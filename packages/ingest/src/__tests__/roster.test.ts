import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseDeputiesMemberProfile, parseDeputiesRosterGroup, parseDeputiesRosterIndex } from "../parsers/deputies-roster";
import { legislature2020, legislature2024, legislatureFromFlag, partyFromText } from "../parsers/roster";
import { parseSenateMemberProfile, parseSenateRosterGroup, parseSenateRosterIndex } from "../parsers/senate-roster";

const fixtures = path.join(__dirname, "../fixtures");

describe("roster parsers", () => {
  it("parses Senate groups, members, mandates, and committees", () => {
    const index = parseSenateRosterIndex(read("senate-roster-index.html"), "https://www.senat.ro/EnumGrupuri.aspx");
    expect(index.groups).toHaveLength(1);
    expect(index.groups[0]?.group.id).toBe("group-senate-psd");

    const group = parseSenateRosterGroup(read("senate-roster-group.html"), index.groups[0]!.url, index.groups[0]!.group);
    expect(group.members).toHaveLength(1);
    expect(group.members[0]?.member.id).toBe("member-senate-b9c904e7-969f-4126-b0e1-0ebd3a003cc5");

    const profile = parseSenateMemberProfile(read("senate-member-profile.html"), group.members[0]!.profileUrl);
    expect(profile.member.slug).toBe("andra-bica");
    expect(profile.mandate?.startsOn).toBe("2024-12-21");
    expect(profile.committeeMemberships[0]?.committeeName).toContain("Comisia pentru buget");
  });

  it("parses Deputies groups, members, roles, party movements, and committees", () => {
    const index = parseDeputiesRosterIndex(read("deputies-roster-index.html"), "https://cdep.ro/ords/pls/dic/site2015.home?idl=1");
    expect(index.groups).toHaveLength(1);
    expect(index.groups[0]?.expectedCount).toBe(93);

    const group = parseDeputiesRosterGroup(read("deputies-roster-group.html"), index.groups[0]!.url, index.groups[0]!.group);
    expect(group.members).toHaveLength(2);
    expect(group.members[0]?.role?.title).toBe("Lider grup parlamentar");

    const profile = parseDeputiesMemberProfile(read("deputies-member-profile.html"), group.members[0]!.profileUrl);
    expect(profile.member.id).toBe("member-deputies-254");
    expect(profile.mandate?.startsOn).toBe("2024-12-21");
    expect(profile.mandate?.constituency).toBe("TIMIŞ");
    expect(profile.partyAffiliations[0]?.partyId).toBe("party-psd");
    expect(profile.groupMemberships[0]?.groupId).toBe("group-deputies-psd");
    expect(profile.committeeMemberships[0]?.committeeName).toContain("Comisia pentru cultură");
  });

  it("parses Deputies month-level party and group movements without swallowing the whole profile", () => {
    const profile = parseDeputiesMemberProfile(read("deputies-member-profile-movements.html"), "https://www.cdep.ro/ords/pls/parlam/structura2015.mp?idm=113&leg=2024", {
      legislature: legislature2024
    });

    expect(profile.mandate?.constituency).toBe("HUNEDOARA");
    expect(profile.partyAffiliations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ partyId: "party-pot", startsOn: "2024-12-21", endsOn: "2026-04-30" }),
        expect.objectContaining({ partyId: "party-upr", startsOn: "2026-05-01" })
      ])
    );
    expect(profile.groupMemberships).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ groupId: "group-deputies-pot", startsOn: "2024-12-21", endsOn: "2026-04-30" }),
        expect.objectContaining({ groupId: "group-deputies-upr", startsOn: "2026-05-01" })
      ])
    );
  });

  it("keeps full Deputies historical names when CDEP titles contain spaced hyphens", () => {
    const profile = parseDeputiesMemberProfile(
      read("deputies-member-profile-hyphen-title.html"),
      "https://www.cdep.ro/ords/pls/parlam/structura2015.mp?idm=38&leg=2020",
      { legislature: legislature2020 }
    );

    expect(profile.member.displayName).toBe("Benga Tudor-Vlad");
    expect(profile.member.slug).toBe("benga-tudor-vlad");
    expect(profile.mandate?.constituency).toBe("BRAŞOV");
  });

  it("keeps historical roster mandates in their own legislature", () => {
    const profile = parseDeputiesMemberProfile("<html><body><h1>Deputat Istoric</h1></body></html>", "https://www.cdep.ro/ords/pls/parlam/structura2015.mp?idm=294&leg=2020", {
      legislature: legislature2020
    });

    expect(profile.member.id).toBe("member-deputies-2020-294");
    expect(profile.mandate?.id).toBe("mandate-member-deputies-2020-294-2020-2024-deputies");
    expect(profile.mandate?.legislatureId).toBe("leg-2020-2024");
    expect(profile.mandate?.startsOn).toBe("2020-12-21");
  });

  it("recognizes historical hyphenated party names", () => {
    expect(partyFromText("Grupul parlamentar al Partidului Democrat-Liberal")?.id).toBe("party-pdl");
  });

  it("parses official CDEP cross-chamber career links, replacements, and party logos", () => {
    const profile = parseDeputiesMemberProfile(
      `<html><head><title>STRUCTURA PARLAMENTULUI ROMÂNIEI 2004-2008</title></head><body>
        <table><tr><td><img src="/parlamentari/l2004/Rotaru_Ion.jpg" alt="Ion Rotaru"></td></tr></table>
        <table>
          <tr><td><font><b>Activitate parlamentară</b></font></td></tr>
          <tr><td><a href="/ords/pls/parlam/structura.mp?idm=143&cam=1&leg=2012&pag=1&idl=1"><b>2012-2016 (sen.)</b></a></td></tr>
          <tr><td><a href="/ords/pls/parlam/structura.mp?idm=64&cam=2&leg=2004&pag=1&idl=1"><b>2004-2008 (dep.)</b></a></td></tr>
        </table>
        <td class="headline">Ion ROTARU<br>Sinteza activitatii parlamentare în legislatura 2004-2008</td>
        <table><tr><td>SENATOR</td></tr><tr><td>
          ales senator în circumscriptia electorala nr.9 <a href="structura.ce?cir=9&cam=1">BRĂILA</a><br>
          pe listele Uniunii Naţionale PSD+PUR<br>
          data validarii: 30 iunie 2008<br>
          înlocuieste pe: <a href="/ords/pls/parlam/structura.mp?idm=103&cam=1&leg=2004&pag=1&idl=1"><b>Aurel Gabriel Simionescu</b></a>
        </td></tr></table>
        <table><tr><td><b>Formatiunea politica:</b></td></tr><tr><td>
          <img src="/aleg/psd2004.jpg"><a href="structura.fp?idp=40&cam=1&leg=2004&idl=1">PSD</a> - Partidul Social Democrat
        </td></tr></table>
        <table><tr><td><b>Grupul parlamentar:</b></td></tr><tr><td>
          <a href="/ords/pls/parlam/structura.gp?idg=2&cam=1&leg=2004">Grupul parlamentar al Partidului Social Democrat</a>
        </td></tr></table>
      </body></html>`,
      "https://www.cdep.ro/ords/pls/parlam/structura.mp?idm=152&cam=1&leg=2004&pag=1&idl=1",
      { legislature: legislatureFromFlag("2004"), chamber: "senate" }
    );

    expect(profile.member.id).toBe("member-senate-2004-152");
    expect(profile.member.displayName).toBe("Ion Rotaru");
    expect(profile.member.sourceIds.profilePhoto).toBe("https://www.cdep.ro/parlamentari/l2004/Rotaru_Ion.jpg");
    expect(profile.careerLinks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ officialId: "143", chamber: "senate", legislature: expect.objectContaining({ label: "2012-2016" }) }),
        expect.objectContaining({ officialId: "64", chamber: "deputies", legislature: expect.objectContaining({ label: "2004-2008" }) })
      ])
    );
    expect(profile.mandate).toEqual(expect.objectContaining({ chamber: "senate", startsOn: "2008-06-30", constituency: "BRĂILA" }));
    expect(profile.mandateRelations?.[0]).toEqual(
      expect.objectContaining({
        relation: "replaces",
        relatedMemberId: "member-senate-2004-103",
        relatedName: "Aurel Gabriel Simionescu"
      })
    );
    expect(profile.partyAffiliations[0]).toEqual(
      expect.objectContaining({ partyId: "party-psd", logoUrl: "https://www.cdep.ro/aleg/psd2004.jpg" })
    );
  });

  it("scopes historical non-party CDEP group ids by legislature", () => {
    const profile = parseDeputiesMemberProfile(
      `<html><body>
        <td class="headline">Deputat Test<br>Sinteza activitatii parlamentare în legislatura 2008-2012</td>
        <table><tr><td>DEPUTAT</td></tr><tr><td>data validarii: 15 decembrie 2008</td></tr></table>
        <table><tr><td><b>Grupul parlamentar:</b></td></tr><tr><td>
          <a href="/ords/pls/parlam/structura.gp?idg=1&cam=2&leg=2008">Grupul parlamentar al Alianței PSD+PC</a>
        </td></tr></table>
      </body></html>`,
      "https://www.cdep.ro/ords/pls/parlam/structura.mp?idm=1&cam=2&leg=2008&pag=1&idl=1",
      { legislature: legislatureFromFlag("2008"), chamber: "deputies" }
    );

    expect(profile.groupMemberships[0]?.groupId).toBe("group-deputies-2008-2012-1");
    expect(profile.groups?.[0]?.name).toBe("Grupul parlamentar al Alianței PSD+PC");
  });

});

function read(file: string): string {
  return readFileSync(path.join(fixtures, file), "utf8");
}
