import { describe, expect, it } from "vitest";
import { parsePriorityEntries } from "../dossiers/priorities";

describe("parsePriorityEntries", () => {
  it("reads the label when it follows the other labels (September-December 2024 layout)", () => {
    const pages = [
      "Lege privind înfiinţarea Universităţii ”Ioan Slavici” din Timişoara L488/2024 E198/12.09.2024 - procedură de urgenţă -lege ordinară - prioritate legislativă 12 A devenit Legea nr. 329/20.12.2024 promulgatã prin decret nr. 1667/20.12.2024",
      "Proiect de lege privind aprobarea Ordonanţei nr.18/2024 L489/2024 E199/13.09.2024 - procedură de urgenţă -lege ordinară 13 Trimis la Cameră"
    ];
    expect(parsePriorityEntries(pages)).toEqual([{ senateNumber: "L488/2024", page: 1, registeredOn: "2024-09-12", urgency: true, lawKind: "ordinary" }]);
  });

  it("reads the label when it follows the stage (2025 and 2026 layout, numbers written 'L29/2025 / PLX71/2025 / E16/2025')", () => {
    const pages = [
      "Proiect de lege privind piețele de instrumente financiare L135/2026 / PLX290/2026 / E17/2026 - procedură de urgenţă -lege ordinară Trimis la Cameră pentru dezbatere - prioritate legislativă 4 adoptat de Senat (30.03.2026) Proiect de lege pentru modificarea Ordonanței L136/2026 / E18/2026 -lege organică în lucru, la comisiile 5"
    ];
    expect(parsePriorityEntries(pages)).toEqual([{ senateNumber: "L135/2026", page: 1, urgency: true, lawKind: "ordinary" }]);
  });

  it("gives a label to the bill before it, never to the next one, even when the label is split by a page break", () => {
    const pages = [
      "Titlu unu L10/2025 / E1/2025 -lege ordinară Trimis la Cameră 1 Titlu doi L11/2025 / E2/2025 - procedură de urgenţă -lege ordinară A devenit Legea nr. 5/2025 - prioritate",
      "legislativă 2 adoptat de Senat (01.03.2025) Titlu trei L12/2025 / E3/2025 -lege ordinară 3"
    ];
    expect(parsePriorityEntries(pages).map((entry) => [entry.senateNumber, entry.page])).toEqual([["L11/2025", 1]]);
  });

  it("lists a bill once when it appears among the registered and again among the adopted, with the first page", () => {
    const pages = [
      "A L7/2025 / E1/2025 - procedură de urgenţă -lege organică - prioritate legislativă 1",
      "B L8/2025 / E2/2025 -lege ordinară 2",
      "A again L7/2025 / E1/2025 - procedură de urgenţă -lege organică - prioritate legislativă 40"
    ];
    expect(parsePriorityEntries(pages)).toEqual([{ senateNumber: "L7/2025", page: 1, urgency: true, lawKind: "organic" }]);
  });

  it("finds nothing in a page with no label, and ignores numbers that are not the Senate's", () => {
    expect(parsePriorityEntries(["Legea nr. 329/20.12.2024 PL-x 354/2025 B402/2025 - prioritate legislativă"])).toEqual([]);
  });
});
