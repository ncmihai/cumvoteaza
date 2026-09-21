import { describe, expect, it } from "vitest";
import { ministryEvidenceExcerpt, normalizeMinistryText } from "../ministry-relations";

describe("ministry relation helpers", () => {
  it("matches official ministry names despite casing, accents and whitespace", () => {
    expect(normalizeMinistryText("  MINISTERUL   ENERGIEI\n")).toBe(normalizeMinistryText("Ministerul Energiei"));
    expect(normalizeMinistryText("Ministerul Sănătății")).toBe("ministerul sanatatii");
  });

  it("keeps a compact, reviewable excerpt around the evidence", () => {
    const excerpt = ministryEvidenceExcerpt(`${"Context ".repeat(30)}Ministerul Energiei propune măsura.${" Final".repeat(30)}`, "Ministerul Energiei");
    expect(excerpt).toContain("Ministerul Energiei propune măsura");
    expect(excerpt.length).toBeLessThanOrEqual(260);
  });
});
