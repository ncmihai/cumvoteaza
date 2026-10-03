import * as cheerio from "cheerio";
import { and, asc, desc, eq, gte, inArray, lt, or } from "drizzle-orm";
import { createDbSession } from "@cumsevoteaza/db";
import * as schema from "@cumsevoteaza/db";
import type { ChamberId, SourceSnapshot, SourceStatus } from "@cumsevoteaza/parliament-model";
import { fetchOfficialSource } from "./fetch-source";
import { parseChamberNominalVote } from "./parsers/chamber-vote";
import { parseDeputiesBill } from "./parsers/deputies-bill";
import { parseSenateBill } from "./parsers/senate-bill";
import { parseSenateVote } from "./parsers/senate-vote";
import { cleanText, hashContent, slugify, snapshotFor } from "./parsers/utils";
import { findOfficialIdentifiers, normalizeOfficialIdentifier } from "./parsers/identifiers";
import { persistChamberVote, persistDeputiesBill, persistSenateBill, persistSenateVote } from "./persist";
import { canonicalizeOfficialUrl } from "./official-urls";
import { refreshReadModels } from "./read-models";

export type DiscoveryKind = "bill" | "vote";
export type DiscoveryStatus = "pending" | "imported" | "partial" | "failed" | "skipped";

export interface SourceDiscoveryInput {
  chamber: ChamberId;
  kind: DiscoveryKind;
  sourceUrl: string;
  officialId?: string;
  title?: string;
  discoveredOn?: string;
  sourceSnapshotId?: string;
}

interface DeputiesYearlyList {
  expectedCount?: number;
  discoveries: SourceDiscoveryInput[];
}

export interface SyncOptions {
  dateFrom?: string;
  dateTo?: string;
  years?: number[];
  maxImports?: number;
  maxRetries?: number;
  refreshExisting?: boolean;
  discoveryLimit?: number;
  dryRun?: boolean;
  chamber?: ChamberId;
  kind?: DiscoveryKind;
  deputiesVoteDates?: string[];
  deputiesVoteMonths?: number[];
  senateFrom?: number;
  senateTo?: number;
  senatePrefixes?: Array<"B" | "BP" | "L" | "PLX">;
  officialId?: string;
  sourceUrl?: string;
}

interface SenateYearlyList {
  expectedCount: number;
  discoveries: SourceDiscoveryInput[];
}

export interface SyncSummary {
  runId?: string;
  dryRun?: boolean;
  discovered: number;
  imported: number;
  partial: number;
  failed: number;
  skipped: number;
  expected?: number;
  newDiscoveries?: number;
  knownByUrl?: number;
  knownByOfficialId?: number;
  wouldImport?: number;
  wouldPartial?: number;
  wouldFail?: number;
  wouldSkip?: number;
  readModels?: {
    billVoteSummaries: number;
    voteCoverageSummaries: number;
    memberLegislatureActivity: number;
    entitySearchIndex: number;
  };
  errors: string[];
}

const defaultYears = yearsSince2024();

export async function discoverSenateSources(options: SyncOptions = {}): Promise<SyncSummary> {
  const summary = await discoverSenateYearlyLists(options.years ?? defaultYears, options);
  if (options.senateFrom && options.senateTo) {
    addSummary(
      summary,
      await discoverGeneratedSenateBills(
        options.years ?? defaultYears,
        options.senateFrom,
        options.senateTo,
        options.senatePrefixes ?? ["L"],
        options
      )
    );
  }
  return summary;
}

export async function discoverDeputiesSources(options: SyncOptions = {}): Promise<SyncSummary> {
  return discoverDeputiesYearlyLists(options.years ?? defaultYears, options);
}

export async function discoverDeputiesVoteSources(options: SyncOptions = {}): Promise<SyncSummary> {
  const years = options.years ?? defaultYears;
  const dates = options.deputiesVoteDates ?? (await discoverDeputiesVoteDates(years, options));
  return discoverSources("deputies", deputiesVoteListUrls(dates), options);
}

export async function discoverSenateVoteSources(options: SyncOptions): Promise<SyncSummary> {
  validateDateRange(options);
  if (!options.dateFrom || !options.dateTo) throw new Error("Senate calendar requires explicit date bounds");
  if (Date.parse(options.dateTo) - Date.parse(options.dateFrom) > 366 * 86400000) throw new Error("Scan at most one year at a time");
  const url = "https://www.senat.ro/voturiplen.aspx";
  let html = await fetchOfficialSource(url, 3);
  const target = "ctl00$B_Center$VoturiPlen1$calVOT";
  async function select(argument: string) {
    const $ = cheerio.load(html);
    if (!$("table.myCalendar").length) throw new Error("Senate voting calendar missing");
    const form = new URLSearchParams();
    $("input[type=hidden][name]").each((_, element) => { form.set($(element).attr("name")!, $(element).attr("value") ?? ""); });
    $("select[name]").each((_, element) => { form.set($(element).attr("name")!, String($(element).val() ?? "")); });
    form.set("__EVENTTARGET", target);
    form.set("__EVENTARGUMENT", argument);
    const response = await fetch(url, { method: "POST", body: form, signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Senate calendar HTTP ${response.status}`);
    html = await response.text();
    return cheerio.load(html);
  }
  const session = createDbSession();
  const summary = syncSummary(Boolean(options.dryRun));
  try {
    // ASP.NET calendar day arguments are observed from each returned month,
    // not guessed vote IDs. Visit every in-range calendar date, including empty days.
    const months = new Set<string>();
    for (let date = options.dateFrom; date <= options.dateTo; date = nextDay(date)) months.add(date.slice(0, 7));
    for (const month of months) {
      try {
        const offset = Math.round((Date.parse(`${month}-01`) - Date.parse("2000-01-01")) / 86400000);
        const $ = await select(`V${offset}`);
        const days = new Map<string, string>();
        $("table.myCalendar a[href]").each((_, element) => {
          const match = $(element).attr("href")?.match(/calVOT','(\d+)'/);
          if (!match) return;
          const date = new Date(Date.parse("2000-01-01") + Number(match[1]) * 86400000).toISOString().slice(0, 10);
          if (date.startsWith(month) && date >= options.dateFrom! && date <= options.dateTo!) days.set(date, match[1]!);
        });
        if (!days.size) throw new Error("Calendar returned no matching dates");
        for (const [date, argument] of days) {
          try {
            const page = await select(argument);
            const expected = date.split("-").reverse().join(".");
            if (!page(".voturi-plen-current-date").text().includes(expected)) throw new Error("Calendar did not select the requested date");
            const snapshot = snapshotFor("senate-vote-calendar", `${url}?selectedDate=${date}`, html, "parsed");
            const discoveries = discoverOfficialLinks(html, url, "senate", snapshot.id).filter((item) => item.kind === "vote");
            if (!options.dryRun) {
              await upsertSourceSnapshot(session.db, snapshot);
              for (const discovery of discoveries) await upsertSourceDiscovery(session.db, { ...discovery, discoveredOn: date });
            }
            summary.discovered += discoveries.length;
            console.log(`Senate calendar ${date}: ${discoveries.length} vote links`);
          } catch (error) { summary.failed++; summary.errors.push(`${date}: ${errorMessage(error)}`); }
        }
      } catch (error) { summary.failed++; summary.errors.push(`${month}: ${errorMessage(error)}`); }
    }
    return summary;
  } finally { await session.close(); }
}

export async function runDailySync(options: SyncOptions = {}): Promise<SyncSummary> {
  const today = new Date().toISOString().slice(0, 10);
  const senateDateFrom = options.dateFrom ?? `${today.slice(0, 8)}01`;
  const senateDateTo = options.dateTo ?? today;
  if (options.dryRun) {
    const summary = syncSummary(true);
    const years = options.years ?? [new Date().getUTCFullYear()];
    addSummary(summary, await discoverSenateSources({ ...options, years }));
    addSummary(summary, await discoverDeputiesSources({ ...options, years }));
    addSummary(summary, await discoverSenateVoteSources({ ...options, dateFrom: senateDateFrom, dateTo: senateDateTo }));
    addSummary(
      summary,
      await discoverDeputiesVoteSources({
        ...options,
        years,
        deputiesVoteMonths: options.deputiesVoteMonths ?? [new Date().getUTCMonth() + 1]
      })
    );
    addSummary(summary, await importPendingDiscoveries({ ...options, years, maxImports: options.maxImports ?? 10, maxRetries: options.maxRetries ?? 4 }));
    return summary;
  }

  const run = await startIngestionRun("daily-sync");
  const summary: SyncSummary = { ...syncSummary(false), runId: run.id };
  try {
    const years = options.years ?? [new Date().getUTCFullYear()];
    const senate = await discoverSenateSources({ ...options, years });
    const deputies = await discoverDeputiesSources({ ...options, years });
    const senateVotes = await discoverSenateVoteSources({ ...options, dateFrom: senateDateFrom, dateTo: senateDateTo });
    const deputiesVotes = await discoverDeputiesVoteSources({
      ...options,
      years,
      deputiesVoteMonths: options.deputiesVoteMonths ?? [new Date().getUTCMonth() + 1]
    });
    addSummary(summary, senate);
    addSummary(summary, deputies);
    addSummary(summary, senateVotes);
    addSummary(summary, deputiesVotes);
    addSummary(summary, await importPendingDiscoveries({ years, maxImports: options.maxImports ?? 10, maxRetries: options.maxRetries ?? 4 }));
    await finishIngestionRun(run.id, statusFromSummary(summary), summary);
    return summary;
  } catch (error) {
    const message = errorMessage(error);
    summary.errors.push(message);
    await finishIngestionRun(run.id, "failed", summary, message);
    return summary;
  }
}

export async function importPendingDiscoveries(options: SyncOptions = {}): Promise<SyncSummary> {
  validateDateRange(options);
  const session = createDbSession();
  const summary = syncSummary(Boolean(options.dryRun));
  try {
    const maxImports = options.maxImports ?? 30;
    const maxRetries = options.maxRetries ?? 4;
    const filters = [
      inArray(schema.sourceDiscoveries.status, options.refreshExisting ? ["imported"] : ["pending", "partial", "failed"]),
      options.chamber ? eq(schema.sourceDiscoveries.chamber, options.chamber) : undefined,
      options.kind ? eq(schema.sourceDiscoveries.kind, options.kind) : undefined,
      options.officialId ? eq(schema.sourceDiscoveries.officialId, options.officialId) : undefined,
      options.sourceUrl ? eq(schema.sourceDiscoveries.sourceUrl, canonicalizeOfficialUrl(options.sourceUrl)) : undefined,
      discoveryYearFilter(options.years),
      options.dateFrom ? gte(schema.sourceDiscoveries.discoveredOn, options.dateFrom) : undefined,
      options.dateTo ? lt(schema.sourceDiscoveries.discoveredOn, nextDay(options.dateTo)) : undefined
    ].filter((filter): filter is Exclude<typeof filter, undefined> => Boolean(filter));
    const rows = await session.db
      .select()
      .from(schema.sourceDiscoveries)
      .where(and(...filters))
      .orderBy(asc(schema.sourceDiscoveries.failureCount), options.refreshExisting ? asc(schema.sourceDiscoveries.lastAttemptAt) : desc(schema.sourceDiscoveries.lastSeenAt))
      .limit(maxImports);

    const importableRows = rows.filter((item) => item.failureCount < maxRetries);
    for (const [index, row] of importableRows.entries()) {
      const result = await importDiscovery(row, { dryRun: Boolean(options.dryRun) });
      addImportResult(summary, result);
      console.log(
        `import:pending progress ${index + 1}/${importableRows.length} ${row.chamber}/${row.kind} ` +
          `${row.officialId ?? row.sourceUrl}: ${result}`
      );
    }
    summary.skipped += rows.filter((item) => item.failureCount >= maxRetries).length;
    if (!options.dryRun && (summary.imported > 0 || summary.partial > 0)) {
      summary.readModels = await refreshReadModels();
    }
    return summary;
  } finally {
    await session.close();
  }
}

function discoveryYearFilter(years?: number[]) {
  const validYears = (years ?? []).filter((year) => Number.isInteger(year));
  if (validYears.length === 0) return undefined;
  return or(
    ...validYears.map((year) =>
      and(
        gte(schema.sourceDiscoveries.discoveredOn, `${year}-01-01`),
        lt(schema.sourceDiscoveries.discoveredOn, `${year + 1}-01-01`)
      )
    )
  );
}

async function discoverSources(chamber: ChamberId, seedUrls: string[], options: SyncOptions): Promise<SyncSummary> {
  const session = createDbSession();
  const summary = syncSummary(Boolean(options.dryRun));
  try {
    const limit = options.discoveryLimit ?? seedUrls.length;
    for (const url of seedUrls.slice(0, limit)) {
      try {
        const html = await fetchOfficialSource(url, 3);
        const snapshot = snapshotFor(`${chamber}-discovery`, url, html, "parsed");
        const discoveries = discoverOfficialLinks(html, url, chamber, options.dryRun ? undefined : snapshot.id);
        if (chamber === "senate" && discoveries.length === 0) {
          const message = `${url}: No Senate dossier links detected; source coverage remains unverified.`;
          summary.failed += 1;
          summary.errors.push(message);
          if (!options.dryRun) await upsertSourceSnapshot(session.db, snapshotFor(`${chamber}-discovery`, url, html, "failed", message));
          continue;
        }
        if (options.dryRun) {
          addDiscoveryClassification(summary, await classifyDiscoveryCandidates(session.db, discoveries));
        } else {
          await upsertSourceSnapshot(session.db, snapshot);
          for (const discovery of discoveries) {
            await upsertSourceDiscovery(session.db, discovery);
          }
        }
        summary.discovered += discoveries.length;
      } catch (error) {
        const message = errorMessage(error);
        summary.failed += 1;
        summary.errors.push(`${url}: ${message}`);
      }
    }
    return summary;
  } finally {
    await session.close();
  }
}

/**
 * The Senate list is an ASP.NET form. A GET of Lista.aspx only returns the
 * search form, so treating it like a link page silently produced zero
 * discoveries. Submit the official year search and turn each returned
 * identifier into the documented number-search URL. Those URLs resolve to
 * the same official dossier page used by the importer.
 */
async function discoverSenateYearlyLists(years: number[], options: SyncOptions): Promise<SyncSummary> {
  const session = createDbSession();
  const summary: SyncSummary = { ...syncSummary(Boolean(options.dryRun)), expected: 0 };
  try {
    const limit = options.discoveryLimit;
    for (const year of years) {
      const searchUrl = `https://www.senat.ro/Legis/Lista.aspx?an_cls=${year}`;
      try {
        const html = await fetchSenateYearSearch(searchUrl, year);
        const parsed = parseSenateYearlyList(html, searchUrl);
        summary.expected = (summary.expected ?? 0) + parsed.expectedCount;
        if (parsed.discoveries.length === 0) {
          const message = `${searchUrl}: Senate search returned no dossier rows; source coverage remains unverified.`;
          summary.failed += 1;
          summary.errors.push(message);
          if (!options.dryRun) {
            await upsertSourceSnapshot(session.db, snapshotFor("senate-yearly-list", searchUrl, html, "failed", message));
          }
          continue;
        }
        const snapshot = snapshotFor("senate-yearly-list", searchUrl, html, "parsed");
        const discoveries = limit === undefined ? parsed.discoveries : parsed.discoveries.slice(0, Math.max(0, limit));
        if (options.dryRun) {
          addDiscoveryClassification(summary, await classifyDiscoveryCandidates(session.db, discoveries));
        } else {
          await upsertSourceSnapshot(session.db, snapshot);
          for (const discovery of discoveries) {
            await upsertSourceDiscovery(session.db, { ...discovery, sourceSnapshotId: snapshot.id });
          }
        }
        summary.discovered += discoveries.length;
      } catch (error) {
        const message = errorMessage(error);
        summary.failed += 1;
        summary.errors.push(`${searchUrl}: ${message}; coverage remains unverified.`);
      }
    }
    return summary;
  } finally {
    await session.close();
  }
}

export function parseSenateYearlyList(html: string, sourceUrl: string, sourceSnapshotId?: string): SenateYearlyList {
  const $ = cheerio.load(html);
  const year = Number(new URL(sourceUrl).searchParams.get("an_cls"));
  const rows = $("table[id*='grdLista'] tr").toArray().slice(1);
  const discoveries: SourceDiscoveryInput[] = [];
  for (const row of rows) {
    // Cheerio concatenates adjacent cells ("1L316/2025"), which prevents
    // the identifier parser from seeing the row number and bill number as
    // separate tokens. Join cells explicitly to preserve that boundary.
    const rowText = cleanText(
      $(row)
        .find("td")
        .toArray()
        .map((cell) => cleanText($(cell).text()))
        .join(" ")
    );
    const identifier = findOfficialIdentifiers(rowText, year).find((item) => item.kind === "senate");
    if (!identifier) continue;
    const detailUrl = new URL(
      `/Legis/Lista.aspx?an_cls=${identifier.year}&nr_cls=${identifier.prefix}${identifier.number}`,
      sourceUrl
    ).toString();
    discoveries.push({
      chamber: "senate",
      kind: "bill",
      sourceUrl: detailUrl,
      officialId: identifier.value,
      title: titleFromRow(rowText, identifier.value),
      discoveredOn: `${identifier.year}-01-01`,
      sourceSnapshotId
    });
  }
  return {
    expectedCount: discoveries.length,
    discoveries: uniqueBy(discoveries, (discovery) => discovery.officialId ?? discovery.sourceUrl)
  };
}

async function fetchSenateYearSearch(searchUrl: string, year: number): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const first = await fetch(searchUrl, {
      signal: controller.signal,
      headers: { "user-agent": "cumsevoteaza-ingest/0.1 (+private research)" }
    });
    if (!first.ok) throw new Error(`HTTP ${first.status} ${first.statusText}`);
    const firstHtml = await first.text();
    const $ = cheerio.load(firstHtml);
    const form = $("form").first();
    if (form.length === 0) throw new Error("Senate search form missing");
    const body = new URLSearchParams();
    form.find("input,select,textarea").each((_, element) => {
      const field = $(element);
      const name = field.attr("name");
      if (!name) return;
      if (element.tagName === "select") {
        const selected = field.find("option[selected]").first();
        if (selected.length) body.set(name, selected.attr("value") ?? selected.text());
      } else if (field.attr("type") === "checkbox") {
        if (field.attr("checked") !== undefined) body.set(name, field.attr("value") ?? "on");
      } else if (!['submit', 'button'].includes(field.attr("type") ?? "")) {
        body.set(name, field.attr("value") ?? "");
      }
    });
    body.set("ctl00$B_Center$Lista$ddAni", String(year));
    body.set("ctl00$B_Center$Lista$chkFaraPaginare", "on");
    body.set("__EVENTTARGET", "ctl00$B_Center$Lista$btnCauta2");
    body.set("__EVENTARGUMENT", "");
    const action = new URL(form.attr("action") || searchUrl, searchUrl).toString();
    const cookies = first.headers.getSetCookie?.().map((cookie) => cookie.split(";", 1)[0]).join("; ");
    const response = await fetch(action, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": "cumsevoteaza-ingest/0.1 (+private research)",
        ...(cookies ? { cookie: cookies } : {}),
        referer: searchUrl
      },
      body
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function discoverDeputiesYearlyLists(years: number[], options: SyncOptions): Promise<SyncSummary> {
  const session = createDbSession();
  const summary: SyncSummary = { ...syncSummary(Boolean(options.dryRun)), expected: 0 };
  try {
    const seedUrls = deputiesSeedUrls(years);
    const limit = options.discoveryLimit ?? seedUrls.length;
    for (const url of seedUrls.slice(0, limit)) {
      try {
        const html = await fetchOfficialSource(url, 3);
        const parsed = parseDeputiesYearlyList(html, url);
        const status = parsed.expectedCount || parsed.discoveries.length > 0 ? "parsed" : "failed";
        const notes = status === "failed" ? "No Deputies yearly-list rows detected; official endpoint may be unavailable from this runtime." : undefined;
        const snapshot = snapshotFor("deputies-yearly-list", url, html, status, notes);
        const discoveries = parsed.discoveries.map((discovery) => ({ ...discovery, sourceSnapshotId: options.dryRun ? undefined : snapshot.id }));
        if (options.dryRun) {
          addDiscoveryClassification(summary, await classifyDiscoveryCandidates(session.db, discoveries));
        } else {
          await upsertSourceSnapshot(session.db, snapshot);
          for (const discovery of parsed.discoveries) {
            await upsertSourceDiscovery(session.db, { ...discovery, sourceSnapshotId: snapshot.id });
          }
        }
        summary.discovered += discoveries.length;
        summary.expected = (summary.expected ?? 0) + (parsed.expectedCount ?? 0);
        if (status === "failed") summary.failed += 1;
      } catch (error) {
        const message = errorMessage(error);
        summary.failed += 1;
        summary.errors.push(`${url}: ${message}`);
      }
    }
    return summary;
  } finally {
    await session.close();
  }
}

type ImportDiscoveryResult = "imported" | "partial" | "failed" | "skipped" | "would_import" | "would_partial" | "would_fail" | "would_skip";

async function importDiscovery(row: typeof schema.sourceDiscoveries.$inferSelect, options: { dryRun?: boolean } = {}): Promise<ImportDiscoveryResult> {
  if (!options.dryRun) {
    const session = createDbSession();
    const attemptedAt = new Date();
    try {
      await session.db
        .update(schema.sourceDiscoveries)
        .set({ lastAttemptAt: attemptedAt })
        .where(eq(schema.sourceDiscoveries.id, row.id));
    } finally {
      await session.close();
    }
  }

  try {
    const importUrl = canonicalizeOfficialUrl(row.sourceUrl);
    const html = await fetchOfficialSource(importUrl, 3);
    const nested = discoverOfficialLinks(html, importUrl, row.chamber, row.sourceSnapshotId ?? undefined);

    if (row.kind === "bill" && row.chamber === "senate") {
      const parsed = parseSenateBill(html, importUrl);
      if (options.dryRun) return dryRunStatusFromSourceStatus(parsed.sourceSnapshot.status);
      await persistSenateBill(parsed);
      await saveNestedDiscoveries(nested, parsed.sourceSnapshot.id);
      await saveNestedDiscoveries(parsed.discoveredSources, parsed.sourceSnapshot.id);
      await markDiscovery(row.id, "imported", parsed.sourceSnapshot.id);
      return "imported";
    }

    if (row.kind === "bill" && row.chamber === "deputies") {
      const parsed = parseDeputiesBill(html, importUrl);
      if (options.dryRun) return dryRunStatusFromSourceStatus(parsed.sourceSnapshot.status);
      await persistDeputiesBill(parsed);
      await saveNestedDiscoveries(nested, parsed.sourceSnapshot.id);
      await markDiscovery(row.id, "imported", parsed.sourceSnapshot.id);
      return "imported";
    }

    if (row.kind === "vote" && row.chamber === "senate") {
      const parsed = parseSenateVote(html, importUrl);
      if (options.dryRun) return dryRunStatusFromSourceStatus(parsed.sourceSnapshot.status);
      await persistSenateVote(parsed);
      await markDiscovery(row.id, parsed.sourceSnapshot.status === "parsed" ? "imported" : "partial", parsed.sourceSnapshot.id);
      return parsed.sourceSnapshot.status === "parsed" ? "imported" : "partial";
    }

    if (row.kind === "vote" && row.chamber === "deputies") {
      const parsed = parseChamberNominalVote(html, importUrl);
      if (parsed.sourceSnapshot.status === "failed") {
        if (options.dryRun) {
          return parsed.warnings.some(isKnownUnsupportedPage) ? "would_skip" : "would_fail";
        }
        await saveSourceSnapshot(parsed.sourceSnapshot);
        const status = parsed.warnings.some(isKnownUnsupportedPage) ? "skipped" : "failed";
        await markDiscovery(row.id, status, parsed.sourceSnapshot.id, parsed.sourceSnapshot.notes);
        return status;
      }
      if (options.dryRun) return dryRunStatusFromSourceStatus(parsed.sourceSnapshot.status);
      await persistChamberVote(parsed);
      const status = parsed.sourceSnapshot.status === "parsed" ? "imported" : parsed.sourceSnapshot.status;
      await markDiscovery(row.id, status, parsed.sourceSnapshot.id);
      return status;
    }

    if (options.dryRun) return "would_skip";
    await markDiscovery(row.id, "skipped");
    return "skipped";
  } catch (error) {
    if (options.dryRun) return "would_fail";
    await markDiscovery(row.id, "failed", undefined, errorMessage(error));
    return "failed";
  }
}

export function discoverOfficialLinks(
  html: string,
  sourceUrl: string,
  chamber: ChamberId,
  sourceSnapshotId?: string
): SourceDiscoveryInput[] {
  const $ = cheerio.load(html);
  const discoveries: SourceDiscoveryInput[] = [];
  const canonicalSourceUrl = canonicalizeOfficialUrl(sourceUrl);

  $("a[href]").each((_, node) => {
    const href = $(node).attr("href");
    if (!href || href.startsWith("javascript:") || href.trim().startsWith("#")) return;
    const absoluteUrl = canonicalizeOfficialUrl(new URL(href.replace(/\\/g, "/"), sourceUrl).toString());
    if (absoluteUrl === canonicalSourceUrl || isSameDocumentAnchor(absoluteUrl, canonicalSourceUrl)) return;
    const text = cleanText($(node).text());
    const rowText = cleanText($(node).closest("tr").text()) || text;
    const kind = kindFromUrl(absoluteUrl);
    if (!kind) return;
    const inferredChamber = chamberFromUrl(absoluteUrl) ?? chamber;
    discoveries.push({
      chamber: inferredChamber,
      kind,
      sourceUrl: absoluteUrl,
      officialId: officialIdFromText(rowText, absoluteUrl, kind),
      title: titleFromRow(rowText, text),
      discoveredOn: dateFromText(rowText) ?? dateFromSourceUrl(sourceUrl),
      sourceSnapshotId
    });
  });

  return uniqueBy(discoveries, (discovery) => discovery.sourceUrl);
}

function isSameDocumentAnchor(candidateUrl: string, sourceUrl: string): boolean {
  const candidate = new URL(candidateUrl);
  const source = new URL(sourceUrl);
  return Boolean(candidate.hash) && candidate.origin === source.origin && candidate.pathname === source.pathname && candidate.search === source.search;
}

export function parseDeputiesYearlyList(html: string, sourceUrl: string, sourceSnapshotId?: string): DeputiesYearlyList {
  const $ = cheerio.load(html);
  const bodyText = cleanText($("body").text());
  const expectedCount = Number(bodyText.match(/Num[aă]r\s+înregistr[aă]ri\s+g[aă]site:\s*(\d+)/i)?.[1] ?? "") || undefined;
  const discoveries: SourceDiscoveryInput[] = [];

  $("tr").each((_, row) => {
    const rowText = cleanText($(row).text());
    const identifier = findOfficialIdentifiers(rowText).find((item) => item.kind === "deputies");
    if (!identifier) return;
    const detailHref = $(row)
      .find("a[href*='upl_pck2015.proiect']")
      .toArray()
      .map((node) => $(node).attr("href"))
      .find(Boolean);
    if (!detailHref) return;

    discoveries.push({
      chamber: "deputies",
      kind: "bill",
      sourceUrl: new URL(detailHref.replace(/\\/g, "/"), sourceUrl).toString(),
      officialId: identifier.value,
      title: deputiesTitleFromRow(rowText, identifier.value),
      discoveredOn: dateFromText(rowText),
      sourceSnapshotId
    });
  });

  return {
    expectedCount,
    discoveries: uniqueBy(discoveries, (discovery) => discovery.sourceUrl)
  };
}

function kindFromUrl(url: string): DiscoveryKind | undefined {
  if (/senat\.ro\/Legis\/Lista\.aspx\?cod=\d+/i.test(url)) return "bill";
  if (/senat\.ro\/legis\/lista\.aspx/i.test(url) && /[?&]nr_cls=(?:BP|B|L|PLX)\d+/i.test(url) && /[?&]an_cls=\d{4}/i.test(url)) {
    return "bill";
  }
  if (/cdep\.ro\/(?:ords\/)?pls\/proiecte\/upl_pck2015\.proiect/i.test(url)) return "bill";
  if (/senat\.ro\/VoturiPlenDetaliu\.aspx/i.test(url)) return "vote";
  if (/cdep\.ro\/(?:ords\/)?pls\/steno\/evot2015\.Nominal/i.test(url)) return "vote";
  return undefined;
}

function chamberFromUrl(url: string): ChamberId | undefined {
  if (/senat\.ro/i.test(url)) return "senate";
  if (/cdep\.ro/i.test(url)) return "deputies";
  return undefined;
}

async function discoverGeneratedSenateBills(
  years: number[],
  from: number,
  to: number,
  prefixes: Array<"B" | "BP" | "L" | "PLX">,
  options: SyncOptions
): Promise<SyncSummary> {
  const session = createDbSession();
  const summary = syncSummary(Boolean(options.dryRun));
  const start = Math.max(1, Math.min(from, to));
  const end = Math.max(from, to);
  try {
    for (const year of years) {
      for (const prefix of prefixes) {
        for (let number = start; number <= end; number += 1) {
          const displayPrefix = prefix === "PLX" ? "PLX" : prefix;
          const discovery = {
            chamber: "senate",
            kind: "bill",
            sourceUrl: `https://www.senat.ro/legis/lista.aspx?an_cls=${year}&nr_cls=${displayPrefix}${number}`,
            officialId: `${displayPrefix}${number}/${year}`,
            title: `Senate bill candidate ${displayPrefix}${number}/${year}`,
            discoveredOn: `${year}-01-01`
          } satisfies SourceDiscoveryInput;
          if (options.dryRun) {
            addDiscoveryClassification(summary, await classifyDiscoveryCandidates(session.db, [discovery]));
          } else {
            await upsertSourceDiscovery(session.db, discovery);
          }
          summary.discovered += 1;
        }
      }
    }
    return summary;
  } finally {
    await session.close();
  }
}

function deputiesSeedUrls(years: number[]): string[] {
  return years.map((year) => `https://www.cdep.ro/ords/pls/proiecte/upl_pck2015.lista?anp=${year}`);
}

async function discoverDeputiesVoteDates(years: number[], options: SyncOptions): Promise<string[]> {
  validateDateRange(options);
  const dates = new Set<string>();
  const months = options.deputiesVoteMonths ?? Array.from({ length: 12 }, (_, index) => index + 1);
  for (const year of years) {
    for (const month of months) {
      const html = await fetchOfficialSource(`https://www.cdep.ro/ords/pls/steno/evot2015.zile_vot?lu=${month}&an=${year}`, 3);
      for (const match of html.matchAll(/\b(20\d{6})\b/g)) {
        const value = match[1]!;
        const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
        if ((!options.dateFrom || iso >= options.dateFrom) && iso <= (options.dateTo ?? new Date().toISOString().slice(0, 10))) dates.add(value);
      }
    }
  }
  return [...dates].sort();
}

function nextDay(value: string): string {
  return new Date(Date.parse(value) + 86400000).toISOString().slice(0, 10);
}

export function validateDateRange(options: Pick<SyncOptions, "dateFrom" | "dateTo">): void {
  for (const value of [options.dateFrom, options.dateTo]) {
    if (value !== undefined && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) throw new Error("Dates must be valid YYYY-MM-DD values");
  }
  if (options.dateFrom && options.dateTo && options.dateFrom > options.dateTo) throw new Error("date-from must precede date-to");
}

function deputiesVoteListUrls(dates: string[]): string[] {
  return dates.map((date) => `https://www.cdep.ro/ords/pls/steno/evot2015.data?dat=${date}&cam=2&idl=1`);
}

function deputiesTitleFromRow(rowText: string, identifier: string): string | undefined {
  const withoutIndex = rowText.replace(/^\d+\.\s*/, "");
  const afterIdentifier = withoutIndex.slice(withoutIndex.indexOf(identifier) + identifier.length);
  const title = cleanText(afterIdentifier.replace(/\b(?:Lege|la comisii|la Senat|pe ordinea de zi|procedura legislativa încetata)\b.*$/i, ""));
  return title.length > 8 ? title.slice(0, 500) : undefined;
}

function officialIdFromText(text: string, sourceUrl: string, kind?: DiscoveryKind): string | undefined {
  const year = yearFromUrlParam(sourceUrl);
  const url = new URL(sourceUrl);
  const voteId = url.searchParams.get("idv");
  if (kind === "vote" && voteId) return voteId;
  const identifier = findOfficialIdentifiers(text, year)[0];
  if (identifier) return identifier.value;
  const nrCls = url.searchParams.get("nr_cls") ?? url.searchParams.get("NR");
  const urlIdentifier = normalizeOfficialIdentifier(nrCls ?? undefined, year);
  return urlIdentifier?.value ?? url.searchParams.get("cod") ?? url.searchParams.get("idp") ?? voteId ?? undefined;
}

function titleFromRow(rowText: string, linkText: string): string | undefined {
  const title = cleanText(rowText.replace(/^\d+\.\s*/, ""));
  if (title.length > 12) return title.slice(0, 500);
  return linkText || undefined;
}

function dateFromText(text: string): string | undefined {
  const match = text.match(/(\d{2})[./-](\d{2})[./-](\d{4})/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : undefined;
}

function dateFromSourceUrl(sourceUrl: string): string | undefined {
  const url = new URL(sourceUrl);
  const value = url.searchParams.get("dat");
  if (!value || !/^\d{8}$/.test(value)) return undefined;
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function yearFromUrlParam(sourceUrl: string): number | undefined {
  const url = new URL(sourceUrl);
  const value = url.searchParams.get("an_cls") ?? url.searchParams.get("AN") ?? url.searchParams.get("anp");
  return value && /^\d{4}$/.test(value) ? Number(value) : undefined;
}

async function saveNestedDiscoveries(discoveries: SourceDiscoveryInput[], sourceSnapshotId: string) {
  if (discoveries.length === 0) return;
  const session = createDbSession();
  try {
    for (const discovery of discoveries) {
      await upsertSourceDiscovery(session.db, { ...discovery, sourceSnapshotId });
    }
  } finally {
    await session.close();
  }
}

async function startIngestionRun(kind: string) {
  const session = createDbSession();
  const id = `run-${slugify(kind)}-${new Date().toISOString().replace(/[:.]/g, "-")}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    await markStaleRunningIngestionRuns(session.db, kind);
    await session.db.insert(schema.ingestionRuns).values({
      id,
      kind,
      status: "running",
      startedAt: new Date(),
      summary: {}
    });
    return { id };
  } finally {
    await session.close();
  }
}

async function markStaleRunningIngestionRuns(db: ReturnType<typeof createDbSession>["db"], kind: string) {
  await db
    .update(schema.ingestionRuns)
    .set({
      status: "failed",
      finishedAt: new Date(),
      error: "Marked failed before starting a new run because it was still running after 6 hours."
    })
    .where(
      and(
        eq(schema.ingestionRuns.kind, kind),
        eq(schema.ingestionRuns.status, "running"),
        lt(schema.ingestionRuns.startedAt, new Date(Date.now() - 6 * 60 * 60 * 1000))
      )
    );
}

async function finishIngestionRun(id: string, status: "completed" | "partial" | "failed", summary: SyncSummary, error?: string) {
  const session = createDbSession();
  try {
    await session.db
      .update(schema.ingestionRuns)
      .set({
        status,
        finishedAt: new Date(),
        summary: { ...summary, runId: id },
        error
      })
      .where(eq(schema.ingestionRuns.id, id));
  } finally {
    await session.close();
  }
}

async function saveSourceSnapshot(sourceSnapshot: SourceSnapshot) {
  const session = createDbSession();
  try {
    await upsertSourceSnapshot(session.db, sourceSnapshot);
  } finally {
    await session.close();
  }
}

async function markDiscovery(id: string, status: DiscoveryStatus, sourceSnapshotId?: string, error?: string) {
  const session = createDbSession();
  try {
    const row = await session.db.select().from(schema.sourceDiscoveries).where(eq(schema.sourceDiscoveries.id, id)).limit(1);
    const failureCount = status === "failed" ? (row[0]?.failureCount ?? 0) + 1 : 0;
    await session.db
      .update(schema.sourceDiscoveries)
      .set({
        status,
        importedAt: status === "imported" || status === "partial" ? new Date() : row[0]?.importedAt,
        lastAttemptAt: new Date(),
        sourceSnapshotId: sourceSnapshotId ?? row[0]?.sourceSnapshotId,
        failureCount,
        lastError: error ?? null
      })
      .where(eq(schema.sourceDiscoveries.id, id));
  } finally {
    await session.close();
  }
}

async function upsertSourceDiscovery(db: ReturnType<typeof createDbSession>["db"], discovery: SourceDiscoveryInput) {
  const now = new Date();
  const sourceUrl = canonicalizeOfficialUrl(discovery.sourceUrl);
  const officialId = discovery.officialId?.trim() || undefined;
  const values = {
    id: `discovery-${discovery.chamber}-${discovery.kind}-${hashContent(discoveryKey({ ...discovery, officialId, sourceUrl })).slice(0, 16)}`,
    chamber: discovery.chamber,
    kind: discovery.kind,
    sourceUrl,
    officialId,
    title: discovery.title,
    discoveredOn: discovery.discoveredOn,
    firstSeenAt: now,
    lastSeenAt: now,
    status: "pending" as const,
    sourceSnapshotId: discovery.sourceSnapshotId
  };

  const [existingByUrl] = await db
    .select({ id: schema.sourceDiscoveries.id })
    .from(schema.sourceDiscoveries)
    .where(eq(schema.sourceDiscoveries.sourceUrl, values.sourceUrl))
    .limit(1);
  const [existingById] = await db
    .select({ id: schema.sourceDiscoveries.id })
    .from(schema.sourceDiscoveries)
    .where(eq(schema.sourceDiscoveries.id, values.id))
    .limit(1);
  const [existingByOfficialId] = values.officialId
    ? await db
        .select({ id: schema.sourceDiscoveries.id })
        .from(schema.sourceDiscoveries)
        .where(
          and(
            eq(schema.sourceDiscoveries.chamber, values.chamber),
            eq(schema.sourceDiscoveries.kind, values.kind),
            eq(schema.sourceDiscoveries.officialId, values.officialId)
          )
        )
        .limit(1)
    : [];

  const updateValues: Partial<typeof schema.sourceDiscoveries.$inferInsert> = {
    chamber: values.chamber,
    kind: values.kind,
    sourceUrl: values.sourceUrl,
    officialId: values.officialId,
    title: values.title,
    lastSeenAt: values.lastSeenAt
  };
  if (values.discoveredOn) updateValues.discoveredOn = values.discoveredOn;
  if (values.sourceSnapshotId) updateValues.sourceSnapshotId = values.sourceSnapshotId;

  const existing = existingByUrl ?? existingByOfficialId ?? existingById;
  if (existing) {
    await db
      .update(schema.sourceDiscoveries)
      .set(updateValues)
      .where(eq(schema.sourceDiscoveries.id, existing.id));
    return;
  }

  await db
    .insert(schema.sourceDiscoveries)
    .values(values)
    .onConflictDoNothing();
}

function discoveryKey(discovery: Pick<SourceDiscoveryInput, "chamber" | "kind" | "sourceUrl" | "officialId">): string {
  return [discovery.chamber, discovery.kind, discovery.officialId ?? canonicalizeOfficialUrl(discovery.sourceUrl)].join(":");
}

async function upsertSourceSnapshot(db: ReturnType<typeof createDbSession>["db"], source: SourceSnapshot) {
  await db
    .insert(schema.sourceSnapshots)
    .values({
      id: source.id,
      sourceUrl: source.sourceUrl,
      fetchedAt: new Date(source.fetchedAt),
      contentHash: source.contentHash,
      parser: source.parser,
      parserVersion: source.parserVersion,
      status: source.status as SourceStatus,
      notes: source.notes
    })
    .onConflictDoUpdate({
      target: schema.sourceSnapshots.id,
      set: {
        sourceUrl: source.sourceUrl,
        fetchedAt: new Date(source.fetchedAt),
        contentHash: source.contentHash,
        parser: source.parser,
        parserVersion: source.parserVersion,
        status: source.status as SourceStatus,
        notes: source.notes
      }
    });
}

function syncSummary(dryRun: boolean): SyncSummary {
  return {
    dryRun: dryRun || undefined,
    discovered: 0,
    imported: 0,
    partial: 0,
    failed: 0,
    skipped: 0,
    errors: []
  };
}

interface DiscoveryClassification {
  newDiscoveries: number;
  knownByUrl: number;
  knownByOfficialId: number;
}

async function classifyDiscoveryCandidates(
  db: ReturnType<typeof createDbSession>["db"],
  discoveries: SourceDiscoveryInput[]
): Promise<DiscoveryClassification> {
  const classification: DiscoveryClassification = { newDiscoveries: 0, knownByUrl: 0, knownByOfficialId: 0 };
  for (const discovery of discoveries) {
    const sourceUrl = canonicalizeOfficialUrl(discovery.sourceUrl);
    const [existingByUrl] = await db
      .select({ id: schema.sourceDiscoveries.id })
      .from(schema.sourceDiscoveries)
      .where(eq(schema.sourceDiscoveries.sourceUrl, sourceUrl))
      .limit(1);
    if (existingByUrl) {
      classification.knownByUrl += 1;
      continue;
    }

    const officialId = discovery.officialId?.trim();
    const [existingByOfficialId] = officialId
      ? await db
          .select({ id: schema.sourceDiscoveries.id })
          .from(schema.sourceDiscoveries)
          .where(
            and(
              eq(schema.sourceDiscoveries.chamber, discovery.chamber),
              eq(schema.sourceDiscoveries.kind, discovery.kind),
              eq(schema.sourceDiscoveries.officialId, officialId)
            )
          )
          .limit(1)
      : [];
    if (existingByOfficialId) {
      classification.knownByOfficialId += 1;
      continue;
    }

    classification.newDiscoveries += 1;
  }
  return classification;
}

function addDiscoveryClassification(summary: SyncSummary, classification: DiscoveryClassification) {
  summary.newDiscoveries = (summary.newDiscoveries ?? 0) + classification.newDiscoveries;
  summary.knownByUrl = (summary.knownByUrl ?? 0) + classification.knownByUrl;
  summary.knownByOfficialId = (summary.knownByOfficialId ?? 0) + classification.knownByOfficialId;
}

function dryRunStatusFromSourceStatus(status: SourceStatus): ImportDiscoveryResult {
  if (status === "parsed") return "would_import";
  if (status === "partial") return "would_partial";
  if (status === "failed") return "would_fail";
  return "would_partial";
}

function addImportResult(summary: SyncSummary, result: ImportDiscoveryResult) {
  if (result === "imported") summary.imported += 1;
  else if (result === "partial") summary.partial += 1;
  else if (result === "failed") summary.failed += 1;
  else if (result === "skipped") summary.skipped += 1;
  else if (result === "would_import") summary.wouldImport = (summary.wouldImport ?? 0) + 1;
  else if (result === "would_partial") summary.wouldPartial = (summary.wouldPartial ?? 0) + 1;
  else if (result === "would_fail") summary.wouldFail = (summary.wouldFail ?? 0) + 1;
  else if (result === "would_skip") summary.wouldSkip = (summary.wouldSkip ?? 0) + 1;
}

function addSummary(target: SyncSummary, next: SyncSummary) {
  target.dryRun = target.dryRun || next.dryRun || undefined;
  target.discovered += next.discovered;
  target.imported += next.imported;
  target.partial += next.partial;
  target.failed += next.failed;
  target.skipped += next.skipped;
  target.expected = (target.expected ?? 0) + (next.expected ?? 0);
  target.newDiscoveries = (target.newDiscoveries ?? 0) + (next.newDiscoveries ?? 0);
  target.knownByUrl = (target.knownByUrl ?? 0) + (next.knownByUrl ?? 0);
  target.knownByOfficialId = (target.knownByOfficialId ?? 0) + (next.knownByOfficialId ?? 0);
  target.wouldImport = (target.wouldImport ?? 0) + (next.wouldImport ?? 0);
  target.wouldPartial = (target.wouldPartial ?? 0) + (next.wouldPartial ?? 0);
  target.wouldFail = (target.wouldFail ?? 0) + (next.wouldFail ?? 0);
  target.wouldSkip = (target.wouldSkip ?? 0) + (next.wouldSkip ?? 0);
  target.readModels = next.readModels ?? target.readModels;
  target.errors.push(...next.errors);
}

function statusFromSummary(summary: SyncSummary): "completed" | "partial" | "failed" {
  if (summary.imported === 0 && summary.discovered === 0 && summary.failed > 0) return "failed";
  if (summary.failed > 0 || summary.partial > 0 || summary.errors.length > 0) return "partial";
  return "completed";
}

function yearsSince2024(): number[] {
  const current = new Date().getUTCFullYear();
  return Array.from({ length: current - 2024 + 1 }, (_, index) => 2024 + index);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function uniqueBy<T>(items: T[], getKey: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = getKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Pages that are understood but deliberately not imported: names-only attendance checks. */
function isKnownUnsupportedPage(warning: string): boolean {
  return /Attendance check lists names without votes/i.test(warning);
}
