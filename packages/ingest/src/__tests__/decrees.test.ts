import { describe, expect, it } from "vitest";
import { namedPersons, parseDecreePage, signatureOf } from "../presidency/decrees";
import { classifyDecree } from "../presidency/decree-types";

/** A record shaped like the portal's: the title carries the number, the date, the subject, the issuer and the Official Gazette; the text ends with the signature. */
function record(options: { type?: string; issuer?: string; title: string; text: string; id?: string }) {
  return `<a:Legi><a:DataVigoare>2026-10-06</a:DataVigoare><a:Emitent>${options.issuer ?? "Pre?edintele României"}</a:Emitent><a:LinkHtml>http://legislatie.just.ro/Public/DetaliiDocument/${options.id ?? "315032"}</a:LinkHtml><a:Numar>1</a:Numar><a:Publicatie>Monitorul Oficial</a:Publicatie><a:Text>${options.text}</a:Text><a:TipAct>${options.type ?? "DECRET"}</a:TipAct><a:Titlu> ${options.title}</a:Titlu></a:Legi>`;
}
const page = (...records: string[]) => `<s:Envelope><s:Body><SearchResponse><SearchResult>${records.join("")}</SearchResult></SearchResponse></s:Body></s:Envelope>`;

describe("parseDecreePage", () => {
  it("reads number, date, subject, gazette, portal page and signer of a President's decree", () => {
    const xml = page(record({
      title: "DECRET nr. 1.123 din 22 noiembrie 2021 privind desemnarea candidatului la funcţia de prim-ministru EMITENT Preşedintele României PUBLICAT ÎN Monitorul Oficial nr. 1110 din 22 noiembrie 2021",
      text: " DECRET nr. 1.123 ... PREȘEDINTELE ROMÂNIEI KLAUS-WERNER IOHANNIS București, 22 noiembrie 2021. Nr. 1.123. -----"
    }));
    expect(parseDecreePage(xml)).toEqual([{
      number: 1123, year: 2021, issuedOn: "2021-11-22", subject: "privind desemnarea candidatului la funcţia de prim-ministru", gazetteNumber: "1110", gazetteOn: "2021-11-22",
      portalUrl: "http://legislatie.just.ro/Public/DetaliiDocument/315032", portalId: "315032", signer: "KLAUS-WERNER IOHANNIS", signedAsInterim: false,
      text: "DECRET nr. 1.123 ... PREȘEDINTELE ROMÂNIEI KLAUS-WERNER IOHANNIS București, 22 noiembrie 2021. Nr. 1.123. -----"
    }]);
  });

  it("leaves out acts that are not the President's decrees", () => {
    const xml = page(
      record({ type: "LEGE", issuer: "Parlamentul", title: "LEGE nr. 5 din 1 ianuarie 2026 privind ceva EMITENT Parlamentul PUBLICAT ÎN Monitorul Oficial nr. 1 din 2 ianuarie 2026", text: "x" }),
      record({ type: "DECRET", issuer: "Consiliul de Stat", title: "DECRET nr. 511*) din 22 noiembrie 1955 privind altceva EMITENT Consiliul de Stat", text: "x" })
    );
    expect(parseDecreePage(xml)).toEqual([]);
  });
});

describe("signatureOf", () => {
  it("reads an acting President and a decree the Prime Minister countersigns", () => {
    expect(signatureOf("... PREȘEDINTELE ROMÂNIEI - interimar - ILIE-GAVRIL BOLOJAN București, 5 mai 2025. Nr. 420.")).toEqual({ name: "ILIE-GAVRIL BOLOJAN", interim: true });
    expect(signatureOf("... PREȘEDINTELE ROMÂNIEI NICUȘOR-DANIEL DAN În temeiul art. 100 alin. (2) din Constituția României, republicată , contrasemnăm acest decret. PRIM-MINISTRU ILIE-GAVRIL BOLOJAN București, 1 octombrie 2026.")).toEqual({ name: "NICUȘOR-DANIEL DAN", interim: false });
  });

  it("returns nothing when the text has no signature", () => {
    expect(signatureOf("DECRET fără semnătură")).toBeUndefined();
  });
});

describe("classifyDecree", () => {
  const cases: Array<[string, string]> = [
    ["pentru promulgarea Legii privind Codul amenajării teritoriului, urbanismului şi construcţiilor", "promulgation"],
    ["privind desemnarea candidatului la funcţia de prim-ministru", "pm_designation"],
    ["pentru numirea unui judecător", "magistrates"],
    ["privind eliberarea din funcţie a unui procuror", "magistrates"],
    ["privind reîncadrarea în funcţie a unui judecător", "magistrates"],
    ["privind conferirea Ordinului Meritul Cultural", "decoration"],
    ["privind acreditarea unui ambasador", "diplomacy"],
    ["privind numirea unor miniştri", "government"],
    ["privind numirea Guvernului", "government"],
    ["privind acordarea grațierii individuale", "pardon"],
    ["privind instituirea stării de urgenţă pe teritoriul României", "state_of_exception"],
    ["privind organizarea referendumului naţional", "parliament_and_referendum"],
    ["pentru supunerea spre ratificare Parlamentului a Acordului de asociere între Uniunea Europeană și o țară", "parliament_and_referendum"],
    ["privind acordarea unei grațieri individuale", "pardon"],
    ["privind retragerea unei decorații", "decoration"],
    ["privind acordarea gradului de contraamiral de flotilă cu o stea unui comandor", "military"],
    ["pentru numirea unui membru în Consiliul de administrație al Casei Naționale de Asigurări de Sănătate", "state_bodies"],
    ["pentru numirea în funcție a procurorului-șef al Direcției Naționale Anticorupție", "judiciary_leadership"],
    ["privind numirea unui judecător la Curtea Constituţională", "constitutional_court"],
    ["privind eliberarea din funcție a unui judecător al Curții Constituționale", "constitutional_court"]
  ];
  for (const [subject, kind] of cases) it(`"${subject}" is ${kind}`, () => expect(classifyDecree(subject).kind).toBe(kind));

  it("says whether the title appoints or releases", () => {
    expect(classifyDecree("pentru numirea unui judecător").action).toBe("appointment");
    expect(classifyDecree("privind eliberarea din funcţie a unui procuror").action).toBe("release");
    expect(classifyDecree("privind eliberarea din funcţie a unui ministru").action).toBe("release");
  });

  it("leaves a title no rule knows as other", () => {
    expect(classifyDecree("privind un lucru neașteptat").kind).toBe("other");
  });
});

describe("namedPersons", () => {
  it("reads the person a ministerial decree names, with the sentence that names them", () => {
    const text = "... Președintele României decretează: + ARTICOL UNIC Se desemnează domnul Marian-Cătălin Predoiu, viceprim-ministru, ministrul afacerilor interne, în funcția de ministru al justiției, ad-interim. PREȘEDINTELE ROMÂNIEI NICUȘOR-DANIEL DAN București, 24 aprilie 2026.";
    const sentence = "Se desemnează domnul Marian-Cătălin Predoiu, viceprim-ministru, ministrul afacerilor interne, în funcția de ministru al justiției, ad-interim.";
    expect(namedPersons("government", text)).toEqual([{ name: "Marian-Cătălin Predoiu", role: sentence, sentence }]);
  });

  it("reads a recall in two articles and an honorific that starts the sentence, once per person", () => {
    const text = "Președintele României decretează: + Articolul 1 Domnul Sorin-Dan Mihalache se recheamă din calitatea de ambasador extraordinar și plenipotențiar al României în Republica Cipru. + Articolul 2 Domnul Sorin-Dan Mihalache își va încheia misiunea în termen de cel mult 90 de zile. PREȘEDINTELE ROMÂNIEI NICUȘOR-DANIEL DAN București, 1 martie 2026.";
    const people = namedPersons("diplomacy", text);
    expect(people.map((person) => person.name)).toEqual(["Sorin-Dan Mihalache"]);
    expect(people[0]!.role).toContain("se recheamă din calitatea de ambasador");
  });

  it("reads nothing from decorations, judges, prosecutors or ranks, whatever the text says", () => {
    const text = "Președintele României decretează: + ARTICOL UNIC Doamna Goncescu Alina se numește în funcția de judecător la Judecătoria Târgu Mureș. PREȘEDINTELE ROMÂNIEI NICUȘOR-DANIEL DAN București, 5 mai 2025.";
    expect(namedPersons("magistrates", text)).toEqual([]);
    expect(namedPersons("decoration", text)).toEqual([]);
    expect(namedPersons("military", text)).toEqual([]);
    expect(namedPersons("pardon", text)).toEqual([]);
  });

  it("reads a decree whose text spaces out the verb ('d e c r e t e a z ă')", () => {
    expect(namedPersons("presidential_staff", "Președintele României d e c r e t e a z ă: + ARTICOL UNIC Începând cu data de 25 mai 2026, domnul Radu-Ioan Mogoș se numește în funcția de consilier de stat. PREȘEDINTELE ROMÂNIEI NICUȘOR-DANIEL DAN București").map((p) => p.name)).toEqual(["Radu-Ioan Mogoș"]);
  });
});
