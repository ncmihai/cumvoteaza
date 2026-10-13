import { describe, expect, it } from "vitest";
import { countyLabel, foldKey, normalizeRomanian, titleCaseRo } from "./text";

describe("text helpers", () => {
  it("writes comma-below letters", () => {
    expect(normalizeRomanian("Asociaţia Şcolii Ţării")).toBe("Asociația Școlii Țării");
    // The tilde a the Chamber prints for ă, and text that needs nothing is returned as it is.
    expect(normalizeRomanian("Ordonanţei de urgenţã a Guvernului, Cãlãraşi")).toBe("Ordonanței de urgență a Guvernului, Călărași");
    expect(normalizeRomanian("Ordonanței de urgență")).toBe("Ordonanței de urgență");
  });
  it("folds to a key without capitals or accents", () => {
    expect(foldKey("BISTRIŢA-NĂSĂUD")).toBe("bistrita-nasaud");
    expect(foldKey(undefined)).toBe("");
  });
  it("capitalises county names the Romanian way", () => {
    expect(titleCaseRo("BISTRIŢA-NĂSĂUD")).toBe("Bistrița-Năsăud");
    expect(titleCaseRo("SATU-MARE")).toBe("Satu-Mare");
    expect(titleCaseRo("CARAŞ-SEVERIN")).toBe("Caraș-Severin");
  });
  it("names the two seat groups that are not a county", () => {
    expect(countyLabel("la nivel national", "ro")).toBe("Locuri naționale (minorități)");
    expect(countyLabel("DIASPORA", "en")).toBe("Diaspora");
    expect(countyLabel("ARGEŞ", "ro")).toBe("Argeș");
  });
});
