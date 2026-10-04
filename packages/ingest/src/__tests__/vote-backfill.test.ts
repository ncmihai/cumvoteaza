import { describe, expect, it } from "vitest";
import { isJointAmendmentVote, summariseJointSittings } from "../coverage/joint-amendments";
import { checkVoteGate, officialVoteUrl, planVoteBackfill, type GateInput } from "../coverage/vote-backfill";
import { officialFromCdep, type OfficialVoteRecord, type StoredVoteRow } from "../coverage/vote-coverage";

const cdep = (id: string, date: string, description: string, chamber: "deputies" | "joint" = "deputies", extra: Partial<OfficialVoteRecord> = {}): OfficialVoteRecord => ({
  ...officialFromCdep({ id, date, time: "10:00", description, chamber, present: 10, notVoting: 0, for: 6, against: 3, abstention: 1, isTest: /^vot test/i.test(description), totalsConsistent: true }),
  ...extra
});

describe("isJointAmendmentVote", () => {
  it.each([
    "Anexa 3/15 amendament respins 114",
    "Anexa 3/15 forma comisiei",
    "Art. 17 integral",
    "Art. 1",
    "Denumirea Sectiunii 2",
    "Sectiunea a 2-a - titlul",
    "Titlul proiectului de lege",
    "Capitolul I - titlul",
    "Pl-x 210/2025 - Amendament respins 1",
    "Art. 22 amr nou introdus",
    "Anexa 5/2 amr nesustinute in plen, in bloc"
  ])("summarises %s", (description) => expect(isJointAmendmentVote(description)).toBe(true));

  it.each([
    "Ordinea de zi",
    "Program de lucru - aprobat",
    "Timp dezbatere",
    "PL-x 2/2025;L14/2025",
    "Pl-x 210/2025 - Vot final",
    "Motiunea de cenzura 2/2025 - Timpi dezbatere",
    "Verificare prezenta",
    "Proiectul de Hotarare privind vacantarea unei functii",
    "Strategia Nationala de Aparare a Tarii",
    "MC 1/2026 - timp dezbatere"
  ])("keeps %s as a vote", (description) => expect(isJointAmendmentVote(description)).toBe(false));
});

describe("summariseJointSittings", () => {
  it("makes one summary per joint day, with the range of ids and the official list", () => {
    const records = [
      cdep("34879", "2025-02-05", "Anexa 3/15", "joint"),
      cdep("34878", "2025-02-05", "Anexa 3/14", "joint"),
      cdep("34911", "2025-02-05", "PL-x 2/2025;L14/2025", "joint"),
      cdep("40", "2025-06-30", "Pl-x 210/2025 - Amendament respins 1", "joint"),
      cdep("50", "2025-06-30", "Anexa 1", "deputies")
    ];
    expect(summariseJointSittings(records)).toEqual([
      { date: "2025-02-05", voteCount: 2, firstOfficialId: "34878", lastOfficialId: "34879", officialUrl: "https://www.cdep.ro/ords/pls/steno/evot2015.data?dat=20250205&cam=0&idl=1" },
      { date: "2025-06-30", voteCount: 1, firstOfficialId: "40", lastOfficialId: "40", officialUrl: "https://www.cdep.ro/ords/pls/steno/evot2015.data?dat=20250630&cam=0&idl=1" }
    ]);
  });
});

describe("planVoteBackfill", () => {
  const stored = (id: string): StoredVoteRow => ({ id: `vote-deputies-https-www-cdep-ro-ords-pls-steno-evot2015-nominal-idv-${id}`, chamber: "deputies", heldOn: "2026-09-23", present: 1, forCount: 1, against: 0, abstention: 0, presentNotVoting: 0, sourceUrl: null });
  const official = [
    cdep("1", "2026-09-16", "a"),
    cdep("2", "2026-09-23", "b"),
    cdep("3", "2026-09-23", "c"),
    cdep("4", "2026-09-23", "Vot test 1"),
    cdep("5", "2026-09-23", "Anexa 1", "joint"),
    cdep("6", "2026-08-01", "old"),
    { ...cdep("sen-1", "2026-09-23", "L1/2026 vot final"), source: "senate" as const, chamber: "senate" as const }
  ];

  it("queues what is missing, newest first, and counts the rest", () => {
    const plan = planVoteBackfill({ official, stored: [stored("2")], range: { from: "2026-09-01", to: "2026-09-30" }, sources: ["cdep"] });
    expect(plan.queue.map((record) => record.officialId)).toEqual(["3", "1"]);
    expect(plan).toMatchObject({ eligible: 2, alreadyHeld: 1, summarised: 1, tests: 1 });
  });

  it("takes only the newest votes up to the limit, and only from the chosen sources", () => {
    expect(planVoteBackfill({ official, stored: [], range: { from: "2026-01-01", to: "2026-12-31" }, sources: ["cdep"], limit: 2 }).queue.map((record) => record.officialId)).toEqual(["3", "2"]);
    expect(planVoteBackfill({ official, stored: [], range: { from: "2026-01-01", to: "2026-12-31" }, sources: ["senate"] }).queue.map((record) => record.officialId)).toEqual(["sen-1"]);
  });
});

describe("checkVoteGate", () => {
  const record = cdep("37398", "2026-09-23", "Vot final", "deputies", { totals: { present: 252, for: 157, against: 81, abstention: 13, notVoting: 1 } });
  const good: GateInput = {
    official: record,
    parsedStatus: "parsed",
    parsed: {
      chamber: "deputies",
      heldOn: "2026-09-23",
      totals: { present: 252, for: 157, against: 81, abstention: 13, presentNotVoting: 1 },
      choices: [...Array(157).fill("for"), ...Array(81).fill("against"), ...Array(13).fill("abstention"), "present_not_voting"],
      warnings: []
    }
  };

  it("passes a page that agrees with the official list in every respect", () => {
    expect(checkVoteGate(good)).toEqual([]);
  });

  it("holds a page whose date, chamber or totals differ from the list", () => {
    const reasons = checkVoteGate({ ...good, parsed: { ...good.parsed, heldOn: "2026-10-04", chamber: "joint", totals: { ...good.parsed.totals, against: 80 } } });
    expect(reasons).toEqual(expect.arrayContaining([expect.stringContaining("date is 2026-10-04"), expect.stringContaining("chamber is joint"), expect.stringContaining("against: page 80, official list 81")]));
  });

  it("holds a page whose name list does not match its totals, or that parsed with warnings", () => {
    expect(checkVoteGate({ ...good, parsed: { ...good.parsed, choices: good.parsed.choices.slice(1) } })).toEqual([expect.stringContaining('name list has 156 "for", totals say 157')]);
    expect(checkVoteGate({ ...good, parsedStatus: "partial", parsed: { ...good.parsed, warnings: ["No Chamber vote subject metadata detected."] } })[0]).toMatch(/parsed with warnings/);
    expect(checkVoteGate({ ...good, parsedStatus: "failed" })[0]).toMatch(/could not be read/);
  });

  it("builds the official page address of a vote", () => {
    expect(officialVoteUrl({ source: "cdep", officialId: "37398" })).toBe("https://www.cdep.ro/ords/pls/steno/evot2015.Nominal?idv=37398");
    expect(officialVoteUrl({ source: "senate", officialId: "abc" })).toBe("https://www.senat.ro/VoturiPlenDetaliu.aspx?AppID=abc");
  });
});
