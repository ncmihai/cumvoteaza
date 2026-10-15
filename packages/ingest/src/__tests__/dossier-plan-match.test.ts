import { describe, expect, it } from "vitest";
import { groupPages, mergeDossiers } from "../dossiers/merge";
import { indexExistingBills, planBill, type ExistingBill, type PlanContext } from "../dossiers/plan";
import type { DossierStep, ParsedDossier } from "../dossiers/types";

const step = (source: "cdep" | "senate", chamber: DossierStep["chamber"], occurredOn: string): DossierStep => ({ source, chamber, occurredOn, order: 0, type: "registered", text: "registered", documents: [] });

const page = (source: "cdep" | "senate", selfId: string, registrations: ParsedDossier["registrations"], occurredOn: string): ParsedDossier => ({
  source,
  sourceUrl: `https://example.test/${source}/${selfId}`,
  selfId,
  registrations,
  initiators: [],
  steps: [step(source, source === "cdep" ? "deputies" : "senate", occurredOn)],
  consulted: [],
  fate: { outcome: "in_progress" },
  unrecognised: []
});

const stored = (id: string, identifiers: Record<string, string>): ExistingBill => ({
  id, slug: id, title: "Propunere legislativă", identifiers, chamberOfOrigin: "senate", decisionChamber: null, lawType: null, sourceSnapshotIds: [], hasDossier: true, stepCount: 4
});

const plan = (pages: ParsedDossier[], bills: ExistingBill[]) => {
  const groups = groupPages(pages);
  expect(groups).toHaveLength(1);
  const context: PlanContext = {
    existingBills: bills, billById: new Map(bills.map((bill) => [bill.id, bill])), profileKeyToMember: new Map(), candidatesByChamber: { deputies: [], senate: [] },
    voteByRef: new Map(), slugsTaken: new Set(), aliasIds: new Set()
  };
  return planBill({ merged: mergeDossiers(groups[0]!), snapshots: [], fetchedAt: {}, context, existingIndex: indexExistingBills(bills) });
};

// A Chamber page that prints only the Senate's B number: the Senate sends one B-numbered bill down more than once, and each registration at the Chamber is a bill of its own (D-025).
const later = page("cdep", "PL-x 57/2024", [{ body: "cdep", number: "57", date: "2024-02-05" }, { body: "senate", number: "B38", year: 2024 }], "2024-02-05");

describe("a dossier that shares only the Senate B number with a stored bill", () => {
  it("is not that bill when the stored bill carries another Chamber number", () => {
    const keeper = stored("bill-l182-2024", { senate: "L182/2024", senate_l: "L182/2024", senate_b: "B38/2024", deputies: "PL-x 807/2023" });
    const result = plan([later], [keeper]);
    expect(result.isNew).toBe(true);
    expect(result.billId).toBe("bill-pl-x-57-2024");
    expect(result.alsoMatches).toEqual([]);
  });

  it("is that bill when the stored bill has no Chamber number yet", () => {
    const keeper = stored("bill-l182-2024", { senate: "L182/2024", senate_l: "L182/2024", senate_b: "B38/2024" });
    const result = plan([later], [keeper]);
    expect(result.isNew).toBe(false);
    expect(result.billId).toBe("bill-l182-2024");
  });

  it("is that bill when the stored bill carries this Chamber number", () => {
    const keeper = stored("bill-l182-2024", { senate_b: "B38/2024", deputies: "PL-x 57/2024" });
    expect(plan([later], [keeper]).billId).toBe("bill-l182-2024");
  });
});
