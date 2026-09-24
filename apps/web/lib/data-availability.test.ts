import { afterEach, describe, expect, it, vi } from "vitest";
import { requireDatabaseOrExplicitDemo } from "./data-availability";

afterEach(() => vi.unstubAllEnvs());
describe("explicit public demo mode", () => {
  it("fails closed without a database", () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("CUMSEVOTEAZA_DEMO_MODE", "");
    expect(requireDatabaseOrExplicitDemo).toThrow("temporarily unavailable");
  });
  it("requires deliberate opt-in for database-free previews", () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("CUMSEVOTEAZA_DEMO_MODE", "1");
    expect(requireDatabaseOrExplicitDemo).not.toThrow();
  });
});
