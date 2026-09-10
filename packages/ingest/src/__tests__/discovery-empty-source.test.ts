import { describe, expect, it, vi } from "vitest";

vi.mock("../fetch-source", () => ({ fetchOfficialSource: vi.fn(async () => "<html><form>Search legislation</form></html>") }));
vi.mock("@cumsevoteaza/db", async (importOriginal) => ({
  ...await importOriginal<Record<string, unknown>>(),
  createDbSession: () => ({ db: {}, close: async () => {} })
}));

import { discoverSenateSources } from "../sync";

describe("empty Senate source response", () => {
  it("reports unverified coverage instead of success even when HTTP returned a page", async () => {
    const result = await discoverSenateSources({ years: [2026], dryRun: true });
    expect(result.discovered).toBe(0);
    expect(result.failed).toBeGreaterThan(0);
    expect(result.errors.every(message => message.includes("coverage remains unverified"))).toBe(true);
  });
});
