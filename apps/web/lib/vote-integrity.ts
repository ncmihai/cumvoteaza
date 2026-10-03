import type { IndividualVote, VoteTotals } from "@cumsevoteaza/parliament-model";

/** Preserve a person once. Conflicting source rows must not select a winner. */
export function uniqueNominalVotes(rows: IndividualVote[]): IndividualVote[] {
  const members = new Map<string, IndividualVote>();
  for (const row of rows) {
    const previous = members.get(row.memberId);
    members.set(row.memberId, previous ? {
      ...previous,
      choice: previous.choice === row.choice ? row.choice : "unknown",
      groupId: previous.groupId === row.groupId ? row.groupId : undefined
    } : row);
  }
  return [...members.values()];
}

export function reconcileVoteSeats(rows: IndividualVote[], totals: VoteTotals, capacity?: number): boolean {
  if (!rows.length || new Set(rows.map((row) => row.memberId)).size !== rows.length) return false;
  if (rows.some((row) => row.choice === "unknown")) return false;
  if (capacity !== undefined && rows.length !== capacity) return false;
  const count = (choice: IndividualVote["choice"]) => rows.filter((row) => row.choice === choice).length;
  if (totals.absent !== undefined && count("absent") !== totals.absent) return false;
  const pairs = [[count("for"), totals.for], [count("against"), totals.against],
    [count("abstention"), totals.abstention], [count("present_not_voting"), totals.presentNotVoting],
    [count("for") + count("against") + count("abstention") + count("present_not_voting"), totals.present]];
  return pairs.every(([actual, expected]) => expected !== undefined && actual === expected);
}

export type NominalShortfall = { choice: "for" | "against" | "abstention" | "present_not_voting"; listed: number; announced: number };

/**
 * Choices where the published name list holds fewer votes than the announced official total
 * (senat.ro sometimes announces one more "for" than it lists by name, D20). Never filled in or guessed.
 */
export function nominalShortfalls(rows: IndividualVote[], totals: VoteTotals): NominalShortfall[] {
  if (!rows.length) return [];
  const announced: Array<[NominalShortfall["choice"], number | undefined]> = [
    ["for", totals.for], ["against", totals.against], ["abstention", totals.abstention], ["present_not_voting", totals.presentNotVoting]
  ];
  return announced
    .map(([choice, expected]) => ({ choice, listed: rows.filter((row) => row.choice === choice).length, announced: expected ?? 0 }))
    .filter((item) => item.listed < item.announced);
}
