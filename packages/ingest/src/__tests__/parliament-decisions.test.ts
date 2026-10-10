import { describe, expect, it } from "vitest";
import { DECISION_QUERIES, decisionListKey, decisionListUrl, decisionPersons, parseDecisionList } from "../presidency/parliament-decisions";

const ITEM = (id: string, body: string) => `<div class="search_result_item"><p><a href="/Public/DetaliiDocument/${id}">1. HOTARARE 15 02/03/2015</a></p><p>${body}</p><p></p></div>`;
const PAGE = `<html><body><p>7 document(e) găsit(e) în 0.01 secunde</p>
${ITEM("166060", "<b> HOTĂRÂRE nr. 15 din 2 martie 2015</b><br>pentru numirea directorului Serviciului Român de Informaţii<br><br><b> EMITENT: </b>PARLAMENTUL<br><b> PUBLICAT ÎN: </b>MONITORUL OFICIAL nr. 151 din 2 martie 2015")}
${ITEM("10847", "<b> HOTĂRÎRE nr. 6 din 26 mai 1997</b><br>privind numirea directorului Serviciului Român de Informaţii<br><br><b> EMITENT: </b>PARLAMENTUL<br><b> PUBLICAT ÎN: </b>MONITORUL OFICIAL nr. 106 din 29 mai 1997")}
${ITEM("1", "<b>LEGE nr. 5 din 4 septembrie 2025</b><br>not a decision")}</body></html>`;

describe("parseDecisionList", () => {
  it("reads the count and each decision, with its title, date and Official Gazette, and leaves out other acts", () => {
    const parsed = parseDecisionList(PAGE);
    expect(parsed.total).toBe(7);
    expect(parsed.items).toEqual([
      { portalId: "166060", number: 15, year: 2015, adoptedOn: "2015-03-02", title: "pentru numirea directorului Serviciului Român de Informaţii", gazetteNumber: "151", gazetteOn: "2015-03-02" },
      { portalId: "10847", number: 6, year: 1997, adoptedOn: "1997-05-26", title: "privind numirea directorului Serviciului Român de Informaţii", gazetteNumber: "106", gazetteOn: "1997-05-29" }
    ]);
  });
});

describe("decisionPersons", () => {
  const head = "HOTĂRÂRE nr. 15 din 2 martie 2015 pentru numirea directorului Serviciului Român de Informaţii EMITENT PARLAMENTUL Publicat în MONITORUL OFICIAL nr. 151 din 2 martie 2015 În temeiul prevederilor art. 65 alin. (2) lit. h) din Constituţia României, republicată, Parlamentul României adoptă prezenta hotărâre. + Articolul UNIC";
  const tail = "Această hotărâre a fost adoptată de Parlamentul României în şedinţa din 2 martie 2015, cu respectarea prevederilor art. 76 alin. (2) din Constituţia României, republicată. PREŞEDINTELE CAMEREI DEPUTAŢILOR VALERIU-ŞTEFAN ZGONEA București, 2 martie 2015. Nr. 15.";

  it("reads the person a decision appoints, as the decision prints the name", () => {
    expect(decisionPersons(`${head} Domnul Hellvig Eduard Raul se numeşte în funcţia de director al Serviciului Român de Informaţii. ${tail}`)).toEqual([
      { name: "Hellvig Eduard Raul", action: "appointment", sentence: "Domnul Hellvig Eduard Raul se numește în funcția de director al Serviciului Român de Informații." }
    ]);
  });

  it("reads a resignation and a vacancy, and a judge named to the Constitutional Court", () => {
    expect(decisionPersons(`${head} Se ia act de demisia domnului Costin Georgescu din funcția de director al Serviciului Român de Informații și se constată vacanța acestei funcții. ${tail}`)).toMatchObject([{ name: "Costin Georgescu", action: "resignation" }]);
    expect(decisionPersons(`${head} Se constată vacanţa funcţiei de director al Serviciului Român de Informaţii. ${tail}`)).toMatchObject([{ name: "", action: "vacancy" }]);
    expect(decisionPersons(`${head} Doamna Livia Doina Stanciu se numeşte judecător la Curtea Constituţională. ${tail}`)).toMatchObject([{ name: "Livia Doina Stanciu", action: "appointment" }]);
  });

  it("reads a description between the name and the verb, the older wording of a resignation, and a vacancy declared because of a resignation", () => {
    expect(decisionPersons(`${head} Domnul Ioan Vida, profesor universitar, doctor în drept, se numeşte în funcţia de judecător la Curtea Constituţională, pentru un mandat de 9 ani, ca urmare a încetării mandatului domnului judecător prof. univ. dr. Ioan Muraru. ${tail}`)).toMatchObject([{ name: "Ioan Vida", action: "appointment" }]);
    expect(decisionPersons(`${head} Domnul senator Toni Greblă se numeşte în funcţia de judecător la Curtea Constituţională ca urmare a încetării mandatului. ${tail}`)).toMatchObject([{ name: "Toni Greblă", action: "appointment" }]);
    expect(decisionPersons(`${head} Parlamentul României ia act de cererea de demisie a domnului Alexandru-Radu Timofte din funcţia de director al Serviciului Român de Informaţii şi declară vacantă această funcţie. ${tail}`)).toMatchObject([{ name: "Alexandru-Radu Timofte", action: "resignation" }]);
    expect(decisionPersons(`${head} Parlamentul României declară vacantă funcţia de director al Serviciului de Informaţii Externe, ca urmare a demisiei domnului Mihai-Răzvan Ungureanu din funcţia de director al Serviciului de Informaţii Externe din data de 8 februarie 2012. ${tail}`)).toMatchObject([{ name: "Mihai-Răzvan Ungureanu", action: "resignation" }]);
  });

  it("names nobody in a decision about something else", () => {
    expect(decisionPersons(`${head} Se aprobă raportul comisiei. ${tail}`)).toEqual([]);
  });
});

describe("the queries", () => {
  it("search the title's words under the issuer's id, with keys that differ by query", () => {
    const query = DECISION_QUERIES[0]!;
    expect(decisionListUrl(query, 1)).toBe("https://legislatie.just.ro/Public/RezultateCautare?rezultatePerPagina=5&page=1&tipdoc=2&sectiuneact=2&titlu=directorului%20Serviciului%20Rom%C3%A2n%20de%20Informa%C8%9Bii");
    const keys = DECISION_QUERIES.map((item) => decisionListKey(item, 1));
    expect(new Set(keys).size).toBe(keys.length);
  });
});
