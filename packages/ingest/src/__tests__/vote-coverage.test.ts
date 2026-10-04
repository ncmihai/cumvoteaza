import { describe, expect, it } from "vitest";
import {
  buildVoteCoverage,
  officialFromCdep,
  officialFromSenate,
  renderCoverageMarkdown,
  storedOfficialKey,
  type OfficialVoteRecord,
  type StoredVoteRow
} from "../coverage/vote-coverage";

const totals = (present: number, forCount: number, against: number, abstention: number, notVoting = 0) => ({ present, for: forCount, against, abstention, notVoting });
const official = (over: Partial<OfficialVoteRecord> & Pick<OfficialVoteRecord, "officialId" | "date">): OfficialVoteRecord => ({
  source: "cdep",
  chamber: "deputies",
  label: "x",
  isTest: false,
  totals: totals(10, 6, 3, 1),
  totalsConsistent: true,
  ...over
});
const stored = (over: Partial<StoredVoteRow> & Pick<StoredVoteRow, "id" | "heldOn">): StoredVoteRow => ({
  chamber: "deputies",
  present: 10,
  forCount: 6,
  against: 3,
  abstention: 1,
  presentNotVoting: 0,
  sourceUrl: null,
  ...over
});
const cdepVote = (id: string, over: Partial<StoredVoteRow> = {}) => stored({ id: `vote-deputies-https-www-cdep-ro-ords-pls-steno-evot2015-nominal-idv-${id}`, heldOn: "2026-09-23", ...over });

const range = { from: "2026-09-01", to: "2026-09-30" };
const fetched = (cdep: string[], senate: string[] = []) => ({ cdep: new Set(cdep), senate: new Set(senate) });

describe("storedOfficialKey", () => {
  it("reads the CDEP vote id from the stored id, or from the source page", () => {
    expect(storedOfficialKey(cdepVote("37397"))).toEqual({ source: "cdep", officialId: "37397" });
    expect(storedOfficialKey(stored({ id: "something-else", heldOn: "2026-09-23", sourceUrl: "https://www.cdep.ro/ords/pls/steno/evot2015.Nominal?idv=37396" }))).toEqual({ source: "cdep", officialId: "37396" });
  });

  it("reads the Senate AppID from the source page in lower case", () => {
    const vote = stored({ id: "vote-senate-l412-2026-09-30-final", chamber: "senate", heldOn: "2026-09-30", sourceUrl: "https://www.senat.ro/VoturiPlenDetaliu.aspx?AppID=8E327233-5C64-4299-BFFA-C8E3849CBDB3" });
    expect(storedOfficialKey(vote)).toEqual({ source: "senate", officialId: "8e327233-5c64-4299-bffa-c8e3849cbdb3" });
  });

  it("returns nothing for a vote with no official identifier", () => {
    expect(storedOfficialKey(stored({ id: "manual-vote", heldOn: "2026-09-23" }))).toBeUndefined();
  });
});

describe("buildVoteCoverage", () => {
  const report = buildVoteCoverage({
    range,
    daysFetched: fetched(["2026-09-23", "2026-09-30"], ["2026-09-30"]),
    official: [
      official({ officialId: "1", date: "2026-09-23" }),
      official({ officialId: "2", date: "2026-09-23" }),
      official({ officialId: "3", date: "2026-09-23", isTest: true }),
      official({ officialId: "4", date: "2026-09-30", chamber: "joint" }),
      official({ source: "senate", officialId: "aaaaaaaa-0000-0000-0000-000000000001", date: "2026-09-30", chamber: "senate" }),
      official({ officialId: "9", date: "2026-08-31" })
    ],
    stored: [
      cdepVote("1", { forCount: 7 }),
      cdepVote("5"),
      cdepVote("6", { heldOn: "2026-09-16" }),
      stored({ id: "vote-senate-a", chamber: "senate", heldOn: "2026-09-30", sourceUrl: "https://www.senat.ro/VoturiPlenDetaliu.aspx?AppID=AAAAAAAA-0000-0000-0000-000000000001" }),
      stored({ id: "manual", heldOn: "2026-09-10" })
    ]
  });

  it("counts official votes per month and chamber, without test ballots and outside the range", () => {
    expect(report.rows.map((row) => [row.month, row.chamber, row.official, row.held, row.missing, row.tests, row.percent])).toEqual([
      ["2026-09", "deputies", 2, 1, 1, 1, 50],
      ["2026-09", "joint", 1, 0, 1, 0, 0],
      ["2026-09", "senate", 1, 1, 0, 0, 100]
    ]);
    expect(report.rows[0]?.missingIds).toEqual(["2"]);
    expect(report.totals.find((row) => row.chamber === "deputies")).toMatchObject({ official: 2, held: 1, missing: 1, percent: 50 });
  });

  it("compares the totals of the votes we hold with the official ones", () => {
    expect(report.totalsMismatches).toEqual([
      { source: "cdep", officialId: "1", storedId: expect.stringContaining("idv-1"), date: "2026-09-23", differences: [{ field: "for", official: 6, stored: 7 }] }
    ]);
  });

  it("separates held votes the official list contradicts from those it cannot check", () => {
    expect(report.storedNotOnOfficialList).toEqual([{ storedId: expect.stringContaining("idv-5"), date: "2026-09-23" }]);
    expect(report.storedUnverifiable).toEqual({ count: 1, days: ["2026-09-16"] });
    expect(report.storedWithoutOfficialId).toEqual(["manual"]);
  });

  it("reports a vote held under another date than the official one", () => {
    const result = buildVoteCoverage({
      range,
      daysFetched: fetched(["2026-09-23"]),
      official: [official({ officialId: "1", date: "2026-09-23" })],
      stored: [cdepVote("1", { heldOn: "2026-09-22" })]
    });
    expect(result.dateMismatches).toEqual([{ source: "cdep", officialId: "1", storedId: expect.any(String), storedDate: "2026-09-22", officialDate: "2026-09-23" }]);
  });

  it("gives no percentage for a month without official votes and flags inconsistent official rows", () => {
    const result = buildVoteCoverage({
      range,
      daysFetched: fetched(["2026-09-23"]),
      official: [official({ officialId: "1", date: "2026-09-23", isTest: true, totalsConsistent: false })],
      stored: []
    });
    expect(result.rows[0]).toMatchObject({ official: 0, tests: 1, percent: null });
    expect(result.officialInconsistent).toEqual([{ source: "cdep", officialId: "1", date: "2026-09-23" }]);
  });

  it("renders a table a person can read", () => {
    const markdown = renderCoverageMarkdown(report, "2026-10-04");
    expect(markdown).toContain("| 2026-09 | Chamber | 2 | 1 | 1 | 50.0% |  |  | 1 |");
    expect(markdown).toContain("Votes held whose totals differ from the official list: **1**");
  });
});

describe("official record mappers", () => {
  it("keeps the Senate's verdict and builds a readable label", () => {
    const record = officialFromSenate({ id: "x", date: "2026-09-30", item: "L412/2026", label: "vot final", title: "t", resolution: "Adoptat", present: 105, for: 102, against: 2, abstention: 1, notVoting: 0, totalsConsistent: true });
    expect(record).toMatchObject({ source: "senate", chamber: "senate", label: "L412/2026 — vot final", resolution: "Adoptat" });
  });

  it("carries CDEP's test flag", () => {
    const record = officialFromCdep({ id: "1", date: "2026-09-23", time: "11:31", description: "Vot test 1", chamber: "deputies", present: 1, notVoting: 0, for: 1, against: 0, abstention: 0, isTest: true, totalsConsistent: true });
    expect(record.isTest).toBe(true);
  });
});
