import { describe, expect, it } from "vitest";
import { classifyVote } from "../vote-classification";

describe("classifyVote", () => {
  it.each([
    ["Verificarea prezenței", null, "quorum_or_presence", "routine", undefined],
    ["Comisiile de specialitate să lucreze în paralel cu plenul", null, "agenda_or_schedule", "routine", undefined],
    ["PL-x 196/2026 - Timp dezbatere", "bill-196", "procedural_timing", "routine", undefined],
    ["Prelungirea termenului constituțional de dezbatere și vot final - PL-x 298/2026", "bill-298", "procedural_timing", "routine", undefined],
    ["Verificare prezenta", null, "quorum_or_presence", "routine", undefined],
    ["Amendamentul nr. 3 la PL-x 12/2026", "bill-12", "amendment", "standard", undefined],
    ["Retrimitere la comisie PL-x 14/2026", "bill-14", "committee_referral", "standard", undefined],
    ["L339/2026 — raport de respingere", "bill-339", "rejection_report", "major", undefined],
    ["Vot final - PL-x 159/2026 - Vot final adoptare - Adoptare", "bill-159", "final_adoption", "major", undefined],
    ["Moțiune de cenzură împotriva Guvernului", null, "no_confidence", "major", undefined],
    ["Vot final - PH CD 53/2026 - Vot final adoptare", null, "institutional_resolution", "standard", undefined],
    ["Senate vote", null, "institutional_resolution", "standard", "raport de activitate"]
    ,["PL 530/2026 - AMA.87", "bill-530", "amendment", "standard", undefined]
    ,["PL 529/2026 - amr.2", "bill-529", "amendment", "standard", undefined]
    ,["Modificare ordine de zi", null, "agenda_or_schedule", "routine", undefined]
    ,["vot test", null, "internal_procedure", "routine", undefined]
    ,["L289/2026 — vf", "bill-289", "final_adoption", "major", "vf"]
    ,["PL 532/2026 - vot final", null, "final_adoption", "major", undefined]
    ,["Senate vote", null, "institutional_resolution", "standard", "PH - COM (2026) 113 final"]
    ,["L495/2025 — proiect de lege de aprobare", "bill-495", "final_adoption", "major", "proiect de lege de aprobare"]
    ,["Încuviințarea Comisiei pentru apărare să își desfășoare activitatea în paralel cu plenul", null, "agenda_or_schedule", "routine", undefined]
  ])("classifies %s", (title, billId, motionKind, prominence, voteType) => {
    expect(classifyVote({ title, billId, voteType })).toMatchObject({ motionKind, prominence });
  });

  it("does not promote an unlinked generic final-vote title", () => {
    expect(classifyVote({ title: "Vot final" })).toMatchObject({
      motionKind: "unknown",
      prominence: "unclassified",
      confidence: "low"
    });
  });

  it("explains what a yes vote supports", () => {
    expect(classifyVote({ title: "Raport de respingere L1/2026", billId: "bill-1" }).yesMeaning).toBe("supports_rejection");
  });
});
