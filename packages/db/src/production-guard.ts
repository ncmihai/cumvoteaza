/**
 * Command-line tools never reach the production database by accident (D-018, D30).
 * `PRODUCTION_DB_HOST` names the production endpoint; a connection to it is refused unless `ALLOW_PRODUCTION=1`,
 * which only the `npm run prod -- <command>` wrapper sets after showing the target and asking for confirmation.
 * The deployed website uses its own pooled connection and is not subject to this guard.
 */
export function endpointOf(databaseUrl: string): string | undefined {
  try {
    const host = new URL(databaseUrl).hostname;
    // pooled and direct hostnames of one Neon endpoint differ only by "-pooler"
    return host.split(".")[0]?.replace(/-pooler$/, "");
  } catch {
    return undefined;
  }
}

export function assertNotProductionByAccident(databaseUrl: string, env: Record<string, string | undefined> = process.env, productionHost = env.PRODUCTION_DB_HOST): void {
  if (!productionHost || env.ALLOW_PRODUCTION === "1") return;
  const target = endpointOf(databaseUrl);
  if (target && target === endpointOf(`postgres://x@${productionHost}/db`)) {
    throw new Error(
      `Refusing to open the production database (${target}) from a command-line tool. ` +
      "Run it through the wrapper instead: npm run prod -- <command>. Local work belongs on the dev branch."
    );
  }
}
