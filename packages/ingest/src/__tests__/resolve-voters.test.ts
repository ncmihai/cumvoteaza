import { describe, expect, it } from "vitest";
import type { Member } from "@cumsevoteaza/parliament-model";
import { resolveVoters, type SittingMember } from "../identity/resolve-voters";

const voter = (id: string, displayName: string, sourceIds: Record<string, string> = {}): Member =>
  ({ id, slug: id, firstName: "", lastName: "", displayName, sourceIds }) as Member;

const sittingSenate: SittingMember[] = [
  { id: "member-senate-81", displayName: "Ninel Peia", sourceIds: { senatRoGuid: "007fdd23-b531-407e-a067-9c3796420c8c", "senate:2024": "81" } },
  { id: "member-senate-63", displayName: "Ion-Narcis Mircescu", sourceIds: { senatRoGuid: "7a6ec680" } }
];

describe("resolveVoters", () => {
  it("maps a senat.ro GUID to the canonical CDEP member through the recorded alias", () => {
    const result = resolveVoters({
      chamber: "senate", legislatureYear: "2024",
      voters: [voter("member-senate-007fdd23-b531-407e-a067-9c3796420c8c", "Ninel Peia", { senate: "007fdd23-b531-407e-a067-9c3796420c8c" })],
      aliases: new Map([["member-senate-007fdd23-b531-407e-a067-9c3796420c8c", "member-senate-81"]]),
      sitting: sittingSenate
    });
    expect(result.canonicalByParsedId.get("member-senate-007fdd23-b531-407e-a067-9c3796420c8c")).toBe("member-senate-81");
    expect(result.unresolved).toEqual([]);
  });

  it("uses the official ID when there is no alias yet", () => {
    const result = resolveVoters({
      chamber: "senate", legislatureYear: "2024",
      voters: [voter("member-senate-7a6ec680", "Narcis Mircescu", { senate: "7A6EC680" })],
      aliases: new Map(), sitting: sittingSenate
    });
    expect(result.canonicalByParsedId.get("member-senate-7a6ec680")).toBe("member-senate-63");
    expect(result.learnedAliases).toEqual([]);
  });

  it("finds a 2020-2024 deputy by CDEP idm instead of the current-legislature ID scheme (ghost voters)", () => {
    const result = resolveVoters({
      chamber: "deputies", legislatureYear: "2020",
      voters: [voter("member-deputies-336", "Grădinaru Radu-Vicenţiu", { cdepIdm: "336" })],
      aliases: new Map(),
      sitting: [{ id: "member-deputies-2020-336", displayName: "Radu-Vicenţiu Grădinaru", sourceIds: { "deputies:2020": "336" } }]
    });
    expect(result.canonicalByParsedId.get("member-deputies-336")).toBe("member-deputies-2020-336");
  });

  it("learns an alias from a unique name match among the members sitting that day", () => {
    const result = resolveVoters({
      chamber: "senate", legislatureYear: "2024",
      voters: [voter("member-senate-ffff0000", "Peia Ninel", { senate: "ffff0000" })],
      aliases: new Map(), sitting: sittingSenate
    });
    expect(result.learnedAliases).toEqual([{ aliasId: "member-senate-ffff0000", canonicalId: "member-senate-81" }]);
  });

  it("never creates a member: an unknown voter is reported unresolved", () => {
    const result = resolveVoters({
      chamber: "senate", legislatureYear: "2024",
      voters: [voter("member-ion-popescu", "Ion Popescu")],
      aliases: new Map(), sitting: sittingSenate
    });
    expect(result.unresolved).toEqual([{ memberId: "member-ion-popescu", displayName: "Ion Popescu" }]);
    expect(result.canonicalByParsedId.size).toBe(0);
  });

  it("matches a senator named by CDEP's idm on a joint-sitting page, even when the spelling differs", () => {
    const result = resolveVoters({
      chamber: "senate", legislatureYear: "2024",
      voters: [voter("member-senate-81", "Peia Ninel-Marian", { cdepIdm: "81", chamber: "senate" }), voter("member-senate-9999", "Nobody Known", { cdepIdm: "9999" })],
      aliases: new Map(), sitting: sittingSenate.filter((member) => member.id !== "member-senate-81").concat([{ id: "member-senate-81-canonical", displayName: "Ninel Peia", sourceIds: { "senate:2024": "81" } }])
    });
    expect(result.canonicalByParsedId.get("member-senate-81")).toBe("member-senate-81-canonical");
    expect(result.unresolved.map((item) => item.memberId)).toEqual(["member-senate-9999"]);
  });
});
