import { describe, expect, it } from "vitest";
import { formationAttemptSeeds } from "../government-formation";
import { governmentSkeletonData } from "../government-skeleton";

describe("government formation attempts", () => {
  const skeleton = governmentSkeletonData();
  const governmentIds = new Set(skeleton.governments.map((government) => government.id));
  const personIds = new Set(skeleton.people.map((person) => person.id));

  it("keeps the outcome consistent with the vote and the threshold", () => {
    for (const attempt of formationAttemptSeeds) {
      if (attempt.votesFor == null || attempt.threshold == null) continue;
      expect(attempt.outcome === "invested", `${attempt.id}: ${attempt.votesFor} for, ${attempt.threshold} needed`).toBe(attempt.votesFor >= attempt.threshold);
      if (attempt.presentCount != null) expect(attempt.votesFor + (attempt.votesAgainst ?? 0)).toBeLessThanOrEqual(attempt.presentCount);
    }
  });

  it("gives every attempt a designee, a source and consistent dates", () => {
    const ids = new Set<string>();
    for (const attempt of skeleton.formationAttempts) {
      expect(ids.has(attempt.id)).toBe(false);
      ids.add(attempt.id);
      expect(personIds.has(attempt.designeePersonId), `${attempt.id} designee`).toBe(true);
      expect(attempt.sources.length).toBeGreaterThan(0);
      if (attempt.voteHeldOn) expect(attempt.voteHeldOn >= attempt.designatedOn).toBe(true);
      if (attempt.revokedOn) expect(attempt.revokedOn >= attempt.designatedOn).toBe(true);
      if (attempt.outcome === "revoked_before_vote") expect(attempt.voteHeldOn).toBeUndefined();
    }
  });

  it("points only at governments that exist, and every invested attempt at the government it formed", () => {
    for (const attempt of skeleton.formationAttempts) {
      for (const id of [attempt.precedingGovernmentId, attempt.resultingGovernmentId]) if (id) expect(governmentIds.has(id), `${attempt.id} -> ${id}`).toBe(true);
      expect(attempt.outcome === "invested").toBe(Boolean(attempt.resultingGovernmentId));
    }
  });

  it("records the three designations made after the Bolojan government was dismissed (2026)", () => {
    const after = formationAttemptSeeds.filter((attempt) => attempt.precedingGovernmentId === "government-bolojan-2025-present");
    expect(after.map((attempt) => [attempt.designee, attempt.designationDecree?.match(/nr\. (\d+\/\d{4})/)?.[1], attempt.outcome])).toEqual([
      ["Eugen Tomac", "316/2026", "revoked_before_vote"],
      ["Adrian-Ioan Veștea", "328/2026", "failed"],
      ["Siegfried Mureșan", "770/2026", "failed"]
    ]);
  });
});
