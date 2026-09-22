import { describe, expect, it } from "vitest";
import { governmentSkeletonData } from "../government-skeleton";
import { auditMinistryInstitutionCatalog, ministryIncarnations, ministryLineage } from "../ministry-institution-catalog";

describe("ministry institution catalog", () => {
  it("keeps the reviewed institutional graph internally consistent", () => {
    expect(auditMinistryInstitutionCatalog()).toEqual({
      portfolios: 26,
      incarnations: 21,
      mappings: 39,
      lineageEdges: 6,
      errors: []
    });
  });

  it("records the 2024 merger and research ministry split", () => {
    expect(ministryLineage.filter((edge) => edge.relationship === "merged_into")).toHaveLength(1);
    expect(ministryLineage.filter((edge) => edge.fromIncarnationId === "ministry-incarnation-cercetare-inovare-digitalizare-2021" && edge.relationship === "split_into")).toHaveLength(2);
  });

  it("connects pilot cabinet roles to active exact incarnations", () => {
    const incarnationById = new Map(ministryIncarnations.map((item) => [item.id, item]));
    const pilotGovernments = new Set(["government-ciolacu-ii-2024-2025", "government-bolojan-2025-present"]);
    const pilotRoles = governmentSkeletonData().roles.filter((role) => role.ministryId && pilotGovernments.has(role.governmentId));
    expect(pilotRoles).toHaveLength(43);
    for (const role of pilotRoles) {
      const incarnation = role.ministryIncarnationId ? incarnationById.get(role.ministryIncarnationId) : undefined;
      expect(incarnation, role.id).toBeDefined();
      expect(incarnation!.startsOn <= role.startsOn, role.id).toBe(true);
      expect(!incarnation!.endsOn || incarnation!.endsOn >= role.startsOn, role.id).toBe(true);
    }
  });
});
