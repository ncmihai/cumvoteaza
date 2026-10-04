import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildBillCoverage, renderBillCoverageMarkdown } from "../coverage/bill-coverage";
import { senateYearSearchForm } from "../coverage/fetch-bill-lists";
import { fetchSenateLists } from "../coverage/fetch-senate-lists";
import { PoliteFetcher } from "../coverage/polite-fetcher";
import { RawCache } from "../coverage/raw-cache";

const fixture = (name: string) => readFileSync(path.join(__dirname, "../fixtures", name), "utf8");
const month = fixture("senate-voturi-plen-month-2026-09.html");
const day = fixture("senate-voturi-plen-day-2026-09-30.html");

describe("fetchSenateLists", () => {
  let dir: string | undefined;
  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = undefined;
  });

  function setup(dayHtml: string) {
    const calls: Array<{ method: string; argument?: string }> = [];
    const fetcher = new PoliteFetcher({
      maxRequests: 20,
      delayMs: 0,
      fetchImpl: async (_url, init) => {
        const argument = init?.body instanceof URLSearchParams ? (init.body.get("__EVENTARGUMENT") ?? undefined) : undefined;
        calls.push({ method: init?.method ?? "GET", argument });
        return new Response(argument === "9770" || argument === "V9740" || !argument ? month : dayHtml);
      }
    });
    return { calls, fetcher };
  }

  it("selects the month, then only the days marked with votes, and saves the pages it was given", async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "coverage-"));
    const cache = new RawCache(dir);
    const { calls, fetcher } = setup(day);
    const result = await fetchSenateLists({ from: "2026-09-30", to: "2026-09-30", cache, fetcher });
    expect(result).toMatchObject({ days: ["2026-09-30"], requested: 3, failures: [] });
    expect(calls).toEqual([{ method: "GET" }, { method: "POST", argument: "V9740" }, { method: "POST", argument: "9769" }]);
    expect(await cache.keys("senate-day")).toEqual(["2026-09-30"]);
    expect(await cache.keys("senate-month")).toEqual(["2026-09"]);
  });

  it("resumes from the saved pages without asking again", async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "coverage-"));
    const cache = new RawCache(dir);
    await fetchSenateLists({ from: "2026-09-30", to: "2026-09-30", cache, fetcher: setup(day).fetcher });
    const again = setup(day);
    const result = await fetchSenateLists({ from: "2026-09-30", to: "2026-09-30", cache, fetcher: again.fetcher });
    expect(again.calls).toEqual([]);
    expect(result).toMatchObject({ requested: 0, cached: 2 });
  });

  it("does not save a day page that shows another date", async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "coverage-"));
    const cache = new RawCache(dir);
    const wrong = day.replace("30.09.2026", "29.09.2026");
    const result = await fetchSenateLists({ from: "2026-09-30", to: "2026-09-30", cache, fetcher: setup(wrong).fetcher });
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.error).toMatch(/did not select 2026-09-30/);
    expect(await cache.keys("senate-day")).toEqual([]);
  });

  it("visits every day of the range when asked to check the marker", async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "coverage-"));
    const { calls, fetcher } = setup(day);
    await fetchSenateLists({ from: "2026-09-01", to: "2026-09-04", cache: new RawCache(dir), fetcher, allDays: true });
    // initial page, month, then four days
    expect(calls).toHaveLength(6);
  });

  it("a dry run asks for nothing", async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "coverage-"));
    const { calls, fetcher } = setup(day);
    const result = await fetchSenateLists({ from: "2026-09-01", to: "2026-09-30", cache: new RawCache(dir), fetcher, dryRun: true });
    expect(calls).toEqual([]);
    expect(result.planned).toBe(2);
  });
});

describe("senateYearSearchForm", () => {
  it("keeps the page's hidden fields and asks for one year without paging", () => {
    const html = `<form action="./Lista.aspx"><input type="hidden" name="__VIEWSTATE" value="abc"/><input type="checkbox" name="other" value="1"/><select name="ctl00$B_Center$Lista$ddAni"><option selected value="2025">2025</option></select><input type="submit" name="go" value="Caută"/></form>`;
    const { action, body } = senateYearSearchForm(html, "https://www.senat.ro/Legis/Lista.aspx?an_cls=2026", 2026);
    expect(action).toBe("https://www.senat.ro/Legis/Lista.aspx");
    expect(body.get("__VIEWSTATE")).toBe("abc");
    expect(body.get("ctl00$B_Center$Lista$ddAni")).toBe("2026");
    expect(body.get("ctl00$B_Center$Lista$chkFaraPaginare")).toBe("on");
    expect(body.get("__EVENTTARGET")).toBe("ctl00$B_Center$Lista$btnCauta2");
    expect(body.has("other")).toBe(false);
    expect(body.has("go")).toBe(false);
  });

  it("refuses a page without a form", () => {
    expect(() => senateYearSearchForm("<html></html>", "https://www.senat.ro/Legis/Lista.aspx", 2026)).toThrow(/form missing/);
  });
});

describe("buildBillCoverage", () => {
  const report = buildBillCoverage({
    official: [
      { chamber: "deputies", officialId: "PL-x 83/2024", year: 2024 },
      { chamber: "deputies", officialId: "PL-x 84/2024", year: 2024 },
      { chamber: "senate", officialId: "L27/2024", year: 2024 },
      { chamber: "senate", officialId: "B646/2026", year: 2026 }
    ],
    stored: [
      { id: "bill-l27-2024", identifiers: { senate: "L27/2024", deputies: "PL-x 83/2024", senate_l: "L27/2024" } },
      { id: "bill-b", identifiers: { senate: "L22/2026", senate_b: "B646/2026" } }
    ],
    pageCounts: [{ chamber: "deputies", year: 2024, announced: 3 }]
  });

  it("matches an official number against every identifier a stored bill carries, per chamber", () => {
    expect(report.rows.map((row) => [row.year, row.chamber, row.official, row.held, row.missing, row.percent])).toEqual([
      [2024, "deputies", 2, 1, 1, 50],
      [2024, "senate", 1, 1, 0, 100],
      [2026, "senate", 1, 1, 0, 100]
    ]);
    expect(report.rows[0]?.missingIds).toEqual(["PL-x 84/2024"]);
  });

  it("flags a list that holds fewer rows than the page announces", () => {
    expect(report.listCountMismatches).toEqual([{ chamber: "deputies", year: 2024, announced: 3, parsed: 2 }]);
    expect(renderBillCoverageMarkdown(report, "2026-10-04")).toContain("page says 3, read 2");
  });
});
