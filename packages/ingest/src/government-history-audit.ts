import { sql } from "drizzle-orm";
import { createDbSession } from "@cumsevoteaza/db";
import { governmentHistory2024To2028, type GovernmentEvidencePurpose, type ReviewedGovernmentPeriod } from "./government-history-manifest";

export type GovernmentAuditSeverity = "error" | "warning" | "info";
export interface GovernmentAuditIssue { severity: GovernmentAuditSeverity; code: string; governmentId?: string; message: string; }
export interface StoredGovernmentPeriod {
  id: string; name: string; startsOn: string; endsOn?: string; basis: string; sourceSnapshotId?: string;
  alignments: Array<{ partyId: string; alignment: string; startsOn: string; endsOn?: string; basis: string; sourceSnapshotId?: string }>;
}
export interface GovernmentHistoryAuditResult {
  generatedAt: string; legislatureId: string; mode: "read_only";
  summary: { expectedGovernments: number; storedGovernments: number; errors: number; warnings: number; verified: boolean };
  issues: GovernmentAuditIssue[]; manifest: ReviewedGovernmentPeriod[];
}

export async function auditGovernmentHistory(manifest: ReviewedGovernmentPeriod[] = governmentHistory2024To2028): Promise<GovernmentHistoryAuditResult> {
  const legislatureId = manifest[0]?.legislatureId ?? "leg-2024-2028";
  const stored = await loadStoredGovernments(manifest.map((government) => government.id));
  return auditGovernmentHistoryRows(manifest, stored, new Date().toISOString(), legislatureId);
}

export function auditGovernmentHistoryRows(manifest: ReviewedGovernmentPeriod[], stored: StoredGovernmentPeriod[], generatedAt = new Date().toISOString(), legislatureId = manifest[0]?.legislatureId ?? "unknown"): GovernmentHistoryAuditResult {
  const issues = [...auditManifest(manifest), ...auditStoredRows(manifest, stored)];
  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.filter((issue) => issue.severity === "warning").length;
  return { generatedAt, legislatureId, mode: "read_only", summary: { expectedGovernments: manifest.length, storedGovernments: stored.length, errors, warnings, verified: errors === 0 && warnings === 0 }, issues, manifest };
}

export function governmentHistoryAuditMarkdown(result: GovernmentHistoryAuditResult): string {
  const lines = [
    `# Government history audit — ${result.legislatureId}`, "", `Generated: ${result.generatedAt}`,
    `Status: **${result.summary.verified ? "VERIFIED" : "REVIEW REQUIRED"}**`, "Mode: read-only", "",
    `Expected governments: ${result.summary.expectedGovernments}; stored: ${result.summary.storedGovernments}; errors: ${result.summary.errors}; warnings: ${result.summary.warnings}.`, "", "## Findings", ""
  ];
  if (result.issues.length === 0) lines.push("No discrepancies found.");
  for (const item of result.issues) lines.push(`- **${item.severity.toUpperCase()} · ${item.code}**${item.governmentId ? ` · \`${item.governmentId}\`` : ""}: ${item.message}`);
  lines.push("", "## Evidence register", "");
  for (const government of result.manifest) {
    lines.push(`### ${government.name} (${government.startsOn} – ${government.endsOn ?? "present"})`, "");
    for (const source of government.sources) lines.push(`- ${source.tier} / ${source.purpose} · ${source.publisher}: [${source.title}](${source.url})`);
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

function auditManifest(manifest: ReviewedGovernmentPeriod[]): GovernmentAuditIssue[] {
  const issues: GovernmentAuditIssue[] = [];
  const ordered = [...manifest].sort((a, b) => a.startsOn.localeCompare(b.startsOn));
  const ids = new Set<string>();
  for (const government of ordered) {
    if (ids.has(government.id)) issues.push(issue("error", "duplicate_government_id", government, "Government id occurs more than once."));
    ids.add(government.id);
    if (government.endsOn && government.endsOn <= government.startsOn) issues.push(issue("error", "invalid_government_interval", government, "End date must be after the start date."));
    const startPurpose: GovernmentEvidencePurpose = government.acting ? "appointment" : "investiture";
    if (!hasOfficialSource(government, startPurpose)) issues.push(issue("error", "missing_official_start_source", government, `Missing official ${startPurpose} evidence.`));
    if (government.endsOn && !hasOfficialSource(government, "termination")) issues.push(issue("warning", "missing_official_end_source", government, "Closed interval has no official termination evidence."));
    if (government.coalition.length > 0 && !government.sources.some((source) => source.tier === "official" && ["coalition", "investiture"].includes(source.purpose))) issues.push(issue("error", "missing_official_coalition_source", government, "Coalition mapping lacks official evidence."));
    for (const alignment of government.coalition) {
      if (alignment.startsOn < government.startsOn || (government.endsOn && (alignment.endsOn ?? government.endsOn) > government.endsOn)) issues.push(issue("error", "alignment_outside_government_interval", government, `${alignment.partyId} lies outside the government interval.`));
    }
  }
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1]!;
    const current = ordered[index]!;
    if (previous.endsOn !== current.startsOn) issues.push({ severity: "error", code: "government_timeline_gap_or_overlap", message: `${previous.id} ends ${previous.endsOn ?? "open"}, but ${current.id} starts ${current.startsOn}.` });
  }
  return issues;
}

function auditStoredRows(manifest: ReviewedGovernmentPeriod[], stored: StoredGovernmentPeriod[]): GovernmentAuditIssue[] {
  const issues: GovernmentAuditIssue[] = [];
  const byId = new Map(stored.map((government) => [government.id, government]));
  for (const expected of manifest) {
    const actual = byId.get(expected.id);
    if (!actual) { issues.push(issue("error", "government_missing_from_database", expected, "Reviewed government is absent from the database.")); continue; }
    for (const field of ["name", "startsOn", "endsOn"] as const) {
      if ((actual[field] ?? undefined) !== (expected[field] ?? undefined)) issues.push(issue("error", `government_${field}_mismatch`, expected, `Expected ${String(expected[field] ?? "open")}; stored ${String(actual[field] ?? "open")}.`));
    }
    if (!actual.sourceSnapshotId) issues.push(issue("warning", "government_source_snapshot_missing", expected, "Database row has no captured source snapshot."));
    for (const alignment of expected.coalition) {
      const actualAlignment = actual.alignments.find((candidate) => candidate.partyId === alignment.partyId && candidate.startsOn === alignment.startsOn);
      if (!actualAlignment) issues.push(issue("error", "coalition_alignment_missing", expected, `${alignment.partyId} alignment is absent.`));
      else {
        if (actualAlignment.alignment !== alignment.alignment || (actualAlignment.endsOn ?? undefined) !== (alignment.endsOn ?? undefined)) issues.push(issue("error", "coalition_alignment_mismatch", expected, `${alignment.partyId} does not match the reviewed interval or role.`));
        if (!actualAlignment.sourceSnapshotId) issues.push(issue("warning", "coalition_source_snapshot_missing", expected, `${alignment.partyId} has no captured source snapshot.`));
      }
    }
  }
  for (const actual of stored) if (!manifest.some((expected) => expected.id === actual.id)) issues.push({ severity: "warning", code: "unreviewed_database_government", governmentId: actual.id, message: "Database government is not present in the reviewed manifest." });
  return issues;
}

async function loadStoredGovernments(ids: string[]): Promise<StoredGovernmentPeriod[]> {
  if (ids.length === 0) return [];
  const session = createDbSession();
  try {
    const idList = sql.join(ids.map((id) => sql`${id}`), sql`, `);
    const governmentRows = await session.db.execute<Record<string, unknown> & { id: string; name: string; starts_on: string; ends_on: string | null; basis: string; source_snapshot_id: string | null }>(sql`select id, name, starts_on, ends_on, basis::text, source_snapshot_id from governments where id in (${idList}) order by starts_on`);
    const alignmentRows = await session.db.execute<Record<string, unknown> & { government_id: string; party_id: string; alignment: string; starts_on: string; ends_on: string | null; basis: string; source_snapshot_id: string | null }>(sql`select government_id, party_id, alignment::text, starts_on, ends_on, basis::text, source_snapshot_id from government_party_alignments where government_id in (${idList}) order by government_id, starts_on, party_id`);
    return governmentRows.map((row) => ({
      id: row.id, name: row.name, startsOn: row.starts_on, endsOn: row.ends_on ?? undefined, basis: row.basis, sourceSnapshotId: row.source_snapshot_id ?? undefined,
      alignments: alignmentRows.filter((alignment) => alignment.government_id === row.id).map((alignment) => ({ partyId: alignment.party_id, alignment: alignment.alignment, startsOn: alignment.starts_on, endsOn: alignment.ends_on ?? undefined, basis: alignment.basis, sourceSnapshotId: alignment.source_snapshot_id ?? undefined }))
    }));
  } finally { await session.close(); }
}

function hasOfficialSource(government: ReviewedGovernmentPeriod, purpose: GovernmentEvidencePurpose): boolean { return government.sources.some((source) => source.tier === "official" && source.purpose === purpose); }
function issue(severity: GovernmentAuditSeverity, code: string, government: ReviewedGovernmentPeriod, message: string): GovernmentAuditIssue { return { severity, code, governmentId: government.id, message }; }
