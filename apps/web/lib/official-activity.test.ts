import { describe, expect, it } from "vitest";
import { officialActivityText } from "../app/[locale]/_components/OfficialActivityPanel";

const item = (metric: string, value: number, extra: { outOf?: number; detail?: number } = {}) => ({ metric, value, asOf: "2026-10-05", sourceUrl: "https://www.senat.ro/x", chamber: "senate" as const, ...extra });

describe("officialActivityText", () => {
  it("words each figure the way the institution does", () => {
    expect(officialActivityText(item("initiatives", 43, { detail: 6 }), "ro")).toBe("43, din care 6 promulgate ca lege");
    expect(officialActivityText(item("initiatives", 43, { detail: 6 }), "en")).toBe("43, of which 6 became law");
    expect(officialActivityText(item("speeches", 105, { outOf: 162 }), "ro")).toBe("105 în 162 ședințe");
    expect(officialActivityText(item("evote_attendance", 87, { outOf: 95 }), "en")).toBe("87 of 95 sittings");
  });

  it("shows a plain count as a plain number, zero included", () => {
    expect(officialActivityText(item("questions", 0), "ro")).toBe("0");
    expect(officialActivityText(item("motions_signed", 17), "en")).toBe("17");
  });

  it("does not invent the second number when the source did not give one", () => {
    expect(officialActivityText(item("speeches", 105), "ro")).toBe("105");
    expect(officialActivityText(item("initiatives", 43), "en")).toBe("43");
  });
});
