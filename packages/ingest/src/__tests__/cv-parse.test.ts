import { describe, expect, it } from "vitest";
import { foldRo, parseCv, parseEntryDates } from "../members/cv-parse";

// Synthetic pages, one per layout the Chamber's CV pages use. No real person.
const PARAGRAPHS = `<html><body>
<p><div id="bandaCV"><h3 class="maj"><B> INFORMAŢII PERSONALE </B></h3></div></p>
<table class="tbcveur2025"><tr><td class="colleft">E-mail</td><td class="colright"><a href="mailto:ana@example.org">ana@example.org</a></td></tr>
<tr><td class="colleft">Telefon</td><td class="colright">0722 123 456</td></tr><tr><td class="colleft">Stare civilă</td><td class="colright">Căsătorită</td></tr>
<tr><td class="colleft">Copii</td><td class="colright">2</td></tr></table>
<p><div id="bandaCV"><h3 class="maj"><B> EXPERIENŢA PROFESIONALĂ </B></h3></div></p>
<p>Decembrie 2024 - prezent - Deputat - Parlamentul Românei</p><br>
<p>Februarie 2019 - Decembrie 2024 - Vicepreşedinte Consiliul Judeţean Exemplu</p><br>
<p>2012 - 2016 - Profesor - Liceul Teoretic Exemplu</p>
<p><div id="bandaCV"><h3 class="maj"><B> EDUCAŢIE ŞI FORMARE </B></h3></div></p>
<p>2005 - 2009 - Licenţă - Universitatea Exemplu</p>
<p><div id="bandaCV"><h3 class="maj"><B> COMPETENŢE PERSONALE </B></h3></div></p>
<p>Capacitate de lucru în echipă</p>
<p>Data actualizare: 22.02.2025</p>
</body></html>`;

const EUROPASS = `<html><body><p><div id="bandaCV"><h3 class="maj"><B> EXPERIENŢA PROFESIONALĂ </B></h3></div></p>
<table class="tbcveur2025">
<tr><td class="colleft"><h4>Perioada</h4></td><td class="colright"><h3><b>2024 - prezent</b></h3></td></tr>
<tr><td class="colleft"><h4>Funcţia sau postul ocupat</h4></td><td class="colright"><h3>Deputat</h3></td></tr>
<tr><td class="colleft"><h4>Numele şi adresa angajatorului</h4></td><td class="colright"><h3><b>Parlamentul României - Camera Deputaţilor</b></h3></td></tr>
<tr><td class="colleft"><h4>Perioada</h4></td><td class="colright"><h3><b>2014 - 2024</b></h3></td></tr>
<tr><td class="colleft"><h4>Funcţia sau postul ocupat</h4></td><td class="colright"><h3>Manager</h3></td></tr>
<tr><td class="colleft"><h4>Numele şi adresa angajatorului</h4></td><td class="colright"><h3><b>S.C. Exemplu SRL</b></h3></td></tr>
<tr><td class="colleft"><h4>Tipul activităţii sau sectorul de activitate</h4></td><td class="colright"><h3>Comerţ</h3></td></tr>
</table></body></html>`;

const DATES_IN_LABEL = `<html><body><p><div id="bandaCV"><h3 class="maj"><B> EXPERIENŢA PROFESIONALĂ </B></h3></div></p>
<table class="tbcveur2025">
<tr><td class="colleft"><h4>Iunie 2025 - prezent</h4></td><td class="colright"><h3><b>Preşedinte al Camerei Exemplu</b></h3></td></tr>
<tr><td class="colleft"><h4>Decembrie 2020 - Decembrie 2024</h4></td><td class="colright"><h3><p><b>Deputat</b></p> <p><i>Partidul Exemplu, circumscripţia 37</i></p> <p>Membru al Comisiei pentru afaceri europene</p></h3></td></tr>
<tr><td class="colleft"><h4>Noiembrie 2017</h4></td><td class="colright"><h3><b>Consilier</b></h3></td></tr>
</table></body></html>`;

const LIST = `<html><body><p><div id="bandaCV2025">Experienţă profesională</div></p>
<ul style="list-style-type:disc;"><li>2020 - prezent<br> Deputat, Camera Deputaţilor, Parlamentul României</li><br>
<li>2013 - 2020<br> Antreprenor, Firma Exemplu S.A.</li><br>
<li>1997 - 2006<br> Asistent medical, Spitalul Exemplu</li></ul>
<div id="bandaCV2025">Competenţe lingvistice</div><p>Engleză B2</p></body></html>`;

const GROUPS = `<html><body><p><div id="bandaCV"><h3 class="maj"><B>EXPERIENŢA PROFESIONALĂ</B></h3></div></p>
<p>DEPUTAT</p><p><b><i>Parlamentul României,</b></i> 12/2024 - prezent</p>
<ul><li>Elaborarea şi susţinerea unor propuneri legislative;</li><li>Monitorizarea activităţii guvernamentale.</li></ul><br><br>
<p>PRIMAR</p><p><b><i>Comuna Exemplu,</b></i> 10/2020 - 12/2024</p><ul><li>Dezvoltarea comunităţii locale.</li></ul>
<p><div id="bandaCV"><h3 class="maj"><B>ACTIVITĂŢI SOCIALE ŞI POLITICE</B></h3></div></p><p>Membru PNL din 2008</p></body></html>`;

const TABLE_HEADING = `<html><body><table><tr><td class="colleft"><h3 class="maj"><B>Experienţa profesională</B></h3></td><td class="colright">2020 - prezent Consilier local Exemplu</td></tr>
<tr><td class="colleft"><h3 class="maj"><B>Educaţia</B></h3></td><td class="colright">2001 - 2005 Facultatea de Drept</td></tr></table></body></html>`;

const texts = (html: string, section?: string) => parseCv(html).entries.filter((entry) => !section || entry.section === section);

describe("parseCv", () => {
  it("reads the three sections of a paragraph CV and leaves out the personal block and everything after the sections", () => {
    const cv = parseCv(PARAGRAPHS);
    expect(cv.entries.map((entry) => [entry.section, entry.rawText])).toEqual([
      ["experience", "Decembrie 2024 - prezent - Deputat - Parlamentul Românei"],
      ["experience", "Februarie 2019 - Decembrie 2024 - Vicepreşedinte Consiliul Judeţean Exemplu"],
      ["experience", "2012 - 2016 - Profesor - Liceul Teoretic Exemplu"],
      ["education", "2005 - 2009 - Licenţă - Universitatea Exemplu"]
    ]);
    const everything = JSON.stringify(cv);
    for (const private_ of ["ana@example.org", "0722 123 456", "Căsătorită", "Capacitate de lucru"]) expect(everything).not.toContain(private_);
    expect(cv.updatedOn).toBe("2025-02-22");
    expect(cv.headings.map((heading) => heading.read)).toEqual([undefined, "experience", "education", undefined]);
  });

  it("parses the dates of an entry with their precision, and 'prezent' as a current role", () => {
    const [first, second, third, edu] = parseCv(PARAGRAPHS).entries;
    expect(first).toMatchObject({ datesText: "Decembrie 2024 - prezent", starts: { date: "2024-12-01", precision: "month" }, isCurrent: true });
    expect(first!.ends).toBeUndefined();
    expect(second).toMatchObject({ starts: { date: "2019-02-01", precision: "month" }, ends: { date: "2024-12-01", precision: "month" }, isCurrent: false });
    expect(third).toMatchObject({ starts: { date: "2012-01-01", precision: "year" }, ends: { date: "2016-01-01", precision: "year" } });
    expect(edu).toMatchObject({ section: "education", starts: { precision: "year" } });
  });

  it("cuts a Europass table at each 'Perioada' row and keeps the values of the rows that follow", () => {
    const entries = texts(EUROPASS);
    expect(entries.map((entry) => entry.lines)).toEqual([
      ["2024 - prezent", "Deputat", "Parlamentul României - Camera Deputaţilor"],
      ["2014 - 2024", "Manager", "S.C. Exemplu SRL", "Comerţ"]
    ]);
    expect(entries[0]).toMatchObject({ isCurrent: true, starts: { date: "2024-01-01" } });
  });

  it("reads a table that keeps the dates in the left column, one entry per row", () => {
    const entries = texts(DATES_IN_LABEL);
    expect(entries).toHaveLength(3);
    expect(entries[0]!.lines).toEqual(["Iunie 2025 - prezent", "Preşedinte al Camerei Exemplu"]);
    expect(entries[1]!.lines).toEqual(["Decembrie 2020 - Decembrie 2024", "Deputat", "Partidul Exemplu, circumscripţia 37", "Membru al Comisiei pentru afaceri europene"]);
    expect(entries[2]).toMatchObject({ starts: { date: "2017-11-01", precision: "month" } });
  });

  it("reads a list whose items are a date, a line break and the role, and stops at the next heading", () => {
    const entries = texts(LIST);
    expect(entries.map((entry) => entry.rawText)).toEqual([
      "2020 - prezent\nDeputat, Camera Deputaţilor, Parlamentul României",
      "2013 - 2020\nAntreprenor, Firma Exemplu S.A.",
      "1997 - 2006\nAsistent medical, Spitalul Exemplu"
    ]);
  });

  it("groups a role line, a line with the date and the bullets under it, and reads the political activity section", () => {
    const cv = parseCv(GROUPS);
    const experience = cv.entries.filter((entry) => entry.section === "experience");
    expect(experience).toHaveLength(2);
    expect(experience[0]!.lines).toEqual(["DEPUTAT", "Parlamentul României, 12/2024 - prezent", "Elaborarea şi susţinerea unor propuneri legislative;", "Monitorizarea activităţii guvernamentale."]);
    expect(experience[0]).toMatchObject({ datesText: "12/2024 - prezent", isCurrent: true, starts: { date: "2024-12-01" } });
    expect(experience[1]).toMatchObject({ starts: { date: "2020-10-01" }, ends: { date: "2024-12-01" } });
    expect(cv.entries.filter((entry) => entry.section === "political").map((entry) => entry.rawText)).toEqual(["Membru PNL din 2008"]);
  });

  it("reads a heading that sits in the left cell of a table row, with the content in the right cell", () => {
    const entries = texts(TABLE_HEADING);
    expect(entries.map((entry) => [entry.section, entry.rawText])).toEqual([["experience", "2020 - prezent Consilier local Exemplu"], ["education", "2001 - 2005 Facultatea de Drept"]]);
  });

  it("gives every entry a stable hash and a position within its section", () => {
    const again = parseCv(PARAGRAPHS).entries;
    expect(again.map((entry) => entry.position)).toEqual([0, 1, 2, 0]);
    expect(again.map((entry) => entry.contentHash)).toEqual(parseCv(PARAGRAPHS).entries.map((entry) => entry.contentHash));
    expect(new Set(again.map((entry) => entry.contentHash)).size).toBe(4);
  });

  it("finds nothing in a profile page that has no CV", () => {
    expect(parseCv("<html><body><p>STRUCTURA PARLAMENTULUI ROMÂNIEI 2024-prezent</p></body></html>").entries).toEqual([]);
  });
});

describe("parseEntryDates", () => {
  it("reads the formats the pages use", () => {
    expect(parseEntryDates(["10/2020 - 12/2024 Primar"])).toMatchObject({ starts: { date: "2020-10-01", precision: "month" }, ends: { date: "2024-12-01" } });
    expect(parseEntryDates(["30.06.2007 - prezent"])).toMatchObject({ starts: { date: "2007-06-30", precision: "day" }, isCurrent: true });
    expect(parseEntryDates(["dec. 2024 - prezent Deputat"])).toMatchObject({ starts: { date: "2024-12-01" }, isCurrent: true });
    expect(parseEntryDates(["DEPUTAT - CIRCUMSCRIPŢIA 42 - 21/12/2024 - ÎN CURS"])).toMatchObject({ starts: { date: "2024-12-21", precision: "day" }, isCurrent: true });
    expect(parseEntryDates(["Septembrie 2018 - Iunie 2022 Vicepreşedinte"])).toMatchObject({ starts: { date: "2018-09-01" }, ends: { date: "2022-06-01" } });
  });

  it("keeps the text of a range it cannot trust, and gives no dates", () => {
    expect(parseEntryDates(["2024 - 2012 Consilier"])).toEqual({ datesText: "2024 - 2012", isCurrent: false });
    expect(parseEntryDates(["31/02/2020 - 2021 Consilier"])).toMatchObject({ isCurrent: false });
    expect(parseEntryDates(["31/02/2020 - 2021 Consilier"])!.starts).toBeUndefined();
  });

  it("takes a lone leading year as a start, and finds nothing where there is no date", () => {
    expect(parseEntryDates(["2020 Consilier judeţean"])).toMatchObject({ datesText: "2020", starts: { date: "2020-01-01", precision: "year" } });
    expect(parseEntryDates(["Consilier judeţean"])).toBeUndefined();
  });

  it("looks only at the first two lines, so a date inside a description is not the entry's date", () => {
    expect(parseEntryDates(["Director", "Firma Exemplu", "Între timp, 2001 - 2003, proiect X"])).toBeUndefined();
  });
});

describe("details found on the real pages", () => {
  it("reads a date written with the day and the month's name, in a range and alone", () => {
    expect(parseEntryDates(["Noiembrie 2021 - 13 iunie 2023", "Preşedinte al Camerei"])).toMatchObject({ starts: { date: "2021-11-01", precision: "month" }, ends: { date: "2023-06-13", precision: "day" } });
    expect(parseEntryDates(["15 iunie 2023 - 6 mai 2025 Membru al Grupului"])).toMatchObject({ starts: { date: "2023-06-15", precision: "day" }, ends: { date: "2025-05-06", precision: "day" } });
    expect(parseEntryDates(["31 februarie 2023 - 2024 Membru"])!.starts).toBeUndefined();
  });
  it("stops at the postal address and the time stamp the page prints after the CV", () => {
    const html = `<html><body><p><div id="bandaCV"><h3 class="maj"><B>ACTIVITATE POLITICĂ</B></h3></div></p><p>2015 - 2022 Preşedinte al Organizaţiei Exemplu</p>
      <p>Adresa postala: Palatul Exemplu, str. Exemplu nr. 1</p><p>vineri, 9 octombrie 2026, 22:23</p></body></html>`;
    const cv = parseCv(html);
    expect(cv.entries.map((entry) => entry.rawText)).toEqual(["2015 - 2022 Preşedinte al Organizaţiei Exemplu"]);
  });
  it("never keeps a line of personal data, even one a page prints inside a career section", () => {
    const html = `<html><body><p><div id="bandaCV"><h3 class="maj"><B>EXPERIENŢA PROFESIONALĂ</B></h3></div></p><p>Sexul Feminin | Data naşterii 14 februarie 1968| Naţionalitatea Română</p>
      <p>2007 - prezent Preşedinte Asociaţia Exemplu</p><p>Stare civilă: căsătorită</p><p>Domiciliul: Strada Exemplu 1</p></body></html>`;
    const cv = parseCv(html);
    expect(cv.entries.map((entry) => entry.rawText)).toEqual(["2007 - prezent Preşedinte Asociaţia Exemplu"]);
  });
  it("drops the Europass label 'Competenţe profesionale dobândite' from an education entry", () => {
    const html = `<html><body><p><div id="bandaCV"><h3 class="maj"><B>EDUCAŢIE ŞI FORMARE</B></h3></div></p><table><tr><td class="colleft">Perioada</td><td class="colright">2010 - 2012</td></tr>
      <tr><td class="colleft">Calificarea / diploma obţinută</td><td class="colright">Masterat</td></tr><tr><td class="colleft">Competenţe profesionale dobândite</td><td class="colright">Management public</td></tr></table></body></html>`;
    expect(parseCv(html).entries[0]!.lines).toEqual(["2010 - 2012", "Masterat", "Management public"]);
  });
});

describe("foldRo", () => {
  it("drops the Romanian diacritics, in both the comma and the cedilla spelling, one character for one", () => {
    expect(foldRo("EXPERIENŢA PROFESIONALĂ Țară Școală")).toBe("experienta profesionala tara scoala");
  });
});
