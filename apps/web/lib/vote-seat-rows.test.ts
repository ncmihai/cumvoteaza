import { expect, it, vi } from "vitest";
import { sampleDataset } from "./test-fixtures/sample-dataset";
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
import { buildVoteSeatRows } from "./data";

it("keeps missing nominal evidence unknown and never trims the roster", () => {
  const vote = { ...sampleDataset.votes[0]!, chamber: "senate" as const, heldOn: "2025-01-01" };
  const rows = buildVoteSeatRows({ vote, individualVotes: [], memberships: [],
    legislatures: [{ id: "leg", label: "2024-2028", startsOn: "2024-12-01", endsOn: "2028-12-01" }],
    mandates: Array.from({ length: 135 }, (_, i) => ({ ...sampleDataset.mandates[0]!, id: `m${i}`, memberId: `p${i}`, chamber: "senate" as const, legislatureId: "leg", startsOn: "2024-12-01", endsOn: undefined }))
  });
  expect(rows).toHaveLength(135);
  expect(rows.every((row) => row.choice === "unknown")).toBe(true);
});

it("merges linked identities, retaining conflicts as unknown", () => {
  const vote = sampleDataset.votes[0]!;
  const rows = buildVoteSeatRows({ vote, mandates: [], memberships: [], legislatures: [],
    members: ["a", "b"].map((id) => ({ ...sampleDataset.members[0]!, id, personId: "one-person" })),
    individualVotes: [ { id: "v1", memberId: "a", voteId: vote.id, choice: "for" }, { id: "v2", memberId: "b", voteId: vote.id, choice: "against" } ]
  });
  expect(rows).toHaveLength(1);
  expect(rows[0]?.choice).toBe("unknown");
});
