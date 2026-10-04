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

  it("backs every investiture figure the Senate has published with its stenogram, and flags the rest as press reports", () => {
    for (const attempt of formationAttemptSeeds.filter((item) => item.voteHeldOn)) {
      const stenogram = attempt.sources.some((source) => source.kind === "official" && /Stenograme_\d{4}\/Plen\/.*comuna\.pdf/.test(source.url));
      if (attempt.voteHeldOn === "2026-09-30") {
        expect(stenogram, "stenogram not yet published on 2026-10-04").toBe(false);
        expect(attempt.notes).toMatch(/stenograma/i);
      } else {
        expect(stenogram, attempt.id).toBe(true);
      }
    }
  });

  it("uses the official threshold of 233 (a majority of 464 or 465 members) and the proces-verbal figures", () => {
    const byId = new Map(formationAttemptSeeds.map((item) => [item.id, item]));
    expect(formationAttemptSeeds.every((item) => item.threshold === undefined || item.threshold === 233)).toBe(true);
    expect(byId.get("formation-vestea-2026")).toEqual(expect.objectContaining({ presentCount: 287, votesFor: 189, votesAgainst: 23, votesVoid: 0 }));
    expect(byId.get("formation-bolojan-2025")).toEqual(expect.objectContaining({ presentCount: 314, votesFor: 301, votesAgainst: 9, votesVoid: 0 }));
    expect(byId.get("formation-ciolacu-ii-2024")).toEqual(expect.objectContaining({ presentCount: 450, votesFor: 240, votesAgainst: 143 }));
  });
});
