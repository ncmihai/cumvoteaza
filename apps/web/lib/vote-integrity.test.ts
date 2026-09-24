import { describe, expect, it } from "vitest";
import type { IndividualVote } from "@cumsevoteaza/parliament-model";
import { reconcileVoteSeats, uniqueNominalVotes } from "./vote-integrity";

const row = (memberId: string, choice: IndividualVote["choice"]): IndividualVote => ({ id: memberId, memberId, voteId: "v", choice });
const totals = { for: 1, against: 0, abstention: 0, presentNotVoting: 0, present: 1 };
describe("vote integrity", () => {
  it("compares against independent official totals", () => {
    expect(reconcileVoteSeats([row("a", "for")], totals, 1)).toBe(true);
    expect(reconcileVoteSeats([row("a", "against")], totals, 1)).toBe(false);
  });
  it("rejects missing evidence and unaccounted capacity without calling it absence", () => {
    expect(reconcileVoteSeats([row("a", "unknown")], totals, 1)).toBe(false);
    expect(reconcileVoteSeats([row("a", "for")], totals, 2)).toBe(false);
  });
  it("deduplicates identical rows and quarantines conflicting choices", () => {
    expect(uniqueNominalVotes([row("a", "for"), row("a", "for")])).toHaveLength(1);
    expect(uniqueNominalVotes([row("a", "for"), row("a", "against")])[0]?.choice).toBe("unknown");
    expect(reconcileVoteSeats([row("a", "for"), row("a", "for")], totals, 2)).toBe(false);
  });
});
