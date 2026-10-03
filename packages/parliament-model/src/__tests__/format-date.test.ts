import { describe, expect, it } from "vitest";
import { formatDate } from "../labels";

describe("formatDate", () => {
  it("shows only the month when the source gave only the month (CDEP 'din iun. 2025')", () => {
    expect(formatDate("2025-06-01", "ro", "month")).toBe("iun. 2025");
    expect(formatDate("2025-06-01", "en", "month")).toBe("Jun 2025");
  });

  it("shows the day for exact dates", () => {
    expect(formatDate("2025-09-03", "ro")).toBe("03 sept. 2025");
  });

  it("never shifts a calendar date into the previous day or month, whatever the time zone", () => {
    const previous = process.env.TZ;
    process.env.TZ = "America/Los_Angeles";
    try {
      expect(formatDate("2025-06-01", "en", "month")).toBe("Jun 2025");
      expect(formatDate("2025-06-01", "en")).toBe("01 Jun 2025");
    } finally {
      process.env.TZ = previous;
    }
  });
});
