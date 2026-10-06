import { describe, expect, it, vi } from "vitest";

vi.mock("@cumsevoteaza/db", () => ({ createPooledDbSession: () => ({}) }));

import { CACHE_TAGS, coalesce, selectCacheTags } from "./server-db";

describe("selectCacheTags", () => {
  it("names every tag when no list is given", () => {
    expect(selectCacheTags(undefined).tags).toEqual(Object.values(CACHE_TAGS));
    expect(selectCacheTags("").tags).toEqual(Object.values(CACHE_TAGS));
  });

  it("purges only the tags that are named", () => {
    expect(selectCacheTags("votes, bills")).toEqual({ tags: ["votes", "bills"], unknown: [] });
  });

  it("reports names that are not tags instead of silently purging nothing", () => {
    expect(selectCacheTags("votes,nope")).toEqual({ tags: ["votes"], unknown: ["nope"] });
  });
});

describe("coalesce", () => {
  it("shares one run between callers that ask for the same thing at the same moment", async () => {
    let runs = 0;
    const work = async () => { runs += 1; await new Promise((resolve) => setTimeout(resolve, 5)); return runs; };
    const [a, b] = await Promise.all([coalesce("k", work), coalesce("k", work)]);
    expect([a, b, runs]).toEqual([1, 1, 1]);
  });

  it("runs again once the first is done, and keeps different keys apart", async () => {
    let runs = 0;
    const work = async () => ++runs;
    expect(await coalesce("a", work)).toBe(1);
    expect(await coalesce("a", work)).toBe(2);
    const [x, y] = await Promise.all([coalesce("x", work), coalesce("y", work)]);
    expect(x).not.toBe(y);
  });

  it("lets a failure reach every waiting caller and does not keep the failed run", async () => {
    const fail = async () => { throw new Error("boom"); };
    await expect(Promise.all([coalesce("f", fail), coalesce("f", fail)])).rejects.toThrow("boom");
    expect(await coalesce("f", async () => "fine")).toBe("fine");
  });
});
