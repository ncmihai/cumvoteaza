import { afterEach, expect, it, vi } from "vitest";
const invalidate = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidateTag: invalidate }));
vi.mock("@/lib/server-db", () => import("./server-db"));
import { GET } from "../app/api/cron/daily-import/route";
import { CACHE_TAGS } from "./server-db";
afterEach(() => { vi.unstubAllEnvs(); invalidate.mockClear(); });

it("rejects unauthorized invalidation without touching caches", async () => {
  vi.stubEnv("CRON_SECRET", "test-only");
  const response = await GET(new Request("https://example.test/api/cron/daily-import?revalidateOnly=1"));
  expect(response.status).toBe(401);
  expect(invalidate).not.toHaveBeenCalled();
});

it("invalidates all public tags including cabinet and ministry readers", async () => {
  vi.stubEnv("CRON_SECRET", "test-only");
  const response = await GET(new Request("https://example.test/api/cron/daily-import?revalidateOnly=1", { headers: { authorization: "Bearer test-only" } }));
  expect(response.status).toBe(200);
  expect(invalidate.mock.calls).toEqual(Object.values(CACHE_TAGS).map((tag) => [tag, "max"]));
  expect(invalidate).toHaveBeenCalledWith("ministries", "max");
  expect(invalidate).toHaveBeenCalledWith("governments", "max");
});

it("does not enable retired production imports", async () => {
  vi.stubEnv("CRON_SECRET", "test-only");
  expect((await GET(new Request("https://example.test/api/cron/daily-import", { headers: { authorization: "Bearer test-only" } }))).status).toBe(410);
  expect(invalidate).not.toHaveBeenCalled();
});
