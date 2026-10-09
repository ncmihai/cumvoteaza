import { unstable_cache } from "next/cache";
import { sql } from "drizzle-orm";
import { createWebDbSession } from "./server-db";

/** How much of the committees' reports could be read (D-035), for the methodology page: per chamber, how many report files, how many were read, and what they gave. */
export interface ReportReadingStats {
  host: "cdep" | "senat";
  reports: number;
  read: number;
  clean: number;
  poor: number;
  none: number;
  withAnnex: number;
  withAuthors: number;
}

async function loadReportReadingStats(): Promise<ReportReadingStats[]> {
  if (!process.env.DATABASE_URL) return [];
  const session = createWebDbSession();
  try {
    const rows = await session.db.execute<{ host: string; reports: number; read: number; clean: number; poor: number; none: number; with_annex: number; with_authors: number }>(sql`
      with reports as (
        select distinct d.id, d.url from bill_procedure_steps s join documents d on d.id = s.document_id
        where s.step_type::text = 'committee_report_received' and s.occurred_on >= '2024-12-20' and d.url ~* '\\.pdf'
      )
      select case when reports.url ~* 'senat\\.ro' then 'senat' else 'cdep' end as host,
        count(*)::int as reports, count(r.document_id)::int as read,
        count(*) filter (where r.quality = 'clean')::int as clean, count(*) filter (where r.quality = 'poor')::int as poor, count(*) filter (where r.quality = 'none')::int as none,
        count(*) filter (where exists (select 1 from committee_report_annexes a where a.document_id = reports.id))::int as with_annex,
        count(*) filter (where exists (select 1 from committee_report_authors a where a.document_id = reports.id))::int as with_authors
      from reports left join committee_report_reads r on r.document_id = reports.id group by 1 order by 1`);
    return [...rows].map((row) => ({ host: row.host === "senat" ? "senat" : "cdep", reports: row.reports, read: row.read, clean: row.clean, poor: row.poor, none: row.none, withAnnex: row.with_annex, withAuthors: row.with_authors }));
  } catch {
    return [];
  } finally {
    await session.close();
  }
}

export const getReportReadingStats = unstable_cache(loadReportReadingStats, ["report-reading-stats-v1"], { revalidate: 3600, tags: ["coverage"] });
