import { describe, expect, it } from "vitest";
import { auditCabinetManifests, cabinetManifests } from "../government-cabinet-manifests";
import { ministryCatalog } from "../ministry-catalog";

describe("reviewed government cabinet manifests", () => {
  it("keeps every reviewed cabinet complete, sourced and temporally valid", () => {
    const audits = auditCabinetManifests(new Set(ministryCatalog.map((ministry) => ministry.name)));
    expect(audits).toHaveLength(cabinetManifests.length);
    expect(audits.every((audit) => audit.errors.length === 0)).toBe(true);
    expect(audits).toContainEqual(expect.objectContaining({
      governmentSlug: "ciolacu-ii-2024-2025",
      expectedInvestitureRoles: 18,
      documentedInvestitureRoles: 18,
      sourcedRoles: 18,
      status: "reviewed"
    }));
  });
});
