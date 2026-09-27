import { afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ failing: true, close: vi.fn() }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("./server-db", () => ({
  CACHE_TAGS: {},
  createWebDbSession: () => ({ close: state.close, db: {
    select: () => ({ from: async () => {
      if (state.failing) throw new Error("private database details");
      return [];
    } })
  } })
}));
import { getMinistries } from "./ministry-data";
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); state.close.mockClear(); state.failing = true; });

it("throws on a database failure instead of caching an empty directory, then permits recovery", async () => {
  vi.stubEnv("DATABASE_URL", "configured");
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  await expect(getMinistries()).rejects.toThrow("temporarily unavailable");
  expect(JSON.stringify(log.mock.calls)).not.toContain("private database details");
  state.failing = false;
  await expect(getMinistries()).resolves.toEqual([]);
  expect(state.close).toHaveBeenCalledTimes(2);
});
