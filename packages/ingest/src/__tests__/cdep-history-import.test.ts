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
});
