import { describe, expect, it } from "vitest";
import { lawTypeFromText, voteOutcome } from "../vote-outcome";

const deputies = { members: 331 };

describe("voteOutcome", () => {
  it("passes a final vote with more than half of all members under any rule (PL-x 296/2026: 273 for of 331)", () => {
    expect(voteOutcome({ ...deputies, motionKind: "final_adoption", yesMeaning: "supports_adoption", forCount: 273, present: 290 }))
      .toEqual({ status: "passed", rule: "passes_under_any_rule", effect: "adopted", threshold: 166 });
  });

  it("reads a passed rejection report as the bill being rejected (Senate L344/2026: 73 for, 109 present)", () => {
    const outcome = voteOutcome({ members: 134, motionKind: "rejection_report", yesMeaning: "supports_rejection", forCount: 73, present: 109 });
    expect(outcome).toEqual({ status: "passed", rule: "passes_under_any_rule", effect: "rejected", threshold: 68 });
  });

  it("fails a final vote at or below half of those present under every rule", () => {
    expect(voteOutcome({ ...deputies, motionKind: "final_adoption", yesMeaning: "supports_adoption", forCount: 120, present: 240 }))
      .toEqual({ status: "failed", rule: "fails_under_any_rule", effect: "not_adopted", threshold: 121 });
  });

  it("does not guess when the result depends on whether the law is organic", () => {
    expect(voteOutcome({ ...deputies, motionKind: "final_adoption", yesMeaning: "supports_adoption", forCount: 150, present: 240 }))
      .toEqual({ status: "undetermined", rule: "depends_on_law_type" });
  });

  it("uses the law type when it is known", () => {
    const base = { ...deputies, motionKind: "final_adoption", yesMeaning: "supports_adoption", forCount: 150, present: 240 };
    expect(voteOutcome({ ...base, lawType: "ordinary" }).status).toBe("passed");
    expect(voteOutcome({ ...base, lawType: "organic" }).status).toBe("failed");
  });

  it("decides amendments and procedure by the majority of those present (PL428/2026 amr.1: 34 for, 185 present)", () => {
    expect(voteOutcome({ ...deputies, motionKind: "amendment", yesMeaning: "supports_amendment", forCount: 34, present: 185 }))
      .toEqual({ status: "failed", rule: "majority_of_present", effect: "not_approved", threshold: 93 });
    expect(voteOutcome({ ...deputies, motionKind: "procedural_timing", yesMeaning: "supports_procedure", forCount: 169, present: 176 }).effect).toBe("approved");
  });

  it("needs two thirds of members for a constitutional revision", () => {
    const outcome = voteOutcome({ ...deputies, motionKind: "final_adoption", yesMeaning: "supports_adoption", title: "Propunere legislativă de revizuire a Constituţiei", forCount: 200, present: 300 });
    expect(outcome).toEqual({ status: "failed", rule: "two_thirds_of_members", effect: "not_adopted", threshold: 221 });
  });

  it("does not treat an attendance check as a decision", () => {
    expect(voteOutcome({ ...deputies, motionKind: "quorum_or_presence", forCount: null, present: 168 })).toEqual({ status: "not_a_decision", rule: "attendance_check" });
  });

  it("reports missing counts and missing quorum instead of a result", () => {
    expect(voteOutcome({ ...deputies, motionKind: "final_adoption", forCount: 100, present: null }).rule).toBe("missing_counts");
    expect(voteOutcome({ ...deputies, motionKind: "final_adoption", forCount: 100, present: 150 }).rule).toBe("below_quorum");
  });

  it("reads the law type stated by CDEP (PL-x 196/2026: organic law, qualified majority not reached)", () => {
    const outcome = voteOutcome({
      ...deputies, motionKind: "final_adoption", yesMeaning: "supports_adoption", forCount: 150, present: 240,
      billTitle: "privind aprobarea OUG nr.6/2026 - lege organica - nu a fost întrunita majoritatea calificata"
    });
    expect(outcome).toEqual({ status: "failed", rule: "majority_of_members", effect: "not_adopted", threshold: 166 });
    expect(lawTypeFromText("Lege ordinară")).toBe("ordinary");
    expect(lawTypeFromText("Vot final adoptare")).toBeUndefined();
  });
});
