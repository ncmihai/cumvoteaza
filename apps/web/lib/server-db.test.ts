import { describe, expect, it, vi } from "vitest";

vi.mock("@cumsevoteaza/db", () => ({ createPooledDbSession: () => ({}) }));

import { CACHE_TAGS, selectCacheTags } from "./server-db";

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
