import { describe, expect, it } from "vitest";
import type { BillDossier } from "@cumsevoteaza/parliament-model";
import { deadlineLine, fateView, groupStepsByChamber, registrationLine, resultLine, stepTypeLabel, verdictLine } from "./bill-dossier-presentation";

const dossier = (over: Partial<BillDossier> = {}): BillDossier => ({ billId: "bill-x", readAt: "2026-10-05T00:00:00Z", sources: {}, registrations: [], outcome: "in_progress", ...over });

describe("bill dossier presentation", () => {
  it("labels every step type in both languages", () => {
    expect(stepTypeLabel("committee_report_received", "ro")).toBe("Raport primit de la comisie");
    expect(stepTypeLabel("published", "en")).toBe("Published in the Official Gazette");
  });

  it("says what a report concluded, with the amendment counts when printed", () => {
    expect(verdictLine({ verdict: "favorable_with_amendments", amendmentsAdmitted: 61 }, "ro")).toBe("Favorabil, cu amendamente (61 admise)");
    expect(verdictLine({ verdict: "rejection", amendmentsRejected: 3 }, "en")).toBe("Report recommends rejection (3 rejected)");
    expect(verdictLine({}, "ro")).toBeUndefined();
  });

  it("writes the vote counts in order and skips what the page did not print", () => {
    expect(resultLine({ for: 284, against: 1, abstention: 2, notVoting: 2 }, "ro")).toBe("284 pentru · 1 împotrivă · 2 abțineri · 2 nu au votat");
    expect(resultLine({ for: 116, against: 0, abstention: 1 }, "en")).toBe("116 for · 0 against · 1 abstention");
    expect(resultLine(undefined, "ro")).toBeUndefined();
  });

  it("names the deadlines by what the step is", () => {
    expect(deadlineLine({ stepType: "sent_to_committee", deadlineAmendmentsOn: "2026-02-19", deadlineOn: "2026-03-03" }, "ro")).toMatch(/termen pentru amendamente: .*· termen pentru raport: /);
    expect(deadlineLine({ stepType: "committee_opinion_requested", deadlineOn: "2025-09-15" }, "en")).toMatch(/^opinion due: /);
    expect(deadlineLine({ stepType: "registered" }, "ro")).toBeUndefined();
  });

  it("shows the fate of a promulgated law with its decree and gazette, and says plainly when the gazette is not read yet", () => {
    const full = fateView(dossier({ outcome: "promulgated", lawNumber: "238", lawYear: 2025, decreeNumber: "1150", decreeYear: 2025, decreeOn: "2025-12-12", gazetteNumber: "1171", gazetteOn: "2025-12-17" }), "ro");
    expect(full).toMatchObject({ tone: "done", headline: "Legea nr. 238/2025" });
    expect(full.details[0]).toMatch(/^Decret de promulgare nr\. 1150\/2025 din /);
    expect(full.details[1]).toMatch(/^Monitorul Oficial nr\. 1171 din /);
    expect(fateView(dossier({ outcome: "promulgated", lawNumber: "53", lawYear: 2026 }), "en").details.at(-1)).toMatch(/not yet read/);
  });

  it("shows a bill still moving with the official stage line, and stopped bills as stopped", () => {
    expect(fateView(dossier({ stageText: "trimis pentru raport la comisiile permanente" }), "ro")).toEqual({ tone: "open", headline: "În procedură", details: ["trimis pentru raport la comisiile permanente"] });
    expect(fateView(dossier({ outcome: "withdrawn" }), "en").tone).toBe("stopped");
  });

  it("shows a shelved (clasat) bill as stopped, with the page's own stage line", () => {
    const view = fateView(dossier({ outcome: "archived", outcomeOn: "2024-12-30", stageText: "Clasat, conform Hotărârii Biroului Permanent" }), "ro");
    expect(view).toMatchObject({ tone: "stopped", headline: "Clasat" });
    expect(view.details.at(-1)).toBe("Clasat, conform Hotărârii Biroului Permanent");
    expect(stepTypeLabel("reexamination_requested", "ro")).toBe("Președintele cere reexaminarea legii");
  });

  it("writes registration numbers and groups steps into chamber lanes", () => {
    expect(registrationLine({ body: "senate", number: "L535", date: "2025-12-02" }, "ro")).toMatch(/^Senat L535 · /);
    expect(groupStepsByChamber([{ chamber: "senate" }, { chamber: "senate" }, { chamber: "deputies" }, { chamber: "senate" }]).map((group) => [group.chamber, group.steps.length])).toEqual([["senate", 2], ["deputies", 1], ["senate", 1]]);
  });
});
