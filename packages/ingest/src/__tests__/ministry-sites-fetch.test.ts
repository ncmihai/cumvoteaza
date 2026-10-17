import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fetchMinistryPages, pageKey, type MinistryPage } from "../ministries/sites-fetch";

const pages: MinistryPage[] = [
  { slug: "externe", page: "leadership", url: "https://mae.example/node/1" },
  { slug: "externe", page: "missions", url: "https://mae.example/missions" },
  { slug: "alpha", page: "leadership", url: "https://alpha.example/conducere" },
  { slug: "beta", page: "leadership", url: "https://beta.example/conducere" }
];

let dir: string | undefined;
afterEach(async () => { if (dir) await rm(dir, { recursive: true, force: true }); dir = undefined; });

const respond = (answers: Record<string, { status: number; body?: string }>, seen: string[] = []) => (async (input: string | URL | Request) => {
  const url = String(input);
  seen.push(url);
  const answer = answers[new URL(url).host] ?? { status: 200, body: "<html>ok</html>" };
  return new Response(answer.body ?? "<html>ok</html>", { status: answer.status });
}) as unknown as typeof fetch;

describe("the ministries' leadership pages", () => {
  it("requests nothing without --live, and only counts what is saved", async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "ministry-"));
    const seen: string[] = [];
    const result = await fetchMinistryPages({ repoRoot: dir, live: false, limit: 10, delayMs: 6000, pages, fetchImpl: respond({}, seen) });
    expect(seen).toEqual([]);
    expect(result).toMatchObject({ pages: 4, cached: 0, fetchedNow: 0, remaining: 4 });
  });

  it("saves each page byte for byte, one request at a time, with at least 6 seconds between sites and mae.ro's 10 between its own pages", async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "ministry-"));
    const sleeps: number[] = [];
    const seen: string[] = [];
    const result = await fetchMinistryPages({ repoRoot: dir, live: true, limit: 10, delayMs: 1000, pages, fetchImpl: respond({}, seen), sleep: async (ms) => { sleeps.push(ms); } });
    expect(result).toMatchObject({ fetchedNow: 4, remaining: 0, failed: [], stopped: [] });
    expect(seen).toHaveLength(4);
    expect(sleeps.filter((ms) => ms >= 6000).length).toBeGreaterThanOrEqual(3);
    expect(await readFile(path.join(dir, "data/coverage/raw/ministry-site", `${pageKey(pages[0]!)}.html`), "utf8")).toBe("<html>ok</html>");
    // A second run finds everything saved.
    expect((await fetchMinistryPages({ repoRoot: dir, live: true, limit: 10, delayMs: 1000, pages, fetchImpl: respond({}, seen), sleep: async () => {} })).cached).toBe(4);
    expect(seen).toHaveLength(4);
  });

  it("stops the requests to a site that pushes back and goes on with the others", async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "ministry-"));
    const seen: string[] = [];
    const result = await fetchMinistryPages({ repoRoot: dir, live: true, limit: 10, delayMs: 1000, pages, fetchImpl: respond({ "mae.example": { status: 403, body: "Just a moment..." } }, seen), sleep: async () => {} });
    expect(result.stopped).toHaveLength(1);
    expect(result.stopped[0]!.site).toBe("mae.example");
    // One request to the site that pushed back, none after it; the other two were saved.
    expect(seen.filter((url) => url.includes("mae.example"))).toHaveLength(1);
    expect(result.fetchedNow).toBe(2);
  });

  it("keeps a page that answers something else than 200 as a failure, not a saved page", async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "ministry-"));
    const result = await fetchMinistryPages({ repoRoot: dir, live: true, limit: 10, delayMs: 1000, pages: [pages[2]!], fetchImpl: respond({ "alpha.example": { status: 404 } }), sleep: async () => {} });
    expect(result.failed).toEqual([{ key: "alpha--leadership", error: "HTTP 404" }]);
    expect(result.fetchedNow).toBe(0);
  });

  it("stops at its own cap", async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "ministry-"));
    const seen: string[] = [];
    const result = await fetchMinistryPages({ repoRoot: dir, live: true, limit: 2, delayMs: 1000, pages, fetchImpl: respond({}, seen), sleep: async () => {} });
    expect(seen).toHaveLength(2);
    expect(result.remaining).toBe(2);
  });
});
