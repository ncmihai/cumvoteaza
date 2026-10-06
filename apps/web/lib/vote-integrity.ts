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

/** The opposite case: the published name list holds more votes of a kind than the announced official total. Reported, never corrected. */
export function nominalSurpluses(rows: IndividualVote[], totals: VoteTotals): NominalShortfall[] {
  if (!rows.length) return [];
  const announced: Array<[NominalShortfall["choice"], number | undefined]> = [
    ["for", totals.for], ["against", totals.against], ["abstention", totals.abstention], ["present_not_voting", totals.presentNotVoting]
  ];
  return announced
    .filter((entry): entry is [NominalShortfall["choice"], number] => entry[1] !== undefined)
    .map(([choice, expected]) => ({ choice, listed: rows.filter((row) => row.choice === choice).length, announced: expected }))
    .filter((item) => item.listed > item.announced);
}
