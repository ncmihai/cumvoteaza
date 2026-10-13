import { describe, expect, it } from "vitest";
import { billDossierKeys, planBillMerges, type BillRecord } from "../identity/bill-merge";
import { chosenBillTitle, isVoteStyleTitle } from "../dossiers/plan";

const bill = (id: string, identifiers: Record<string, string>, parsers: string[]): BillRecord => ({ id, slug: id.replace(/^bill-/, ""), identifiers, parsers });

describe("bill merges (D22)", () => {
  it("normalizes dossier keys and ignores Senate registration numbers", () => {
    expect(billDossierKeys({ senate: "L122/2026", deputies: "Pl-x 196/2026", senate_b: "B53/2026" })).toEqual(["senate:L122/2026", "deputies:PL-x 196/2026"]);
    expect(billDossierKeys({ senate: "B258/2025", senate_b: "B258/2025" })).toEqual([]);
  });

  it("folds a CDEP vote placeholder into the full record of the same dossier (PL-x 196/2026)", () => {
    const plan = planBillMerges([
      bill("bill-l122-2026", { senate: "L122/2026", deputies: "PL-x 196/2026", senate_l: "L122/2026" }, ["deputies-bill"]),
      bill("bill-pl-x-196-2026", { deputies: "PL-x 196/2026" }, ["chamber-nominal-vote"])
    ]);
    expect(plan.merges).toEqual([{ into: "bill-l122-2026", from: ["bill-pl-x-196-2026"], key: "deputies:PL-x 196/2026" }]);
  });

  it("keeps the Senate bill page record when both chambers' pages were stored separately, and folds chains", () => {
    const plan = planBillMerges([
      bill("bill-pl-x-151-2024", { deputies: "PL-x 151/2024" }, ["deputies-bill"]),
      bill("bill-l94-2024", { senate: "L94/2024", deputies: "PL-x 151/2024", senate_l: "L94/2024" }, ["senate-bill"]),
      bill("bill-l94-2024-vote", { senate: "L94/2024" }, ["senate-vote-detail"])
    ]);
    expect(plan.merges).toEqual([{ into: "bill-l94-2024", from: ["bill-l94-2024-vote", "bill-pl-x-151-2024"], key: "deputies:PL-x 151/2024, senate:L94/2024" }]);
  });

  it("reports different dossiers sharing a B-number instead of merging them", () => {
    const plan = planBillMerges([
      bill("bill-pl-x-267-2025", { senate: "B258/2025", deputies: "PL-x 267/2025", senate_b: "B258/2025" }, ["deputies-bill"]),
      bill("bill-pl-x-428-2025", { senate: "B258/2025", deputies: "PL-x 428/2025", senate_b: "B258/2025" }, ["deputies-bill"])
    ]);
    expect(plan.merges).toEqual([]);
    expect(plan.sharedRegistrationNumbers).toEqual([{ number: "B258/2025", bills: ["bill-pl-x-267-2025", "bill-pl-x-428-2025"] }]);
  });
});

describe("a bill's title when a vote named it first", () => {
  it("knows the titles a vote gave", () => {
    for (const title of ["L103/2022 — vot final", "L1/2022 — vf", "PL-x 135/2022 - Retrimitere la Comisie", "L109/2015 — proiect de lege de respingere", "L106/2021 — raport de respingere (a legii)"]) expect(isVoteStyleTitle(title)).toBe(true);
    for (const title of ["Proiect de Lege pentru modificarea Legii nr. 58/1934", "Lege privind L103/2022", "unknown"]) expect(isVoteStyleTitle(title)).toBe(false);
  });

  it("replaces it with the dossier's title, keeps a real stored title, and falls back on what there is", () => {
    expect(chosenBillTitle("L103/2022 — vot final", "Proiect de Lege pentru ratificarea unui acord", "bill-l103-2022")).toBe("Proiect de Lege pentru ratificarea unui acord");
    expect(chosenBillTitle("Proiect de Lege vechi", "Proiect de Lege nou", "bill-x")).toBe("Proiect de Lege vechi");
    expect(chosenBillTitle("L103/2022 — vot final", undefined, "bill-l103-2022")).toBe("L103/2022 — vot final");
    expect(chosenBillTitle(undefined, undefined, "bill-x")).toBe("bill-x");
    expect(chosenBillTitle("unknown", "Titlu", "bill-x")).toBe("Titlu");
  });
});

