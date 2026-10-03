import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../fetch-source", () => ({ fetchOfficialSource: vi.fn(async () => "<html><form>Search legislation</form></html>") }));
vi.mock("@cumsevoteaza/db", async (importOriginal) => ({
  ...await importOriginal<Record<string, unknown>>(),
  createDbSession: () => ({ db: {}, close: async () => {} })
}));

import { discoverSenateSources } from "../sync";

// The Senate year search uses global fetch (GET form, then POST), not fetchOfficialSource.
// Stub it so the test never touches senat.ro and always sees an empty result page.
const fetchStub = vi.fn(async () => new Response("<html><form>Search legislation</form></html>", { status: 200 }));

afterEach(() => {
  vi.unstubAllGlobals();
  fetchStub.mockClear();
});

describe("empty Senate source response", () => {
  it("reports unverified coverage instead of success even when HTTP returned a page", async () => {
    vi.stubGlobal("fetch", fetchStub);
    const result = await discoverSenateSources({ years: [2026], dryRun: true });
    expect(fetchStub).toHaveBeenCalled();
    expect(result.discovered).toBe(0);
    expect(result.failed).toBeGreaterThan(0);
    expect(result.errors.every(message => message.includes("coverage remains unverified"))).toBe(true);
  });
});
