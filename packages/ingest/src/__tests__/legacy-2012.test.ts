import { describe, expect, it } from "vitest";
import { readLegacy2012 } from "../elections/legacy-2012";

const CIRC_HEADER = Array.from({ length: 21 }, (_, i) => `c${i}`).join(";");
const circ = (number: number, name: string, type: "cd" | "s", competitor: string, votes: number) => {
  const cells = Array.from({ length: 21 }, () => "0");
  cells[0] = String(number); cells[1] = name; cells[2] = type; cells[18] = competitor; cells[19] = String(votes);
  return cells.join(";");
};
const CAND_HEADER = "NUME;NumeCompetitor;Nr circumscriptie;Nume circ;Colegiu senat;Colegiu Deputati;Total;Prezenti;Voturi;Mandat;Procent";
const cand = (competitor: string, number: number, name: string, senate: string, deputies: string, mandate: number) => `X;${competitor};${number};${name};${senate};${deputies};0;0;0;${mandate};0`;

describe("readLegacy2012", () => {
  it("sums a competitor's votes per circumscription and chamber and counts the mandates its candidates won, by the college each stood in", () => {
    const circumscriptions = [CIRC_HEADER, circ(1, "ALBA", "cd", "UNIUNEA SOCIAL LIBERALĂ", 70000), circ(1, "ALBA", "s", "UNIUNEA SOCIAL LIBERALĂ", 72000), circ(1, "ALBA", "cd", "PARTIDUL ROMÂNIA MARE", 3000), circ(1, "ALBA", "cd", "UNIUNEA SOCIAL LIBERALĂ", 500)].join("\n");
    const candidates = [CAND_HEADER, cand("UNIUNEA SOCIAL LIBERALĂ", 1, "ALBA", "", "1", 1), cand("UNIUNEA SOCIAL LIBERALĂ", 1, "ALBA", "", "2", 1), cand("UNIUNEA SOCIAL LIBERALĂ", 1, "ALBA", "1", "", 1), cand("PARTIDUL ROMÂNIA MARE", 1, "ALBA", "", "3", 0)].join("\n");
    const rows = readLegacy2012(circumscriptions, candidates);
    const find = (chamber: string, list: string) => rows.find((row) => row.chamber === chamber && row.listName === list)!;
    expect(find("deputies", "UNIUNEA SOCIAL LIBERALĂ")).toMatchObject({ votes: 70500, mandates: 2, circumscriptionNumber: 1, circumscription: "ALBA" });
    expect(find("senate", "UNIUNEA SOCIAL LIBERALĂ")).toMatchObject({ votes: 72000, mandates: 1 });
    expect(find("deputies", "PARTIDUL ROMÂNIA MARE")).toMatchObject({ votes: 3000, mandates: 0 });
  });

  it("keeps a competitor that won a mandate even when the votes file has no row for it", () => {
    const rows = readLegacy2012(`${CIRC_HEADER}\n${circ(1, "ALBA", "cd", "A", 10)}`, `${CAND_HEADER}\n${cand("B", 2, "ARAD", "", "1", 1)}`);
    expect(rows.find((row) => row.listName === "B")).toMatchObject({ votes: 0, mandates: 1, circumscriptionNumber: 2 });
  });
});
