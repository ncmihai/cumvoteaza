import { describe, expect, it } from "vitest";
import { MINORITY_ALIASES, neverRepresented, searchTextOf } from "./party-directory-rules";
import { foldKey } from "./text";

const entry = (overrides: Partial<Parameters<typeof neverRepresented>[0]> = {}) => ({ kind: "minority_organisation" as const, deputies: 0, senators: 0, legislatures: [] as string[], ...overrides });

describe("neverRepresented", () => {
  it("hides a minority organisation with no member now and in no legislature", () => {
    expect(neverRepresented(entry())).toBe(true);
  });
  it("keeps one that sits now or sat before, and never hides a party or the unaffiliated", () => {
    expect(neverRepresented(entry({ deputies: 1 }))).toBe(false);
    expect(neverRepresented(entry({ legislatures: ["2020-2024"] }))).toBe(false);
    expect(neverRepresented(entry({ kind: "party" as never }))).toBe(false);
  });
});

describe("searchTextOf", () => {
  it("lets a hidden variant's name find the organisation it is a variant of", () => {
    const apr = { slug: "asociatia-partida-romilor-pro-europa", shortName: "APR", name: "Asociația Partida Romilor „Pro-Europa”" };
    expect(foldKey(searchTextOf(apr))).toContain(foldKey("Partida Romilor"));
    expect(foldKey(searchTextOf({ slug: "x", shortName: "X", name: "Altă organizație" }))).not.toContain(foldKey("Partida Romilor"));
  });
  it("names only organisations that exist, one body per alias", () => {
    expect(Object.keys(MINORITY_ALIASES).sort()).toEqual(["asociatia-liga-albanezilor-din-romania", "asociatia-partida-romilor-pro-europa", "comunitatea-rusilor-lipoveni-din-romania", "uniunea-bulgara-din-banat-romania"]);
  });
});
