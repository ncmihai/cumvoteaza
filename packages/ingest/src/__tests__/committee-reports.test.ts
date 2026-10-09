import { describe, expect, it } from "vitest";
import { findAnnexes, findAuthors, garbledShare, normalizeReportUrl, readReport, reportKey } from "../dossiers/committee-reports";

describe("findAnnexes", () => {
  it("finds the annex headings in the layouts the committees use, once per kind, on the first page of the table", () => {
    const pages = [
      "RAPORT ... cu amendamentele admise cuprinse în anexa care face parte integrantă din prezentul raport.",
      "PREȘEDINTE, SECRETAR,\nAnexa\nAMENDAMENTE ADMISE\nNr. crt Text în vigoare Text Propunere legislativă",
      "AMENDAMENTE ADMISE\nNr. crt ... continuarea tabelului",
      "Anexă Amendamente respinse la propunerea legislativă pentru modificarea Legii nr. 1/2020\nNr. crt.",
      "ANEXĂ Amendament Admis Nr. crt. Forma Senatului"
    ];
    expect(findAnnexes(pages)).toEqual([{ kind: "admitted", page: 2 }, { kind: "rejected", page: 4 }]);
  });

  it("does not take a sentence of the report for a heading, even when the line wraps and begins with the words", () => {
    const pages = ["Comisiile propun respingerea propunerii legislative, cu\namendamente respinse, cuprinse in anexa care face parte integrantă din prezentul raport\ncomun de respingere"];
    expect(findAnnexes(pages)).toEqual([]);
  });
});

describe("findAuthors", () => {
  it("reads the authors the annex names, whether written 'Autori: ...' or '(Amendament propus de ...)', once each however the hyphen is spaced", () => {
    const text = "Autori: Alexandru – Paul DIMITRIU, deputat USR, Patricia – Simina-Arina MOȘ, deputat PNL\n... Autori: Alexandru-Paul DIMITRIU, deputat USR\n(Amendament propus de domnul deputat Andrei Daniel GHEORGHE – deputat PSD)";
    expect(findAuthors(text).map((author) => [author.name.replace(/\s+/g, " "), author.role, author.group])).toEqual([
      ["Alexandru – Paul DIMITRIU", "deputy", "USR"],
      ["Patricia – Simina-Arina MOȘ", "deputy", "PNL"],
      ["Andrei Daniel GHEORGHE", "deputy", "PSD"]
    ]);
  });

  it("reads a senator, and ignores a capitalised phrase that is not followed by a role", () => {
    expect(findAuthors("Senator Ion POPESCU, senator PNL; Comisia pentru buget, finanțe și bănci")).toEqual([{ name: "Ion POPESCU", role: "senator", group: "PNL" }]);
  });
});

describe("readReport", () => {
  it("reads authors only from text that is clean, because a name misread by OCR is worse than no name", () => {
    const annexPage = "Anexa\nAMENDAMENTE ADMISE\nAutori: Alexandru – Paul DIMITRIU, deputat USR\n" + "text ".repeat(120);
    const clean = readReport(["Raport ".repeat(80), annexPage]);
    expect(clean.quality).toBe("clean");
    expect(clean.annexes).toEqual([{ kind: "admitted", page: 2 }]);
    expect(clean.authors).toHaveLength(1);
    const garbled = readReport(["Raport ".repeat(80), annexPage + " ~ ^ | ` x1y ".repeat(60)]);
    expect(garbled.quality).toBe("poor");
    expect(garbled.annexes).toEqual([{ kind: "admitted", page: 2 }]);
    expect(garbled.authors).toEqual([]);
  });

  it("calls a file with no text layer 'none'", () => {
    expect(readReport(["", " "]).quality).toBe("none");
  });
});

describe("helpers", () => {
  it("measures OCR noise as the share of words with characters Romanian text does not have", () => {
    expect(garbledShare("Comisia juridică de numiri disciplină")).toBe(0);
    expect(garbledShare("Comisia juridică, de disciplină ~ imunită~i ^ validări")).toBeGreaterThan(20);
  });

  it("fetches the Chamber's reports over https and gives each address one file name", () => {
    expect(normalizeReportUrl("http://www.cdep.ro/comisii/sport/pdf/2026/rp253.pdf")).toBe("https://www.cdep.ro/comisii/sport/pdf/2026/rp253.pdf");
    expect(normalizeReportUrl("https://www.senat.ro/legis/PDF/2026/26L143CR.PDF?nocache=true")).toBe("https://www.senat.ro/legis/PDF/2026/26L143CR.PDF?nocache=true");
    expect(reportKey("https://a/b.pdf")).toMatch(/^[0-9a-f]{16}$/);
    expect(reportKey("https://a/b.pdf")).toBe(reportKey("https://a/b.pdf"));
  });
});
