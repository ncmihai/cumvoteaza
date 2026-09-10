import { afterEach, describe, expect, it, vi } from "vitest";
const calendar = `<table class="myCalendar"><tr><td><a href="javascript:__doPostBack('ctl00$B_Center$VoturiPlen1$calVOT','9747')">8</a></td></tr></table>`;
vi.mock("../fetch-source", () => ({ fetchOfficialSource: vi.fn(async () => `<table class="myCalendar"></table>`) }));
vi.mock("@cumsevoteaza/db", async (original) => ({ ...await original<Record<string, unknown>>(), createDbSession: () => ({ db: {}, close: async () => {} }) }));
import { discoverSenateVoteSources } from "../sync";
afterEach(() => vi.unstubAllGlobals());
describe("Senate calendar", () => {
  it("discovers dated official vote links from a selected day", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(calendar)).mockResolvedValueOnce(new Response(calendar + `<span class="voturi-plen-current-date">Data Curenta: 08.09.2026</span><table><tr><td><a href="./VoturiPlenDetaliu.aspx?AppID=abc">Vot final L1/2026</a></td></tr></table>`)));
    const result = await discoverSenateVoteSources({ dateFrom: "2026-09-08", dateTo: "2026-09-08", dryRun: true });
    expect(result.discovered).toBe(1);
    expect(result.failed).toBe(0);
  });
  it("reports wrong-date responses as failed coverage", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(calendar)).mockResolvedValueOnce(new Response(calendar + `<span class="voturi-plen-current-date">Data Curenta: 09.09.2026</span>`)));
    const result = await discoverSenateVoteSources({ dateFrom: "2026-09-08", dateTo: "2026-09-08", dryRun: true });
    expect(result.failed).toBe(1);
    expect(result.discovered).toBe(0);
  });
});
