import { describe, expect, it } from "vitest";
import { biographyForm, pickSenateCards } from "../members/senate-bio-fetch";
import { parseSenateBiography } from "../members/senate-bio-parse";

const category = (index: string, label: string, body: string) => `
<table style="width: 165px;"><tr><td style="text-align: right"> ${label} </td></tr></table>
<input type="hidden" name="ctl00$B_Center$Fisa1$${index}$hParlamentarID" value="075d383a" />
<div><table id="ctl00_B_Center_Fisa1_${index}_Fisa2" width="100%"><tr><td>${body}</td></tr></table></div>`;
const entry = (index: string, n: string, html: string) => `<table id="ctl00_B_Center_Fisa1_${index}_Fisa2_ctl${n}_Fisa3" width="100%"><tr><td>${html}</td></tr></table>`;

const page = `<html><body><form id="aspnetForm"><input type="hidden" name="__VIEWSTATE" value="abc" /><input type="hidden" name="__VIEWSTATEGENERATOR" value="xyz" />
<a href="javascript:__doPostBack(&#39;ctl00$B_Center$Repeater14$ctl00$lnkBiog&#39;,&#39;&#39;)">Biografie</a>
${category("ctl02", "Experienţă profesională", entry("ctl02", "02", '<strong>Decembrie 2020 &ndash; &icirc;n prezent</strong><br />Senatul Rom&acirc;niei<br />Senator <br /><a title="Mai mult..." href="#">Mai mult...</a>'))}
${category("ctl03", "Educaţie şi formare", entry("ctl03", "02", '<a title="Mai mult..." href="#">Mai mult...</a>'))}
${category("ctl05", "Activitate în teritoriu", entry("ctl05", "02", "Cabinet senatorial:<br />Bulevardul Ion Ionescu, nr. 1<br />Telefon: 0747180258<br />e-mail: x@senat.ro"))}
${category("ctl07", "Alte informaţii", entry("ctl07", "02", "Abilități și competențe<br />Din 2013 Președinte al Societății de Boli Infecțioase<br />Din 2009 Membru titular al Academiei de Științe Medicale<br />2005-2009 Consilier al Ministrului Sănătății<br />Contact Senat: Calea 13 Septembrie") + entry("ctl07", "03", "Română") + entry("ctl07", "04", "Engleză - foarte bine"))}
</form></body></html>`;

describe("a senator's biography on the Senate's card", () => {
  const parsed = parseSenateBiography(page);

  it("reads the dated entry with the dates, the institution and the role, without the link to more", () => {
    const first = parsed.entries[0]!;
    expect(first).toMatchObject({ section: "experience", position: 0, datesText: "Decembrie 2020 – în prezent", isCurrent: true });
    expect(first.lines).toEqual(["Decembrie 2020 – în prezent", "Senatul României", "Senator"]);
    expect(first.starts).toMatchObject({ date: "2020-12-01", precision: "month" });
  });

  it("leaves an entry that is only a link to more (education) out, and every contact line", () => {
    expect(parsed.entries.some((item) => item.section === "education")).toBe(false);
    expect(parsed.entries.some((item) => /Telefon|senat\.ro|Cabinet|Contact/.test(item.rawText))).toBe(false);
    expect(parsed.droppedContactLines).toBeGreaterThan(0);
  });

  it("makes one entry of each dated line of a block and reads 'Din 2013' as a start with no end", () => {
    expect(parsed.entries.slice(1).map((item) => item.rawText)).toEqual(["Din 2013 Președinte al Societății de Boli Infecțioase", "Din 2009 Membru titular al Academiei de Științe Medicale", "2005-2009 Consilier al Ministrului Sănătății"]);
    expect(parsed.entries[1]).toMatchObject({ datesText: "Din 2013", starts: { date: "2013-01-01", precision: "year" }, isCurrent: false });
    expect(parsed.entries[1]!.ends).toBeUndefined();
    expect(parsed.entries[3]).toMatchObject({ starts: { date: "2005-01-01" }, ends: { date: "2009-01-01", precision: "year" } });
  });

  it("does not take a language for an entry", () => {
    expect(parsed.entries.some((item) => /^Română|Engleză/.test(item.rawText))).toBe(false);
  });
});

describe("the form that asks the Senate for the biography tab", () => {
  it("posts the card's hidden fields with the tab's own event target", () => {
    const form = biographyForm(page)!;
    expect(form.get("__EVENTTARGET")).toBe("ctl00$B_Center$Repeater14$ctl00$lnkBiog");
    expect(form.get("__VIEWSTATE")).toBe("abc");
    expect(form.get("__EVENTARGUMENT")).toBe("");
  });

  it("is absent when the card has no biography tab or no view state", () => {
    expect(biographyForm('<html><body><form id="aspnetForm"><input type="hidden" name="__VIEWSTATE" value="abc" /></form></body></html>')).toBeUndefined();
    expect(biographyForm("<a href=\"javascript:__doPostBack('x$lnkBiog','')\">Biografie</a>")).toBeUndefined();
  });
});

describe("which card a senator with a seat in two legislatures is read from", () => {
  const seats = [
    { personId: "p1", guid: "AAA-2020", key: "leg2020:cam1:idm119" },
    { personId: "p1", guid: "BBB-2024", key: "leg2024:cam1:idm109" },
    { personId: "p2", guid: "CCC-2024", key: "leg2024:cam1:idm95" },
    { personId: "p2", guid: "DDD-2020", key: "leg2020:cam1:idm110" }
  ];
  const saved = new Set(["bbb-2024", "ccc-2024"]);

  it("is the latest seat's card, in whatever order the rows come", () => {
    const expected = new Map([["p1", "bbb-2024"], ["p2", "ccc-2024"]]);
    expect(pickSenateCards(seats, saved)).toEqual(expected);
    expect(pickSenateCards([...seats].reverse(), saved)).toEqual(expected);
  });

  it("skips a seat whose card was not saved and leaves out a person with no saved card", () => {
    expect(pickSenateCards(seats, new Set(["aaa-2020"]))).toEqual(new Map([["p1", "aaa-2020"]]));
    expect(pickSenateCards(seats, new Set())).toEqual(new Map());
  });
});
