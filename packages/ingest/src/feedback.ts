import { sql } from "drizzle-orm";
import type { DbClient } from "@cumsevoteaza/db";

export interface FeedbackRow extends Record<string, unknown> {
  id: string;
  kind: string;
  message: string;
  page_path: string | null;
  locale: string | null;
  contact: string | null;
  status: string;
  created_at: string;
}

export const FEEDBACK_STATUSES = ["new", "read", "done"] as const;

/** The reports visitors sent through the site's feedback form (D-031), newest first. Read-only. */
export async function listFeedback(db: DbClient, options: { status?: string; limit?: number } = {}): Promise<FeedbackRow[]> {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 500);
  const rows = await db.execute<FeedbackRow>(sql`
    select id, kind, message, page_path, locale, contact, status, created_at::text as created_at
    from feedback_reports
    where (${options.status ?? null}::text is null or status = ${options.status ?? null})
    order by created_at desc
    limit ${limit}`);
  return [...rows];
}

/** Sets the status of the given reports (new, read, done). Only the status changes; the message is never edited. */
export async function markFeedback(db: DbClient, ids: string[], status: string): Promise<number> {
  if (!(FEEDBACK_STATUSES as readonly string[]).includes(status)) throw new Error(`status must be one of ${FEEDBACK_STATUSES.join(", ")}`);
  if (ids.length === 0) return 0;
  const rows = await db.execute<{ id: string }>(sql`
    update feedback_reports set status = ${status} where id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)}) returning id`);
  return [...rows].length;
}

export function formatFeedback(rows: FeedbackRow[]): string {
  if (rows.length === 0) return "No reports.";
  return rows.map((row) => [
    `${row.created_at.slice(0, 16)}  [${row.status}]  ${row.kind}  ${row.id}`,
    row.page_path ? `  page: ${row.page_path}${row.locale ? ` (${row.locale})` : ""}` : undefined,
    row.contact ? `  contact: ${row.contact}` : undefined,
    ...row.message.split("\n").map((line) => `  | ${line}`)
  ].filter((line): line is string => line !== undefined).join("\n")).join("\n\n");
}
