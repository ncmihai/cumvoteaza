import { describe, expect, it } from "vitest";
import { auditGovernmentHistoryRows, governmentHistoryAuditMarkdown, type StoredGovernmentPeriod } from "../government-history-audit";
import { governmentHistory2024To2028 } from "../government-history-manifest";

function matchingStoredRows(): StoredGovernmentPeriod[] {
  return governmentHistory2024To2028.map((government) => ({
    id: government.id,
    name: government.name,
    startsOn: government.startsOn,
    endsOn: government.endsOn,
    basis: government.acting ? "manual_curation" : "official_investiture",
    sourceSnapshotId: `source-${government.id}`,
    alignments: government.coalition.map((alignment) => ({
      ...alignment,
      basis: "official_coalition",
      sourceSnapshotId: `source-${government.id}`
    }))
  }));
}

describe("government history audit", () => {
  it("accepts a continuous, sourced and database-matched timeline", () => {
    const result = auditGovernmentHistoryRows(governmentHistory2024To2028, matchingStoredRows(), "2026-09-13T00:00:00.000Z");
    expect(result.summary).toMatchObject({ errors: 0, warnings: 0, verified: true });
  });
  it("detects timeline gaps and database discrepancies without persisting", () => {
    const manifest = structuredClone(governmentHistory2024To2028);
    manifest[1]!.startsOn = "2025-05-07";
    const stored = matchingStoredRows();
    stored[2]!.alignments = stored[2]!.alignments.filter((alignment) => alignment.partyId !== "party-usr");
    const result = auditGovernmentHistoryRows(manifest, stored, "2026-09-13T00:00:00.000Z");
    expect(result.mode).toBe("read_only");
    expect(result.issues.map((item) => item.code)).toEqual(expect.arrayContaining(["government_timeline_gap_or_overlap", "government_startsOn_mismatch", "coalition_alignment_missing"]));
  });
  it("keeps Wikipedia visible as secondary context in the report", () => {
    const markdown = governmentHistoryAuditMarkdown(auditGovernmentHistoryRows(governmentHistory2024To2028, matchingStoredRows(), "2026-09-13T00:00:00.000Z"));
    expect(markdown).toContain("secondary / context");
    expect(markdown).toContain("Wikipedia");
  });
});
