import { sql } from "drizzle-orm";
import type { DbClient } from "@cumsevoteaza/db";
import type { CheckRecord } from "./cv-check";

/**
 * D-050: the owner's look at the CV checks. `members:cv:review` lists the checks that wait for a review (by default the differences); `members:cv:mark` records the
 * owner's decision: reviewed (the check may be shown), or the status changed (a difference that turns out to be our own error is set back to unchecked, or to matches),
 * with a note. Nothing else is edited, and the member's own text is never touched.
 */
export interface CvReviewRow {
  id: string;
  person: string;
  slug: string | null;
  section: string;
  text: string;
  datesText: string | null;
  status: string;
  reason: string | null;
  records: CheckRecord[];
  sourceUrl: string;
  reviewedOn: string | null;
}

export async function listCvChecks(db: DbClient, options: { status?: string; reviewed?: boolean; limit?: number } = {}): Promise<CvReviewRow[]> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 500);
  const status = options.status ?? "differs";
  const rows = await db.execute<{ id: string; person: string; slug: string | null; section: string; raw_text: string; dates_text: string | null; check_status: string; check_reason: string | null; check_records: CheckRecord[]; source_url: string; reviewed_on: string | null }>(sql`
    select e.id, p.display_name as person, (select m.slug from members m where m.person_id = e.person_id order by m.slug limit 1) as slug, e.section, e.raw_text, e.dates_text,
           e.check_status, e.check_reason, e.check_records, e.source_url, e.reviewed_on::text as reviewed_on
    from member_cv_entries e join people p on p.id = e.person_id
    where e.check_status = ${status}
      and (${options.reviewed ?? null}::boolean is null or (e.reviewed_on is not null) = ${options.reviewed ?? null})
    order by p.display_name, e.section, e.position limit ${limit}`);
  return [...rows].map((row) => ({ id: row.id, person: row.person, slug: row.slug, section: row.section, text: row.raw_text, datesText: row.dates_text, status: row.check_status, reason: row.check_reason, records: row.check_records, sourceUrl: row.source_url, reviewedOn: row.reviewed_on }));
}

export function formatCvChecks(rows: CvReviewRow[]): string {
  if (rows.length === 0) return "Nothing waiting.";
  return rows.map((row) => [
    `${row.id}  [${row.status}${row.reviewedOn ? `, reviewed ${row.reviewedOn}` : ", not reviewed"}]  ${row.person}${row.slug ? ` (/members/${row.slug})` : ""}  ${row.section}  reason: ${row.reason ?? "-"}`,
    ...row.text.split("\n").slice(0, 4).map((line) => `  CV : ${line}`),
    ...row.records.slice(0, 6).map((record) => `  ours: ${record.label}  ${record.from ?? "?"} → ${record.to ?? "?"}`),
    `  source: ${row.sourceUrl}`
  ].join("\n")).join("\n\n");
}

export const CV_CHECK_STATUSES = ["unchecked", "matches", "differs"] as const;

/** Records the owner's decision on checks: reviewed (or not), optionally a different status and a note. Returns how many rows changed. */
export async function markCvChecks(db: DbClient, ids: string[], decision: { reviewed?: boolean; status?: string; note?: string }, today = new Date().toISOString().slice(0, 10)): Promise<number> {
  if (ids.length === 0) return 0;
  if (decision.status && !(CV_CHECK_STATUSES as readonly string[]).includes(decision.status)) throw new Error(`status must be one of ${CV_CHECK_STATUSES.join(", ")}`);
  const reviewedOn = decision.reviewed === false ? null : today;
  const rows = await db.execute<{ id: string }>(sql`
    update member_cv_entries set
      reviewed_on = ${reviewedOn}::date,
      check_status = coalesce(${decision.status ?? null}, check_status),
      review_note = coalesce(${decision.note ?? null}, review_note)
    where id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)}) returning id`);
  return [...rows].length;
}
