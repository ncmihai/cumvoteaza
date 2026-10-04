import type { OfficialVoteRecord } from "./vote-coverage";

/**
 * D-022: in a joint sitting the article, annex and amendment votes of one bill (hundreds of ballots, about 400
 * voters each) are not imported one by one; the sitting gets one summary row linking to the official list.
 * What stays imported: agenda, work programme, time limits, final votes, motions, designations, resolutions.
 * Observed in the sittings of 2025-02-05, 2026-03-19/20 and 2025-06-30 (descriptions as CDEP writes them).
 */
const AMENDMENT_VOTE = /^(art\b|anexa\b|denumirea\s+sec|sec[tț]iunea\b|titlul\b|capitolul\b|cap\.\s)|\bamendament|\bamr\b|\bamr\./i;

export function isJointAmendmentVote(description: string): boolean {
  return AMENDMENT_VOTE.test(description.trim());
}

export interface SittingSummary {
  date: string;
  /** Votes of the sitting that are summarised instead of imported. */
  voteCount: number;
  firstOfficialId: string;
  lastOfficialId: string;
  /** CDEP's list of that day's votes, where every one of them can be read. */
  officialUrl: string;
}

export const cdepDayListUrl = (date: string) => `https://www.cdep.ro/ords/pls/steno/evot2015.data?dat=${date.replaceAll("-", "")}&cam=0&idl=1`;

/** One summary per joint sitting day that has summarised votes. */
export function summariseJointSittings(records: OfficialVoteRecord[]): SittingSummary[] {
  const byDay = new Map<string, OfficialVoteRecord[]>();
  for (const record of records) {
    if (record.source !== "cdep" || record.chamber !== "joint" || record.isTest || !record.summarised) continue;
    byDay.set(record.date, [...(byDay.get(record.date) ?? []), record]);
  }
  return [...byDay.entries()]
    .map(([date, votes]) => {
      const ids = votes.map((vote) => vote.officialId).sort((a, b) => Number(a) - Number(b));
      return { date, voteCount: votes.length, firstOfficialId: ids[0]!, lastOfficialId: ids.at(-1)!, officialUrl: cdepDayListUrl(date) };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}
