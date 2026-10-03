import { afterEach, describe, expect, it, vi } from "vitest";
import { requireDatabase } from "./data-availability";

afterEach(() => vi.unstubAllEnvs());
describe("public data availability", () => {
  it("fails closed without a database instead of showing sample data", () => {
    vi.stubEnv("DATABASE_URL", "");
    expect(requireDatabase).toThrow("temporarily unavailable");
  });
  it("allows reads when a database is configured", () => {
    vi.stubEnv("DATABASE_URL", "postgres://example");
    expect(requireDatabase).not.toThrow();
  });
});
