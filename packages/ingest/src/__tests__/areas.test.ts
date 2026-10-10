import { describe, expect, it } from "vitest";
import { readAreas } from "../elections/areas";

const PV_HEADER = "precinct_county_nce,precinct_county_name,precinct_name,precinct_nr,uat_name,uat_siruta,report_version,report_stage_code,report_type_scope_code,report_type_category_code,report_type_code,created_at,a,a1,a2,a3,b,b1,b2,b3,c,d,e,f,g,\"PARTIDUL A-voturi\",\"ALIANȚA B-voturi\",\"CANDIDAT INDEPENDENT X-voturi\"";
const pv = (nce: number, county: string, uat: string, siruta: string, precinct: number, version: number, a1: number, b: number, lists: [number, number, number], f = 1) =>
  `${nce},${county},"SECȚIA ${precinct}",${precinct},${uat},${siruta},${version},PART,PRCNCT,CD,CD_SV,"2024-12-02 10:00:00",${a1},${a1},0,0,${b},${b},0,0,0,0,${lists[0] + lists[1] + lists[2]},${f},0,${lists[0]},${lists[1]},${lists[2]}`;

describe("readAreas", () => {
  it("adds the stations up per commune, keeps the highest version of a station, merges the Bucharest sectors' codes and names the countries abroad", () => {
    const text = [
      PV_HEADER,
      pv(1, "ALBA", "MUNICIPIUL ALBA IULIA", "1026", 1, 1, 500, 300, [100, 150, 40]),
      pv(1, "ALBA", "MUNICIPIUL ALBA IULIA", "1026", 1, 2, 500, 310, [110, 150, 40]),
      pv(1, "ALBA", "MUNICIPIUL ALBA IULIA", "1026", 2, 1, 400, 200, [50, 100, 0]),
      pv(1, "ALBA", "COMUNA ARIEȘENI", "1999", 1, 1, 100, 50, [20, 20, 0]),
      pv(44, "Sector 1", "BUCUREȘTI SECTORUL 1", "179141", 1, 1, 900, 500, [200, 250, 0]),
      pv(45, "Sector 2", "BUCUREȘTI SECTORUL 2", "179150", 1, 1, 800, 400, [100, 250, 0]),
      pv(43, "STRĂINĂTATE", "ITALIA", "9999", 1, 1, 10, 9, [4, 5, 0]),
      pv(43, "STRĂINĂTATE", "ITALIA", "9999", 2, 1, 10, 9, [4, 5, 0]),
      pv(43, "STRĂINĂTATE", "REPUBLICA MOLDOVA", "9999", 3, 1, 10, 9, [1, 8, 0])
    ].join("\n");
    const { areas, lists, aliases, withoutCommune } = readAreas(text, "pv");
    const byKey = new Map(areas.map((area) => [area.key, area]));
    const alba = byKey.get("1026")!;
    expect(alba).toMatchObject({ circumscriptionNumber: 1, name: "MUNICIPIUL ALBA IULIA", sections: 2, registered: 900, present: 510, valid: 450, invalid: 2 });
    expect(alba.votes.get("partidul a")).toBe(160);
    expect(alba.votes.get("independents")).toBe(40);
    expect(byKey.get("179141")!.circumscriptionNumber).toBe(42);
    expect(byKey.get("179150")!.circumscriptionNumber).toBe(42);
    expect([...byKey.keys()].filter((key) => key.startsWith("abroad:")).sort()).toEqual(["abroad:italia", "abroad:republica-moldova"]);
    expect(byKey.get("abroad:italia")!.sections).toBe(2);
    expect(lists.get("independents")).toEqual({ name: "", independents: true });
    expect(lists.get("alianta b")?.name).toBe("ALIANȚA B");
    expect(aliases).toEqual([]);
    expect(withoutCommune).toBe(0);
  });

  it("reads the sector from the name when a file gives Bucharest one code, and a renumbered commune by the circumscription it is in", () => {
    const header = "Numar circumscriptie;Denumire circumscriptie;Instituție secție de votare;Număr secție de votare;UAT;UAT_SIRUTA;a;a1;a2;a3;b;b1;b2;b3;c;d;e;f;g;PARTIDUL A;ALIANȚA B";
    const line = (circ: number, uat: string, siruta: string, station: number, a: number, b: number, lists: [number, number]) => `${circ};NUME;ȘCOALA;${station};${uat};${siruta};${a};${a};0;0;${b};${b};0;0;0;0;${lists[0] + lists[1]};1;0;${lists[0]};${lists[1]}`;
    const text = [header, line(42, "BUCUREŞTI SECTORUL 3", "179132", 1, 100, 60, [30, 30]), line(42, "BUCUREŞTI SECTORUL 4", "179132", 2, 100, 50, [20, 30]), line(14, "BĂNEASA", "63171", 1, 80, 40, [10, 30]), line(11, "BĂNEASA", "63171", 1, 80, 40, [10, 30])].join("\n");
    const { areas, aliases } = readAreas(text, "sections");
    const keys = areas.map((area) => `${area.circumscriptionNumber}:${area.key}`).sort();
    expect(keys).toEqual(["11:63171", "14:61069", "42:179169", "42:179178"]);
    expect(aliases).toHaveLength(3);
  });

  it("keeps a station with no commune code under its circumscription and counts it", () => {
    const text = [PV_HEADER, pv(5, "BIHOR", "NECUNOSCUT", "", 1, 1, 100, 50, [10, 40, 0])].join("\n");
    const { areas, withoutCommune } = readAreas(text, "pv");
    expect(areas.map((area) => area.key)).toEqual(["unknown:5"]);
    expect(withoutCommune).toBe(1);
  });

  it("refuses a file without the columns it needs", () => {
    expect(() => readAreas("a;b\n1;2", "sections")).toThrow();
  });
});
