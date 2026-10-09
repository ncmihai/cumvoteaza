import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { sql } from "drizzle-orm";
import * as schema from "@cumsevoteaza/db";
import type { DbClient } from "@cumsevoteaza/db";
import { PoliteFetcher } from "../coverage/polite-fetcher";
import { RawCache } from "../coverage/raw-cache";

const execFileAsync = promisify(execFile);

/**
 * Sprint 12c (D-034): bills the Senate marks "prioritate legislativă". The Senate's legislative department publishes a Legislative Bulletin for each ordinary session
 * (a PDF of 150 to 250 pages listing every bill registered at the Senate that session and every bill it adopted), and prints the label beside the bills so marked,
 * next to "procedură de urgenţă" and "lege ordinară" or "lege organică". The bulletins are listed on https://www.senat.ro/default.aspx?Sel=EEDF0BF9-BE0F-4A2C-B80C-44A5CCA45DDE.
 */
export interface SenateBulletin {
  id: string;
  label: string;
  /** The session's first and last day (the Constitution's two ordinary sessions: 1 February to 30 June, 1 September to 31 December). */
  startsOn: string;
  endsOn: string;
  url: string;
}

const BASE = "https://www.senat.ro/UploadFisiere/03db55c6-7e90-43cc-97f5-b9907c26bbd7/";
export const SENATE_BULLETINS: SenateBulletin[] = [
  { id: "2024-1", label: "februarie–iunie 2024", startsOn: "2024-02-01", endsOn: "2024-06-30", url: `${BASE}Buletin%20legislativ%20sesiunea%20I%202024_mail.pdf` },
  { id: "2024-2", label: "septembrie–decembrie 2024", startsOn: "2024-09-01", endsOn: "2024-12-31", url: `${BASE}BuletinLegislativ.pdf` },
  { id: "2025-1", label: "februarie–iunie 2025", startsOn: "2025-02-01", endsOn: "2025-06-30", url: `${BASE}Buletin%20legislativ%20sesiunea%20I%202025.pdf` },
  { id: "2025-2", label: "septembrie–decembrie 2025", startsOn: "2025-09-01", endsOn: "2025-12-31", url: `${BASE}Buletin%20legislativ%20sesiunea%20II%202025.pdf` },
  { id: "2026-1", label: "februarie–iunie 2026", startsOn: "2026-02-01", endsOn: "2026-06-30", url: `${BASE}Buletin%20legislativ%20sesiunea%20I%202026.pdf` }
];

export interface PriorityEntry {
  /** The Senate's number: "L488/2024". */
  senateNumber: string;
  /** The page of the bulletin that prints it (the first one when the bill is listed twice). */
  page: number;
  registeredOn?: string;
  urgency: boolean;
  lawKind?: "ordinary" | "organic";
}

/**
 * The bills the bulletin labels "prioritate legislativă", read from the text of its pages. Every bill's entry is its title, then its number and registration
 * ("L488/2024 E198/12.09.2024", from 2025 "L29/2025 / PLX71/2025 / E16/2025"), then the labels ("- procedură de urgenţă -lege ordinară - prioritate legislativă") and its stage;
 * the labels of a bill are the words between its own number and the next bill's number. A bill is listed once among those registered and again among those adopted: the first page counts.
 */
export function parsePriorityEntries(pages: string[]): PriorityEntry[] {
  let full = "";
  const starts: number[] = [];
  for (const page of pages) {
    starts.push(full.length);
    full += `${page.replace(/\s+/g, " ")} `;
  }
  const pageOf = (offset: number) => {
    let index = 0;
    while (index + 1 < starts.length && starts[index + 1]! <= offset) index += 1;
    return index + 1;
  };
  const numbers = [...full.matchAll(/\bL(\d{1,4})\/(20\d{2})\b/g)];
  const found = new Map<string, PriorityEntry>();
  numbers.forEach((match, index) => {
    const from = match.index! + match[0].length;
    // The labels sit between this bill's number and the next bill's title (right after the number in 2024, after the stage in 2025 and 2026); never past the next number.
    const to = Math.min(from + 450, numbers[index + 1]?.index ?? full.length);
    const window = full.slice(from, to);
    if (!/prioritate\s*legislativ/i.test(window)) return;
    const senateNumber = `L${Number(match[1])}/${match[2]}`;
    if (found.has(senateNumber)) return;
    const registered = /E\d+\/(\d{2})\.(\d{2})\.(\d{4})/.exec(window);
    found.set(senateNumber, {
      senateNumber,
      page: pageOf(match.index!),
      ...(registered ? { registeredOn: `${registered[3]}-${registered[2]}-${registered[1]}` } : {}),
      urgency: /procedur[ăa]\s*de\s*urgen/i.test(window),
      ...(/lege\s*organic/i.test(window) ? { lawKind: "organic" as const } : /lege\s*ordinar/i.test(window) ? { lawKind: "ordinary" as const } : {})
    });
  });
  return [...found.values()];
}

/** The text of every page of a saved bulletin, through the same Python reader (pypdf) the bill-text importer uses. */
export async function readBulletinPages(repoRoot: string, bulletin: SenateBulletin): Promise<string[] | undefined> {
  const file = new RawCache(path.join(repoRoot, "data/coverage/raw")).filePath("senate-bulletin", bulletin.id);
  if (!existsSync(file)) return undefined;
  const candidates = [process.env.PYTHON_BIN, process.env.HOME ? path.join(process.env.HOME, "miniconda3/bin/python") : undefined, "python3"].filter(Boolean) as string[];
  for (const python of candidates) {
    if (python.includes("/") && !existsSync(python)) continue;
    try {
      const { stdout } = await execFileAsync(python, [path.join(repoRoot, "tools/pdf-text/pages.py"), file], { maxBuffer: 200 * 1024 * 1024, timeout: 300_000 });
      return JSON.parse(stdout) as string[];
    } catch {
      /* try the next interpreter */
    }
  }
  throw new Error("No Python with pypdf was found (set PYTHON_BIN).");
}

export interface FetchBulletinsResult {
  bulletins: number;
  cached: number;
  fetchedNow: number;
  skippedNoNetwork: number;
}

/** Saves each session's bulletin PDF under `data/coverage/raw/senate-bulletin` (one file per session, never asked twice). Without `live` nothing is fetched. */
export async function fetchBulletins(options: { repoRoot: string; live: boolean; log?: (line: string) => void }): Promise<FetchBulletinsResult> {
  const cache = new RawCache(path.join(options.repoRoot, "data/coverage/raw"));
  const result: FetchBulletinsResult = { bulletins: SENATE_BULLETINS.length, cached: 0, fetchedNow: 0, skippedNoNetwork: 0 };
  const fetcher = new PoliteFetcher({ maxRequests: SENATE_BULLETINS.length + 2, delayMs: 4000, timeoutMs: 180_000, retries: 1 });
  for (const bulletin of SENATE_BULLETINS) {
    if (await cache.has("senate-bulletin", bulletin.id)) { result.cached += 1; continue; }
    if (!options.live) { result.skippedNoNetwork += 1; continue; }
    const response = await fetcher.get(bulletin.url);
    if (response.status !== 200 || !response.body.subarray(0, 5).toString("latin1").startsWith("%PDF")) throw new Error(`The Senate answered ${response.status} (not a PDF) for ${bulletin.label}`);
    await cache.write("senate-bulletin", bulletin.id, response.body, { url: bulletin.url, status: response.status });
    result.fetchedNow += 1;
    options.log?.(`${bulletin.label}: ${Math.round(response.body.byteLength / 1024)} KB`);
  }
  return result;
}

export interface ImportPrioritiesResult {
  persisted: boolean;
  sessions: Array<{ session: string; flagged: number; matched: number; unmatched: string[] }>;
  bills: number;
  flags: number;
  written: number;
}

/**
 * Writes `bill_priority_flags` from the saved bulletins. A flagged number is matched to the bill that holds it as its Senate number (L488/2024); a number no bill holds is
 * listed and left out. The flags of every session read are replaced as a whole.
 */
export async function importPriorities(db: DbClient, options: { repoRoot: string; persist: boolean }): Promise<ImportPrioritiesResult> {
  const bills = await db.execute<{ id: string; senate_l: string }>(sql`select id, coalesce(identifiers->>'senate_l', identifiers->>'senate') as senate_l from bills where coalesce(identifiers->>'senate_l', identifiers->>'senate') ~ '^L[0-9]+/[0-9]{4}$'`);
  const billBySenateNumber = new Map<string, string>();
  for (const row of bills) billBySenateNumber.set(row.senate_l, row.id);
  const result: ImportPrioritiesResult = { persisted: options.persist, sessions: [], bills: 0, flags: 0, written: 0 };
  const rows: Array<typeof schema.billPriorityFlags.$inferInsert> = [];
  const sessionsRead: string[] = [];
  for (const bulletin of SENATE_BULLETINS) {
    const pages = await readBulletinPages(options.repoRoot, bulletin);
    if (!pages) continue;
    sessionsRead.push(bulletin.id);
    const entries = parsePriorityEntries(pages);
    const unmatched: string[] = [];
    let matched = 0;
    for (const entry of entries) {
      const billId = billBySenateNumber.get(entry.senateNumber);
      if (!billId) { unmatched.push(entry.senateNumber); continue; }
      matched += 1;
      rows.push({ billId, sessionId: bulletin.id, sessionLabel: bulletin.label, sessionStartsOn: bulletin.startsOn, sessionEndsOn: bulletin.endsOn, bulletinUrl: bulletin.url, bulletinPage: entry.page, senateNumber: entry.senateNumber, urgency: entry.urgency, lawKind: entry.lawKind ?? null });
    }
    result.sessions.push({ session: bulletin.label, flagged: entries.length, matched, unmatched });
  }
  result.bills = new Set(rows.map((row) => row.billId)).size;
  result.flags = rows.length;
  if (!options.persist || sessionsRead.length === 0) return result;
  await db.transaction(async (tx) => {
    await tx.execute(sql`delete from bill_priority_flags where session_id in (${sql.join(sessionsRead.map((id) => sql`${id}`), sql`, `)})`);
    for (let i = 0; i < rows.length; i += 300) await tx.insert(schema.billPriorityFlags).values(rows.slice(i, i + 300)).onConflictDoNothing();
  });
  result.written = rows.length;
  return result;
}
