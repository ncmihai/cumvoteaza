import { describe, expect, it } from "vitest";
import { looksComplete, missingMembers, parseRosterPage, storedProfileKeys, type OfficialMember } from "../updater/roster-check";

// The markup of the Chamber's roster page (structura.de?leg=2024): one row per member, the name linking to the profile; the same member can be linked twice.
const row = (n: number, name: string, cam = 2, leg = "2024") => `<tr valign=top><td align=right>${n}.&nbsp;</td><td><b><a href="/ords/pls/parlam/structura.mp?idm=${n}&cam=${cam}&leg=${leg}">${name}</a></b></td><td><a href="structura.gp?idg=1&leg=${leg}">PSD</a></td></tr>`;
const html = `<html><body><table>${row(1, "Adomnicăi Mirela Elena")}${row(3, "Albu&nbsp;Dumitrița")}${row(336, "Badea Mihai-Alexandru")}${row(336, "Badea Mihai-Alexandru")}${row(7, "Alt Om", 2, "2020")}${row(9, "Un Senator", 1)}<tr><td><a href="structura.ce?cir=34&leg=2024">35</a></td></tr></table></body></html>`;

describe("parseRosterPage", () => {
  it("lists each member of the legislature and chamber once, by profile number", () => {
    const members = parseRosterPage(html, "deputies", "2024");
    expect(members.map((member) => member.idm)).toEqual([1, 3, 336]);
    expect(members[1]).toMatchObject({ name: "Albu Dumitrița", url: "https://www.cdep.ro/ords/pls/parlam/structura.mp?idm=3&cam=2&leg=2024" });
  });
  it("does not mix chambers or legislatures", () => {
    expect(parseRosterPage(html, "senate", "2024").map((member) => member.idm)).toEqual([9]);
    expect(parseRosterPage(html, "deputies", "2020").map((member) => member.idm)).toEqual([7]);
  });
});

describe("missingMembers", () => {
  const official: OfficialMember[] = parseRosterPage(html, "deputies", "2024");
  it("names the members whose profile we do not hold, counting a career link as holding it", () => {
    const stored = storedProfileKeys([{ source_ids: { cdepProfileKey: "leg2024:cam2:idm1" } }, { source_ids: { cdepProfileKey: "leg2020:cam2:idm5", cdepCareerKeys: "leg2020:cam2:idm5,leg2024:cam2:idm3" } }, { source_ids: null }]);
    expect(missingMembers(official, stored, "2024").map((member) => member.name)).toEqual(["Badea Mihai-Alexandru"]);
  });
  it("is empty when we hold everyone", () => {
    const stored = new Set(["leg2024:cam2:idm1", "leg2024:cam2:idm3", "leg2024:cam2:idm336"]);
    expect(missingMembers(official, stored, "2024")).toEqual([]);
  });
});

describe("looksComplete", () => {
  it("rejects a page that lists far fewer members than the chamber seats", () => {
    const few = parseRosterPage(html, "deputies", "2024");
    expect(looksComplete("deputies", few)).toBe(false);
    expect(looksComplete("senate", Array.from({ length: 137 }, (_, index) => ({ chamber: "senate" as const, idm: index + 1, name: "x", url: "" })))).toBe(true);
  });
});
