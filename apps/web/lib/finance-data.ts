import { unstable_cache } from "next/cache";
import { sql } from "drizzle-orm";
import { CACHE_TAGS, createWebDbSession } from "./server-db";

/**
 * Party money (Sprint 15 follow-up): what the Permanent Electoral Authority's control reports in the Official Gazette say each party took in and spent in a year, from `party_finance_years`.
 * The amounts are the AEP's, in lei. A report that gives no figures (the party did not send its documents, or declared nothing) has a note and no amount; a breakdown that does not add up to the
 * total is left out (`linesAddUp`). Every function answers "nothing" when the table is not there yet (the deploy can come before the migration).
 */
export interface FinanceRow {
  id: string;
  partyName: string;
  partySlug?: string;
  partyDisplayName?: string;
  year: number;
  incomeTotal?: number;
  /** Present only where the report's lines add up to the total. */
  breakdown?: { dues: number; donations: number; loans: number; subsidy: number; refund: number; interest: number; other: number };
  expensesTotal?: number;
  note?: string;
  fine?: number;
  confiscated?: number;
  violations: string[];
  reportNumber?: string;
  reportDate?: string;
  gazetteNumber?: string;
  portalUrl: string;
}

type Raw = {
  id: string;
  party_name: string;
  slug: string | null;
  display_name: string | null;
  year: number;
  income_total: string | null;
  income_dues: string;
  income_donations: string;
  income_loans: string;
  income_subsidy: string;
  income_refund: string;
  income_interest: string;
  income_other: string;
  expenses_total: string | null;
  lines_add_up: boolean;
  note: string | null;
  fine_lei: string | null;
  confiscated_lei: string | null;
  violations: string[] | null;
  report_number: string | null;
  report_date: string | null;
  gazette_number: string | null;
  portal_url: string;
}

const toRow = (row: Raw): FinanceRow => ({
  id: row.id,
  partyName: row.party_name,
  ...(row.slug ? { partySlug: row.slug, partyDisplayName: row.display_name ?? row.party_name } : {}),
  year: Number(row.year),
  ...(row.income_total === null ? {} : { incomeTotal: Number(row.income_total) }),
  ...(row.lines_add_up && row.income_total !== null ? { breakdown: { dues: Number(row.income_dues), donations: Number(row.income_donations), loans: Number(row.income_loans), subsidy: Number(row.income_subsidy), refund: Number(row.income_refund), interest: Number(row.income_interest), other: Number(row.income_other) } } : {}),
  ...(row.expenses_total === null ? {} : { expensesTotal: Number(row.expenses_total) }),
  ...(row.note ? { note: row.note } : {}),
  ...(row.fine_lei === null ? {} : { fine: Number(row.fine_lei) }),
  ...(row.confiscated_lei === null ? {} : { confiscated: Number(row.confiscated_lei) }),
  violations: Array.isArray(row.violations) ? row.violations : [],
  ...(row.report_number ? { reportNumber: row.report_number } : {}),
  ...(row.report_date ? { reportDate: String(row.report_date).slice(0, 10) } : {}),
  ...(row.gazette_number ? { gazetteNumber: row.gazette_number } : {}),
  portalUrl: row.portal_url
});

async function queryFinance(partyId?: string): Promise<FinanceRow[]> {
  if (!process.env.DATABASE_URL) return [];
  const session = createWebDbSession();
  try {
    const rows = await session.db.execute<Raw>(sql`
      select f.id, f.party_name, p.slug, p.name as display_name, f.year, f.income_total::text, f.income_dues::text, f.income_donations::text, f.income_loans::text, f.income_subsidy::text, f.income_refund::text,
             f.income_interest::text, f.income_other::text, f.expenses_total::text, f.lines_add_up, f.note, f.fine_lei::text, f.confiscated_lei::text, f.violations, f.report_number, f.report_date::text,
             f.gazette_number, f.portal_url
      from party_finance_years f left join parties p on p.id = f.party_id
      ${partyId ? sql`where f.party_id = ${partyId}` : sql``}
      order by f.year desc, f.income_total desc nulls last, f.party_name`);
    return [...rows].map(toRow);
  } finally {
    await session.close();
  }
}

// A failed read must not be remembered for an hour: it throws inside the cache and the callers turn it into "nothing".
const cachedFinance = unstable_cache(async (partyId: string) => queryFinance(partyId || undefined), ["party-finance-v2"], { revalidate: 3600, tags: [CACHE_TAGS.parties] });

/** Every party and year the reports cover, newest year first and the largest income first; `partyId` narrows it to one party we hold. */
export async function getFinance(partyId?: string): Promise<FinanceRow[]> {
  try {
    return await cachedFinance(partyId ?? "");
  } catch {
    return [];
  }
}
