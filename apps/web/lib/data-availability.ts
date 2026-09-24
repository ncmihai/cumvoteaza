export function requireDatabaseOrExplicitDemo(): void {
  if (!process.env.DATABASE_URL && process.env.CUMSEVOTEAZA_DEMO_MODE !== "1") {
    throw new Error("Public data is temporarily unavailable");
  }
}

export function dataUnavailable(): never {
  // Never log connection strings, queries or source payloads in a public failure.
  console.error("[public-data] database read failed");
  throw new Error("Public data is temporarily unavailable");
}
