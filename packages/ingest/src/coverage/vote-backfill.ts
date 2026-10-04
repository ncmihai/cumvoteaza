import type { OfficialVoteRecord, StoredVoteRow } from "./vote-coverage";
import { storedOfficialKey } from "./vote-coverage";

export interface BackfillPlan {
  /** Votes to import, newest first. */
  queue: OfficialVoteRecord[];
  /** Official votes in range that match the filters, before the limit. */
  eligible: number;
  alreadyHeld: number;
  /** Joint amendment votes kept as a sitting summary (D-022). */
  summarised: number;
  tests: number;
  unsupported: number;
}

export function planVoteBackfill(input: {
  official: OfficialVoteRecord[];
  stored: StoredVoteRow[];
  range: { from: string; to: string };
  sources: Array<"cdep" | "senate">;
  limit?: number;
  /** `source:id` keys of votes known to carry no per-member choices. */
  unsupported?: ReadonlySet<string>;
}): BackfillPlan {
  const held = new Set<string>();
  for (const vote of input.stored) {
    const key = storedOfficialKey(vote);
    if (key) held.add(`${key.source}:${key.officialId}`);
  }
  let alreadyHeld = 0;
  let summarised = 0;
  let tests = 0;
  let unsupported = 0;
  const wanted: OfficialVoteRecord[] = [];
  for (const record of input.official) {
    if (record.date < input.range.from || record.date > input.range.to || !input.sources.includes(record.source)) continue;
    if (record.isTest) {
      tests += 1;
    } else if (held.has(`${record.source}:${record.officialId}`)) {
      alreadyHeld += 1;
    } else if (input.unsupported?.has(`${record.source}:${record.officialId}`)) {
      unsupported += 1;
    } else if (record.summarised) {
      summarised += 1;
    } else if (record.chamber === "unknown") {
      continue;
    } else {
      wanted.push(record);
    }
  }
  wanted.sort((a, b) => b.date.localeCompare(a.date) || (b.source === "cdep" ? Number(b.officialId) - Number(a.officialId) : b.officialId.localeCompare(a.officialId)));
  return { queue: input.limit === undefined ? wanted : wanted.slice(0, input.limit), eligible: wanted.length, alreadyHeld, summarised, tests, unsupported };
}

export function officialVoteUrl(record: Pick<OfficialVoteRecord, "source" | "officialId">): string {
  return record.source === "cdep"
    ? `https://www.cdep.ro/ords/pls/steno/evot2015.Nominal?idv=${record.officialId}`
    : `https://www.senat.ro/VoturiPlenDetaliu.aspx?AppID=${record.officialId}`;
}

export interface GateInput {
  official: OfficialVoteRecord;
  /** "parsed" means the page's own totals agreed with its name list; "partial" and "failed" come with warnings. */
  parsedStatus: string;
  parsed: {
    chamber: string;
    heldOn: string;
    totals: { present: number; for: number; against: number; abstention: number; presentNotVoting: number };
    choices: string[];
    warnings: string[];
  };
}

/** Why a parsed vote page must not be written yet; an empty list means it passes every gate. */
export function checkVoteGate({ official, parsedStatus, parsed }: GateInput): string[] {
  const reasons: string[] = [];
  if (parsedStatus === "failed") reasons.push(`page could not be read${parsed.warnings.length ? `: ${parsed.warnings.join(" ")}` : ""}`);
  else if (parsedStatus !== "parsed") reasons.push(`page parsed with warnings: ${parsed.warnings.join(" ") || parsedStatus}`);
  if (parsed.heldOn !== official.date) reasons.push(`date is ${parsed.heldOn}, the official list says ${official.date}`);
  if (parsed.chamber !== official.chamber) reasons.push(`chamber is ${parsed.chamber}, the official list says ${official.chamber}`);
  const pairs: Array<[string, number, number]> = [
    ["present", parsed.totals.present, official.totals.present],
    ["for", parsed.totals.for, official.totals.for],
    ["against", parsed.totals.against, official.totals.against],
    ["abstention", parsed.totals.abstention, official.totals.abstention],
    ["present, did not vote", parsed.totals.presentNotVoting, official.totals.notVoting]
  ];
  for (const [label, page, list] of pairs) if (page !== list) reasons.push(`${label}: page ${page}, official list ${list}`);
  const count = (choice: string) => parsed.choices.filter((item) => item === choice).length;
  for (const [label, choice, total] of [["for", "for", parsed.totals.for], ["against", "against", parsed.totals.against], ["abstention", "abstention", parsed.totals.abstention]] as const) {
    if (count(choice) !== total) reasons.push(`name list has ${count(choice)} "${label}", totals say ${total}`);
  }
  return reasons;
}
