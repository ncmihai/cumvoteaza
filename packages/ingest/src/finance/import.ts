import { sql } from "drizzle-orm";
import * as schema from "@cumsevoteaza/db";
import type { DbClient } from "@cumsevoteaza/db";
import { readAnnualReports, reportPageUrl, type IncomeKind } from "./aep-reports";

/** A party's name compared with ours: no diacritics, no leading "Partidul", no spaces or punctuation. */
const bare = (name: string) => name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/^partidul /, "").replace(/ /g, "");

export interface ImportFinanceResult {
  persisted: boolean;
  reportsRead: number;
  reportsSkipped: Array<{ id: string; why: string; title: string }>;
  rows: number;
  rowsLinesAddUp: number;
  partiesLinked: number;
  /** Party names in the reports that are none of the parties we hold. */
  unmatchedParties: string[];
  years: number[];
  written: number;
}

const money = (value: number) => value.toFixed(2);

/** Writes `party_finance_years` from the saved AEP reports (offline apart from the database). Dry run unless `persist`. */
export async function importFinance(db: DbClient, options: { repoRoot: string; persist: boolean }): Promise<ImportFinanceResult> {
  const parties = [...(await db.execute<{ id: string; name: string }>(sql`select id, name from parties`))];
  const byName = new Map(parties.map((party) => [bare(party.name), party.id]));
  const read = await readAnnualReports(options.repoRoot);
  const readAt = new Date();
  const rows: Array<typeof schema.partyFinanceYears.$inferInsert> = [];
  const unmatched = new Set<string>();
  const skipped: ImportFinanceResult["reportsSkipped"] = [];
  let reportsRead = 0;
  for (const item of read) {
    if (!item.report) {
      skipped.push({ id: item.portalId, why: item.skipped ?? "unread", title: item.title.slice(0, 160) });
      continue;
    }
    reportsRead += 1;
    const report = item.report;
    const partyId = byName.get(bare(report.party));
    if (!partyId) unmatched.add(report.party);
    for (const year of report.years) {
      const total = (kind: IncomeKind) => year.income.filter((line) => line.kind === kind).reduce((sum, line) => sum + line.lei, 0);
      // A breakdown that does not add up to the total is not stored as if it did: the zeros then mean "not given", which `lines_add_up` says.
      const give = (kind: IncomeKind) => money(year.linesAddUp ? total(kind) : 0);
      rows.push({
        id: `${item.portalId}-${year.year}`,
        reportId: item.portalId,
        reportNumber: item.number || null,
        reportDate: item.issuedOn ?? null,
        gazetteNumber: item.gazetteNumber ?? null,
        gazetteOn: item.gazetteOn ?? null,
        portalUrl: reportPageUrl(item.portalId),
        partyName: report.party,
        partyId: partyId ?? null,
        year: year.year,
        incomeTotal: year.incomeTotal === undefined ? null : money(year.incomeTotal),
        incomeDues: give("dues"),
        incomeDonations: give("donations"),
        incomeLoans: give("loans"),
        incomeSubsidy: give("subsidy"),
        incomeRefund: give("refund"),
        incomeInterest: give("interest"),
        incomeOther: give("other"),
        expensesTotal: year.expensesTotal === undefined ? null : money(year.expensesTotal),
        linesAddUp: year.linesAddUp,
        nothingRegistered: report.nothingRegistered,
        note: year.note ?? null,
        fineLei: report.fineLei === undefined ? null : money(report.fineLei),
        confiscatedLei: report.confiscatedLei === undefined ? null : money(report.confiscatedLei),
        violations: report.violations,
        readAt
      });
    }
  }
  const result: ImportFinanceResult = {
    persisted: options.persist,
    reportsRead,
    reportsSkipped: skipped,
    rows: rows.length,
    rowsLinesAddUp: rows.filter((row) => row.linesAddUp).length,
    partiesLinked: new Set(rows.flatMap((row) => (row.partyId ? [row.partyId] : []))).size,
    unmatchedParties: [...unmatched].sort(),
    years: [...new Set(rows.map((row) => row.year))].sort(),
    written: 0
  };
  if (!options.persist || rows.length === 0) return result;
  await db.transaction(async (tx) => {
    await tx.execute(sql`delete from party_finance_years`);
    for (let i = 0; i < rows.length; i += 200) await tx.insert(schema.partyFinanceYears).values(rows.slice(i, i + 200));
  });
  result.written = rows.length;
  return result;
}

export interface ImportCampaignsResult {
  persisted: boolean;
  reportsSaved: number;
  reportsRead: number;
  reportsSkipped: Array<{ id: string; title: string }>;
  partiesLinked: number;
  unmatchedParties: number;
  byKind: Record<string, number>;
  written: number;
}

/** Writes `party_campaign_finance` from the saved AEP campaign reports (offline apart from the database). Dry run unless `persist`. */
export async function importCampaigns(db: DbClient, options: { repoRoot: string; persist: boolean }): Promise<ImportCampaignsResult> {
  const { readCampaignReports } = await import("./aep-reports");
  const parties = [...(await db.execute<{ id: string; name: string }>(sql`select id, name from parties`))];
  const byName = new Map(parties.map((party) => [bare(party.name), party.id]));
  const read = await readCampaignReports(options.repoRoot);
  const readAt = new Date();
  const rows: Array<typeof schema.partyCampaignFinance.$inferInsert> = [];
  const skipped: ImportCampaignsResult["reportsSkipped"] = [];
  for (const item of read) {
    const report = item.report;
    if (!report) {
      skipped.push({ id: item.portalId, title: item.title.slice(0, 160) });
      continue;
    }
    rows.push({
      id: item.portalId,
      reportId: item.portalId,
      reportNumber: item.number || null,
      reportDate: item.issuedOn ?? null,
      gazetteNumber: item.gazetteNumber ?? null,
      gazetteOn: item.gazetteOn ?? null,
      portalUrl: reportPageUrl(item.portalId),
      partyName: report.party,
      partyId: byName.get(bare(report.party)) ?? null,
      electionKind: report.kind,
      electionYear: report.year,
      electionLabel: report.election,
      contributions: report.contributions === undefined ? null : money(report.contributions),
      expenses: report.expenses === undefined ? null : money(report.expenses),
      reimbursementRequested: report.reimbursementRequested === undefined ? null : money(report.reimbursementRequested),
      invalidated: report.invalidated === undefined ? null : money(report.invalidated),
      note: report.note ?? null,
      fineLei: report.fineLei === undefined ? null : money(report.fineLei),
      warned: report.warned,
      violations: report.violations,
      readAt
    });
  }
  const byKind: Record<string, number> = {};
  for (const row of rows) byKind[row.electionKind] = (byKind[row.electionKind] ?? 0) + 1;
  const result: ImportCampaignsResult = {
    persisted: options.persist,
    reportsSaved: read.length,
    reportsRead: rows.length,
    reportsSkipped: skipped,
    partiesLinked: new Set(rows.flatMap((row) => (row.partyId ? [row.partyId] : []))).size,
    unmatchedParties: new Set(rows.filter((row) => !row.partyId).map((row) => row.partyName)).size,
    byKind,
    written: 0
  };
  if (!options.persist || rows.length === 0) return result;
  await db.transaction(async (tx) => {
    await tx.execute(sql`delete from party_campaign_finance`);
    for (let i = 0; i < rows.length; i += 200) await tx.insert(schema.partyCampaignFinance).values(rows.slice(i, i + 200));
  });
  result.written = rows.length;
  return result;
}
