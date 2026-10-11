import { describe, expect, it } from "vitest";
import { ELECTION_SOURCES } from "../elections/sources";
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

describe("the election sources", () => {
  it("name every election once, give a presidential round its candidates as the ballot \"president\", and keep the hand-fed ones apart from the open-data ones", () => {
    const ids = ELECTION_SOURCES.map((source) => source.id);
    expect(new Set(ids).size).toBe(ids.length);
    // The rounds known only by national totals (2019) have no files at all.
    for (const source of ELECTION_SOURCES.filter((item) => item.kind === "presidential" && !item.nationalOnly)) {
      expect(source.manual).toBe(true);
      expect(source.files.every((file) => file.chamber === "president" && file.manualPath)).toBe(true);
      expect(source.files.some((file) => file.role === "sections")).toBe(true);
    }
    for (const source of ELECTION_SOURCES.filter((item) => item.kind !== "presidential")) expect(source.files.every((file) => file.chamber !== "president")).toBe(true);
    // Elections before 2019 had no votes by mail.
    expect(ELECTION_SOURCES.find((item) => item.id === "pres-2014-r1")!.files.some((file) => file.role === "mail")).toBe(false);
    expect(ELECTION_SOURCES.find((item) => item.id === "pres-2025-r1")!.files.some((file) => file.role === "mail")).toBe(true);
  });
});

describe("the 2019 presidential rounds, known by their national totals", () => {
  it("add up to the valid votes the Constitutional Court prints, and the second round's two candidates are the first round's first two", async () => {
    const { ELECTION_SOURCES } = await import("../elections/sources");
    const rounds = ELECTION_SOURCES.filter((election) => election.id.startsWith("pres-2019-"));
    expect(rounds.map((election) => election.id).sort()).toEqual(["pres-2019-r1", "pres-2019-r2"]);
    for (const round of rounds) {
      const totals = round.nationalOnly!;
      expect(totals.results.reduce((sum, result) => sum + result.votes, 0)).toBe(totals.valid);
      expect(round.kind).toBe("presidential");
    }
    const first = rounds.find((election) => election.id === "pres-2019-r1")!.nationalOnly!;
    const second = rounds.find((election) => election.id === "pres-2019-r2")!.nationalOnly!;
    expect(first.results).toHaveLength(14);
    expect(first.results.slice(0, 2).map((result) => result.name).sort()).toEqual(second.results.map((result) => result.name).sort());
  });
});
