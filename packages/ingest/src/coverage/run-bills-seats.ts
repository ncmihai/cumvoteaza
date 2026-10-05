import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { sql } from "drizzle-orm";
import { createDbSession } from "@cumsevoteaza/db";
import { chamberSeatCountsByLegislature } from "@cumsevoteaza/parliament-model";
import { parseDeputiesYearlyList, parseSenateYearlyList } from "../sync";
import { buildBillCoverage, renderBillCoverageMarkdown, type BillCoverageReport, type OfficialBill } from "./bill-coverage";
import { fetchBillDossiers, type DossierFetchResult, type DossierSource } from "./fetch-bill-dossiers";
import { fetchBillLists, CDEP_BILLS_YEAR_URL, SENATE_BILLS_YEAR_URL } from "./fetch-bill-lists";
import type { ListFetchResult } from "./fetch-cdep-lists";
import { PoliteFetcher } from "./polite-fetcher";
import { decodeOfficialBytes, RawCache } from "./raw-cache";
import { COVERAGE_RAW_DIR } from "./run-fetch";

const REPORT_DIR = (repoRoot: string) => path.join(repoRoot, "data", "coverage", "reports");

export async function runBillListFetch(options: {
  repoRoot: string;
  years: number[];
  sources: Array<"cdep" | "senate">;
  live: boolean;
  maxRequests: number;
  delayMs: number;
  refresh?: boolean;
  log?: (line: string) => void;
}): Promise<ListFetchResult> {
  return fetchBillLists({
    years: options.years,
    sources: options.sources,
    cache: new RawCache(COVERAGE_RAW_DIR(options.repoRoot)),
    fetcher: new PoliteFetcher({ maxRequests: options.maxRequests, delayMs: options.delayMs }),
    refresh: options.refresh,
    dryRun: !options.live,
    log: options.log
  });
}

/** Sprint 7: one page per bill dossier named by the saved yearly lists, saved raw. Plan only unless `live`. */
export async function runBillDossierFetch(options: {
  repoRoot: string;
  years: number[];
  sources: DossierSource[];
  live: boolean;
  maxRequests: number;
  delayMs: number;
  limit?: number;
  only?: string[];
  refresh?: boolean;
  uncoveredOnly?: boolean;
  extraSenate?: string[];
  log?: (line: string) => void;
}): Promise<DossierFetchResult> {
  return fetchBillDossiers({
    cache: new RawCache(COVERAGE_RAW_DIR(options.repoRoot)),
    fetcher: new PoliteFetcher({ maxRequests: options.maxRequests, delayMs: options.delayMs }),
    years: options.years,
    sources: options.sources,
    limit: options.limit,
    only: options.only,
    refresh: options.refresh,
    uncoveredOnly: options.uncoveredOnly,
    extraSenate: options.extraSenate,
    dryRun: !options.live,
    log: options.log
  });
}

/** Offline: the saved yearly bill lists against the bills in the database (read-only). */
export async function runBillCoverageReport(options: { repoRoot: string; years: number[]; today: string }): Promise<{ report: BillCoverageReport; missingLists: string[]; files: { markdown: string; json: string } }> {
  const cache = new RawCache(COVERAGE_RAW_DIR(options.repoRoot));
  const official: OfficialBill[] = [];
  const pageCounts: Array<{ chamber: "deputies" | "senate"; year: number; announced: number }> = [];
  const missingLists: string[] = [];
  const yearOf = (id: string) => Number(id.match(/\/(\d{4})$/)?.[1]);
  for (const year of options.years) {
    const cdep = await cache.read("cdep-bills-year", String(year));
    if (cdep) {
      const parsed = parseDeputiesYearlyList(decodeOfficialBytes(cdep), CDEP_BILLS_YEAR_URL(year));
      for (const item of parsed.discoveries) if (item.officialId) official.push({ chamber: "deputies", officialId: item.officialId, year: yearOf(item.officialId) || year });
      if (parsed.expectedCount !== undefined) pageCounts.push({ chamber: "deputies", year, announced: parsed.expectedCount });
    } else missingLists.push(`deputies ${year}`);
    const senate = await cache.read("senate-bills-year", String(year));
    if (senate) {
      for (const item of parseSenateYearlyList(decodeOfficialBytes(senate), SENATE_BILLS_YEAR_URL(year)).discoveries) if (item.officialId) official.push({ chamber: "senate", officialId: item.officialId, year: yearOf(item.officialId) || year });
    } else missingLists.push(`senate ${year}`);
  }
  const session = createDbSession();
  let stored: Array<{ id: string; identifiers: Record<string, string> }>;
  try {
    stored = [...(await session.db.execute<{ id: string; identifiers: Record<string, string> }>(sql`select id, identifiers from bills`))];
  } finally {
    await session.close();
  }
  const report = buildBillCoverage({ official, stored, pageCounts });
  await mkdir(REPORT_DIR(options.repoRoot), { recursive: true });
  const base = path.join(REPORT_DIR(options.repoRoot), `bills-coverage-${options.years[0]}_${options.years.at(-1)}`);
  await writeFile(`${base}.json`, `${JSON.stringify({ generatedAt: options.today, missingLists, ...report }, null, 2)}\n`);
  await writeFile(`${base}.md`, renderBillCoverageMarkdown(report, options.today));
  return { report, missingLists, files: { markdown: `${base}.md`, json: `${base}.json` } };
}

export interface SeatRow {
  legislature: string;
  chamber: "deputies" | "senate";
  /** Legal number of seats (packages/parliament-model seat counts). */
  seats: number | undefined;
  /** Mandates with no end date. */
  openMandates: number;
  /** Everyone who held a mandate in the legislature, replacements included. */
  mandatesEver: number;
}

/** DB only: how many people sit against how many seats exist, per legislature. */
export async function runSeatCoverage(): Promise<SeatRow[]> {
  const session = createDbSession();
  try {
    const rows = await session.db.execute<{ label: string; chamber: "deputies" | "senate"; open_mandates: number; mandates_ever: number }>(sql`
      select l.label, m.chamber::text as chamber,
             count(*) filter (where m.ends_on is null)::int as open_mandates,
             count(*)::int as mandates_ever
      from member_mandates m join legislatures l on l.id = m.legislature_id
      group by l.label, m.chamber, l.starts_on order by l.starts_on desc, m.chamber`);
    return rows.map((row) => ({ legislature: row.label, chamber: row.chamber, seats: chamberSeatCountsByLegislature[row.label]?.[row.chamber], openMandates: row.open_mandates, mandatesEver: row.mandates_ever }));
  } finally {
    await session.close();
  }
}

export function renderSeatCoverageMarkdown(rows: SeatRow[]): string {
  const lines = ["| Legislature | Chamber | Legal seats | Mandates still open | Mandates ever held |", "| --- | --- | ---: | ---: | ---: |"];
  for (const row of rows) lines.push(`| ${row.legislature} | ${row.chamber === "deputies" ? "Chamber" : "Senate"} | ${row.seats ?? "?"} | ${row.openMandates} | ${row.mandatesEver} |`);
  lines.push("", "Mandates still open are only meaningful for the current legislature: past mandates mostly have no end date yet (roster refresh, Sprint 6).");
  return `${lines.join("\n")}\n`;
}
