import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import * as schema from "@cumsevoteaza/db";
import type { DbClient } from "@cumsevoteaza/db";
import { decodeOfficialBytes } from "../coverage/raw-cache";
import { matchByName, type NameCandidate } from "../dossiers/member-match";
import { parseSanctionsPage, type ParsedSanction } from "./sanctions-parse";
import { SANCTION_LEGISLATURES, sanctionsKey, sanctionsUrl } from "./sanctions-fetch";

/**
 * D-052: the saved sanctions pages read into `member_sanctions`. Nothing is requested. A deputy is tied to an entry only when the printed name fits exactly one deputy who sat on the date
 * of the entry (or in that legislature, for an entry with no date); otherwise the row is kept without a member and listed, never guessed.
 */
export interface ImportSanctionsResult {
  persisted: boolean;
  pages: number;
  entries: number;
  matched: number;
  unmatched: Array<{ legislature: string; heldOn?: string; name?: string; reason: string }>;
  informational: number;
  byKind: Record<string, number>;
  upheldContestations: number;
  rowsWritten: number;
  rowsDeleted: number;
}

export async function importSanctions(db: DbClient, options: { repoRoot: string; persist: boolean; log?: (line: string) => void }): Promise<ImportSanctionsResult> {
  const result: ImportSanctionsResult = { persisted: options.persist, pages: 0, entries: 0, matched: 0, unmatched: [], informational: 0, byKind: {}, upheldContestations: 0, rowsWritten: 0, rowsDeleted: 0 };

  const mandates = [...(await db.execute<{ id: string; person_id: string | null; name: string; starts_on: string; ends_on: string; legislature_start: string; legislature_end: string }>(sql`
    select m.id, m.person_id, m.display_name as name, mm.starts_on::text as starts_on, coalesce(mm.ends_on, l.ends_on)::text as ends_on, l.starts_on::text as legislature_start, l.ends_on::text as legislature_end
    from members m join member_mandates mm on mm.member_id = m.id join legislatures l on l.id = mm.legislature_id where mm.chamber = 'deputies'`))];
  const personOf = new Map(mandates.map((row) => [row.id, row.person_id]));
  const candidates: NameCandidate[] = mandates.map((row) => ({ id: row.id, name: row.name, startsOn: row.starts_on, endsOn: row.ends_on }));

  const rows: Array<typeof schema.memberSanctions.$inferInsert> = [];
  const readAt = new Date();
  for (const legislature of SANCTION_LEGISLATURES) {
    let html: string;
    try {
      html = decodeOfficialBytes(await readFile(path.join(options.repoRoot, "data/coverage/raw/member-sanctions", `${sanctionsKey(legislature)}.html`)));
    } catch {
      continue;
    }
    result.pages += 1;
    const page = parseSanctionsPage(html, legislature);
    result.informational += page.informational.length;
    // An entry with no date is matched among the deputies of that legislature (the year of the legislature, 2024 for 2024-2028).
    const sitting = candidates.filter((candidate) => candidate.startsOn.slice(0, 4) <= String(Number(legislature) + 3) && candidate.endsOn.slice(0, 4) >= legislature);
    for (const entry of page.entries) {
      result.entries += 1;
      result.byKind[entry.kind] = (result.byKind[entry.kind] ?? 0) + 1;
      if (entry.contestation?.outcome === "upheld") result.upheldContestations += 1;
      const { memberId, status } = entry.nameText ? tie(entry, entry.heldOn ? candidates : sitting) : { memberId: undefined, status: "no_name" as const };
      if (memberId) result.matched += 1;
      else result.unmatched.push({ legislature, ...(entry.heldOn ? { heldOn: entry.heldOn } : {}), ...(entry.nameText ? { name: entry.nameText } : {}), reason: status });
      rows.push(rowOf(entry, memberId, memberId ? personOf.get(memberId) ?? null : null, status, sanctionsUrl(legislature), readAt));
    }
  }
  if (!options.persist) return result;

  const keep = new Set(rows.map((row) => row.id));
  const loaded = new Set(SANCTION_LEGISLATURES.filter((legislature) => rows.some((row) => row.legislature === legislature)));
  const existing = [...(await db.execute<{ id: string; legislature: string }>(sql`select id, legislature from member_sanctions`))];
  const stale = existing.filter((row) => loaded.has(row.legislature as (typeof SANCTION_LEGISLATURES)[number]) && !keep.has(row.id)).map((row) => row.id);
  for (const row of rows) {
    await db.insert(schema.memberSanctions).values(row).onConflictDoUpdate({ target: schema.memberSanctions.id, set: { ...row, id: undefined } });
    result.rowsWritten += 1;
  }
  for (const id of stale) {
    await db.execute(sql`delete from member_sanctions where id = ${id}`);
    result.rowsDeleted += 1;
  }
  options.log?.(`Sanctions: ${result.rowsWritten} written, ${result.rowsDeleted} removed`);
  return result;
}

function tie(entry: ParsedSanction, candidates: NameCandidate[]): { memberId?: string; status: "matched" | "unmatched" | "ambiguous" } {
  const match = matchByName(entry.nameText!, entry.heldOn, candidates);
  return match.id ? { memberId: match.id, status: "matched" } : { status: match.ambiguous ? "ambiguous" : "unmatched" };
}

function rowOf(entry: ParsedSanction, memberId: string | undefined, personId: string | null, status: "matched" | "unmatched" | "ambiguous" | "no_name", sourceUrl: string, readAt: Date): typeof schema.memberSanctions.$inferInsert {
  return {
    id: entry.id,
    legislature: entry.legislature,
    memberId: memberId ?? null,
    personId,
    nameText: entry.nameText ?? null,
    groupLabel: entry.groupLabel ?? null,
    heldOn: entry.heldOn ?? null,
    headline: entry.headline,
    kind: entry.kind,
    parts: entry.parts,
    article: entry.article ?? null,
    decisionLabel: entry.decision?.label ?? null,
    decisionNumber: entry.decision?.number ?? null,
    decisionDated: entry.decision?.dated ?? null,
    decisionUrl: entry.decision?.url ?? null,
    contestationFiledUrl: entry.contestationFiledUrl ?? null,
    contestationOutcome: entry.contestation?.outcome ?? null,
    contestationLabel: entry.contestation?.label ?? null,
    contestationUrl: entry.contestation?.url ?? null,
    stenogramUrl: entry.stenogramUrl ?? null,
    matchStatus: status,
    sourceUrl,
    contentHash: createHash("sha256").update(JSON.stringify(entry)).digest("hex"),
    readAt
  };
}
