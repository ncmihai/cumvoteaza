import { describe, expect, it } from "vitest";
import { isCrossLegislatureAlias, legislatureTagOf } from "../identity/legislature-tag";

describe("legislature tags of member ids", () => {
  it("reads the year of an earlier legislature and none for the current one", () => {
    expect(legislatureTagOf("member-deputies-2020-336")).toBe("2020");
    expect(legislatureTagOf("member-senate-1996-12")).toBe("1996");
    expect(legislatureTagOf("member-deputies-336")).toBeUndefined();
    expect(legislatureTagOf("member-senate-ad29025b-adcf-4c9d-8f02-851ab171ff91")).toBeUndefined();
  });

  it("calls an alias across legislatures unsafe for a roster, and keeps those within one", () => {
    expect(isCrossLegislatureAlias("member-deputies-336", "member-deputies-2020-336")).toBe(true);
    expect(isCrossLegislatureAlias("member-deputies-2016-5", "member-deputies-2020-5")).toBe(true);
    expect(isCrossLegislatureAlias("member-senate-ad29025b-adcf-4c9d-8f02-851ab171ff91", "member-senate-66")).toBe(false);
    expect(isCrossLegislatureAlias("member-deputies-2020-9", "member-deputies-2020-8")).toBe(false);
  });
});
