import { VOTE_KINDS, VOTE_LABEL, VOTE_STYLE, type VoteKind } from "./vote-meaning";

export type VoteCounts = Partial<Record<VoteKind, number>>;

/** Counts of a vote from the stored totals. "present" here means present and did not vote. */
export function countsOfTotals(totals: { for: number; against: number; abstention: number; presentNotVoting: number; absent?: number }): VoteCounts {
  return { for: totals.for, against: totals.against, abstain: totals.abstention, present: totals.presentNotVoting, absent: totals.absent ?? 0 };
}

/**
 * One bar for the whole vote: the share of for, against, abstentions, present-did-not-vote and absent, in that fixed order and colours.
 * The segments grow from the left once when the page loads (never under reduced motion). The numbers are in the label for screen readers.
 */
export function SplitBar({ counts, locale = "ro", height = "h-2.5", showAbsent = false }: { counts: VoteCounts; locale?: "ro" | "en"; height?: string; showAbsent?: boolean }) {
  const kinds = VOTE_KINDS.filter((kind) => (showAbsent || kind !== "absent") && (counts[kind] ?? 0) > 0);
  const total = kinds.reduce((sum, kind) => sum + (counts[kind] ?? 0), 0);
  const description = VOTE_KINDS.filter((kind) => (counts[kind] ?? 0) > 0 && (showAbsent || kind !== "absent")).map((kind) => `${VOTE_LABEL[locale][kind]} ${counts[kind]}`).join(", ");
  return (
    <div role="img" aria-label={description} className={`flex w-full gap-px overflow-hidden rounded-full bg-line ${height}`}>
      {total === 0
        ? null
        : kinds.map((kind, index) => (
            <span key={kind} className={`split-seg block ${VOTE_STYLE[kind].fill}`} style={{ flexGrow: counts[kind], flexBasis: 0, animationDelay: `${index * 70}ms` }} />
          ))}
    </div>
  );
}
