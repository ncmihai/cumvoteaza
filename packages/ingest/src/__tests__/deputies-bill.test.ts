import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { cleanExtractedText, chunkText } from "../bill-text";
import { parseDeputiesBill } from "../parsers/deputies-bill";

describe("parseDeputiesBill", () => {
  it("extracts a structured CDEP dossier timeline and document kinds", () => {
    const html = readFileSync(path.join(__dirname, "../fixtures/deputies-bill-plx-158.html"), "utf8");
    const parsed = parseDeputiesBill(html, "https://www.cdep.ro/ords/pls/proiecte/upl_pck2015.proiect?idp=22820");

    expect(parsed.bill.identifiers.deputies).toBe("PL-x 158/2026");
    expect(parsed.bill.decisionChamber).toBe("deputies");
    expect(parsed.sponsors[0]).toEqual(expect.objectContaining({ sponsorType: "government", name: "Guvernul României" }));
    expect(parsed.procedureSteps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ occurredOn: "2026-03-04", stepType: "adopted_by_senate" }),
        expect.objectContaining({ occurredOn: "2026-03-09", stepType: "sent_to_committee" }),
        expect.objectContaining({ occurredOn: "2026-05-12", stepType: "committee_report_received" }),
        expect.objectContaining({ occurredOn: "2026-05-20", stepType: "final_vote" })
      ])
    );
    expect(parsed.documents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ documentKind: "proposal", officialUrlHash: expect.any(String) }),
        expect.objectContaining({ documentKind: "senate_adopted_form" }),
        expect.objectContaining({ documentKind: "committee_report" }),
        expect.objectContaining({ documentKind: "adopted_form" }),
        expect.objectContaining({ documentKind: "promulgation_form" })
      ])
    );
    expect(parsed.events.length).toBe(parsed.procedureSteps.length);
  });

  it("reads the law type from the Caracter row, not from other text mentioning it", () => {
    const html = `<html><body><h4>PL-x 158/2026</h4><table>
      <tr valign=top><td bgcolor="fff0d8">Prelucrarea datelor cu caracter personal</td><td>link</td></tr>
      <tr valign=top><td bgcolor="fff0d8">Caracter:</td><td>
organic
</td></tr></table></body></html>`;
    expect(parseDeputiesBill(html, "https://www.cdep.ro/ords/pls/proiecte/upl_pck2015.proiect?idp=1").bill.lawType).toBe("organic");
  });

  it("classifies CDEP document kinds from official filename conventions when labels are generic", () => {
    const html = `
      <html>
        <body>
          <h3>Proiect de Lege pentru testare</h3>
          <table>
            <tr><td>01.02.2026</td><td><a href="/proiecte/2026/300/30/5/pl335.pdf">PDF</a></td></tr>
            <tr><td>02.02.2026</td><td><a href="/comisii/invatamant/pdf/2026/rp335.pdf">PDF</a></td></tr>
            <tr><td>03.02.2026</td><td><a href="/comisii/munca/pdf/2026/av335.pdf">PDF</a></td></tr>
            <tr><td>04.02.2026</td><td><a href="/ords/pls/proiecte/docs?2026/pl335_plx_335_26_stema.pdf">PDF</a></td></tr>
            <tr><td>05.02.2026</td><td><a href="/ords/pls/proiecte/docs?2026/pl335_cd335_26.pdf">PDF</a></td></tr>
          </table>
        </body>
      </html>
    `;
    const parsed = parseDeputiesBill(html, "https://www.cdep.ro/ords/pls/proiecte/upl_pck2015.proiect?idp=23100");

    expect(parsed.documents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ documentKind: "proposal" }),
        expect.objectContaining({ documentKind: "committee_report" }),
        expect.objectContaining({ documentKind: "committee_opinion" }),
        expect.objectContaining({ documentKind: "promulgation_form" }),
        expect.objectContaining({ documentKind: "adopted_form" })
      ])
    );
  });
});

describe("bill text helpers", () => {
  it("cleans and chunks extracted text deterministically", () => {
    const text = cleanExtractedText(" Art. 1  \n\n\n  Se completează legea.  ");
    expect(text).toBe("Art. 1\n\nSe completează legea.");
    expect(chunkText("abcdef", 2)).toEqual(["ab", "cd", "ef"]);
  });
});
