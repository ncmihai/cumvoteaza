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
        ] },
        { label: "Comisia economică", url: "https://cdep.ro/co?idc=7", startMonth: null, endMonth: null, roles: [{ role: "Secretar", startMonth: "1999-09", endMonth: null }] }
      ]
    }], legislature, "deputies");
    const rows = roster.committeeMemberships.map((row) => [row.committeeName.slice(0, 18), row.role, row.startsOn, row.startsOnPrecision, row.endsOn, row.endsOnPrecision]);
    expect(rows).toEqual([
      ["Comisia pentru ind", "Membru", "1996-11-22", "day", "1997-02-01", "month"],
      ["Comisia pentru Int", "Secretar", "1997-11-01", "month", undefined, "day"],
      ["Comisia specială X", "Membru", "1998-02-01", "month", "1998-06-01", "month"],
      ["Comisia specială X", "Secretar", "1998-02-01", "month", "1998-03-01", "month"],
      ["Comisia specială X", "Vicepreşedinte", "1998-03-01", "month", "1998-06-01", "month"],
      ["Comisia economică", "Secretar", "1999-09-01", "month", undefined, "day"]
    ]);
  });

  it("dates a group role from CDEP's months and keeps who held it, in which group (D37)", () => {
    const legislature = legislatureFromFlag("2024");
    const roster = buildParsedRoster([{
      ...profile("21 decembrie 2024"),
      profileKey: "leg2024:cam2:idm9",
      identity: { officialId: "9", legislature: "2024", chamber: "deputies" as const },
      groupMemberships: [{
        label: "Grupul parlamentar al Uniunii Salvaţi România",
        url: "https://cdep.ro/ords/pls/parlam/structura.gp?idg=7&leg=2024",
        startMonth: null,
        endMonth: null,
        roles: [
          { role: "Vicelider", startMonth: "2025-09", endMonth: "2026-02" },
          { role: "Lider", startMonth: "2026-02", endMonth: null }
        ]
      }]
    }], legislature, "deputies");
    expect(roster.roles.map((role) => [role.title, role.kind, role.startsOn, role.startsOnPrecision, role.endsOn, role.endsOnPrecision])).toEqual([
      [expect.stringMatching(/^Vicelider de grup · /), "group", "2025-09-01", "month", "2026-02-01", "month"],
      [expect.stringMatching(/^Lider de grup · /), "group", "2026-02-01", "month", undefined, "day"]
    ]);
    expect(roster.roles.every((role) => role.groupId && role.memberId === roster.members[0]!.id)).toBe(true);
  });

  it("gives a role without months of its own the dates of its group membership", () => {
    const roster = buildParsedRoster([{
      ...profile("21 decembrie 2024"),
      profileKey: "leg2024:cam1:idm4",
      identity: { officialId: "4", legislature: "2024", chamber: "senate" as const },
      groupMemberships: [{ label: "Grupul parlamentar PSD", url: "https://cdep.ro/ords/pls/parlam/structura.gp?idg=1&cam=1&leg=2024", startMonth: null, endMonth: null, roles: [{ role: "Secretar" }] }]
    }], legislatureFromFlag("2024"), "senate");
    expect(roster.roles).toHaveLength(1);
    expect(roster.roles[0]).toMatchObject({ kind: "group", startsOn: "2024-12-21", endsOn: undefined });
  });

  it("closes a role without an end at the end of a finished legislature, but leaves the current legislature's roles open", () => {
    const group = [{ label: "Grupul parlamentar PSD", url: "https://cdep.ro/ords/pls/parlam/structura.gp?idg=1&leg=2004", startMonth: null, endMonth: null, roles: [{ role: "Lider" }] }];
    const past = buildParsedRoster([{ ...profile("13 decembrie 2004"), groupMemberships: group }], legislatureFromFlag("2004"), "senate");
    expect(past.roles[0]).toMatchObject({ endsOn: legislatureFromFlag("2004").endsOn });
    const current = buildParsedRoster([{ ...profile("21 decembrie 2024"), profileKey: "leg2024:cam1:idm1", identity: { officialId: "1", legislature: "2024", chamber: "senate" as const }, groupMemberships: group }], legislatureFromFlag("2024"), "senate");
    expect(current.roles[0]!.endsOn).toBeUndefined();
  });
});
