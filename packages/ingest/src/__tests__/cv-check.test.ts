import { describe, expect, it } from "vitest";
import { checkClaim, claimKind, dateWindow, type Span } from "../members/cv-check";
import { parseEntryDates } from "../members/cv-parse";

const TODAY = "2026-10-15";
const mandate = (chamber: "deputies" | "senate", from: string, to: string, label = "leg"): Span => ({ kind: "mandate", chamber, from, to, label });
const claim = (text: string) => {
  const lines = text.split("\n");
  const dates = parseEntryDates(lines);
  return { section: "experience" as const, lines, isCurrent: dates?.isCurrent ?? false, ...(dates?.starts ? { starts: dates.starts } : {}), ...(dates?.ends ? { ends: dates.ends } : {}) };
};

// Two terms in a row, as our records hold them, then a gap, then the current term.
const DEPUTY = [mandate("deputies", "2016-12-21", "2020-12-20", "2016-2020"), mandate("deputies", "2020-12-21", "2024-12-20", "2020-2024"), mandate("deputies", "2024-12-21", TODAY, "2024-2028")];

describe("claimKind", () => {
  it("reads the role from the first line that is not the date", () => {
    expect(claimKind(claim("2020 - prezent\nDeputat, Camera Deputaţilor"))).toBe("deputies");
    expect(claimKind(claim("DEPUTAT\nParlamentul României, 12/2024 - prezent"))).toBe("deputies");
    expect(claimKind(claim("Decembrie 2024 - prezent - Senator - Parlamentul Românei"))).toBe("senate");
    expect(claimKind(claim("2021 - 2023\nMinistrul Educaţiei"))).toBe("government");
  });
  it("does not take a deputy of the European Parliament, an adviser or a secretary for a member of ours", () => {
    expect(claimKind(claim("2015 - 2019\nDeputat în Parlamentul European"))).toBeUndefined();
    expect(claimKind(claim("2010 - 2014\nConsilier parlamentar, Camera Deputaţilor"))).toBeUndefined();
    expect(claimKind(claim("2010 - 2014\nSecretar general al Camerei Deputaţilor"))).toBeUndefined();
    expect(claimKind(claim("2005 - 2010: Deputat eparhial în Adunarea Eparhială a Episcopiei"))).toBeUndefined();
    expect(claimKind(claim("2009 - 2015\nDeputat, Parlamentul Republicii Moldova"))).toBeUndefined();
    expect(claimKind({ section: "education", lines: ["2005 - 2009", "Deputat"] })).toBeUndefined();
  });
});

describe("dateWindow", () => {
  it("is the first and the last day a date can mean", () => {
    const [a, b] = dateWindow("2020-12-01", "month");
    expect(b - a).toBe(30);
    const [c, d] = dateWindow("2020-01-01", "year");
    expect(d - c).toBe(365);
  });
});

describe("checkClaim against the mandates", () => {
  it("matches a stay that our mandates cover, written with a year's precision", () => {
    const result = checkClaim(claim("2016 - 2024\nDeputat"), DEPUTY, TODAY);
    expect(result).toMatchObject({ status: "matches", reason: "covered" });
    expect(result.records).toHaveLength(3);
  });
  it("matches a claim for one term of a longer stay, and a current claim of the sitting term", () => {
    expect(checkClaim(claim("2020 - 2024\nDeputat"), DEPUTY, TODAY).status).toBe("matches");
    expect(checkClaim(claim("12/2024 - prezent\nDeputat"), DEPUTY, TODAY).status).toBe("matches");
  });
  it("flags a CV that reaches back further than our record", () => {
    const result = checkClaim(claim("2008 - 2016\nDeputat"), DEPUTY, TODAY);
    expect(result).toMatchObject({ status: "differs", reason: "not_covered" });
  });
  it("flags a gap in the middle of a claimed stay", () => {
    const gap = [mandate("deputies", "2012-12-19", "2016-12-20"), mandate("deputies", "2024-12-21", TODAY)];
    expect(checkClaim(claim("2012 - 2026\nDeputat"), gap, TODAY).status).toBe("differs");
  });
  it("flags 'prezent' when our latest mandate has ended", () => {
    const ended = [mandate("deputies", "2016-12-21", "2020-12-20")];
    expect(checkClaim(claim("2016 - prezent\nDeputat"), ended, TODAY)).toMatchObject({ status: "differs", reason: "not_current" });
  });
  it("reads 'prezent' as the day the CV was filed: a seat that ended after that day is no difference", () => {
    const endedLater = [mandate("deputies", "2024-12-21", "2025-12-18")];
    const filed = { ...claim("12/2024 - prezent\nDeputat"), asOf: "2025-03-01" };
    expect(checkClaim(filed, endedLater, TODAY).status).toBe("matches");
    expect(checkClaim({ ...filed, asOf: undefined }, endedLater, TODAY).status).toBe("differs");
  });
  it("compares only the chamber that is claimed", () => {
    expect(checkClaim(claim("2016 - 2020\nSenator"), DEPUTY, TODAY).status).toBe("differs");
    expect(checkClaim(claim("2016 - 2020\nSenator"), [mandate("senate", "2016-12-21", "2020-12-20")], TODAY).status).toBe("matches");
  });
  it("does not check what it cannot compare: no role of ours, no dates, no end, dates too coarse", () => {
    expect(checkClaim(claim("2010 - 2014\nConsilier judeţean"), DEPUTY, TODAY).status).toBe("unchecked");
    expect(checkClaim(claim("Deputat"), DEPUTY, TODAY)).toMatchObject({ status: "unchecked", reason: "no_dates" });
    expect(checkClaim(claim("2020 Deputat"), DEPUTY, TODAY)).toMatchObject({ status: "unchecked", reason: "no_end" });
    expect(checkClaim(claim("2020 - 2020\nDeputat"), DEPUTY, TODAY)).toMatchObject({ status: "unchecked", reason: "too_coarse" });
  });
  it("tolerates the month's slack at the ends, so a month-precise CV is not flagged for the days between", () => {
    expect(checkClaim(claim("Decembrie 2016 - Decembrie 2020\nDeputat"), DEPUTY, TODAY).status).toBe("matches");
  });
});

describe("checkClaim for a ministry", () => {
  const roles: Span[] = [{ kind: "government", from: "2021-11-25", to: "2023-06-13", label: "Ministru · Guvernul X" }];
  it("only ever confirms: an overlap matches, an absence stays unchecked", () => {
    expect(checkClaim(claim("2021 - 2023\nMinistrul Educaţiei"), roles, TODAY).status).toBe("matches");
    expect(checkClaim(claim("1996 - 2000\nMinistrul Educaţiei"), roles, TODAY)).toMatchObject({ status: "unchecked", reason: "no_government_record" });
  });
});
