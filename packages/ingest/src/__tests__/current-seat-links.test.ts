import { describe, expect, it } from "vitest";
import { matchGroup, parseMinorityOrganisation, parseRosterGroups, type GroupRef } from "../repair/current-seat-links";

const roster = `
<table>
<tr valign=top><td>130.&nbsp;</td><td><b><a href="/ords/pls/parlam/structura.mp?idm=132&cam=2&leg=2024">Grofu Daniel</a></b></td>
<td align="center"><a href="structura.ce?cir=41&leg=2024">42</a></td><td align="center" colspan=2><a href="structura.ce?cir=41&leg=2024">BUCUREŞTI</a></td>
<td align="center"><a href="/ords/pls/parlam/structura.gp?idg=9&leg=2024">UPR</a></td><td></td></tr>
<tr valign=top><td>131.&nbsp;</td><td><b><a href="/ords/pls/parlam/structura.mp?idm=133&cam=2&leg=2024">Grosaru Ioana</a></b></td>
<td colspan=3>&nbsp;</td>
<td align="center"><a href="/ords/pls/parlam/structura.gp?idg=0&leg=2024">Neafiliaţi</a></td><td></td></tr>
<tr valign=top><td>132.&nbsp;</td><td><b><a href="/ords/pls/parlam/structura.mp?idm=134&cam=2&leg=2024">Grosu Veronica</a></b></td>
<td align="center">35</td><td align="center" colspan=2>SUCEAVA</td>
<td align="center"><a href="/ords/pls/parlam/structura.gp?idg=2&leg=2024">AUR</a></td><td></td></tr>
</table>`;

const groups: GroupRef[] = [
  { id: "group-deputies-upr", shortName: "UPR", name: "Uniți pentru România" },
  { id: "group-deputies-unaffiliated", shortName: "Neafiliați", name: "Deputaţi neafiliaţi" },
  { id: "group-deputies-minoritati", shortName: "Minorități", name: "Grupul parlamentar al minorităților naționale" },
  { id: "group-deputies-aur", shortName: "AUR", name: "Alianța pentru Unirea Românilor" }
];

describe("current seat links", () => {
  it("reads the group the roster lists for each member, including a member with no county", () => {
    const parsed = parseRosterGroups(roster);
    expect(parsed.get(132)).toBe("UPR");
    expect(parsed.get(133)).toBe("Neafiliaţi");
    expect(parsed.get(134)).toBe("AUR");
  });

  it("matches a roster label to our group", () => {
    expect(matchGroup("Neafiliaţi", groups)?.id).toBe("group-deputies-unaffiliated");
    expect(matchGroup("Mino.", groups)?.id).toBe("group-deputies-minoritati");
    expect(matchGroup("AUR", groups)?.id).toBe("group-deputies-aur");
    expect(matchGroup("Necunoscut", groups)).toBeUndefined();
  });

  it("reads the organisation a national-minority member was nominated by", () => {
    const profile = `<html><body><p>Ioana GROSARU</p><p>DEPUTAT aleasa la nivel national data validarii: 21 decembrie 2024</p>
      <p>Organizatia minoritatilor nationale: Asociaţia Italienilor din România - RO.AS.IT.</p><p>Grupul parlamentar:     Comisii permanente</p></body></html>`;
    expect(parseMinorityOrganisation(profile)).toBe("Asociaţia Italienilor din România - RO.AS.IT.");
    expect(parseMinorityOrganisation("<html><body>Grupul parlamentar: PSD</body></html>")).toBeUndefined();
  });
});
