import { describe, expect, it } from "vitest";
import { MIN_COVERED_SHARE, abroadByCountry, countryKey, countryName } from "./diaspora";
import { sumAreasBy, type MapArea } from "./election-map";

const abroadArea = (slug: string, v: number, lists: Array<[number, number]>, c = 43): MapArea => ({ k: `abroad:${slug}`, c, n: slug, s: 2, r: 0, p: v + 5, v, i: 5, l: lists.map((entry) => entry[0]), x: lists.map((entry) => entry[1]) });

describe("the votes abroad added up by country", () => {
  it("puts the spellings of one country together and orders the lists again", () => {
    const { countries, left, coveredShare } = abroadByCountry([
      abroadArea("franta", 100, [[1, 60], [2, 40]]),
      abroadArea("italia", 300, [[2, 200], [1, 100]]),
      // Spelt another way in another election's file, but the same country: the two are one in a single file only if the AEP itself split it.
      abroadArea("statele-unite-ale-americii", 50, [[1, 30], [2, 20]]),
      abroadArea("sua", 10, [[2, 10]])
    ]);
    expect(left).toEqual([]);
    expect(coveredShare).toBe(1);
    expect(countries.map((area) => area.k)).toEqual([countryKey("380"), countryKey("250"), countryKey("840")]);
    expect(countries[2]).toMatchObject({ n: "US", v: 60, l: [1, 2], x: [30, 30] });
    expect(countries[0]).toMatchObject({ n: "IT", v: 300, l: [2, 1], x: [200, 100] });
  });

  it("returns a place that is in no country of the list apart, and counts how much of the votes it holds back", () => {
    const { countries, left, coveredShare } = abroadByCountry([abroadArea("germania", 900, [[1, 900]]), abroadArea("roma-nia", 100, [[1, 100]])]);
    expect(countries).toHaveLength(1);
    expect(left.map((area) => area.k)).toEqual(["abroad:roma-nia"]);
    expect(coveredShare).toBeCloseTo(0.9);
    expect(coveredShare).toBeGreaterThanOrEqual(MIN_COVERED_SHARE - 1e-9);
  });

  it("does not draw a year whose files give cities: most of the votes are in no country of the list", () => {
    const { countries, coveredShare } = abroadByCountry([abroadArea("milano", 400, [[1, 400]]), abroadArea("londra", 400, [[1, 400]]), abroadArea("luxembourg", 20, [[1, 20]])]);
    expect(countries.map((area) => area.n)).toEqual(["LU"]);
    expect(coveredShare).toBeLessThan(MIN_COVERED_SHARE);
  });

  it("leaves the places inside Romania out and gives nothing for no votes abroad", () => {
    expect(abroadByCountry([abroadArea("1", 100, [[1, 100]], 1)])).toMatchObject({ countries: [], left: [], coveredShare: 0 });
  });

  it("names a country in the reader's language, and falls back to the world file's name where the browser has none", () => {
    expect(countryName("IT", "ro")).toMatch(/Italia/);
    expect(countryName("IT", "en")).toBe("Italy");
    expect(countryName("Q", "ro", "Nowhere")).toBe("Nowhere");
  });
});

describe("areas added up under a key of the caller's choosing", () => {
  it("returns the areas that have no key apart, never dropped", () => {
    const { sums, left } = sumAreasBy([abroadArea("a", 10, [[1, 10]]), abroadArea("b", 20, [[1, 5], [2, 15]]), abroadArea("c", 5, [[3, 5]])], (area) => (area.n === "c" ? undefined : { key: "g", name: "G" }));
    expect(sums).toHaveLength(1);
    expect(sums[0]).toMatchObject({ k: "g", n: "G", v: 30, l: [1, 2], x: [15, 15] });
    expect(left.map((area) => area.k)).toEqual(["abroad:c"]);
  });
});
