import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function rootEnvValue(repoRoot: string, name: string): string | undefined {
  const envPath = path.join(repoRoot, ".env");
  if (!existsSync(envPath)) return undefined;
  const line = readFileSync(envPath, "utf8").split("\n").find((item) => item.startsWith(`${name}=`));
  return line?.slice(name.length + 1).replace(/^"|"$/g, "").trim() || undefined;
}

/**
 * Purges the public site's cached data. `tags` ("votes,bills") purges only those caches; without it, every one.
 * Needs CRON_SECRET (the environment, or the root .env) and a site that holds the same secret.
 */
export async function revalidateSite(options: { repoRoot: string; site?: string; tags?: string }): Promise<{ ok: boolean; status: number; body: string }> {
  const secret = process.env.CRON_SECRET ?? rootEnvValue(options.repoRoot, "CRON_SECRET");
  if (!secret) throw new Error("CRON_SECRET is not set in the environment or .env");
  const site = options.site ?? "https://cumvoteaza.vercel.app";
  const response = await fetch(`${site}/api/cron/daily-import?revalidateOnly=1${options.tags ? `&tags=${encodeURIComponent(options.tags)}` : ""}`, { headers: { authorization: `Bearer ${secret}` } });
  return { ok: response.ok, status: response.status, body: await response.text() };
}
