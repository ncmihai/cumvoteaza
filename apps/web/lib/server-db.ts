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
  search: "search"
} as const;

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
