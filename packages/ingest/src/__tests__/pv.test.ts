import { describe, expect, it } from "vitest";
import { parseDelimited, sumPvListVotes } from "../elections/parse";

const HEADER = "precinct_county_nce,precinct_county_name,precinct_name,precinct_nr,uat_name,uat_siruta,report_version,report_stage_code,report_type_scope_code,report_type_category_code,report_type_code,created_at,a,a1,\"PARTIDUL A-voturi\",\"ALIANȚA B-voturi\"";
const row = (nce: number, county: string, precinct: number, version: number, a: number, b: number) => `${nce},${county},"SECȚIA ${precinct}",${precinct},UAT,${nce}00,${version},FINAL,PRCNCT,CD,CD_SV,"2024-12-02 10:00:00",100,100,${a},${b}`;

describe("sumPvListVotes", () => {
  it("sums the lists of every polling station per circumscription, counting a station once at its highest version, with the Bucharest sectors as one circumscription", () => {
    const text = [HEADER, row(1, "ALBA", 1, 1, 10, 5), row(1, "ALBA", 1, 2, 12, 6), row(1, "ALBA", 2, 1, 3, 4), row(44, "Sector 1", 1, 1, 7, 7), row(45, "Sector 2", 1, 1, 8, 1), row(43, "STRĂINĂTATE", 1, 1, 1, 0)].join("\n");
    expect(sumPvListVotes(parseDelimited(text))).toEqual([
      { circumscriptionNumber: 1, circumscription: "ALBA", list: "PARTIDUL A", votes: 15 },
      { circumscriptionNumber: 1, circumscription: "ALBA", list: "ALIANȚA B", votes: 10 },
      { circumscriptionNumber: 42, circumscription: "MUNICIPIUL BUCUREȘTI", list: "PARTIDUL A", votes: 15 },
      { circumscriptionNumber: 42, circumscription: "MUNICIPIUL BUCUREȘTI", list: "ALIANȚA B", votes: 8 },
      { circumscriptionNumber: 43, circumscription: "STRĂINĂTATE", list: "PARTIDUL A", votes: 1 },
      { circumscriptionNumber: 43, circumscription: "STRĂINĂTATE", list: "ALIANȚA B", votes: 0 }
    ]);
  });

  it("counts two rows that share a station number but not a name (the votes by mail: the bureau and the first station abroad are both number 1)", () => {
    const mail = (name: string, version: number, a: number, b: number) => `43,STRĂINĂTATE,"${name}",1,ROMANIA,9999,${version},PART,PRCNCT,CD_C,CD_SV_BVC,"2024-12-02 10:00:00",0,0,${a},${b}`;
    const text = [HEADER, mail("BIROUL ELECTORAL PENTRU VOTUL PRIN CORESPONDENȚĂ NR. 1", 1, 2185, 100), mail("PRETORIA", 1, 0, 0)].join("\n");
    expect(sumPvListVotes(parseDelimited(text)).map((item) => [item.list, item.votes])).toEqual([["PARTIDUL A", 2185], ["ALIANȚA B", 100]]);
  });

  it("refuses a file that is not a polling-station minutes file", () => {
    expect(() => sumPvListVotes([["a", "b"], ["1", "2"]])).toThrow();
    expect(() => sumPvListVotes([["precinct_county_nce", "precinct_county_name"], ["1", "ALBA"]])).toThrow();
  });
});
