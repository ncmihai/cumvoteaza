import { describe, expect, it } from "vitest";
import type { BillProcedureStep, DocumentSource } from "@cumsevoteaza/parliament-model";
import { buildReportsAndOpinions } from "./bill-reports-opinions";

const step = (id: string, stepType: BillProcedureStep["stepType"], occurredOn: string, extra: Partial<BillProcedureStep> = {}): BillProcedureStep => ({ id, billId: "b", occurredOn, chamber: "senate", stepType, title: stepType, displayOrder: Number(id.replace(/\D/g, "")) || 0, ...extra });
const doc = (id: string, label: string, url: string): DocumentSource => ({ id, billId: "b", label, url });

describe("buildReportsAndOpinions", () => {
  it("lists a committee's report with its verdict, number, amendment counts and the file", () => {
    const result = buildReportsAndOpinions(
      [step("s1", "committee_report_received", "2026-03-10", { committeeName: "Comisia juridică", verdict: "favorable_with_amendments", documentNumber: "213", amendmentsAdmitted: 4, amendmentsRejected: 1, documentIds: ["d1"] })],
      [doc("d1", "Comisia juridică", "https://www.senat.ro/legis/PDF/2026/26L1CJ.PDF?nocache=true")]
    );
    expect(result.reports).toHaveLength(1);
    expect(result.reports[0]).toMatchObject({ issuer: "Comisia juridică", verdict: "favorable_with_amendments", number: "213", amendments: { admitted: 4, rejected: 1 }, attached: false, date: "2026-03-10" });
    expect(result.reports[0]!.files).toEqual([{ documentId: "d1", url: "https://www.senat.ro/legis/PDF/2026/26L1CJ.PDF?nocache=true", format: "pdf", label: "Comisia juridică" }]);
  });

  it("shows the .pdf and its .docx copy as one entry, the pdf first", () => {
    const result = buildReportsAndOpinions(
      [step("s1", "committee_opinion_received", "2024-02-01", { chamber: "deputies", committeeName: "Comisia pentru muncă", documentIds: ["d2", "d1"] })],
      [doc("d1", "", "http://www.cdep.ro/comisii/munca/doc/2024/av55.docx"), doc("d2", "", "http://www.cdep.ro/comisii/munca/pdf/2024/av55.pdf")]
    );
    expect(result.committeeOpinions).toHaveLength(1);
    expect(result.committeeOpinions[0]!.files.map((file) => file.format)).toEqual(["pdf", "docx"]);
  });

  it("shows the Chamber's .doc copy, kept in a sibling folder, with its .pdf as one report", () => {
    const result = buildReportsAndOpinions(
      [step("s1", "committee_report_received", "2026-06-10", { chamber: "deputies", committeeName: "Comisia juridică", documentIds: ["d1", "d2"] })],
      [doc("d1", "Comisia juridică", "https://www.cdep.ro/comisii/juridica/pdf/2026/rp336.pdf"), doc("d2", "Comisia juridică", "https://www.cdep.ro/comisii/juridica/doc/2026/rp336.doc")]
    );
    expect(result.reports).toHaveLength(1);
    expect(result.reports[0]!.files.map((file) => file.format)).toEqual(["pdf", "doc"]);
  });

  it("finds the Legislative Council's opinion printed on the registration step, and the Government's decision stays out", () => {
    const result = buildReportsAndOpinions(
      [step("s1", "registered", "2025-05-02", { documentIds: ["d1", "d2", "d3"] })],
      [doc("d1", "forma iniţiatorului", "https://x/FG.PDF"), doc("d2", "avizul Consiliului Legislativ", "https://x/LG.PDF"), doc("d3", "hotărârea de Guvern", "https://x/HG.PDF")]
    );
    expect(result.total).toBe(1);
    expect(result.bodyOpinions[0]).toMatchObject({ issuer: "Consiliul Legislativ", role: "legislative_council", attached: true, date: "2025-05-02" });
  });

  it("adds an opinion the header lists without a step, undated, unless a step already prints that file", () => {
    const result = buildReportsAndOpinions(
      [step("s1", "registered", "2025-05-02", { documentIds: ["d1"] })],
      [doc("d1", "avizul Consiliului Legislativ", "https://x/LG.PDF"), doc("d2", "avizul Consiliului Economic şi Social", "https://x/CES.PDF"), doc("d3", "avizul Consiliului Legislativ", "https://x/LG.PDF?nocache=true")]
    );
    expect(result.bodyOpinions.map((entry) => entry.issuer).sort()).toEqual(["Consiliul Economic și Social", "Consiliul Legislativ"]);
    expect(result.bodyOpinions.find((entry) => entry.role === "economic_social_council")!.date).toBeUndefined();
  });

  it("does not list the editable copy of a committee paper as an opinion of its own", () => {
    const result = buildReportsAndOpinions(
      [step("s1", "committee_opinion_received", "2024-02-01", { chamber: "deputies", committeeName: "Comisia X", documentIds: ["d1"] })],
      [doc("d1", "", "http://www.cdep.ro/c/pdf/2024/av9.pdf"), doc("d2", "Aviz — Comisia X", "http://www.cdep.ro/c/doc/2024/av9.docx")]
    );
    expect(result.committeeOpinions).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it("lists a request that has no answer on the page, and not one that has", () => {
    const result = buildReportsAndOpinions(
      [
        step("s1", "committee_opinion_requested", "2026-01-05", { committeeName: "Comisia A" }),
        step("s2", "committee_opinion_requested", "2026-01-05", { committeeName: "Comisia B" }),
        step("s3", "committee_opinion_received", "2026-02-01", { committeeName: "Comisia A", documentIds: ["d1"] }),
        step("s4", "government_view_requested", "2026-01-06", { institution: "Guvernul" })
      ],
      [doc("d1", "Comisia A", "https://x/a.pdf")]
    );
    expect(result.requestedWithoutAnswer).toEqual([
      { issuer: "Comisia B", requestedOn: "2026-01-05", kind: "committee_opinion" },
      { issuer: "Guvernul", requestedOn: "2026-01-06", kind: "government_view" }
    ]);
  });

  it("attaches what was read from a report's PDF to the report, and to no other entry", () => {
    const reading = { quality: "clean" as const, pages: 13, annexes: [{ kind: "admitted" as const, page: 4 }], authors: [{ name: "Alexandru – Paul DIMITRIU", role: "deputy" as const, group: "USR" }] };
    const result = buildReportsAndOpinions(
      [step("s1", "committee_report_received", "2026-03-10", { committeeName: "Comisia juridică", documentIds: ["d1"] }), step("s2", "committee_opinion_received", "2026-03-11", { committeeName: "Comisia B", documentIds: ["d2"] })],
      [doc("d1", "Comisia juridică", "https://www.cdep.ro/comisii/juridica/pdf/2026/rp336.pdf"), doc("d2", "Comisia B", "https://www.cdep.ro/comisii/b/pdf/2026/av5.pdf")],
      { d1: reading, d2: reading }
    );
    expect(result.reports[0]!.reading).toEqual(reading);
    expect(result.committeeOpinions[0]!.reading).toBeUndefined();
  });

  it("says nothing for a bill whose dossier names no report or opinion", () => {
    const result = buildReportsAndOpinions([step("s1", "registered", "2026-01-01", { documentIds: ["d1"] })], [doc("d1", "forma iniţiatorului", "https://x/FG.PDF")]);
    expect(result.total).toBe(0);
    expect(result.requestedWithoutAnswer).toEqual([]);
  });
});
