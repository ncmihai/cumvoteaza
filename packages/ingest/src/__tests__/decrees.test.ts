import { describe, expect, it } from "vitest";
import { parseDecreePage, signatureOf } from "../presidency/decrees";
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
    ["privind organizarea referendumului naţional", "parliament_and_referendum"]
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
