import { describe, expect, it } from "vitest";
import type { IndividualVote } from "@cumsevoteaza/parliament-model";
import { nominalShortfalls, nominalSurpluses, uniqueNominalVotes } from "./vote-integrity";

const row = (memberId: string, choice: IndividualVote["choice"]): IndividualVote => ({ id: memberId, memberId, voteId: "v", choice });
const totals = { for: 1, against: 0, abstention: 0, presentNotVoting: 0, present: 1 };
describe("vote integrity", () => {
  it("deduplicates identical rows and quarantines conflicting choices", () => {
    expect(uniqueNominalVotes([row("a", "for"), row("a", "for")])).toHaveLength(1);
    expect(uniqueNominalVotes([row("a", "for"), row("a", "against")])[0]?.choice).toBe("unknown");
  });
  it("reports announced votes missing from the published name list (Senate L181/2025: 109 announced, 108 named)", () => {
    const rows = Array.from({ length: 108 }, (_, index) => row(`m${index}`, "for"));
    expect(nominalShortfalls(rows, { for: 109, against: 0, abstention: 0, presentNotVoting: 0, present: 109 }))
      .toEqual([{ choice: "for", listed: 108, announced: 109 }]);
    expect(nominalShortfalls(rows, { for: 108, against: 0, abstention: 0, presentNotVoting: 0, present: 108 })).toEqual([]);
    expect(nominalShortfalls([], totals)).toEqual([]);
  });
  it("reports a name list that holds more votes than announced, and says nothing when it matches or has no list", () => {
    expect(nominalSurpluses([row("a", "for"), row("b", "for")], totals)).toEqual([{ choice: "for", listed: 2, announced: 1 }]);
    expect(nominalSurpluses([row("a", "for")], totals)).toEqual([]);
    expect(nominalSurpluses([row("a", "unknown")], totals)).toEqual([]);
    expect(nominalSurpluses([], totals)).toEqual([]);
  });
});
