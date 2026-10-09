import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { sql } from "drizzle-orm";
import * as schema from "@cumsevoteaza/db";
import type { DbClient } from "@cumsevoteaza/db";
import { FetchStoppedError, PoliteFetcher } from "../coverage/polite-fetcher";
import { RawCache } from "../coverage/raw-cache";

const execFileAsync = promisify(execFile);

/**
 * Sprint 12d (D-035): what the committees' reports say about amendments. A report is a PDF; its amendments are in an annex table headed "AMENDAMENTE ADMISE" or
 * "AMENDAMENTE RESPINSE". Only what can be read without guessing is read: that the annex exists and on which page, and the authors it names.
 */
export interface ReportSource {
  /** The address to fetch: https, as the Chamber's own site serves it. */
  url: string;
  /** The saved file's name under data/coverage/raw/committee-report. */
  key: string;
  host: "cdep" | "senat";
  /** The `documents` rows (one per bill) that hold this address. */
  documentIds: string[];
}

export const reportKey = (url: string) => createHash("sha1").update(url).digest("hex").slice(0, 16);

/** The plain-http addresses the Chamber's pages print do not connect; the same path over https does. */
export function normalizeReportUrl(url: string): string {
  return url.replace(/^http:\/\/((?:www\.)?cdep\.ro)/i, "https://$1");
}

/** Every committee-report PDF of this legislature (reports received since the first sitting, 20 December 2024) the dossiers print. */
export async function listReportSources(db: DbClient): Promise<ReportSource[]> {
  const rows = await db.execute<{ document_id: string; url: string }>(sql`
    select distinct d.id as document_id, d.url
    from bill_procedure_steps s
    join documents d on d.id = s.document_id
    where s.step_type::text = 'committee_report_received' and s.occurred_on >= '2024-12-20' and d.url ~* '\\.pdf'
    union
    select distinct d.id, d.url
    from bill_procedure_steps s
    join bill_step_documents sd on sd.step_id = s.id
    join documents d on d.id = sd.document_id
    where s.step_type::text = 'committee_report_received' and s.occurred_on >= '2024-12-20' and d.url ~* '\\.pdf'`);
  const byUrl = new Map<string, ReportSource>();
  for (const row of rows) {
    const url = normalizeReportUrl(row.url);
    const existing = byUrl.get(url);
    if (existing) { if (!existing.documentIds.includes(row.document_id)) existing.documentIds.push(row.document_id); continue; }
    byUrl.set(url, { url, key: reportKey(url), host: /senat\.ro/i.test(url) ? "senat" : "cdep", documentIds: [row.document_id] });
  }
  return [...byUrl.values()].sort((a, b) => a.url.localeCompare(b.url));
}

export interface FetchReportsResult {
  reports: number;
  cached: number;
  fetchedNow: number;
  remaining: number;
  failed: string[];
  stoppedBy?: string;
}

/**
 * Saves the report PDFs under `data/coverage/raw/committee-report`, one request at a time and `delayMs` apart (docs/cdep-access.md), at most `limit` new files per run,
 * what is saved is never fetched again. A refusal (403, 429, a security check) or five failures in a row end the run. Without `live` nothing is fetched.
 */
export async function fetchReports(options: { repoRoot: string; sources: ReportSource[]; live: boolean; host?: "cdep" | "senat"; limit: number; delayMs: number; log?: (line: string) => void }): Promise<FetchReportsResult> {
  const cache = new RawCache(path.join(options.repoRoot, "data/coverage/raw"));
  const wanted = options.sources.filter((source) => !options.host || source.host === options.host);
  const result: FetchReportsResult = { reports: wanted.length, cached: 0, fetchedNow: 0, remaining: 0, failed: [] };
  const fetcher = new PoliteFetcher({ maxRequests: options.limit * 2 + 10, delayMs: options.delayMs, timeoutMs: 180_000, retries: 1, maxConsecutiveFailures: 5 });
  for (const source of wanted) {
    if (await cache.has("committee-report", source.key)) { result.cached += 1; continue; }
    if (!options.live || result.fetchedNow >= options.limit || result.stoppedBy) { result.remaining += 1; continue; }
    try {
      const response = await fetcher.get(source.url);
      const isPdf = response.body.subarray(0, 5).toString("latin1").startsWith("%PDF");
      if (response.status === 404) { result.failed.push(`${source.url}: 404`); continue; }
      if (response.status !== 200 || !isPdf) { result.failed.push(`${source.url}: HTTP ${response.status}${isPdf ? "" : ", not a PDF"}`); continue; }
      await cache.write("committee-report", source.key, response.body, { url: source.url, status: response.status });
      result.fetchedNow += 1;
      if (result.fetchedNow % 25 === 0) options.log?.(`${result.fetchedNow} saved this run`);
    } catch (error) {
      result.failed.push(`${source.url}: ${error instanceof Error ? error.message : String(error)}`);
      if (error instanceof FetchStoppedError) { result.stoppedBy = error.message; }
    }
  }
  return result;
}

export interface ReportAnnex {
  kind: "admitted" | "rejected";
  /** The PDF page the annex starts on (1-based). */
  page: number;
}

export interface ReportAuthor {
  name: string;
  role: "deputy" | "senator";
  /** The group or party printed beside the name ("USR", "PSD", "Neafiliat"). */
  group?: string;
}

export interface ReportReading {
  pages: number;
  /** Share of the text's words that are not words (OCR noise): under 2% reads as clean text. */
  garbledPercent: number;
  quality: "clean" | "poor" | "none";
  annexes: ReportAnnex[];
  /** Only read from text of clean quality: a name misread by OCR is worse than no name. */
  authors: ReportAuthor[];
}

const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Share of words with a character a Romanian sentence does not have (~ ^ | ` and digits inside a word): the mark of a bad scan. */
export function garbledShare(text: string): number {
  const words = text.match(/\S+/g) ?? [];
  if (words.length === 0) return 100;
  const bad = words.filter((word) => /[~^|`{}<>]|[A-Za-z]\d[A-Za-z]/.test(word));
  return (100 * bad.length) / words.length;
}

/**
 * The annex headings: a line that is the heading itself ("AMENDAMENTE ADMISE", "Amendamente respinse", "Amendament Admis", also after "Anexă"), not the sentence of the
 * report that mentions them ("... cu amendamente admise prezentate în anexă", whose line wraps and may begin with the words). A heading starts with a capital letter and is
 * the heading words, or "Anexă" followed by them. The table repeats its heading on every page it spans: the first page of each kind is the annex's.
 */
export function findAnnexes(pages: string[]): ReportAnnex[] {
  const found: ReportAnnex[] = [];
  pages.forEach((text, index) => {
    const lines = text.split(/\r?\n/);
    for (const raw of lines) {
      const line = raw.replace(/\s+/g, " ").trim();
      if (!/^[A-ZĂÂÎȘȚŞŢ]/.test(line)) continue;
      const match = /^(?:anex[aă]\s*(?:nr\.?\s*\d+)?\s*[-–:.]?\s*)?amendament(?:e|ul)?\s+(admis[ae]?|respins[ae]?)\b/i.exec(fold(line));
      if (!match) continue;
      const kind: ReportAnnex["kind"] = match[1]!.startsWith("admis") ? "admitted" : "rejected";
      if (!found.some((item) => item.kind === kind)) found.push({ kind, page: index + 1 });
    }
  });
  return found;
}

/**
 * The authors the annex names. Two shapes cover the Chamber's reports: "Autori: Alexandru – Paul DIMITRIU, deputat USR, Patricia – Simina-Arina MOȘ, deputat PNL" and
 * "(Amendament propus de domnul deputat Andrei Daniel GHEORGHE – deputat PSD)". A name is read only when it is followed by "deputat" or "senator" and a group word.
 */
export function findAuthors(annexText: string): ReportAuthor[] {
  const text = annexText.replace(/\s+/g, " ");
  const authors: ReportAuthor[] = [];
  const add = (name: string, role: "deputat" | "senator", group: string | undefined) => {
    const cleaned = name.replace(/^(?:(?:domnul|doamna|domnii|doamnele|dl\.?|d-na|senator|deputat|autori|autor|amendament\s+propus\s+de)\s*:?\s*)+/i, "").replace(/\s*[–-]\s*$/, "").trim();
    if (cleaned.length < 5 || cleaned.split(/\s+/).length < 2 || /\d/.test(cleaned)) return;
    const key = fold(cleaned).replace(/[–-]/g, " ").replace(/\s+/g, " ");
    if (authors.some((author) => fold(author.name).replace(/[–-]/g, " ").replace(/\s+/g, " ") === key)) return;
    authors.push({ name: cleaned, role: role === "deputat" ? "deputy" : "senator", ...(group ? { group: group.trim() } : {}) });
  };
  // "Name, deputat GROUP" and "Name – deputat GROUP": the name is the run of capitalised words before the role.
  const name = "((?:[A-ZĂÂÎȘȚŞŢ][\\p{L}'’.]*(?:\\s*[–-]\\s*|\\s+)){1,5}[A-ZĂÂÎȘȚŞŢ][\\p{L}'’.]*)";
  const re = new RegExp(`${name}\\s*[,–-]?\\s*(deputat|senator)\\s+((?:[A-ZĂÂÎȘȚŞŢ][A-Za-zĂÂÎȘȚăâîșțşţ]*|neafiliat|minorit[a-zăț]+)(?:\\s*\\([^)]{1,40}\\))?)`, "gu");
  for (const match of text.matchAll(re)) add(match[1]!, match[2] as "deputat" | "senator", match[3]);
  return authors;
}

export function readReport(pages: string[]): ReportReading {
  const text = pages.join("\n");
  const chars = text.replace(/\s/g, "").length;
  const garbled = garbledShare(text);
  const quality: ReportReading["quality"] = chars < 40 * Math.max(pages.length, 1) ? "none" : garbled > 2 ? "poor" : "clean";
  const annexes = findAnnexes(pages);
  const firstAnnex = annexes.length ? Math.min(...annexes.map((annex) => annex.page)) : undefined;
  const authors = quality === "clean" && firstAnnex !== undefined ? findAuthors(pages.slice(firstAnnex - 1).join("\n")) : [];
  return { pages: pages.length, garbledPercent: Math.round(garbled * 10) / 10, quality, annexes, authors };
}

/** The text of every page of a saved PDF through the same Python reader (pypdf) as the bulletins; one process per file. */
export async function readSavedPages(repoRoot: string, key: string): Promise<string[] | undefined> {
  const file = new RawCache(path.join(repoRoot, "data/coverage/raw")).filePath("committee-report", key);
  if (!existsSync(file)) return undefined;
  const candidates = [process.env.PYTHON_BIN, process.env.HOME ? path.join(process.env.HOME, "miniconda3/bin/python") : undefined, "python3"].filter(Boolean) as string[];
  for (const python of candidates) {
    if (python.includes("/") && !existsSync(python)) continue;
    try {
      const { stdout } = await execFileAsync(python, [path.join(repoRoot, "tools/pdf-text/pages.py"), file], { maxBuffer: 400 * 1024 * 1024, timeout: 300_000 });
      return JSON.parse(stdout) as string[];
    } catch {
      /* try the next interpreter */
    }
  }
  return undefined;
}

export interface ImportReportsResult {
  persisted: boolean;
  reports: number;
  read: number;
  notSavedYet: number;
  unreadable: number;
  byHost: Record<string, { read: number; clean: number; poor: number; none: number; withAnnex: number; withAuthors: number }>;
  authors: number;
  authorsMatchedToMembers: number;
  written: { reads: number; annexes: number; authors: number };
}

/** A member of the chamber the author belongs to whose name has exactly the same words in any order (the rule the dossiers use for initiators). */
async function loadMembersByWords(db: DbClient): Promise<Map<string, string[]>> {
  const rows = await db.execute<{ id: string; name: string; chamber: string }>(sql`
    select distinct m.id, m.display_name as name, mm.chamber::text as chamber from members m join member_mandates mm on mm.member_id = m.id`);
  const index = new Map<string, string[]>();
  for (const row of rows) {
    const key = `${row.chamber}|${fold(row.name).replace(/[–-]/g, " ").split(/\s+/).filter(Boolean).sort().join(" ")}`;
    index.set(key, [...(index.get(key) ?? []), row.id]);
  }
  return index;
}

const wordsKey = (role: "deputy" | "senator", name: string) => `${role === "deputy" ? "deputies" : "senate"}|${fold(name).replace(/[–-]/g, " ").split(/\s+/).filter(Boolean).sort().join(" ")}`;

/** Reads every saved report and writes `committee_report_reads`, `committee_report_annexes` and `committee_report_authors`. Offline apart from the database. */
export async function importReports(db: DbClient, options: { repoRoot: string; persist: boolean; log?: (line: string) => void }): Promise<ImportReportsResult> {
  const sources = await listReportSources(db);
  const members = await loadMembersByWords(db);
  const result: ImportReportsResult = { persisted: options.persist, reports: sources.length, read: 0, notSavedYet: 0, unreadable: 0, byHost: {}, authors: 0, authorsMatchedToMembers: 0, written: { reads: 0, annexes: 0, authors: 0 } };
  const reads: Array<typeof schema.committeeReportReads.$inferInsert> = [];
  const annexes: Array<typeof schema.committeeReportAnnexes.$inferInsert> = [];
  const authors: Array<typeof schema.committeeReportAuthors.$inferInsert> = [];
  let done = 0;
  for (const source of sources) {
    const pages = await readSavedPages(options.repoRoot, source.key);
    if (!pages) { if (existsSync(new RawCache(path.join(options.repoRoot, "data/coverage/raw")).filePath("committee-report", source.key))) result.unreadable += 1; else result.notSavedYet += 1; continue; }
    const reading = readReport(pages);
    result.read += 1;
    const stats = (result.byHost[source.host] ??= { read: 0, clean: 0, poor: 0, none: 0, withAnnex: 0, withAuthors: 0 });
    stats.read += 1;
    stats[reading.quality] += 1;
    if (reading.annexes.length) stats.withAnnex += 1;
    if (reading.authors.length) stats.withAuthors += 1;
    for (const documentId of source.documentIds) {
      reads.push({ documentId, pages: reading.pages, garbledPercent: reading.garbledPercent, quality: reading.quality, readAt: new Date() });
      for (const annex of reading.annexes) annexes.push({ documentId, kind: annex.kind, page: annex.page });
      reading.authors.forEach((author, position) => {
        const matches = members.get(wordsKey(author.role, author.name)) ?? [];
        authors.push({ documentId, position, name: author.name, role: author.role, groupLabel: author.group ?? null, memberId: matches.length === 1 ? matches[0]! : null });
      });
    }
    result.authors += reading.authors.length;
    result.authorsMatchedToMembers += reading.authors.filter((author) => (members.get(wordsKey(author.role, author.name)) ?? []).length === 1).length;
    done += 1;
    if (done % 200 === 0) options.log?.(`${done} reports read`);
  }
  if (!options.persist) return result;
  await db.transaction(async (tx) => {
    await tx.execute(sql`delete from committee_report_authors`);
    await tx.execute(sql`delete from committee_report_annexes`);
    await tx.execute(sql`delete from committee_report_reads`);
    for (let i = 0; i < reads.length; i += 500) await tx.insert(schema.committeeReportReads).values(reads.slice(i, i + 500)).onConflictDoNothing();
    for (let i = 0; i < annexes.length; i += 500) await tx.insert(schema.committeeReportAnnexes).values(annexes.slice(i, i + 500)).onConflictDoNothing();
    for (let i = 0; i < authors.length; i += 500) await tx.insert(schema.committeeReportAuthors).values(authors.slice(i, i + 500)).onConflictDoNothing();
  });
  result.written = { reads: reads.length, annexes: annexes.length, authors: authors.length };
  return result;
}
