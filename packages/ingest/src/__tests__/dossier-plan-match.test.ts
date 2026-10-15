import { describe, expect, it } from "vitest";
import { groupPages, mergeDossiers } from "../dossiers/merge";
import { settleVoteConflicts } from "../dossiers/import";
import { chosenBillTitle, indexExistingBills, planBill, type BillPlan, type ExistingBill, type PlanContext } from "../dossiers/plan";
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

const plan = (pages: ParsedDossier[], bills: ExistingBill[], chamberPageNumbers?: Set<string>) => {
  const groups = groupPages(pages);
  expect(groups).toHaveLength(1);
  const context: PlanContext = {
    existingBills: bills, billById: new Map(bills.map((bill) => [bill.id, bill])), profileKeyToMember: new Map(), candidatesByChamber: { deputies: [], senate: [] },
    voteByRef: new Map(), slugsTaken: new Set(), aliasIds: new Set(), ...(chamberPageNumbers ? { chamberPageNumbers } : {})
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

describe("a Senate page with no Chamber page of its own", () => {
  const senateOnly = { ...page("senate", "L268/2026", [{ body: "senate", number: "L268", date: "2026-03-01" }], "2026-03-01"), title: "Propunere legislativă pentru completarea Legea apiculturii nr.383/2013" };

  it("does not take the stored bill of a Chamber page that exists", () => {
    // The Senate listed PLX468/2026 for it; the Chamber's own page of 468/2026 is another bill, stored with a Senate number printed by mistake.
    const chamberBill = stored("bill-pl-x-468-2026", { deputies: "PL-x 468/2026", senate_b: "B152/2026" });
    const result = plan([senateOnly], [chamberBill], new Set(["pl-x468/2026"]));
    expect(result.isNew).toBe(true);
    expect(result.billId).toBe("bill-l268-2026");
  });

  it("keeps the bill whose id is its own Senate number, and drops the Chamber number that bill carried by mistake", () => {
    const wrong = stored("bill-l268-2026", { senate: "L268/2026", senate_l: "L268/2026", deputies: "PL-x 468/2026" });
    const result = plan([senateOnly], [wrong], new Set(["pl-x468/2026"]));
    expect(result.billId).toBe("bill-l268-2026");
    expect(result.bill.identifiers.deputies).toBeUndefined();
  });
});

describe("the title a bill is stored with", () => {
  it("is replaced when it names other laws than the dossier's", () => {
    expect(chosenBillTitle("Proiect de Lege pentru completarea art.469 din Legea nr.227/2015 privind Codul fiscal", "Propunere legislativă pentru completarea Legea apiculturii nr.383/2013", "bill-l268-2026")).toBe("Propunere legislativă pentru completarea Legea apiculturii nr.383/2013");
    expect(chosenBillTitle("Lege pentru completarea Legii nr.95/2006", "Proiect de Lege pentru completarea Legii nr.95/2006 privind reforma", "bill-x")).toBe("Lege pentru completarea Legii nr.95/2006");
  });
});

describe("a vote one dossier names while another bill holds it", () => {
  const conflict = (storedBillId: string) => ({ voteId: "vote-senate-l62-2021-04-12-final", storedBillId, reason: "stored_bill_has_its_own_dossier" });
  const planOf = (billId: string, over: Partial<BillPlan> = {}) => ({ billId, steps: [], alsoMatches: [], voteLinks: [], voteConflicts: [], ...over }) as unknown as BillPlan;

  it("moves when the holder is covered by a dossier of this run that does not name it", () => {
    const claimant = planOf("bill-l62-2021", { voteConflicts: [conflict("bill-pl-x-134-2022")] });
    const holder = planOf("bill-l62-2022", { alsoMatches: ["bill-pl-x-134-2022"] });
    settleVoteConflicts([claimant, holder]);
    expect(claimant.voteConflicts).toEqual([]);
    expect(claimant.voteLinks).toEqual([{ voteId: "vote-senate-l62-2021-04-12-final", billId: "bill-l62-2021", replaces: "bill-pl-x-134-2022" }]);
  });

  it("stays a conflict when the holder's own dossier names the vote, or when no dossier of this run covers the holder", () => {
    const claimant = planOf("bill-l62-2021", { voteConflicts: [conflict("bill-l67-2021")] });
    const names = planOf("bill-l67-2021", { steps: [{ voteId: "vote-senate-l62-2021-04-12-final" }] as BillPlan["steps"] });
    settleVoteConflicts([claimant, names]);
    expect(claimant.voteConflicts).toHaveLength(1);
    const alone = planOf("bill-a", { voteConflicts: [conflict("bill-b")] });
    settleVoteConflicts([alone]);
    expect(alone.voteConflicts).toHaveLength(1);
  });
});
