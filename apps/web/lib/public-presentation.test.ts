import { describe, expect, it } from "vitest";
import type { Bill, Government, Member, MemberCareerSegment, MemberHistoryRow, SourceSnapshot, Vote } from "@cumsevoteaza/parliament-model";
import {
  presentBill,
  presentCompositionSnapshot,
  presentMemberCareer,
  presentMemberIdentity,
  presentMemberProfileContext,
  presentMemberActivity,
  presentSource,
  presentVote,
  selectCurrentPartyState
} from "./public-presentation";

const vote: Vote = {
  id: "vote-1",
  billId: "bill-1",
  chamber: "deputies",
  title: "Vot final - PL-x 196/2026 - Vot final adoptare - Adoptare",
  heldOn: "2026-09-09",
  voteType: "nominal",
  totals: { present: 291, for: 129, against: 70, abstention: 38, presentNotVoting: 54 },
  sourceSnapshotId: "source-1"
};

const bill: Bill = {
  id: "bill-1",
  slug: "pl-x-196-2026",
  title: "Aprobarea OUG nr. 6/2026 inițiatori: Guvernul României",
  identifiers: { deputies: "PL-x 196/2026" },
  chamberOfOrigin: "senate",
  status: "Trimis la promulgare consultare publică: 10 zile",
  sourceSnapshotIds: ["source-1"]
};

describe("public presentation contracts", () => {
  it("never infers a legal outcome from procedural title text", () => {
    expect(presentVote(vote, { locale: "ro", bill }).outcome).toBe("unknown");
    expect(presentVote(vote, { locale: "ro", bill }).outcomeLabel).toBe("Rezultat neclarificat");
    expect(presentVote(vote, { locale: "ro", bill, authoritativeOutcome: "adopted" }).outcome).toBe("adopted");
  });

  it("separates readable and official bill text", () => {
    const result = presentBill(bill);
    expect(result.identifier).toBe("PL-x 196/2026");
    expect(result.heading).toBe("Aprobarea OUG nr. 6/2026");
    expect(result.officialTitle).toBe(bill.title);
    expect(result.status).toBe("Trimis la promulgare");
    expect(presentBill({ ...bill, status: "în termenul acordat pentru avize și puncte de vedere solicitate Inițiator: 39 deputați" }).status).toBe("—");
  });

  it("does not call coverage-only data attendance", () => {
    const coverageOnly = presentMemberActivity({ for: 300, against: 50, abstention: 10, presentNotVoting: 20, absent: 0, unknown: 0 }, "ro");
    expect(coverageOnly.participationKind).toBe("coverage-only");
    expect(coverageOnly.participationPercent).toBeUndefined();

    const eligible = presentMemberActivity({ for: 300, against: 50, abstention: 10, presentNotVoting: 20, absent: 20, unknown: 0 }, "ro", 400);
    expect(eligible.participationKind).toBe("eligible");
    expect(eligible.participationPercent).toBe(95);
  });

  it("selects only a government participation valid on the requested date", () => {
    const ended = government("old", "2025-06-01", "2026-04-24");
    const current = government("current", "2026-04-25");
    const result = selectCurrentPartyState([
      { government: ended, alignment: "government", startsOn: "2025-06-01", endsOn: "2026-04-24" },
      { government: current, alignment: "opposition", startsOn: "2026-04-25" }
    ], "2026-09-11");
    expect(result.status).toBe("current");
    expect(result.participation?.government.id).toBe("current");
  });

  it("reports dated sources and incomplete compositions explicitly", () => {
    const source: SourceSnapshot = { id: "s", sourceUrl: "https://example.test", fetchedAt: "2026-06-01T00:00:00Z", contentHash: "x", parser: "p", parserVersion: "1", status: "parsed" };
    expect(presentSource(source, "en", "2026-09-11").freshness).toBe("stale");
    expect(presentCompositionSnapshot({ chamber: "deputies", asOf: "2026-09-11", capacity: 330, occupied: 325, unknownAffiliation: 3 })).toEqual({
      chamber: "deputies", asOf: "2026-09-11", capacity: 330, occupied: 325, vacancies: 5, unknownAffiliation: 3, isComplete: false
    });
  });

  it("separates an imported parliamentary office from the member name", () => {
    const member = testMember("Adrian-Felician Cozma, Vicepresedinte Al Camerei Deputatilor");
    expect(presentMemberIdentity(member, [], "2026-09-12")).toEqual({
      name: "Adrian-Felician Cozma",
      office: "Vicepreședinte al Camerei Deputaților"
    });
  });

  it("normalizes legacy Romanian cedilla characters in imported offices", () => {
    const result = presentMemberIdentity(testMember("Adrian-Felician Cozma, Vicepreşedinte Al Camerei Deputaţilor"), [], "2026-09-12");
    expect(result.name).toBe("Adrian-Felician Cozma");
    expect(result.office).toBe("Vicepreședinte al Camerei Deputaților");
  });

  it("prefers an active sourced role over a title embedded in the imported name", () => {
    const history: MemberHistoryRow[] = [{ id: "role-1", startsOn: "2025-01-01", legislatureId: "leg-2024-2028", chamber: "deputies", type: "role", label: "Chestor al Camerei Deputaților", details: "Rol parlamentar", votesFor: 0, votesAgainst: 0, abstentions: 0, proposals: 0 }];
    expect(presentMemberIdentity(testMember("Ana Exemplu, Secretar"), history, "2026-09-12").office).toBe("Chestor al Camerei Deputaților");
  });

  it("orders and merges continuous career segments without hiding party changes", () => {
    const segments: MemberCareerSegment[] = [
      career("pnl-2", "PNL", "2025-01-02"),
      career("usr", "USR", "2023-01-01", "2024-12-31", "usr"),
      career("pnl-1", "PNL", "2025-01-01", "2025-01-01")
    ];
    const result = presentMemberCareer(segments);
    expect(result.segments.map((segment) => segment.label)).toEqual(["USR", "PNL"]);
    expect(result.affiliationCount).toBe(2);
    expect(result.hasChanges).toBe(true);
    expect(result.hasAmbiguousDates).toBe(false);
    expect(result.endsOn).toBeUndefined();
  });

  it("flags overlapping different affiliations instead of inventing a transition order", () => {
    const result = presentMemberCareer([
      career("a", "ALDE", "2016-12-21", "2020-12-20", "alde"),
      career("b", "PMP", "2016-12-21", "2020-12-20", "pmp")
    ]);
    expect(result.hasAmbiguousDates).toBe(true);
  });

  it("builds member context from sourced roles before weaker evidence", () => {
    const role: MemberHistoryRow = { id: "r", startsOn: "2025-01-01", legislatureId: "leg", chamber: "deputies", type: "role", label: "Vicepreședinte al Camerei Deputaților", details: "", votesFor: 0, votesAgainst: 0, abstentions: 0, proposals: 0 };
    const result = presentMemberProfileContext({ identity: { name: "Ana Exemplu" }, chamberLabel: "Camera Deputaților", partyLabel: "PNL", legislatureId: "leg", legislatureLabel: "2024–2028", history: [role], sponsoredBillCount: 12, locale: "ro", asOf: "2026-01-01" });
    expect(result.evidenceKind).toBe("role");
    expect(result.summary).toContain("Ana Exemplu");
    expect(result.significance).toContain(role.label);
  });

  it("states when profile significance cannot be supported", () => {
    const result = presentMemberProfileContext({ identity: { name: "Ana Exemplu" }, locale: "ro" });
    expect(result.evidenceKind).toBe("unavailable");
    expect(result.significance).toContain("Nu există încă suficiente date");
  });
});

function government(id: string, startsOn: string, endsOn?: string): Government {
  return { id, slug: id, name: id, startsOn, endsOn, basis: "manual_curation" };
}

function testMember(displayName: string): Member {
  return { id: "member-1", slug: "member-1", firstName: "Adrian-Felician", lastName: "Cozma", displayName, sourceIds: {} };
}

function career(id: string, label: string, startsOn: string, endsOn?: string, partySlug = "pnl"): MemberCareerSegment {
  return { id, label, startsOn, endsOn, partySlug, chamber: "deputies", legislatureId: "leg-2024-2028" };
}
