/** Public pages read only real data. Without a database they report "unavailable", never sample data. */
export function requireDatabase(): void {
  if (!process.env.DATABASE_URL) {
    throw new Error("Public data is temporarily unavailable");
  }
}

export function dataUnavailable(): never {
  // Never log connection strings, queries or source payloads in a public failure.
  console.error("[public-data] database read failed");
  throw new Error("Public data is temporarily unavailable");
}
