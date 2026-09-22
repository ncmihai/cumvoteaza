import { describe, expect, it } from "vitest";
import { governmentSkeletonData } from "../government-skeleton";
import { auditMinistryInstitutionCatalog, incarnationIdByName, ministryLineage } from "../ministry-institution-catalog";

describe("ministry institution catalog", () => {
  it("keeps the reviewed institutional graph internally consistent", () => {
    expect(auditMinistryInstitutionCatalog()).toEqual({
      portfolios: 13,
      incarnations: 8,
      mappings: 26,
      lineageEdges: 6,
      errors: []
    });
  });

  it("records the 2024 merger and research ministry split", () => {
    expect(ministryLineage.filter((edge) => edge.relationship === "merged_into")).toHaveLength(1);
    expect(ministryLineage.filter((edge) => edge.fromIncarnationId === "ministry-incarnation-cercetare-inovare-digitalizare-2021" && edge.relationship === "split_into")).toHaveLength(2);
  });

  it("connects pilot cabinet roles to active exact incarnations", () => {
    const pilotNames = new Set(incarnationIdByName.keys());
    const pilotRoles = governmentSkeletonData().roles.filter((role) => role.ministry && pilotNames.has(role.ministry));
    expect(pilotRoles.length).toBeGreaterThan(0);
    expect(pilotRoles.every((role) => role.ministryIncarnationId)).toBe(true);
  });
});
