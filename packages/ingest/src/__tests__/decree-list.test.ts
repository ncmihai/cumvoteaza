import { describe, expect, it } from "vitest";
import { decreeListUrl, listKey, parseDecreeList } from "../presidency/portal-search";
import { decreePageText, textTargets } from "../presidency/decree-texts";
import type { DecreeRecord } from "../presidency/decrees";

const ITEM = (id: string, body: string) => `<div class="search_result_item"><p><a href="/Public/DetaliiDocument/${id}">1. DECRET 1 01/01/2025</a></p><p>${body}</p><p></p><p>Data intrarii in vigoare: 03 septembrie 2025</p></div>`;
const PAGE = `<html><body><p>Rezultate căutare pentru Tipul documentului "DECRET"</p><p>35 document(e) găsit(e) în 0.01 secunde</p>
${ITEM("301862", "<b> DECRET nr. 915 din 3 septembrie 2025</b><br>privind conferirea Ordinului Naţional Serviciul Credincios<br><br><b> EMITENT: </b>PREŞEDINTELE ROMÂNIEI<br><b> PUBLICAT ÎN: </b>MONITORUL OFICIAL nr. 78 din 31 ianuarie 2014")}
${ITEM("301863", "<b> DECRET nr. 1.916 din 4 septembrie 2025</b><br>pentru numirea unui judecător")}
${ITEM("301864", "<b>ORDIN nr. 5 din 4 septembrie 2025</b><br>not a decree")}</body></html>`;

describe("parseDecreeList", () => {
  it("reads the portal's count and each decree, with a space where the page puts a line break, the gazette when printed, and thousands written with a dot", () => {
    const parsed = parseDecreeList(PAGE);
    expect(parsed.total).toBe(35);
    expect(parsed.decrees).toEqual([
      { number: 915, year: 2025, issuedOn: "2025-09-03", subject: "privind conferirea Ordinului Naţional Serviciul Credincios", gazetteNumber: "78", gazetteOn: "2014-01-31", portalUrl: "http://legislatie.just.ro/Public/DetaliiDocument/301862", portalId: "301862", text: "" },
      { number: 1916, year: 2025, issuedOn: "2025-09-04", subject: "pentru numirea unui judecător", portalUrl: "http://legislatie.just.ro/Public/DetaliiDocument/301863", portalId: "301863", text: "" }
    ]);
  });

  it("returns no decree and a zero count for a page that is not a result list", () => {
    expect(parseDecreeList("<html><body>Verifying your browser</body></html>")).toEqual({ total: 0, decrees: [] });
  });
});

describe("addresses and keys", () => {
  it("builds a month's address with its last day and the page size code", () => {
    expect(decreeListUrl(2024, 2, 3, 5)).toBe("https://legislatie.just.ro/Public/RezultateCautare?rezultatePerPagina=5&page=3&tipdoc=3&sectiuneact=49&semnatinceputtext=2024/02/01&semnatsfarsittext=2024/02/29");
    expect(listKey(2014, 1, 5, 12)).toBe("m2014-01-s5-p12");
  });
});

describe("textTargets", () => {
  const decree = (number: number, issuedOn: string, subject: string): DecreeRecord => ({ number, year: Number(issuedOn.slice(0, 4)), issuedOn, subject, portalUrl: `http://x/${number}`, portalId: String(number), text: "" });

  it("wants every decree of an office-holding kind and the first and last decree of each month, and nothing else", () => {
    const decrees = [
      decree(1, "2025-09-01", "pentru numirea unui judecător"),
      decree(2, "2025-09-02", "privind conferirea Ordinului Meritul Cultural"),
      decree(3, "2025-09-03", "privind acreditarea unui ambasador"),
      decree(4, "2025-09-04", "pentru numirea unui judecător"),
      decree(5, "2025-09-05", "pentru numirea unui judecător"),
      decree(6, "2025-10-02", "privind conferirea Ordinului Meritul Cultural")
    ];
    expect(textTargets(decrees).sort()).toEqual(["1", "3", "5", "6"]);
  });
});

describe("decreePageText", () => {
  it("returns the visible text of a saved decree page with one space between words", () => {
    expect(decreePageText("<html><body><script>x()</script><p>DECRET nr. 1<br>privind</p><p>Se numește&nbsp;domnul</p></body></html>")).toBe("DECRET nr. 1 privind Se numește domnul");
  });
});
