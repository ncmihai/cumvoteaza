import { describe, expect, it } from "vitest";
import { membershipPeriods } from "../membership-periods";

const mandate2024 = { startsOn: "2024-12-21" };
const row = (label: string, startMonth?: string, endMonth?: string) => ({ label, url: `https://cdep.ro/${label}`, startMonth, endMonth });

describe("membershipPeriods", () => {
  it("keeps CDEP's group sequence instead of making every group span the mandate (Ninel Peia, 2024 Senate)", () => {
    const { periods, unresolved } = membershipPeriods(
      [row("SOS", undefined, "2025-06"), row("Senatori neafiliaţi", "2025-06", "2025-09"), row("PACE", "2025-09")],
      mandate2024
    );
    expect(unresolved).toEqual([]);
    expect(periods.map((p) => [p.label, p.startsOn, p.startsOnPrecision, p.endsOn, p.endsOnPrecision])).toEqual([
      ["SOS", "2024-12-21", "day", "2025-06-01", "month"],
      ["Senatori neafiliaţi", "2025-06-01", "month", "2025-09-01", "month"],
      ["PACE", "2025-09-01", "month", undefined, "day"]
    ]);
  });

  it("a single undated row spans the whole mandate", () => {
    const { periods } = membershipPeriods([row("AUR")], { startsOn: "2024-12-21", endsOn: "2025-03-01" });
    expect(periods).toEqual([
      expect.objectContaining({ label: "AUR", startsOn: "2024-12-21", startsOnPrecision: "day", endsOn: "2025-03-01", endsOnPrecision: "day" })
    ]);
  });

  it("fills a missing boundary from the neighbouring row (PD until feb. 2008, then PDL)", () => {
    const { periods } = membershipPeriods(
      [row("PC", undefined, "2007-06"), row("PD", "2007-06", "2008-02"), row("PDL")],
      { startsOn: "2004-12-13", endsOn: "2008-12-14" }
    );
    expect(periods.at(-1)).toEqual(expect.objectContaining({ label: "PDL", startsOn: "2008-02-01", startsOnPrecision: "month", endsOn: "2008-12-14", endsOnPrecision: "day" }));
  });

  it("sorts rows that CDEP lists in reverse order", () => {
    const { periods } = membershipPeriods([row("PDSR", "1993-07"), row("FDSN", undefined, "1993-07")], { startsOn: "1992-10-16" });
    expect(periods.map((p) => p.label)).toEqual(["FDSN", "PDSR"]);
    expect(periods[0]).toEqual(expect.objectContaining({ startsOn: "1992-10-16", endsOn: "1993-07-01" }));
  });

  it("does not invent periods for undated rows whose position cannot be pinned down", () => {
    const { periods, unresolved } = membershipPeriods([row("independent"), row("PD")], { startsOn: "2004-12-13", endsOn: "2008-12-14" });
    expect(periods).toEqual([]);
    expect(unresolved.map((r) => r.label)).toEqual(["independent", "PD"]);
  });

  it("clamps month dates to the mandate and then uses the mandate's exact day", () => {
    const { periods } = membershipPeriods([row("A", "2024-12", "2025-02"), row("B", "2025-02", "2029-01")], { startsOn: "2024-12-21", endsOn: "2028-12-20" });
    expect(periods[0]).toEqual(expect.objectContaining({ startsOn: "2024-12-21", startsOnPrecision: "day" }));
    expect(periods[1]).toEqual(expect.objectContaining({ endsOn: "2028-12-20", endsOnPrecision: "day" }));
  });
});
