import { createPooledDbSession } from "@cumsevoteaza/db";

export const CACHE_TAGS = {
  home: "home",
  votes: "votes",
  bills: "bills",
  members: "members",
  parties: "parties",
  composition: "composition",
  ministries: "ministries",
  governments: "governments",
  coverage: "coverage",
  search: "search"
} as const;

/** The cache tags a purge names ("votes,bills"); without a list, every tag. Unknown names are returned so the caller can refuse them. */
export function selectCacheTags(list: string | null | undefined): { tags: string[]; unknown: string[] } {
  const all = Object.values(CACHE_TAGS) as string[];
  const wanted = (list ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  if (wanted.length === 0) return { tags: all, unknown: [] };
  return { tags: wanted.filter((item) => all.includes(item)), unknown: wanted.filter((item) => !all.includes(item)) };
}

export function createWebDbSession() {
  return createPooledDbSession();
}

export async function timed<T>(label: string, work: () => Promise<T>): Promise<T> {
  const shouldLog = process.env.NODE_ENV === "development" || process.env.CUMSEVOTEAZA_PERF_LOG === "1";
  if (!shouldLog) return work();

  const started = performance.now();
  try {
    return await work();
  } finally {
    const elapsed = Math.round(performance.now() - started);
    console.info(`[perf] ${label}: ${elapsed}ms`);
  }
}
