import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseQuestionPage } from "../members/questions";

const here = path.dirname(fileURLToPath(import.meta.url));
const interpellation = readFileSync(path.join(here, "../fixtures/cdep-interpellation-819B.html"), "utf8");

describe("parseQuestionPage", () => {
  it("reads an answered interpellation: dates, the linked asker, the addressee, both PDFs and who answered", () => {
    expect(parseQuestionPage(interpellation, "81509")).toEqual({
      officialId: "81509",
      kind: "interpellation",
      number: "819B",
      title: "Stadiul analizării propunerilor de instituire a zonelor de protecție strictă în județul Suceava",
      registeredOn: "2025-11-25",
      presentedOn: "2025-11-25",
      communicatedOn: "2025-11-25",
      askMode: "în scris",
      textUrl: "https://www.cdep.ro/interpel/2025/i819B.pdf",
      askers: [{ text: "Mirela Elena Adomnicăi - deputat PSD", profile: { chamber: "deputies", legislature: "2024", officialId: "1" } }],
      addressees: [{ name: "Ministerul Mediului, Apelor şi Pădurilor", attention: "doamnei Diana-Anda Buzoianu - Ministru" }],
      answer: { number: "58339", answeredOn: "2026-01-22", mode: "în scris", from: "Ministerul Mediului, Apelor şi Pădurilor", signedBy: "domnul Cosmin-Răzvan Butuza - Secretar de Stat", url: "https://www.cdep.ro/interpel/2025/r819B.pdf" }
    });
  });

  it("has no answer when the page has no answer table", () => {
    const withoutAnswer = interpellation.replace(/<tr bgcolor="#14247C"><td colspan=2 align="center"><b><font color="#ffffff">Informaţii privind răspunsul<\/font><\/td><\/tr>[\s\S]*?<\/table>\s*<\/td>\s*<\/tr>\s*<\/table>/, "</table>");
    const parsed = parseQuestionPage(withoutAnswer, "81509");
    expect(parsed?.answer).toBeUndefined();
    expect(parsed?.number).toBe("819B");
  });

  it("reads several askers and several addressees", () => {
    const html = `<div class="pageHeaderLinks">Întrebarea nr. 3676A/08.01.2026</div><span class="headline">Planurile de stocare</span>
<table><tr bgcolor="#14247C"><td colspan=2><b>Informaţii privind întrebarea</b></td></tr>
<tr><td>Nr.înregistrare: </td><td><b>3676A</b></td></tr>
<tr><td>Data înregistrarii: </td><td><b>08.01.2026</b></td></tr>
<tr><td>Adresant: </td><td><b><a href="structura.mp?idm=7&cam=2&leg=2024&idl=1">Ion Popescu</a></b> - deputat <a href="/ords/pls/parlam/structura.gp?idg=2&leg=2024">PNL</a><br><b><a href="structura.mp?idm=44&cam=1&leg=2024&idl=1">Maria Ionescu</a></b> - senator <a href="/x/structura.gp?idg=3&leg=2024">USR</a></td></tr>
<tr><td>Destinatar: </td><td><b>Ministerul Energiei</b><br>în atenţia: domnului <b>Bogdan Ivan</b> - Ministru<br><b>Primul-ministru</b></td></tr></table>`;
    const parsed = parseQuestionPage(html, "1");
    expect(parsed?.kind).toBe("question");
    expect(parsed?.askers).toEqual([
      { text: "Ion Popescu - deputat PNL", profile: { chamber: "deputies", legislature: "2024", officialId: "7" } },
      { text: "Maria Ionescu - senator USR", profile: { chamber: "senate", legislature: "2024", officialId: "44" } }
    ]);
    expect(parsed?.addressees).toEqual([{ name: "Ministerul Energiei", attention: "domnului Bogdan Ivan - Ministru" }, { name: "Primul-ministru" }]);
  });

  it("returns nothing for a page that is not a question or interpellation", () => {
    expect(parseQuestionPage("<html><body><p>Eroare</p></body></html>", "1")).toBeUndefined();
  });
});
