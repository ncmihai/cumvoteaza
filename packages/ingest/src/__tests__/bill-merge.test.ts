import { describe, expect, it } from "vitest";
import { billDossierKeys, planBillMerges, type BillRecord } from "../identity/bill-merge";

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
