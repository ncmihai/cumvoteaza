import { describe, expect, it } from "vitest";
import { parseQuestionList, questionListUrl, questionUrl } from "../members/questions-fetch";

const LIST = `<table><tr valign="top" bgcolor="#fef9c2">
  <td align="right">1.<//td>
  <td><b><a href="interpelari.detalii?idi=82395&idl=1">Interpelarea nr.929B/10.02.2026</a></b><br>Condi&#539;iile igienico-sanitare improprii din cadrul Sec&#539;iei de Pediatrie</td>
</tr>
<tr valign="top" bgcolor="#fffef2">
  <td align="right">2.<//td>
  <td><b><a href="interpelari.detalii?idi=82396&idl=1">Interpelarea nr.930B/10.02.2026</a></b><br>Condi&#539;ii inacceptabile de călătorie &#8211; pasageri &#8222;Săgeata Albastră&#8221;</td>
</tr>
<tr><td><b><a href="interpelari.detalii?idi=82395&idl=1">Interpelarea nr.929B/10.02.2026</a></b><br>repeated row</td></tr></table>`;

describe("parseQuestionList", () => {
  it("reads number, date and title of each item, decoding the page's entities", () => {
    expect(parseQuestionList(LIST, "interpellation")).toEqual([
      { idi: "82395", kind: "interpellation", number: "929B", registeredOn: "2026-02-10", title: "Condițiile igienico-sanitare improprii din cadrul Secției de Pediatrie" },
      { idi: "82396", kind: "interpellation", number: "930B", registeredOn: "2026-02-10", title: "Condiții inacceptabile de călătorie – pasageri „Săgeata Albastră”" }
    ]);
  });

  it("reads a question the same way and ignores links that are not items", () => {
    const html = `<a href="interpelari.lista?tip=A&dat=2025&idl=1">2025</a><table><tr><td><b><a href="interpelari.detalii?idi=82081&idl=1">Întrebarea nr.3676A/08.01.2026</a></b><br>Planurile de stocare</td></tr></table>`;
    expect(parseQuestionList(html, "question")).toEqual([{ idi: "82081", kind: "question", number: "3676A", registeredOn: "2026-01-08", title: "Planurile de stocare" }]);
  });
});

describe("addresses", () => {
  it("builds the list and item addresses the Chamber serves", () => {
    expect(questionListUrl("question", 2026)).toBe("https://www.cdep.ro/ords/pls/parlam/interpelari.lista?tip=A&dat=2026&idl=1");
    expect(questionListUrl("interpellation", 2025)).toBe("https://www.cdep.ro/ords/pls/parlam/interpelari.lista?tip=B&dat=2025&idl=1");
    expect(questionUrl("81509")).toBe("https://www.cdep.ro/ords/pls/parlam/interpelari.detalii?idi=81509&idl=1");
  });
});
