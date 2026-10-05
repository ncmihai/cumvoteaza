import { describe, expect, it } from "vitest";
import { triageVoteDiscovery } from "../discovery-triage";
import { officialFromCdep, type OfficialVoteRecord } from "../coverage/vote-coverage";

const official = (id: string, description: string, chamber: "deputies" | "joint" = "deputies"): OfficialVoteRecord =>
  officialFromCdep({ id, date: "2026-09-23", time: "10:00", description, chamber, present: 1, notVoting: 0, for: 1, against: 0, abstention: 0, isTest: /^vot test/i.test(description), totalsConsistent: true });

const context = {
  firstInScopeId: 34601,
  officialById: new Map([official("40000", "Vot final"), official("40001", "Vot test 1"), official("40002", "Anexa 1 amendament", "joint"), official("40003", "Verificare prezenta"), official("40004", "Vot nou")].map((record) => [record.officialId, record])),
  heldIds: new Set(["40000"]),
  unsupportedIds: new Set(["40003"])
};
const triage = (officialId: string | null) => triageVoteDiscovery({ id: "d", officialId, status: "pending" }, context);

describe("triageVoteDiscovery", () => {
  it("retires votes of earlier legislatures with a reason", () => {
    expect(triage("12774")).toMatchObject({ rule: "older_legislature", status: "skipped" });
  });

  it("marks what we already hold as imported", () => {
    expect(triage("40000")).toMatchObject({ rule: "already_imported", status: "imported" });
  });

  it("retires test ballots, attendance checks and summarised amendment votes, each with its own reason", () => {
    expect(triage("40001")).toMatchObject({ rule: "test_ballot", status: "skipped" });
    expect(triage("40003")).toMatchObject({ rule: "attendance_check", status: "skipped" });
    expect(triage("40002")).toMatchObject({ rule: "joint_amendment_summarised", status: "skipped" });
  });

  it("leaves a vote on the official list that we do not hold pending, and flags one the lists do not know", () => {
    expect(triage("40004")).toMatchObject({ rule: "still_to_import", status: "pending" });
    expect(triage("40099")).toMatchObject({ rule: "not_on_official_lists", status: "pending" });
  });

  it("ignores discoveries without a numeric vote id", () => {
    expect(triage(null)).toBeUndefined();
    expect(triage("PL-x 138/2025")).toBeUndefined();
  });
});
