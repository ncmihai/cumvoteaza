import { describe, expect, it } from "vitest";
import { buildParsedRoster } from "../cdep-history-import";
import { legislatureFromFlag } from "../parsers/roster";

const profile = (validationDateRaw: string) => ({
  profileKey: "leg2004:cam1:idm50",
  url: "https://cdep.ro/ords/pls/parlam/structura.mp?cam=1&idm=50&leg=2004",
  snapshot: { contentHash: "a".repeat(64), fetchedAt: "2026-05-20T00:00:00Z", status: 200, url: "https://cdep.ro/x" },
  identity: { officialId: "50", legislature: "2004", chamber: "senate" as const },
  name: "Ion Iliescu",
  validationDateRaw,
  groupMemberships: [{ label: "Grupul parlamentar PSD", url: "https://cdep.ro/ords/pls/parlam/structura.gp?idg=1&cam=1&leg=2004" }]
});

describe("CDEP history roster", () => {
  it("does not trust a validation date from before the legislature began (CDEP's '17 februarie 2004')", () => {
    const legislature = legislatureFromFlag("2004");
    const roster = buildParsedRoster([profile("17 februarie 2004")], legislature, "senate");
    expect(roster.mandates[0]!.startsOn).toBe(legislature.startsOn);
    expect(roster.groupMemberships[0]!.startsOn).toBe(legislature.startsOn);
  });

  it("keeps a plausible validation date", () => {
    const roster = buildParsedRoster([profile("3 februarie 2005")], legislatureFromFlag("2004"), "senate");
    expect(roster.mandates[0]!.startsOn).toBe("2005-02-03");
  });

  it("keeps CDEP's committee dates and dated roles instead of the whole mandate (D19)", () => {
    const legislature = legislatureFromFlag("1996");
    const roster = buildParsedRoster([{
      ...profile("22 noiembrie 1996"),
      profileKey: "leg1996:cam2:idm1",
      identity: { officialId: "1", legislature: "1996", chamber: "deputies" as const },
      committeeMemberships: [
        { label: "Comisia pentru industrii şi servicii", url: "https://cdep.ro/co?idc=3", startMonth: null, endMonth: "1997-02", roles: [] },
        { label: "Comisia pentru Integrare Europeană", url: "https://cdep.ro/co?idc=16", startMonth: "1997-11", endMonth: null, roles: [{ role: "Secretar" }] },
        { label: "Comisia specială X", url: "https://cdep.ro/co?idc=40", startMonth: "1998-02", endMonth: "1998-06", roles: [
          { role: "Secretar", startMonth: null, endMonth: "1998-03" },
          { role: "Vicepreşedinte", startMonth: "1998-03", endMonth: null }
        ] }
      ]
    }], legislature, "deputies");
    const rows = roster.committeeMemberships.map((row) => [row.committeeName.slice(0, 18), row.role, row.startsOn, row.startsOnPrecision, row.endsOn, row.endsOnPrecision]);
    expect(rows).toEqual([
      ["Comisia pentru ind", "Membru", "1996-11-22", "day", "1997-02-01", "month"],
      ["Comisia pentru Int", "Secretar", "1997-11-01", "month", undefined, "day"],
      ["Comisia specială X", "Membru", "1998-02-01", "month", "1998-06-01", "month"],
      ["Comisia specială X", "Secretar", "1998-02-01", "month", "1998-03-01", "month"],
      ["Comisia specială X", "Vicepreşedinte", "1998-03-01", "month", "1998-06-01", "month"]
    ]);
  });
});
