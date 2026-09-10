import { describe, expect, it } from "vitest";
import { validateDateRange } from "../sync";

describe("bounded vote imports", () => {
  it("accepts inclusive single-day and open bounds", () => {
    expect(() => validateDateRange({ dateFrom: "2026-05-01", dateTo: "2026-05-01" })).not.toThrow();
    expect(() => validateDateRange({ dateTo: "2026-09-10" })).not.toThrow();
  });
  it("rejects invalid or reversed dates before opening a database", () => {
    for (const dateFrom of ["2026-02-30", "2026-13-01", "05/01/2026", "bad"]) {
      expect(() => validateDateRange({ dateFrom })).toThrow();
    }
    expect(() => validateDateRange({ dateFrom: "2026-09-10", dateTo: "2026-05-01" })).toThrow();
  });
});
