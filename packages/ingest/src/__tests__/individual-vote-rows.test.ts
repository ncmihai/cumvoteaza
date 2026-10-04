import { describe, expect, it } from "vitest";
import type { IndividualVote } from "@cumsevoteaza/parliament-model";
import { dedupeIndividualVotes, upsertIndividualVoteRows } from "../individual-vote-rows";

const vote = (voteId: string, memberId: string, choice: IndividualVote["choice"] = "for"): IndividualVote => ({ id: `iv-${voteId}-${memberId}`, voteId, memberId, choice });

describe("individual vote rows", () => {
  it("keeps one choice per member per vote, the last one", () => {
    const rows = dedupeIndividualVotes([vote("v1", "m1", "for"), vote("v1", "m2"), vote("v1", "m1", "against"), vote("v2", "m1")]);
    expect(rows.map((row) => [row.voteId, row.memberId, row.choice])).toEqual([["v1", "m1", "against"], ["v1", "m2", "for"], ["v2", "m1", "for"]]);
  });

  it("writes in batches and reports how many rows were written", async () => {
    const calls: number[] = [];
    const db = {
      execute: async () => {
        calls.push(1);
        return Array.from({ length: calls.length === 1 ? 1000 : 5 }, () => ({}));
      }
    };
    const votes = Array.from({ length: 1005 }, (_, index) => vote("v1", `m${index}`));
    expect(await upsertIndividualVoteRows(db, votes)).toBe(1005);
    expect(calls).toHaveLength(2);
  });

  it("fails the import when a vote or member of the batch does not exist, as the foreign key did", async () => {
    const db = { execute: async () => [{}] };
    await expect(upsertIndividualVoteRows(db, [vote("v1", "m1"), vote("v1", "m2")])).rejects.toThrow(/wrote 1 of 2 rows/);
  });

  it("does nothing for an empty list", async () => {
    const db = { execute: async () => { throw new Error("should not be called"); } };
    expect(await upsertIndividualVoteRows(db, [])).toBe(0);
  });
});
