import type { OfficialCdepVote } from "./cdep-official-votes";
import type { OfficialSenateVote } from "./senate-official-votes";

export type CoverageChamber = "deputies" | "senate" | "joint" | "unknown";
export type OfficialSource = "cdep" | "senate";

export interface VoteTotals {
  present: number;
  for: number;
  against: number;
  abstention: number;
  notVoting: number;
}

/** One vote as an official list names it, whichever site it came from. */
export interface OfficialVoteRecord {
  source: OfficialSource;
  /** CDEP vote id, or the Senate AppID in lower case. */
  officialId: string;
  date: string;
  chamber: CoverageChamber;
  label: string;
  /** CDEP's own test ballots; listed, but never counted as a missing vote. */
  isTest: boolean;
  totals: VoteTotals;
  totalsConsistent: boolean;
  /** The Senate's own verdict column. CDEP's list has none. */
  resolution?: string;
}

export interface StoredVoteRow {
  id: string;
  chamber: "deputies" | "senate" | "joint";
  heldOn: string;
  present: number;
  forCount: number;
  against: number;
  abstention: number;
  presentNotVoting: number;
  sourceUrl: string | null;
}

export function officialFromCdep(vote: OfficialCdepVote): OfficialVoteRecord {
  return {
    source: "cdep",
    officialId: vote.id,
    date: vote.date,
    chamber: vote.chamber,
    label: vote.description,
    isTest: vote.isTest,
    totals: { present: vote.present, for: vote.for, against: vote.against, abstention: vote.abstention, notVoting: vote.notVoting },
    totalsConsistent: vote.totalsConsistent
  };
}

export function officialFromSenate(vote: OfficialSenateVote): OfficialVoteRecord {
  return {
    source: "senate",
    officialId: vote.id,
    date: vote.date,
    chamber: "senate",
    label: [vote.item, vote.label].filter(Boolean).join(" — "),
    isTest: false,
    totals: { present: vote.present, for: vote.for, against: vote.against, abstention: vote.abstention, notVoting: vote.notVoting },
    totalsConsistent: vote.totalsConsistent,
    resolution: vote.resolution
  };
}

/** The official identifier a stored vote answers to: the CDEP vote id, or the Senate AppID. */
export function storedOfficialKey(vote: StoredVoteRow): { source: OfficialSource; officialId: string } | undefined {
  if (vote.chamber === "senate") {
    const appId = vote.sourceUrl?.match(/[?&]AppID=([0-9a-f-]{36})/i)?.[1];
    return appId ? { source: "senate", officialId: appId.toLowerCase() } : undefined;
  }
  const idv = vote.id.match(/-idv-(\d+)$/)?.[1] ?? vote.sourceUrl?.match(/[?&]idv=(\d+)/i)?.[1];
  return idv ? { source: "cdep", officialId: idv } : undefined;
}

export interface CoverageRow {
  month: string;
  chamber: CoverageChamber;
  /** Official votes on the lists, test ballots excluded. */
  official: number;
  tests: number;
  /** Official votes we hold. */
  held: number;
  missing: number;
  /** held / official, or null when the official count is zero. */
  percent: number | null;
  missingIds: string[];
}

export interface TotalsMismatch {
  source: OfficialSource;
  officialId: string;
  storedId: string;
  date: string;
  differences: Array<{ field: keyof VoteTotals; official: number; stored: number }>;
}

export interface VoteCoverageReport {
  range: { from: string; to: string };
  daysFetched: { cdep: number; senate: number };
  rows: CoverageRow[];
  totals: Array<{ chamber: CoverageChamber; official: number; held: number; missing: number; percent: number | null }>;
  /** Votes we hold whose totals differ from the official list (the source-vs-stored check). */
  totalsMismatches: TotalsMismatch[];
  /** Votes we hold under another date than the official list gives. */
  dateMismatches: Array<{ source: OfficialSource; officialId: string; storedId: string; storedDate: string; officialDate: string }>;
  /** Official rows whose own numbers do not add up (present is not for + against + abstain + did not vote). */
  officialInconsistent: Array<{ source: OfficialSource; officialId: string; date: string }>;
  /** Votes we hold on a day whose official list was fetched but does not contain them. */
  storedNotOnOfficialList: Array<{ storedId: string; date: string }>;
  /** Votes we hold on days no list was fetched for, so they cannot be checked yet. */
  storedUnverifiable: { count: number; days: string[] };
  /** Stored votes with no official identifier at all (neither a CDEP vote id nor a Senate AppID). */
  storedWithoutOfficialId: string[];
  /** Official records that are neither a Chamber, Senate nor joint vote. */
  unknownChamber: number;
}

const FIELDS: Array<[keyof VoteTotals, (vote: StoredVoteRow) => number]> = [
  ["present", (vote) => vote.present],
  ["for", (vote) => vote.forCount],
  ["against", (vote) => vote.against],
  ["abstention", (vote) => vote.abstention],
  ["notVoting", (vote) => vote.presentNotVoting]
];

const percentOf = (held: number, official: number) => (official === 0 ? null : Math.round((held / official) * 10_000) / 100);

export function buildVoteCoverage(input: {
  official: OfficialVoteRecord[];
  stored: StoredVoteRow[];
  range: { from: string; to: string };
  /** Days a list was fetched for, per source: only those can confirm or contradict a stored vote. */
  daysFetched: { cdep: ReadonlySet<string>; senate: ReadonlySet<string> };
}): VoteCoverageReport {
  const { official, stored, range, daysFetched } = input;
  const inRange = (date: string) => date >= range.from && date <= range.to;
  const storedByKey = new Map<string, StoredVoteRow>();
  const storedWithoutOfficialId: string[] = [];
  for (const vote of stored) {
    if (!inRange(vote.heldOn)) continue;
    const key = storedOfficialKey(vote);
    if (key) storedByKey.set(`${key.source}:${key.officialId}`, vote);
    else storedWithoutOfficialId.push(vote.id);
  }

  const cells = new Map<string, CoverageRow>();
  const totalsMismatches: TotalsMismatch[] = [];
  const dateMismatches: VoteCoverageReport["dateMismatches"] = [];
  const officialInconsistent: VoteCoverageReport["officialInconsistent"] = [];
  const officialKeys = new Set<string>();
  let unknownChamber = 0;

  for (const record of official) {
    if (!inRange(record.date)) continue;
    const key = `${record.source}:${record.officialId}`;
    officialKeys.add(key);
    if (record.chamber === "unknown") unknownChamber += 1;
    if (!record.totalsConsistent) officialInconsistent.push({ source: record.source, officialId: record.officialId, date: record.date });
    const cellKey = `${record.date.slice(0, 7)}|${record.chamber}`;
    const cell = cells.get(cellKey) ?? { month: record.date.slice(0, 7), chamber: record.chamber, official: 0, tests: 0, held: 0, missing: 0, percent: null, missingIds: [] };
    cells.set(cellKey, cell);
    const held = storedByKey.get(key);
    if (record.isTest) {
      cell.tests += 1;
      continue;
    }
    cell.official += 1;
    if (!held) {
      cell.missing += 1;
      cell.missingIds.push(record.officialId);
      continue;
    }
    cell.held += 1;
    if (held.heldOn !== record.date) dateMismatches.push({ source: record.source, officialId: record.officialId, storedId: held.id, storedDate: held.heldOn, officialDate: record.date });
    const differences = FIELDS.flatMap(([field, read]) => (read(held) === record.totals[field] ? [] : [{ field, official: record.totals[field], stored: read(held) }]));
    if (differences.length) totalsMismatches.push({ source: record.source, officialId: record.officialId, storedId: held.id, date: record.date, differences });
  }

  const rows = [...cells.values()]
    .map((cell) => ({ ...cell, percent: percentOf(cell.held, cell.official), missingIds: cell.missingIds.sort((a, b) => a.localeCompare(b, "en", { numeric: true })) }))
    .sort((a, b) => a.month.localeCompare(b.month) || a.chamber.localeCompare(b.chamber));

  const totals = (["deputies", "senate", "joint", "unknown"] as const)
    .map((chamber) => {
      const mine = rows.filter((row) => row.chamber === chamber);
      const officialCount = mine.reduce((sum, row) => sum + row.official, 0);
      const held = mine.reduce((sum, row) => sum + row.held, 0);
      return { chamber, official: officialCount, held, missing: officialCount - held, percent: percentOf(held, officialCount) };
    })
    .filter((row) => row.official > 0);

  const storedNotOnOfficialList: VoteCoverageReport["storedNotOnOfficialList"] = [];
  const unverifiableDays = new Set<string>();
  let unverifiable = 0;
  for (const vote of stored) {
    if (!inRange(vote.heldOn)) continue;
    const key = storedOfficialKey(vote);
    if (!key || officialKeys.has(`${key.source}:${key.officialId}`)) continue;
    if (daysFetched[key.source].has(vote.heldOn)) {
      storedNotOnOfficialList.push({ storedId: vote.id, date: vote.heldOn });
    } else {
      unverifiable += 1;
      unverifiableDays.add(vote.heldOn);
    }
  }

  return {
    range,
    daysFetched: { cdep: daysFetched.cdep.size, senate: daysFetched.senate.size },
    rows,
    totals,
    totalsMismatches,
    dateMismatches,
    officialInconsistent,
    storedNotOnOfficialList,
    storedUnverifiable: { count: unverifiable, days: [...unverifiableDays].sort() },
    storedWithoutOfficialId,
    unknownChamber
  };
}

const CHAMBER_LABEL: Record<CoverageChamber, string> = { deputies: "Chamber", senate: "Senate", joint: "Joint", unknown: "Other" };

export function renderCoverageMarkdown(report: VoteCoverageReport, generatedAt: string): string {
  const lines: string[] = [];
  const pct = (value: number | null) => (value === null ? "–" : `${value.toFixed(1)}%`);
  lines.push(`# Vote coverage ${report.range.from} to ${report.range.to}`, "");
  lines.push(`Generated ${generatedAt}. Official lists read: ${report.daysFetched.cdep} CDEP days, ${report.daysFetched.senate} Senate days. "Official" excludes CDEP's own test ballots.`, "");
  lines.push("## Totals", "", "| Chamber | Official | Held | Missing | Coverage |", "| --- | ---: | ---: | ---: | ---: |");
  for (const row of report.totals) lines.push(`| ${CHAMBER_LABEL[row.chamber]} | ${row.official} | ${row.held} | ${row.missing} | ${pct(row.percent)} |`);
  lines.push("", "## By month", "", "| Month | Chamber | Official | Held | Missing | Coverage | Tests |", "| --- | --- | ---: | ---: | ---: | ---: | ---: |");
  for (const row of report.rows) lines.push(`| ${row.month} | ${CHAMBER_LABEL[row.chamber]} | ${row.official} | ${row.held} | ${row.missing} | ${pct(row.percent)} | ${row.tests || ""} |`);
  lines.push("", "## Source against stored", "");
  lines.push(`- Votes held whose totals differ from the official list: **${report.totalsMismatches.length}**`);
  for (const item of report.totalsMismatches.slice(0, 25)) {
    lines.push(`  - ${item.source} ${item.officialId} (${item.date}, ${item.storedId}): ${item.differences.map((d) => `${d.field} official ${d.official}, stored ${d.stored}`).join("; ")}`);
  }
  lines.push(`- Votes held under a different date than the official list: **${report.dateMismatches.length}**`);
  for (const item of report.dateMismatches.slice(0, 25)) lines.push(`  - ${item.source} ${item.officialId}: stored ${item.storedDate}, official ${item.officialDate}`);
  lines.push(`- Votes held that are not on the official list of their day: **${report.storedNotOnOfficialList.length}**`);
  for (const item of report.storedNotOnOfficialList.slice(0, 25)) lines.push(`  - ${item.storedId} (${item.date})`);
  lines.push(`- Votes held on days no list was fetched for (cannot be checked yet): **${report.storedUnverifiable.count}**${report.storedUnverifiable.days.length ? ` on ${report.storedUnverifiable.days.length} days` : ""}`);
  lines.push(`- Official rows whose own numbers do not add up: **${report.officialInconsistent.length}**`);
  lines.push(`- Held votes without an official identifier: **${report.storedWithoutOfficialId.length}**`);
  return `${lines.join("\n")}\n`;
}
