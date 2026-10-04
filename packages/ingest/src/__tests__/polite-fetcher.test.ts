import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fetchCdepLists, monthsBetween } from "../coverage/fetch-cdep-lists";
import { FetchStoppedError, PoliteFetcher } from "../coverage/polite-fetcher";
import { RawCache } from "../coverage/raw-cache";

function fakeClock() {
  let time = 0;
  const sleeps: number[] = [];
  return { sleeps, now: () => time, sleep: async (ms: number) => { sleeps.push(ms); time += ms; } };
}

const answer = (body: string, status = 200) => new Response(body, { status });

describe("PoliteFetcher", () => {
  it("keeps the requested distance between two requests", async () => {
    const clock = fakeClock();
    const fetcher = new PoliteFetcher({ maxRequests: 10, delayMs: 2000, fetchImpl: async () => answer("ok"), ...clock });
    await fetcher.get("https://example.test/a");
    await fetcher.get("https://example.test/b");
    await fetcher.get("https://example.test/c");
    expect(clock.sleeps).toEqual([2000, 2000]);
  });

  it("never exceeds the request budget, retries included", async () => {
    const clock = fakeClock();
    let calls = 0;
    const fetcher = new PoliteFetcher({ maxRequests: 2, retries: 3, maxConsecutiveFailures: 99, fetchImpl: async () => { calls += 1; return answer("", 503); }, ...clock });
    await expect(fetcher.get("https://example.test/a")).rejects.toMatchObject({ reason: "budget" });
    expect(calls).toBe(2);
  });

  it("retries a server error once and then succeeds", async () => {
    const clock = fakeClock();
    const replies = [answer("", 502), answer("fine")];
    const fetcher = new PoliteFetcher({ maxRequests: 5, fetchImpl: async () => replies.shift()!, ...clock });
    expect((await fetcher.get("https://example.test/a")).body.toString()).toBe("fine");
  });

  it("stops at once when the source pushes back", async () => {
    const clock = fakeClock();
    const fetcher = new PoliteFetcher({ maxRequests: 50, fetchImpl: async () => answer("no", 429), ...clock });
    await expect(fetcher.get("https://example.test/a")).rejects.toBeInstanceOf(FetchStoppedError);
    expect(fetcher.requests).toBe(1);
  });

  it("stops after too many failures in a row", async () => {
    const clock = fakeClock();
    const fetcher = new PoliteFetcher({ maxRequests: 50, retries: 0, maxConsecutiveFailures: 3, fetchImpl: async () => { throw new Error("timeout"); }, ...clock });
    await expect(fetcher.get("https://example.test/1")).rejects.toThrow("timeout");
    await expect(fetcher.get("https://example.test/2")).rejects.toThrow("timeout");
    await expect(fetcher.get("https://example.test/3")).rejects.toMatchObject({ reason: "failures" });
  });
});

describe("monthsBetween", () => {
  it("covers every month from the first to the last day, across a year end", () => {
    expect(monthsBetween("2024-12-21", "2025-02-03").map((month) => month.key)).toEqual(["2024-12", "2025-01", "2025-02"]);
  });
});

describe("fetchCdepLists", () => {
  let dir: string | undefined;
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = undefined;
  });

  const xml = (id: string) => `<?xml version="1.0" encoding="ISO-8859-2"?><ROWSET><ROW><VOTID>${id}</VOTID><TIME_VOT>08.09.2026 10:00</TIME_VOT><DESCRIERE>x</DESCRIERE><CAMERA>2</CAMERA><PREZENTI>3</PREZENTI><NU_AU_VOTAT>0</NU_AU_VOTAT><AU_VOTAT_DA>2</AU_VOTAT_DA><AU_VOTAT_NU>1</AU_VOTAT_NU><AU_VOTAT_AB>0</AU_VOTAT_AB></ROW></ROWSET>`;

  function setup(handler: (url: string) => Response) {
    const urls: string[] = [];
    const clock = fakeClock();
    const fetcher = new PoliteFetcher({ maxRequests: 50, fetchImpl: async (input) => { urls.push(String(input)); return handler(String(input)); }, ...clock });
    return { urls, fetcher };
  }

  it("fetches the sitting days, then each day, keeps the raw files, and resumes without asking again", async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "coverage-"));
    const cache = new RawCache(dir);
    const handler = (url: string) => (url.includes("zile_vot") ? answer(",20260908,20260909") : answer(xml(url.endsWith("20260908") ? "100" : "101")));
    const first = setup(handler);
    const result = await fetchCdepLists({ from: "2026-09-01", to: "2026-09-30", cache, fetcher: first.fetcher });
    expect(result).toMatchObject({ days: ["2026-09-08", "2026-09-09"], requested: 3, failures: [] });
    expect(first.urls).toEqual([
      "https://www.cdep.ro/ords/pls/steno/evot2015.zile_vot?lu=9&an=2026",
      "https://www.cdep.ro/ords/pls/steno/evot2015.xml?par1=1&par2=20260908",
      "https://www.cdep.ro/ords/pls/steno/evot2015.xml?par1=1&par2=20260909"
    ]);
    expect(await cache.keys("cdep-day")).toEqual(["20260908", "20260909"]);
    expect((await readFile(path.join(dir, "manifest.jsonl"), "utf8")).trim().split("\n")).toHaveLength(3);

    const second = setup(handler);
    const again = await fetchCdepLists({ from: "2026-09-01", to: "2026-09-30", cache, fetcher: second.fetcher });
    expect(again).toMatchObject({ requested: 0, cached: 3 });
    expect(second.urls).toEqual([]);
  });

  it("does not save an answer it cannot read, so the next run asks again", async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "coverage-"));
    const cache = new RawCache(dir);
    const { fetcher } = setup((url) => (url.includes("zile_vot") ? answer(",20260908,20260909") : url.endsWith("20260908") ? answer("<html>Eroare</html>") : answer(xml("101"))));
    const result = await fetchCdepLists({ from: "2026-09-01", to: "2026-09-30", cache, fetcher });
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.key).toBe("day 2026-09-08");
    expect(await cache.keys("cdep-day")).toEqual(["20260909"]);
  });

  it("refreshes only what concerns the days since the given date", async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "coverage-"));
    const cache = new RawCache(dir);
    const handler = (url: string) => (url.includes("zile_vot") ? answer(",20260908,20260909") : answer(xml("101")));
    await fetchCdepLists({ from: "2026-09-01", to: "2026-09-30", cache, fetcher: setup(handler).fetcher });
    const refreshed = setup(handler);
    await fetchCdepLists({ from: "2026-09-01", to: "2026-09-30", cache, fetcher: refreshed.fetcher, refreshSince: "2026-09-09" });
    expect(refreshed.urls).toEqual([
      "https://www.cdep.ro/ords/pls/steno/evot2015.zile_vot?lu=9&an=2026",
      "https://www.cdep.ro/ords/pls/steno/evot2015.xml?par1=1&par2=20260909"
    ]);
  });

  it("a dry run asks for nothing and says how much it would ask", async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "coverage-"));
    const { fetcher, urls } = setup(() => answer(""));
    const result = await fetchCdepLists({ from: "2026-01-01", to: "2026-03-31", cache: new RawCache(dir), fetcher, dryRun: true });
    expect(urls).toEqual([]);
    expect(result.planned).toBe(3);
  });

  it("ends the run, keeping what it has, when the budget is spent", async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "coverage-"));
    const cache = new RawCache(dir);
    const clock = fakeClock();
    const fetcher = new PoliteFetcher({ maxRequests: 2, fetchImpl: async (input) => (String(input).includes("zile_vot") ? answer(",20260908,20260909") : answer(xml("100"))), ...clock });
    const result = await fetchCdepLists({ from: "2026-09-01", to: "2026-09-30", cache, fetcher });
    expect(result.stopped).toMatch(/budget/i);
    expect(await cache.keys("cdep-day")).toEqual(["20260908"]);
  });
});
