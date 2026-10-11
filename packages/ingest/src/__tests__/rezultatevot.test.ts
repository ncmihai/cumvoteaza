import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AreaReading } from "../elections/areas";
import { buildNameIndex } from "../elections/areas-2012";
import { circumscriptionOfCounty, readRezultatevotAreas } from "../elections/rezultatevot";

const area = (key: string, circumscriptionNumber: number, name: string) => ({ key, circumscriptionNumber, name, sections: 1, registered: 0, present: 0, valid: 0, invalid: 0, votes: new Map<string, number>() });
const later: AreaReading = { areas: [area("1151", 1, "ORAŞ ABRUD"), area("1017", 1, "MUNICIPIUL ALBA IULIA"), area("8001", 31, "ORAŞ PĂTÂRLAGELE")], lists: new Map(), aliases: [], withoutCommune: 0 };
const { index } = buildNameIndex([later]);

const answer = (county: string, place: string, valid: number, candidates: Array<[string, number]>, extra: Record<string, unknown> = {}) => JSON.stringify({
  scope: { type: "locality", countyName: county, localityName: place, ...extra },
  results: { eligibleVoters: valid * 2, totalVotes: valid + 5, validVotes: valid, nullVotes: 5, candidates: candidates.map(([name, votes]) => ({ name, votes })) }
});

let root: string;
beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "rezultatevot-"));
  const dir = path.join(root, "data/coverage/raw/rezultatevot");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "b3-c1-l353.json"), answer("Alba", "Abrud", 100, [["KLAUS-WERNER IOHANNIS", 60], ["VASILICA-VIORICA DĂNCILĂ", 40]]));
  await writeFile(path.join(dir, "b3-c1-l246.json"), answer("Alba", "Alba Iulia", 1000, [["KLAUS-WERNER IOHANNIS", 700], ["VASILICA-VIORICA DĂNCILĂ", 300]]));
  await writeFile(path.join(dir, "b3-c1-l999.json"), answer("Alba", "Comuna Noua", 10, [["KLAUS-WERNER IOHANNIS", 10]]));
  await writeFile(path.join(dir, "b3-c1-l998.json"), JSON.stringify({ scope: { type: "locality", countyName: "Alba", localityName: "Gol" }, results: { eligibleVoters: 0, totalVotes: 0, validVotes: 0, nullVotes: 0, candidates: [] } }));
  await writeFile(path.join(dir, "b3-c12913-l12914.json"), answer("Bucuresti", "Sectorul 1", 500, [["KLAUS-WERNER IOHANNIS", 300], ["VASILICA-VIORICA DĂNCILĂ", 200]]));
  await writeFile(path.join(dir, "b3-country77.json"), JSON.stringify({ scope: { type: "diaspora_country", countryName: "Franta" }, results: { eligibleVoters: 0, totalVotes: 50, validVotes: 48, nullVotes: 2, candidates: [{ name: "KLAUS-WERNER IOHANNIS", votes: 48 }] } }));
  await writeFile(path.join(dir, "b3-c1.json"), answer("Alba", "", 1100, [["KLAUS-WERNER IOHANNIS", 770]]));
  await writeFile(path.join(dir, "b2-c1-l353.json"), answer("Alba", "Abrud", 90, [["KLAUS-WERNER IOHANNIS", 90]]));
});
afterAll(async () => { await rm(root, { recursive: true, force: true }); });

describe("circumscriptionOfCounty", () => {
  it("reads the API's county names (no diacritics) as the circumscription numbers", () => {
    expect(circumscriptionOfCounty("Alba")).toBe(1);
    expect(circumscriptionOfCounty("Arges")).toBe(3);
    expect(circumscriptionOfCounty("Caras-Severin")).toBe(11);
    expect(circumscriptionOfCounty("Satu Mare")).toBe(32);
    expect(circumscriptionOfCounty("Bucuresti")).toBe(42);
    expect(circumscriptionOfCounty("Atlantida")).toBeUndefined();
  });
});

describe("readRezultatevotAreas", () => {
  it("makes communes of one ballot's locality answers, finds Bucharest's sectors and the countries abroad, keeps what it cannot place out of the map, and sums each candidate", async () => {
    const reading = await readRezultatevotAreas(root, 3, index);
    const byKey = new Map(reading.areas.map((item) => [item.key, item]));
    expect(byKey.get("1151")).toMatchObject({ circumscriptionNumber: 1, valid: 100, present: 105, invalid: 5, registered: 200 });
    expect(byKey.get("1151")!.votes.get("klaus werner iohannis")).toBe(60);
    expect(byKey.get("1017")).toMatchObject({ valid: 1000 });
    expect(byKey.get("179141")).toMatchObject({ circumscriptionNumber: 42, valid: 500 });
    expect(byKey.get("abroad:franta")).toMatchObject({ circumscriptionNumber: 43, valid: 48 });
    expect(byKey.get("unknown:1")).toMatchObject({ valid: 10 });
    expect(reading.unmatched).toEqual([{ circumscription: 1, name: "Comuna Noua", votes: 10 }]);
    // A place with no votes at all is no area; the county's own answer and the other ballot are not read as places.
    expect(reading.areas).toHaveLength(5);
    expect(reading.totalsByCandidate.get("klaus werner iohannis")).toBe(60 + 700 + 10 + 300 + 48);
    expect(reading.lists.get("vasilica viorica dancila")).toEqual({ name: "VASILICA-VIORICA DĂNCILĂ", independents: false });
    expect(reading.problems).toEqual([]);
  });
});
