import { describe, expect, it } from "vitest";
import { classifyBillDocument, documentFormatOf } from "../bill-documents";

const classify = (label: string, url = "https://www.senat.ro/legis/PDF/2025/25b313X.PDF?nocache=true", stepType?: string) => classifyBillDocument({ label, url, stepType });

describe("classifyBillDocument", () => {
  it("names the outside bodies that give opinions, in the page's own words", () => {
    expect(classify("avizul Consiliului Legislativ")).toMatchObject({ role: "legislative_council", body: "Consiliul Legislativ" });
    expect(classify("Avizul Consiliului Economic şi Social")).toMatchObject({ role: "economic_social_council" });
    expect(classify("opinia Consiliului Fiscal")).toMatchObject({ role: "fiscal_council" });
    expect(classify("avizul Consiliului Superior al Magistraturii")).toMatchObject({ role: "judiciary_council" });
    expect(classify("avizul Consiliului Concurenţei")).toMatchObject({ role: "competition_council" });
    expect(classify("Avizul ANCOM")).toEqual({ role: "other_body_opinion", body: "ANCOM", format: "pdf" });
    expect(classify("avizul Băncii Naţionale a României")).toMatchObject({ role: "other_body_opinion", body: "Băncii Naţionale a României" });
  });

  it("tells a committee's report from its opinion by the step the document is printed on, because the label is only the committee's name", () => {
    const committee = "Comisia juridică, de disciplină şi imunităţi";
    expect(classify(committee, undefined, "committee_report_received").role).toBe("committee_report");
    expect(classify(committee, undefined, "committee_opinion_received").role).toBe("committee_opinion");
    expect(classify(`Raport — ${committee}`).role).toBe("committee_report");
    expect(classify(`Aviz — ${committee}`).role).toBe("committee_opinion");
  });

  it("falls back to the Chamber's file names when the label says nothing", () => {
    expect(classify("", "http://www.cdep.ro/comisii/administratie/pdf/2026/rp049.pdf").role).toBe("committee_report");
    expect(classify("Document 8", "https://www.cdep.ro/comisii/juridica/pdf/2026/av035.pdf").role).toBe("committee_opinion");
    expect(classify("", "http://www.cdep.ro/comisii/administratie/doc/2023/av550.docx")).toMatchObject({ role: "committee_opinion", format: "docx" });
  });

  it("keeps the Government's view, decision and ordinance apart from the opinions, and the bill's own forms out of them", () => {
    expect(classify("punctul de vedere al Guvernului").role).toBe("government_view");
    expect(classify("hotărârea de Guvern").role).toBe("government_decision");
    expect(classify("ordonanţa de urgenţă a Guvernului").role).toBe("ordinance");
    expect(classify("forma iniţiatorului").role).toBe("initiator_form");
    expect(classify("expunerea de motive la iniţiativa legislativă").role).toBe("explanatory_memo");
    expect(classify("Adresa Senatului").role).toBe("cover_letter");
    expect(classify("forma adoptată de Senat").role).toBe("adopted_form");
    expect(classify("forma trimisă la promulgare").role).toBe("promulgation_form");
    expect(classify("tabel comparativ").role).toBe("other");
  });

  it("does not take a committee name under a registration step for an opinion", () => {
    expect(classify("Comisia pentru buget", undefined, "registered").role).toBe("other");
  });
});

describe("documentFormatOf", () => {
  it("reads the format from the address, including the Chamber's docs? addresses and the Senate's query string", () => {
    expect(documentFormatOf("https://www.senat.ro/legis/PDF/2023/23L647AD.PDF?nocache=true")).toBe("pdf");
    expect(documentFormatOf("https://www.cdep.ro/ords/pls/proiecte/docs?2026/pl077_plx_77_26.pdf")).toBe("pdf");
    expect(documentFormatOf("http://www.cdep.ro/comisii/x/doc/2024/rp027.doc")).toBe("doc");
    expect(documentFormatOf("http://www.cdep.ro/comisii/x/doc/2023/av550.docx")).toBe("docx");
    expect(documentFormatOf("http://example.ro/page")).toBe("other");
  });
});
