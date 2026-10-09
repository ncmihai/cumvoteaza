import { describe, expect, it } from "vitest";
import { decodeElectionBytes, parseDelimited, readMandatesLong, readMandatesWide, sumListVotes } from "../elections/parse";

describe("decodeElectionBytes", () => {
  it("reads UTF-8 with a BOM, UTF-16 and Windows-1250", () => {
    expect(decodeElectionBytes(Buffer.from("﻿Alba;ȘI", "utf8"))).toBe("Alba;ȘI");
    expect(decodeElectionBytes(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("Alba;Ț", "utf16le")]))).toBe("Alba;Ț");
    expect(decodeElectionBytes(Buffer.from([0x53, 0x41, 0x4c, 0x56, 0x41, 0xde, 0x49]))).toBe("SALVAŢI");
  });
});

describe("parseDelimited", () => {
  it("picks the delimiter, keeps quoted fields whole and skips blank lines", () => {
    expect(parseDelimited('a;b;c\r\n1;"x;y";3\r\n\r\n4;5;6\r\n')).toEqual([["a", "b", "c"], ["1", "x;y", "3"], ["4", "5", "6"]]);
    expect(parseDelimited("a,b\n1,2")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("sumListVotes", () => {
  const rows = [
    ["Numar circumscriptie", "Denumire circumscriptie", "Număr secție", "a", "b", "g", "PARTIDUL A", "ALIANȚA B", "X-CANDIDAT INDEPENDENT"],
    ["1", "ALBA", "1", "100", "90", "0", "50", "30", ""],
    ["1", "ALBA", "2", "100", "90", "0", "20", "40", "3"],
    ["2", "ARAD", "1", "100", "90", "0", "5", "", "1"]
  ];

  it("sums each list over the polling stations of a circumscription, with an empty cell as no vote", () => {
    expect(sumListVotes(rows)).toEqual([
      { circumscriptionNumber: 1, circumscription: "ALBA", list: "PARTIDUL A", votes: 70 },
      { circumscriptionNumber: 1, circumscription: "ALBA", list: "ALIANȚA B", votes: 70 },
      { circumscriptionNumber: 1, circumscription: "ALBA", list: "X-CANDIDAT INDEPENDENT", votes: 3 },
      { circumscriptionNumber: 2, circumscription: "ARAD", list: "PARTIDUL A", votes: 5 },
      { circumscriptionNumber: 2, circumscription: "ARAD", list: "ALIANȚA B", votes: 0 },
      { circumscriptionNumber: 2, circumscription: "ARAD", list: "X-CANDIDAT INDEPENDENT", votes: 1 }
    ]);
  });

  it("refuses a file without the circumscription or statistics columns", () => {
    expect(() => sumListVotes([["x", "y"]])).toThrow();
  });
});

describe("mandates", () => {
  it("reads the long form of 2020", () => {
    expect(readMandatesLong([["Numar circumscriptie", "Denumire", "Lista", "Număr mandate"], ["1", "ALBA", "PARTIDUL NAȚIONAL LIBERAL", "2"], ["1", "ALBA", "ALIANȚA USR PLUS", "1"]])).toEqual([
      { circumscriptionNumber: 1, circumscription: "ALBA", list: "PARTIDUL NAȚIONAL LIBERAL", mandates: 2 },
      { circumscriptionNumber: 1, circumscription: "ALBA", list: "ALIANȚA USR PLUS", mandates: 1 }
    ]);
  });

  it("reads the wide form of 2016, leaving out lists with no mandate", () => {
    expect(readMandatesWide([["Nr.", "Denumire", "PARTIDUL A", "PARTIDUL B"], [1, "ALBA", 4, 0], [2, "ARAD", 2, 3]])).toEqual([
      { circumscriptionNumber: 1, circumscription: "ALBA", list: "PARTIDUL A", mandates: 4 },
      { circumscriptionNumber: 2, circumscription: "ARAD", list: "PARTIDUL A", mandates: 2 },
      { circumscriptionNumber: 2, circumscription: "ARAD", list: "PARTIDUL B", mandates: 3 }
    ]);
  });
});
