import { describe, expect, it } from "vitest";
import { pageText, parseDeputyCounts, parseHeaderBirth, profileKeyFromUrl } from "../members/profile-facts";

describe("parseHeaderBirth", () => {
  it("reads the date printed after the name in the page header", () => {
    expect(parseHeaderBirth("STRUCTURA PARLAMENTULUI ROMÂNIEI 2024-prezent Pagina noua | Mentiune juridica | English | Français Cauta Mirela Elena Adomnicăi n. 15 aug. 1970 Curriculum Vitae Activitate parlamentară")).toEqual({ date: "1970-08-15", raw: "15 aug. 1970" });
  });

  it("knows every abbreviated month the pages use, including May written in full", () => {
    const month = (abbr: string) => parseHeaderBirth(`Cauta Ion Popescu n. 3 ${abbr} 1960 Activitate`)?.date;
    expect(["ian.", "feb.", "mar.", "apr.", "mai", "iun.", "iul.", "aug.", "sep.", "oct.", "noi.", "dec."].map(month)).toEqual([
      "1960-01-03", "1960-02-03", "1960-03-03", "1960-04-03", "1960-05-03", "1960-06-03", "1960-07-03", "1960-08-03", "1960-09-03", "1960-10-03", "1960-11-03", "1960-12-03"
    ]);
  });

  it("returns nothing when the header has no date (older pages print only the years of a life, or nothing)", () => {
    expect(parseHeaderBirth("Cauta Iosif Dan 1950-2007 Curriculum Vitae Activitate parlamentară")).toBeUndefined();
    expect(parseHeaderBirth("Cauta Mihai Ţălpeanu Activitate parlamentară 1990-1992 (sen.)")).toBeUndefined();
  });

  it("never takes a date from further down the page than the header", () => {
    const filler = "x".repeat(300);
    expect(parseHeaderBirth(`Cauta Ion Popescu ${filler} n. 3 mar. 1960`)).toBeUndefined();
  });

  it("refuses an impossible or implausible date", () => {
    expect(parseHeaderBirth("Cauta Ion Popescu n. 31 feb. 1960 Activitate")).toBeUndefined();
    expect(parseHeaderBirth("Cauta Ion Popescu n. 3 mar. 2024 Activitate")).toBeUndefined();
  });

  it("does not mistake a middle initial for the birth marker", () => {
    expect(parseHeaderBirth("Cauta Ion N. Popescu n. 9 oct. 1955 Activitate")).toEqual({ date: "1955-10-09", raw: "9 oct. 1955" });
  });
});

describe("parseDeputyCounts", () => {
  it("reads every line the page prints", () => {
    const text = "Biroul x. Activitatea parlamentara în cifre: Luari de cuvânt: 38 (în 24 sedinte) din care declaratii politice: 5 Luari de cuvânt în BP: 3 (în 2 sedinte) Propuneri legislative initiate: 54 , din care 15 promulgate legi Întrebari si interpelari: 7 Motiuni: 1 Biroul parlamentar: Suceava, Str Meseriaşilor nr. 2 Adresa postala: Palatul";
    expect(parseDeputyCounts(text)).toEqual([
      { metric: "speeches", value: 38, outOf: 24 },
      { metric: "political_declarations", value: 5 },
      { metric: "initiatives", value: 54, detail: 15 },
      { metric: "questions_and_interpellations", value: 7 },
      { metric: "motions_signed", value: 1 }
    ]);
  });

  it("leaves out a line the page does not print instead of writing a zero", () => {
    expect(parseDeputyCounts("Activitatea parlamentara în cifre: Propuneri legislative initiate: 24 , din care 0 promulgate legi Motiuni: 2 Adresa postala: Palatul")).toEqual([
      { metric: "initiatives", value: 24, detail: 0 },
      { metric: "motions_signed", value: 2 }
    ]);
  });

  it("reads speeches printed without a sitting count", () => {
    expect(parseDeputyCounts("Activitatea parlamentara în cifre: Luari de cuvânt: 16 Propuneri legislative initiate: 1 , din care 0 promulgate legi")?.[0]).toEqual({ metric: "speeches", value: 16 });
  });

  it("returns nothing for a page without the block", () => {
    expect(parseDeputyCounts("Cauta Ion Popescu n. 3 mar. 1960 Curriculum Vitae")).toBeUndefined();
  });

  it("does not read the speeches in the Permanent Bureau as the speeches in plenary", () => {
    expect(parseDeputyCounts("Activitatea parlamentara în cifre: Luari de cuvânt în BP: 9 (în 4 sedinte) Propuneri legislative initiate: 2 , din care 1 promulgate legi")?.map((item) => item.metric)).toEqual(["initiatives"]);
  });
});

describe("profileKeyFromUrl", () => {
  it("names a profile by legislature, chamber and number", () => {
    expect(profileKeyFromUrl("https://cdep.ro/ords/pls/parlam/structura.mp?cam=2&idm=1&leg=2024")).toBe("leg2024:cam2:idm1");
    expect(profileKeyFromUrl("https://www.cdep.ro/ords/pls/parlam/structura.mp?cam=1&idl=1&idm=44&leg=2024")).toBe("leg2024:cam1:idm44");
  });

  it("ignores the other pages of a profile", () => {
    expect(profileKeyFromUrl("https://cdep.ro/ords/pls/parlam/structura.mp?cam=2&idl=1&idm=1&leg=2024&pag=0")).toBeUndefined();
    expect(profileKeyFromUrl("https://cdep.ro/ords/pls/parlam/structura.fp?cam=2&idl=1&idp=40&leg=2024")).toBeUndefined();
  });
});

describe("pageText", () => {
  it("returns the text of the page without scripts, markup or repeated white space", () => {
    expect(pageText("<html><head><style>p{}</style></head><body><script>var a=1;</script><p>Cauta   Ion</p><p>n. 3 mar.&nbsp;1960</p></body></html>")).toBe("Cauta Ion n. 3 mar. 1960");
  });
});
