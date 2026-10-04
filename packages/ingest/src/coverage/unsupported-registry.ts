import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface UnsupportedVote {
  source: "cdep" | "senate";
  officialId: string;
  date: string;
  reason: string;
  label: string;
  officialTotals: { present: number; for: number; against: number; abstention: number; notVoting: number };
  url: string;
}

const registryFile = (repoRoot: string) => path.join(repoRoot, "data", "coverage", "unsupported-votes.json");

/** Official votes whose page publishes no per-member choices (attendance checks). Kept so they are neither retried nor counted as missing. */
export async function readUnsupportedRegistry(repoRoot: string): Promise<UnsupportedVote[]> {
  try {
    return JSON.parse(await readFile(registryFile(repoRoot), "utf8")) as UnsupportedVote[];
  } catch {
    return [];
  }
}

export async function mergeUnsupportedRegistry(repoRoot: string, additions: UnsupportedVote[]): Promise<UnsupportedVote[]> {
  const merged = new Map((await readUnsupportedRegistry(repoRoot)).map((item) => [`${item.source}:${item.officialId}`, item]));
  for (const item of additions) merged.set(`${item.source}:${item.officialId}`, item);
  const all = [...merged.values()].sort((a, b) => a.date.localeCompare(b.date) || a.officialId.localeCompare(b.officialId, "en", { numeric: true }));
  await mkdir(path.dirname(registryFile(repoRoot)), { recursive: true });
  await writeFile(registryFile(repoRoot), `${JSON.stringify(all, null, 2)}\n`);
  return all;
}

export const unsupportedKeys = (items: UnsupportedVote[]) => new Set(items.map((item) => `${item.source}:${item.officialId}`));
