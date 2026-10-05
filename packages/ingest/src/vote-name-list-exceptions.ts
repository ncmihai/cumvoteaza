import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface NameListException {
  source: "cdep" | "senate";
  officialId: string;
  voteId: string;
  date: string;
  /** How many names the source's own list is short, per choice. */
  shortBy: { for?: number; against?: number; abstention?: number };
  verifiedOn: string;
  evidence: string;
}

const defaultFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../data/curated/vote-name-list-exceptions.json");

/** Votes checked by hand whose source page lists fewer names than it announces (data/curated/vote-name-list-exceptions.json). */
export function readNameListExceptions(file = defaultFile): NameListException[] {
  if (!existsSync(file)) return [];
  return (JSON.parse(readFileSync(file, "utf8")) as { exceptions: NameListException[] }).exceptions;
}

export const exceptionKey = (source: string, officialId: string) => `${source}:${officialId.toLowerCase()}`;

/** Adds entries to the curated file (kept sorted by date), skipping official ids already recorded. */
export function appendNameListExceptions(additions: NameListException[], file = defaultFile): number {
  const raw = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as { note?: string; exceptions: NameListException[] }) : { exceptions: [] };
  const have = new Set(raw.exceptions.map((item) => exceptionKey(item.source, item.officialId)));
  const added = additions.filter((item) => !have.has(exceptionKey(item.source, item.officialId)));
  if (added.length === 0) return 0;
  raw.exceptions = [...raw.exceptions, ...added].sort((a, b) => a.date.localeCompare(b.date) || a.officialId.localeCompare(b.officialId));
  writeFileSync(file, `${JSON.stringify(raw, null, 2)}\n`);
  return added.length;
}
