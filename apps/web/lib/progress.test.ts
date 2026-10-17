import { describe, expect, it } from "vitest";
import { buildProgress, sharePercent, shortLegislature, PRESIDENTIAL_ELECTION_YEARS, type ProgressArea, type ProgressBar, type ProgressInput, type ProgressNote, type ProgressStrip } from "./progress";

const LABELS = ["1990-1992", "1992-1996", "1996-2000", "2000-2004", "2004-2008", "2008-2012", "2012-2016", "2016-2020", "2020-2024", "2024-2028"];
const legislatures = LABELS.map((label) => ({ label, startsOn: `${label.slice(0, 4)}-06-01` }));

function input(overrides: Partial<ProgressInput> = {}): ProgressInput {
  return {
    legislatures: [...legislatures].reverse(), // any order in, ascending out
    votes: [
      { legislature: "2024-2028", startsOn: "2024-12-21", chamber: "deputies", votes: 1201, nominalVotes: 1190, status: "complete" },
      { legislature: "2024-2028", startsOn: "2024-12-21", chamber: "senate", votes: 1262, nominalVotes: 1250, status: "complete" },
      { legislature: "2020-2024", startsOn: "2020-12-21", chamber: "deputies", votes: 4000, nominalVotes: 3900, status: "partial" },
      { legislature: "2012-2016", startsOn: "2012-12-19", chamber: "senate", votes: 1, nominalVotes: 0, status: "partial" }
    ],
    officialVotes: { generatedOn: "2026-10-17", rangeFrom: "2024-12-21", rangeTo: "2026-10-17", totals: [{ chamber: "deputies", official: 1205, held: 1201, percent: 99.67 }, { chamber: "senate", official: 1262, held: 1262, percent: 100 }, { chamber: "joint", official: 142, held: 141, percent: 99.3 }] },
    officialBills: { generatedOn: "2026-10-17", rows: [{ chamber: "deputies", year: 2025, official: 592, held: 586, percent: 98.99 }, { chamber: "senate", year: 2026, official: 677, held: 676, percent: 99.85 }] },
    bills: { bills: 6584, withDossier: 6000, promulgated: 1000, promulgatedWithGazette: 990 },
    seats: [
      { legislature: "2024-2028", chamber: "deputies", seats: 331, openMandates: 330, mandatesEver: 335 },
      { legislature: "2024-2028", chamber: "senate", seats: 134, openMandates: 134, mandatesEver: 136 },
      { legislature: "2020-2024", chamber: "deputies", seats: 330, mandatesEver: 360 },
      { legislature: "2020-2024", chamber: "senate", seats: 136, mandatesEver: 130 },
      { legislature: "2016-2020", chamber: "deputies", seats: 329, mandatesEver: 330 }
    ],
    members: { current: 464, withBirthDate: 459, withCv: 355 },
    elections: [
      { kind: "parliamentary", heldOn: "2020-12-06", legislatureYear: "2020" },
      { kind: "parliamentary", heldOn: "2024-12-01", legislatureYear: "2024" },
      { kind: "presidential", heldOn: "2024-11-24", legislatureYear: "2024" },
      { kind: "presidential", heldOn: "2025-05-04", legislatureYear: "2025" },
      { kind: "presidential", heldOn: "2025-05-18", legislatureYear: "2025" }
    ],
    governments: [
      { slug: "roman-i-1989-1990", name: "Roman I", roles: 1 },
      { slug: "vacaroiu-1992-1996", name: "Văcăroiu", roles: 36 },
      { slug: "dejeu-acting-1998", name: "Dejeu interimar", roles: 1 },
      { slug: "bolojan-2025-present", name: "Bolojan", roles: 33 }
    ],
    ministries: [{ slug: "interne", name: "Ministerul Afacerilor Interne", hasLeadership: true }, { slug: "justitie", name: "Ministerul Justiției", hasLeadership: false }],
    decreesByYear: [{ year: 1998, held: 486, highest: 683 }, { year: 2002, held: 1063, highest: 1063 }, { year: 2011, held: 659, highest: 1000 }],
    missions: { headed: 166, withHead: 155, honorary: 170, cultural: 17 },
    documents: { linked: 124726, proposals: 6429, proposalsStored: 237, reports: 1566, opinions: 22422 },
    finance: { firstYear: 2017, lastYear: 2025, annualReports: 122, campaignReports: 355 },
    questions: { deputies: { "2024-2028": 8399 }, senate: {} },
    motions: { "2024-2028": 14 },
    ...overrides
  };
}

const area = (areas: ProgressArea[], id: string) => areas.find((item) => item.id === id)!;
const item = <T extends ProgressBar | ProgressStrip | ProgressNote>(areas: ProgressArea[], areaId: string, id: string) => area(areas, areaId).items.find((entry) => entry.id === id) as T;
const states = (strip: ProgressStrip) => strip.cells.map((cell) => cell.state);

describe("sharePercent", () => {
  it("rounds down, so a gap never shows as 100%", () => {
    expect(sharePercent(2604, 2609)).toBe(99.8);
    expect(sharePercent(1999, 2000)).toBe(99.9);
    expect(sharePercent(2000, 2000)).toBe(100);
    expect(sharePercent(0, 10)).toBe(0);
  });
  it("has no share where there is no total", () => {
    expect(sharePercent(0, 0)).toBeNull();
  });
});

describe("shortLegislature", () => {
  it("shortens the second year", () => {
    expect(shortLegislature("2020-2024")).toBe("2020–24");
    expect(shortLegislature("1990-1992")).toBe("1990–92");
  });
});

describe("the votes rows", () => {
  const areas = buildProgress(input());

  it("shows the ten legislatures oldest first, complete only where the official lists agree", () => {
    const strip = item<ProgressStrip>(areas, "votes", "votes-legislatures");
    expect(strip.cells.map((cell) => cell.label)).toEqual(["1990–92", "1992–96", "1996–00", "2000–04", "2004–08", "2008–12", "2012–16", "2016–20", "2020–24", "2024–28"]);
    expect(states(strip)).toEqual(["none", "none", "none", "none", "none", "none", "held", "none", "held", "complete"]);
    expect(strip.cells[8]!.detail.en).toContain("no official total");
    expect(strip.cells[6]!.detail.ro).toBe("2012-2016: 1 vot, păstrat, fără un total oficial cu care să-l comparăm");
  });

  it("compares the sum of the chambers and the joint sittings with the official lists", () => {
    const bar = item<ProgressBar>(areas, "votes", "votes-official");
    expect([bar.have, bar.total]).toEqual([2604, 2609]);
    expect(bar.missing?.en).toBe("5 missing against the official list.");
  });

  it("counts the votes that have a named list among all the votes held", () => {
    const bar = item<ProgressBar>(areas, "votes", "votes-nominal");
    expect([bar.have, bar.total]).toEqual([1190 + 1250 + 3900, 1201 + 1262 + 4000 + 1]);
  });

  it("draws no official-list bar while the comparison is not published", () => {
    const without = buildProgress(input({ officialVotes: undefined }));
    expect(area(without, "votes").items.map((entry) => entry.id)).toEqual(["votes-legislatures", "votes-nominal"]);
  });
});

describe("members and elections", () => {
  const areas = buildProgress(input());

  it("calls a roster complete only when both chambers hold at least as many mandates as seats", () => {
    const strip = item<ProgressStrip>(areas, "members", "rosters");
    expect(states(strip).slice(7)).toEqual(["held", "held", "complete"]); // 2016–20 has no Senate row; 2020–24 has fewer Senate mandates than seats
    expect(states(strip).slice(0, 7)).toEqual(Array(7).fill("none"));
  });

  it("compares the seats now filled with the legal seats of the legislature in office", () => {
    const bar = item<ProgressBar>(areas, "members", "seats-now");
    expect([bar.have, bar.total]).toEqual([464, 465]);
  });

  it("bars the birth dates and CVs against the sitting members", () => {
    expect([item<ProgressBar>(areas, "members", "members-birth").have, item<ProgressBar>(areas, "members", "members-cv").have]).toEqual([459, 355]);
    expect(item<ProgressBar>(areas, "members", "members-cv").total).toBe(464);
  });

  it("marks the parliamentary elections by the year their legislature began", () => {
    const strip = item<ProgressStrip>(areas, "elections", "elections-parliamentary");
    expect(strip.cells.map((cell) => `${cell.label}:${cell.state}`)).toEqual(["1990:none", "1992:none", "1996:none", "2000:none", "2004:none", "2008:none", "2012:none", "2016:none", "2020:complete", "2024:complete"]);
  });

  it("lists the ten presidential elections and says how many rounds are held", () => {
    const strip = item<ProgressStrip>(areas, "elections", "elections-presidential");
    expect(strip.cells.map((cell) => Number(cell.label))).toEqual([...PRESIDENTIAL_ELECTION_YEARS]);
    expect(strip.cells.filter((cell) => cell.state === "complete").map((cell) => cell.label)).toEqual(["2024", "2025"]);
    expect(strip.cells.find((cell) => cell.label === "2024")!.detail.en).toContain("one round");
    expect(strip.cells.find((cell) => cell.label === "2025")!.detail.en).toContain("2 rounds");
  });
});

describe("government, presidency and missions", () => {
  const areas = buildProgress(input());

  it("counts the governments that are not caretakers, and names the ones with the prime minister alone", () => {
    const bar = item<ProgressBar>(areas, "government", "governments-cabinets");
    expect([bar.have, bar.total]).toEqual([2, 3]);
    expect(bar.missing?.en).toBe("Prime minister only: Roman I.");
  });

  it("names the ministry whose page is not read", () => {
    const bar = item<ProgressBar>(areas, "government", "ministries-leadership");
    expect([bar.have, bar.total]).toEqual([1, 2]);
    expect(bar.missing?.ro).toBe("Lipsește: Ministerul Justiției.");
  });

  it("measures the decrees against the numbering and names the years with most gaps", () => {
    const bar = item<ProgressBar>(areas, "presidency", "decrees");
    expect([bar.have, bar.total]).toEqual([486 + 1063 + 659, 683 + 1063 + 1000]);
    expect(bar.label.en).toBe("Decrees of 1998–2011 against the numbering");
    expect(bar.missing?.en).toContain("2011 (341), 1998 (197)");
    expect(bar.missing?.en).not.toContain("2002");
  });

  it("measures the missions with a named head against those whose page names one", () => {
    const bar = item<ProgressBar>(areas, "ambassadors", "missions-heads");
    expect([bar.have, bar.total]).toEqual([155, 166]);
    expect(bar.missing?.en).toBe("11 pages name no one (a vacant post or another layout).");
    expect(item<ProgressNote>(areas, "ambassadors", "missions-unread").value).toBe("187");
  });
});

describe("rows with no total to compare with", () => {
  const areas = buildProgress(input());

  it("shows questions only in the legislature read, motions the same, and the Senate's none", () => {
    expect(states(item<ProgressStrip>(areas, "questions", "questions-deputies"))).toEqual([...Array(9).fill("none"), "held"]);
    expect(states(item<ProgressStrip>(areas, "questions", "questions-senate"))).toEqual(Array(10).fill("none"));
    expect(states(item<ProgressStrip>(areas, "questions", "motions"))).toEqual([...Array(9).fill("none"), "held"]);
  });

  it("gives party money as a note without a bar", () => {
    const note = item<ProgressNote>(areas, "finance", "finance-reports");
    expect(note.kind).toBe("note");
    expect(note.value).toBe("2017–2025");
    expect(note.tone).toBe("held");
  });

  it("states the planned texts and the unread lists as not held", () => {
    expect(item<ProgressNote>(areas, "bills", "laws-text").tone).toBe("none");
    expect(item<ProgressNote>(areas, "government", "investiture").tone).toBe("none");
    expect(item<ProgressNote>(areas, "elections", "elections-other").tone).toBe("none");
  });

  it("never lets a bar hold more than its total", () => {
    const capped = buildProgress(input({ members: { current: 100, withBirthDate: 120, withCv: 5 } }));
    expect(item<ProgressBar>(capped, "members", "members-birth").have).toBe(100);
  });

  it("leaves out a bar whose total is zero", () => {
    const empty = buildProgress(input({ decreesByYear: [], missions: { headed: 0, withHead: 0, honorary: 0, cultural: 0 }, ministries: [] }));
    expect(area(empty, "presidency").items.map((entry) => entry.id)).toEqual(["offices"]);
    expect(empty.find((entry) => entry.id === "ambassadors")).toBeUndefined();
    expect(area(empty, "government").items.some((entry) => entry.id === "ministries-leadership")).toBe(false);
  });
});
