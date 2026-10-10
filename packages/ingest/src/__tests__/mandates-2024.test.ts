import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseDelimited, readMandatesLong } from "../elections/parse";
import { ELECTION_SOURCES } from "../elections/sources";

/**
 * The mandates of the 2024 elections by list and circumscription were counted from the "list of elected deputies" and the "list of elected senators" in the Central Electoral Bureau's final
 * minutes (Official Gazette 1237 of 10 December 2024). The expected figures below are the minutes' own totals (the number of mandates of each circumscription, first and second distribution
 * added, and each list's mandates for the country), so a slip in the transcription shows here.
 */
const read = (file: string) => readMandatesLong(parseDelimited(readFileSync(path.join(__dirname, "../elections/curated", file), "utf8")));

const SEATS_DEPUTIES = [5, 7, 9, 10, 9, 5, 6, 9, 5, 7, 5, 4, 10, 11, 4, 7, 10, 9, 4, 5, 5, 6, 4, 12, 5, 7, 4, 8, 8, 6, 11, 5, 4, 6, 10, 5, 10, 4, 7, 6, 5, 29, 4];
const SEATS_SENATE = [2, 3, 4, 4, 4, 2, 3, 4, 2, 3, 2, 2, 4, 5, 2, 3, 4, 4, 1, 2, 2, 3, 1, 5, 2, 3, 2, 4, 3, 3, 5, 2, 2, 3, 4, 2, 4, 2, 3, 2, 2, 13, 2];

const total = (rows: Array<{ mandates: number }>) => rows.reduce((sum, row) => sum + row.mandates, 0);
const byList = (rows: Array<{ list: string; mandates: number }>) => Object.fromEntries([...new Set(rows.map((row) => row.list))].map((list) => [list, total(rows.filter((row) => row.list === list))]));
const byCircumscription = (rows: Array<{ circumscriptionNumber: number; mandates: number }>, count: number) => Array.from({ length: count }, (_, i) => total(rows.filter((row) => row.circumscriptionNumber === i + 1)));

describe("the 2024 mandates", () => {
  const deputies = read("parl-2024-deputies-mandates.csv");
  const senate = read("parl-2024-senate-mandates.csv");
  const deputiesOnLists = deputies.filter((row) => row.circumscriptionNumber <= 43);
  const minorities = deputies.filter((row) => row.circumscriptionNumber === 99);

  it("gives the Chamber of Deputies 312 mandates on lists and 19 to the national minorities", () => {
    expect(total(deputiesOnLists)).toBe(312);
    expect(total(minorities)).toBe(19);
    expect(new Set(minorities.map((row) => row.list)).size).toBe(19);
    expect(minorities.every((row) => row.mandates === 1)).toBe(true);
  });

  it("gives each list the mandates the minutes total for the country", () => {
    expect(byList(deputiesOnLists)).toEqual({
      "PARTIDUL SOCIAL DEMOCRAT": 86,
      "ALIANȚA PENTRU UNIREA ROMÂNILOR": 63,
      "PARTIDUL NAȚIONAL LIBERAL": 49,
      "UNIUNEA SALVAȚI ROMÂNIA": 40,
      "PARTIDUL S.O.S. ROMÂNIA": 28,
      "PARTIDUL OAMENILOR TINERI": 24,
      "UNIUNEA DEMOCRATĂ MAGHIARĂ DIN ROMÂNIA": 22
    });
    expect(byList(senate)).toEqual({
      "PARTIDUL SOCIAL DEMOCRAT": 36,
      "ALIANȚA PENTRU UNIREA ROMÂNILOR": 28,
      "PARTIDUL NAȚIONAL LIBERAL": 22,
      "UNIUNEA SALVAȚI ROMÂNIA": 19,
      "PARTIDUL S.O.S. ROMÂNIA": 12,
      "UNIUNEA DEMOCRATĂ MAGHIARĂ DIN ROMÂNIA": 10,
      "PARTIDUL OAMENILOR TINERI": 7
    });
  });

  it("fills every circumscription with exactly the mandates it has", () => {
    expect(byCircumscription(deputiesOnLists, 43)).toEqual(SEATS_DEPUTIES);
    expect(byCircumscription(senate, 43)).toEqual(SEATS_SENATE);
    expect(total(senate)).toBe(134);
  });

  it("is read by the importer from the repository, so the election shows its mandates", () => {
    const source = ELECTION_SOURCES.find((election) => election.id === "parl-2024")!;
    const mandateFiles = source.files.filter((file) => file.role === "mandates");
    expect(mandateFiles).toHaveLength(2);
    expect(mandateFiles.every((file) => file.repoPath?.startsWith("packages/ingest/src/elections/curated/"))).toBe(true);
    expect(source.note?.ro).toContain("Monitorul Oficial");
  });
});
