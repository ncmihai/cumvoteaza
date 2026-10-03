import { drizzle } from "drizzle-orm/postgres-js";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import * as schema from "./schema";

type ResolvedDbSession = ReturnType<typeof createDbSession>;

declare global {
  // eslint-disable-next-line no-var
  var __cumsevoteazaWebDbSessions: Map<string, ResolvedDbSession> | undefined;
}

export function createDb(databaseUrl = process.env.DATABASE_URL) {
  return createDbSession(databaseUrl).db;
}

export function createDbSession(databaseUrl = process.env.DATABASE_URL) {
  const resolvedUrl = resolveDatabaseUrl(databaseUrl);

  const client = postgres(resolvedUrl, { max: 1 });
  return {
    db: drizzle(client, { schema }),
    close: () => client.end()
  };
}

export function createPooledDbSession(databaseUrl = process.env.DATABASE_URL) {
  const resolvedUrl = resolveDatabaseUrl(databaseUrl);
  const poolSize = Number(process.env.DATABASE_MAX_CONNECTIONS ?? "3");
  const max = Number.isFinite(poolSize) ? Math.max(1, Math.min(10, Math.floor(poolSize))) : 3;
  const sessions = globalThis.__cumsevoteazaWebDbSessions ?? new Map<string, ResolvedDbSession>();
  globalThis.__cumsevoteazaWebDbSessions = sessions;

  const existing = sessions.get(resolvedUrl);
  if (existing) return existing;

  const client = postgres(resolvedUrl, {
    max,
    idle_timeout: 20,
    connect_timeout: 10
  });
  const session: ResolvedDbSession = {
    db: drizzle(client, { schema }),
    close: async () => {
      // Web requests share this client for the life of the server process.
    }
  };
  sessions.set(resolvedUrl, session);
  return session;
}

export type DbSession = ReturnType<typeof createDbSession>;
export type DbClient = DbSession["db"];

function resolveDatabaseUrl(databaseUrl = process.env.DATABASE_URL): string {
  const resolvedUrl = databaseUrl ?? readRootEnv().DATABASE_URL;
  if (!resolvedUrl) {
    throw new Error("DATABASE_URL is required to create the database client.");
  }
  return resolvedUrl;
}

function readRootEnv(): Record<string, string> {
  try {
    const raw = readFileSync(new URL("../../../.env", import.meta.url), "utf8");
    return Object.fromEntries(
      raw
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#") && line.includes("="))
        .map((line) => {
          const index = line.indexOf("=");
          return [line.slice(0, index), line.slice(index + 1).replace(/^"|"$/g, "")];
        })
    );
  } catch {
    return {};
  }
}
