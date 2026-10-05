import { sql } from "drizzle-orm";
import { createDbSession } from "@cumsevoteaza/db";
import { readUnsupportedRegistry, unsupportedKeys } from "./coverage/unsupported-registry";
import { loadOfficialVotes } from "./coverage/load-official-votes";
import { RawCache } from "./coverage/raw-cache";
import { COVERAGE_RAW_DIR } from "./coverage/run-fetch";
import { loadStoredVotes } from "./coverage/run-report";
import { storedOfficialKey, type OfficialVoteRecord, type StoredVoteRow } from "./coverage/vote-coverage";

export interface DiscoveryRow {
  id: string;
  officialId: string | null;
  status: string;
}

export type TriageOutcome =
  | { rule: "older_legislature"; status: "skipped"; reason: string }
  | { rule: "already_imported"; status: "imported"; reason: string }
  | { rule: "test_ballot"; status: "skipped"; reason: string }
  | { rule: "attendance_check"; status: "skipped"; reason: string }
  | { rule: "joint_amendment_summarised"; status: "skipped"; reason: string }
  | { rule: "still_to_import"; status: "pending"; reason: string }
  | { rule: "not_on_official_lists"; status: "pending"; reason: string };

/**
 * Decides what a pending or failed CDEP vote discovery really is. Pure: the official lists, the votes we hold and the
 * known attendance checks are inputs. Reasons are written to the discovery row so nothing is retired silently.
 */
export function triageVoteDiscovery(
  row: DiscoveryRow,
  context: { firstInScopeId: number; officialById: ReadonlyMap<string, OfficialVoteRecord>; heldIds: ReadonlySet<string>; unsupportedIds: ReadonlySet<string> }
): TriageOutcome | undefined {
  if (!row.officialId || !/^\d+$/.test(row.officialId)) return undefined;
  if (Number(row.officialId) < context.firstInScopeId) {
    return { rule: "older_legislature", status: "skipped", reason: "Before the 2024–2028 legislature: older legislatures are not imported yet (Q16)." };
  }
  if (context.heldIds.has(row.officialId)) return { rule: "already_imported", status: "imported", reason: "Imported by the votes backfill." };
  const official = context.officialById.get(row.officialId);
  if (official?.isTest) return { rule: "test_ballot", status: "skipped", reason: "CDEP test ballot (\"Vot test\"), not a vote." };
  if (context.unsupportedIds.has(row.officialId)) return { rule: "attendance_check", status: "skipped", reason: "Attendance check: the page lists who was present, with no vote choices." };
  if (official?.summarised) return { rule: "joint_amendment_summarised", status: "skipped", reason: "Joint article or amendment vote, kept as one summary per sitting (D-022)." };
  if (official) return { rule: "still_to_import", status: "pending", reason: "On the official list and not imported yet." };
  return { rule: "not_on_official_lists", status: "pending", reason: "Not on the official day lists fetched so far; check before importing." };
}

export interface TriageSummary {
  persisted: boolean;
  examined: number;
  byRule: Record<string, number>;
  /** Discoveries left pending, with the rule that kept them. */
  leftPending: Array<{ officialId: string | null; rule: string }>;
  changed: number;
}

export async function runDiscoveryTriage(options: { repoRoot: string; persist: boolean }): Promise<TriageSummary> {
  const cache = new RawCache(COVERAGE_RAW_DIR(options.repoRoot));
  const official = await loadOfficialVotes(cache, "2024-12-21", "2100-01-01");
  const cdep = official.records.filter((record) => record.source === "cdep");
  const firstInScopeId = Math.min(...cdep.map((record) => Number(record.officialId)));
  const stored: StoredVoteRow[] = await loadStoredVotes("2024-12-21", "2100-01-01");
  const heldIds = new Set(stored.flatMap((vote) => { const key = storedOfficialKey(vote); return key?.source === "cdep" ? [key.officialId] : []; }));
  const unsupportedIds = new Set([...unsupportedKeys(await readUnsupportedRegistry(options.repoRoot))].filter((key) => key.startsWith("cdep:")).map((key) => key.slice(5)));
  const officialById = new Map(cdep.map((record) => [record.officialId, record]));

  const session = createDbSession();
  try {
    const rows = [...(await session.db.execute<{ id: string; official_id: string | null; status: string }>(sql`
      select id, official_id, status::text as status from source_discoveries where kind = 'vote' and chamber = 'deputies' and status in ('pending', 'failed')`))]
      .map((row) => ({ id: row.id, officialId: row.official_id, status: row.status }));
    const summary: TriageSummary = { persisted: options.persist, examined: rows.length, byRule: {}, leftPending: [], changed: 0 };
    const updates = new Map<string, { status: TriageOutcome["status"]; ids: string[] }>();
    for (const row of rows) {
      const outcome = triageVoteDiscovery(row, { firstInScopeId, officialById, heldIds, unsupportedIds });
      if (!outcome) continue;
      summary.byRule[outcome.rule] = (summary.byRule[outcome.rule] ?? 0) + 1;
      if (outcome.status === "pending") {
        summary.leftPending.push({ officialId: row.officialId, rule: outcome.rule });
        continue;
      }
      const key = `${outcome.status}|${outcome.reason}`;
      updates.set(key, { status: outcome.status, ids: [...(updates.get(key)?.ids ?? []), row.id] });
    }
    if (options.persist) {
      for (const [key, update] of updates) {
        const reason = key.slice(key.indexOf("|") + 1);
        for (let index = 0; index < update.ids.length; index += 500) {
          const batch = update.ids.slice(index, index + 500).map((id) => sql`${id}`);
          await session.db.execute(sql`
            update source_discoveries
            set status = ${update.status}::source_discovery_status, last_error = ${reason}, imported_at = case when ${update.status} = 'imported' then now() else imported_at end
            where id in (${sql.join(batch, sql`, `)})`);
          summary.changed += batch.length;
        }
      }
    }
    return summary;
  } finally {
    await session.close();
  }
}
