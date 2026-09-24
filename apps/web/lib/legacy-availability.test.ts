import { afterEach, expect, it, vi } from "vitest";
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("./server-db", () => ({
  CACHE_TAGS: {}, timed: (_label: string, work: () => unknown) => work(),
  createWebDbSession: () => ({ db: {
    select: () => { throw new Error("database unavailable"); },
    execute: () => { throw new Error("database unavailable"); }
  }, close: async () => {} })
}));
import { getMemberDirectoryData, getMemberPageData, getPartyPageData } from "./data";
import { getCurrentCompositionData, getCompositionTimelineData } from "./composition-data";

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
it("legacy public routes reject database failures instead of demo or empty success", async () => {
  vi.stubEnv("DATABASE_URL", "configured");
  vi.spyOn(console, "error").mockImplementation(() => {});
  for (const read of [() => getMemberDirectoryData(), () => getMemberPageData("member"),
    () => getPartyPageData("pnl"), () => getCurrentCompositionData("official"),
    () => getCompositionTimelineData("official")]) {
    await expect(read()).rejects.toThrow("temporarily unavailable");
  }
});
