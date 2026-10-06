import { describe, expect, it } from "vitest";
import { cabinetDecrees, catchUpWindow, decideRunStatus, diffDossier, integrityVerdict, issueFor, pickBillPagesToRefresh, type StepResult } from "../updater/plan";

const step = (name: string, status: StepResult["status"], extra: Partial<StepResult> = {}): StepResult => ({ step: name, status, startedAt: "2026-10-07T05:00:00Z", endedAt: "2026-10-07T05:01:00Z", ...extra });

describe("catchUpWindow", () => {
  it("starts three days before the last success and ends today", () => {
    expect(catchUpWindow({ lastSuccessAt: "2026-10-05T05:10:00Z", today: "2026-10-07" })).toEqual({ from: "2026-10-02", to: "2026-10-07" });
  });
  it("looks at the last two weeks on a first run", () => {
    expect(catchUpWindow({ today: "2026-10-07" })).toEqual({ from: "2026-09-23", to: "2026-10-07" });
  });
  it("never goes back more than the cap after a long silence", () => {
    expect(catchUpWindow({ lastSuccessAt: "2026-01-01T00:00:00Z", today: "2026-10-07", maxDays: 30 })).toEqual({ from: "2026-09-07", to: "2026-10-07" });
  });
});

describe("catchUpWindow and held votes", () => {
  it("goes back to a vote that was held until it is in, however long ago", () => {
    expect(catchUpWindow({ lastSuccessAt: "2026-10-09T05:10:00Z", today: "2026-10-10", heldDates: ["2026-10-06"] })).toEqual({ from: "2026-10-05", to: "2026-10-10" });
  });
  it("still never goes back more than the cap", () => {
    expect(catchUpWindow({ lastSuccessAt: "2026-10-09T05:10:00Z", today: "2026-10-10", heldDates: ["2026-01-02"], maxDays: 30 })).toEqual({ from: "2026-09-10", to: "2026-10-10" });
  });
});

describe("integrityVerdict", () => {
  const before = [{ name: "a_error", severity: "error" as const, count: 0 }, { name: "b_warning", severity: "warning" as const, count: 4 }, { name: "c_error", severity: "error" as const, count: 2 }];
  it("blocks on a grown error check and only reports a grown warning", () => {
    const after = [{ name: "a_error", severity: "error" as const, count: 1 }, { name: "b_warning", severity: "warning" as const, count: 6 }, { name: "c_error", severity: "error" as const, count: 2 }];
    expect(integrityVerdict(before, after)).toEqual({ worse: ["a_error: 0 → 1"], grew: ["b_warning: 4 → 6"] });
  });
  it("lets a tolerated error check grow (reported, not blocking)", () => {
    const after = [{ name: "a_error", severity: "error" as const, count: 3 }];
    expect(integrityVerdict(before, after, new Set(["a_error"]))).toEqual({ worse: [], grew: ["a_error: 0 → 3"] });
  });
  it("is quiet when nothing grew", () => {
    expect(integrityVerdict(before, before)).toEqual({ worse: [], grew: [] });
  });
});

describe("decideRunStatus", () => {
  it("is nothing_new when everything ran and nothing changed", () => {
    expect(decideRunStatus({ steps: [step("votes", "ok"), step("bills", "skipped")], integrityWorse: [], changes: 0 })).toBe("nothing_new");
  });
  it("publishes when things changed and every gate passed", () => {
    expect(decideRunStatus({ steps: [step("votes", "ok")], integrityWorse: [], changes: 5 })).toBe("published");
  });
  it("holds on a held item or a worse check, even with changes", () => {
    expect(decideRunStatus({ steps: [step("votes", "ok", { held: [{ kind: "vote", id: "1", reasons: ["totals differ"] }] })], integrityWorse: [], changes: 5 })).toBe("held");
    expect(decideRunStatus({ steps: [step("votes", "ok")], integrityWorse: ["x: 0 → 1"], changes: 5 })).toBe("held");
  });
  it("does not hold the data for a decree that may change the cabinet", () => {
    expect(decideRunStatus({ steps: [step("decrees", "ok", { held: [{ kind: "decree", id: "decret-801-2026", reasons: ["a decree"] }] })], integrityWorse: [], changes: 0 })).toBe("nothing_new");
  });
  it("fails when a step failed", () => {
    expect(decideRunStatus({ steps: [step("votes", "failed")], integrityWorse: [], changes: 0 })).toBe("failed");
  });
});

describe("issueFor", () => {
  it("names the held items with their reasons and the steps", () => {
    const issue = issueFor({ id: "run-1", status: "held", startedAt: "2026-10-07T05:00:00Z", trigger: "schedule", steps: [step("votes", "ok", { counts: { written: 3 } })], held: [{ kind: "vote", id: "senate-77", reasons: ["a name is not in the roster"], url: "https://www.senat.ro/x" }], integrity: { worse: [], grew: [] }, counts: {} });
    expect(issue.title).toBe("[updater] held batch 2026-10-07");
    expect(issue.key).toBe("[updater] held batch");
    expect(issue.body).toContain("vote `senate-77`: a name is not in the roster (https://www.senat.ro/x)");
    expect(issue.body).toContain("votes: ok {\"written\":3}");
  });
  it("has its own title when the only news is a decree", () => {
    const issue = issueFor({ id: "run-3", status: "nothing_new", startedAt: "2026-10-08T05:00:00Z", trigger: "schedule", steps: [], held: [{ kind: "decree", id: "decret-801-2026", reasons: ["a decree that may change the cabinet: Decret nr. 801"] }], integrity: { worse: [], grew: [] }, counts: {} });
    expect(issue.title).toBe("[updater] possible cabinet change 2026-10-08");
    expect(issue.body).toContain("To look at (nothing was held back)");
  });
  it("tells the owner how to add a missing member", () => {
    const issue = issueFor({ id: "run-4", status: "held", startedAt: "2026-10-09T05:00:00Z", trigger: "schedule", steps: [], held: [{ kind: "roster", id: "deputies:idm337", reasons: ["Nume Prenume is on the official roster and we hold no profile for them"], url: "https://www.cdep.ro/ords/pls/parlam/structura.mp?idm=337&cam=2&leg=2024" }], integrity: { worse: [], grew: [] }, counts: {} });
    expect(issue.body).toContain("A member is missing from our roster");
    expect(issue.body).toContain("cdep_history_probe.py crawl --seed-url");
    expect(issue.body).toContain("roster `deputies:idm337`");
  });
  it("says so when a run failed with an error", () => {
    const issue = issueFor({ id: "run-2", status: "failed", startedAt: "2026-10-07T05:00:00Z", trigger: "manual", steps: [], held: [], integrity: { worse: [], grew: [] }, counts: {}, error: "HTTP 503" });
    expect(issue.title).toBe("[updater] run failed 2026-10-07");
    expect(issue.body).toContain("**Error:** HTTP 503");
  });
});

describe("pickBillPagesToRefresh", () => {
  it("takes new pages, then those a vote touched, then the in-progress pages read longest ago, up to the cap and without repeats", () => {
    const pages = [
      { key: "B1-2026", readAt: "2026-10-05T00:00:00Z", inProgress: true },
      { key: "B2-2026", readAt: "2026-09-01T00:00:00Z", inProgress: true },
      { key: "B3-2026", readAt: "2026-08-01T00:00:00Z", inProgress: false },
      { key: "B4-2026", readAt: "2026-09-20T00:00:00Z", inProgress: true }
    ];
    expect(pickBillPagesToRefresh({ newKeys: ["L9-2026"], touchedKeys: ["B1-2026", "L9-2026"], pages, max: 4 })).toEqual(["L9-2026", "B1-2026", "B2-2026", "B4-2026"]);
    expect(pickBillPagesToRefresh({ newKeys: [], touchedKeys: [], pages, max: 1 })).toEqual(["B2-2026"]);
  });
});

describe("cabinetDecrees", () => {
  const act = (type: string, text: string) => ({ type, issuer: "Președintele României", title: "", link: "http://legislatie.just.ro/Public/DetaliiDocument/1", text });
  it("reports decrees that change who sits in the Government, once each", () => {
    const acts = [
      act("DECRET", " DECRET nr. 801 din 5 octombrie 2026 pentru numirea domnului X în funcția de ministru al sănătății   EMITENT PREȘEDINTELE ROMÂNIEI"),
      act("DECRET", " DECRET nr. 801 din 5 octombrie 2026 pentru numirea domnului X în funcția de ministru al sănătății   EMITENT PREȘEDINTELE ROMÂNIEI"),
      act("DECRET", " DECRET nr. 802 din 5 octombrie 2026 pentru numirea unui judecător   EMITENT PREȘEDINTELE ROMÂNIEI"),
      act("DECRET", " DECRET nr. 803 din 6 octombrie 2026 privind eliberarea din funcție a viceprim-ministrului Y   EMITENT"),
      act("DECRET", " DECRET nr. 804 din 6 octombrie 2026 pentru desemnarea unui membru al Guvernului ca ministru interimar   EMITENT"),
      act("DECRET", " DECRET nr. 365 din 2 iulie 2026 pentru promulgarea Legii privind aprobarea Ordonanței de urgență a Guvernului nr. 55/2025   EMITENT"),
      act("HOTĂRÂRE", " HOTĂRÂRE nr. 5 din 1 octombrie 2026 privind ministrul")
    ];
    const found = cabinetDecrees(acts, new Set(["decret-803-2026"]));
    expect(found.map((item) => item.id)).toEqual(["decret-801-2026", "decret-804-2026"]);
    expect(found[0]!.title).toContain("ministru al sănătății");
  });
});

describe("diffDossier", () => {
  it("names a new bill as created", () => {
    expect(diffDossier(undefined, { outcome: "in_progress" })).toEqual([{ field: "created", oldValue: null, newValue: "in_progress" }]);
  });
  it("lists only the fields that changed, with old and new values", () => {
    const before = { outcome: "in_progress", stage: "la comisii", lawNumber: null, steps: 12 };
    const after = { outcome: "promulgated", stage: "Lege 190/2026", lawNumber: "190", steps: 14 };
    expect(diffDossier(before, after)).toEqual([
      { field: "outcome", oldValue: "in_progress", newValue: "promulgated" },
      { field: "stage", oldValue: "la comisii", newValue: "Lege 190/2026" },
      { field: "lawNumber", oldValue: null, newValue: "190" },
      { field: "steps", oldValue: "12", newValue: "14" }
    ]);
  });
  it("is empty when nothing changed", () => {
    expect(diffDossier({ outcome: "archived", steps: 5 }, { outcome: "archived", steps: 5 })).toEqual([]);
  });
});
