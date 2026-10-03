import { afterEach, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("./server-db", () => ({
  CACHE_TAGS: {}, timed: (_label: string, work: () => unknown) => work(),
  createWebDbSession: () => ({ db: { execute: () => Promise.reject(new Error("private connection details")) }, close: async () => {} })
}));
import { getBillExplorerData, getDirectoryFilterOptions, getVoteExplorerData } from "./explorer-data";

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
it("never substitutes sample data when a configured database fails", async () => {
  vi.stubEnv("DATABASE_URL", "configured");
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  await expect(getVoteExplorerData({ filters: { q: "not a demo" } })).rejects.toThrow("temporarily unavailable");
  await expect(getBillExplorerData()).rejects.toThrow("temporarily unavailable");
  await expect(getDirectoryFilterOptions()).rejects.toThrow("temporarily unavailable");
  expect(JSON.stringify(log.mock.calls)).not.toContain("private connection details");
});
