import { describe, expect, it } from "vitest";
import { approvedOrdinanceOf, ordinanceFromActs, refKey, refLabel, titleWordsOf } from "../dossiers/ordinances";
import type { LegislatieAct } from "../dossiers/gazette-lookup";

const refOf = (title: string) => { const ref = approvedOrdinanceOf(title); return ref ? { kind: ref.kind, number: ref.number, year: ref.year } : undefined; };
const act = (type: string, issuer: string, text: string, id = "292291"): LegislatieAct => ({ type, issuer, title: "", link: `http://legislatie.just.ro/Public/DetaliiDocument/${id}`, text });

describe("approvedOrdinanceOf", () => {
  it("reads the urgency ordinance a bill approves, including the Chamber's 'urgenţã' misspelling and a number without a space", () => {
    expect(refOf("Proiect de Lege privind aprobarea Ordonanţei de urgenţã a Guvernului nr.52/2024 pentru modificarea şi abrogarea unor prevederi")).toEqual({ kind: "urgency", number: "52", year: 2024 });
    expect(refOf("Proiect de lege pentru aprobarea Ordonanței de urgență a Guvernului nr. 144/2024 privind declararea obiectivului")).toEqual({ kind: "urgency", number: "144", year: 2024 });
  });

  it("reads an ordinary ordinance, and an ordinance of an earlier year than the bill", () => {
    expect(refOf("Proiect de Lege pentru aprobarea Ordonanţei Guvernului nr.18/2024 privind prorogarea unor termene")).toEqual({ kind: "ordinary", number: "18", year: 2024 });
    expect(refOf("privind aprobarea Ordonanţei de urgenţã a Guvernului nr.206/2020 pentru prorogarea termenului")).toEqual({ kind: "urgency", number: "206", year: 2020 });
  });

  it("takes only the ordinance right after 'aprobarea', not the ones that ordinance amends", () => {
    expect(refOf("pentru aprobarea Ordonanței Guvernului nr. 5/2026 pentru modificarea și completarea Ordonanței Guvernului nr. 27/2011 privind transporturile rutiere")).toEqual({ kind: "ordinary", number: "5", year: 2026 });
  });

  it("says nothing for a title that does not approve an ordinance", () => {
    expect(refOf("Proiect de lege pentru modificarea Ordonanței de urgență a Guvernului nr. 57/2019 privind Codul administrativ")).toBeUndefined();
    expect(refOf("Propunere legislativă pentru aprobarea Programului național")).toBeUndefined();
  });

  it("keeps the ordinance's own title as a hint, and picks its most distinctive words to search by", () => {
    const ref = approvedOrdinanceOf("Proiect de Lege pentru aprobarea Ordonanţei de urgenţă a Guvernului nr.24/2026 privind reducerea temporară a nivelului accizei aplicabil motorinei şi instituirea contribuţiei de solidaritate")!;
    expect(ref.hint).toMatch(/^privind reducerea temporara a nivelului accizei aplicabil motorinei/);
    expect(titleWordsOf(ref.hint)).toEqual(["reducerea", "temporara", "nivelului", "accizei", "aplicabil", "motorinei"]);
    expect(titleWordsOf(undefined)).toEqual([]);
  });

  it("names the reference the way people write it", () => {
    expect(refLabel({ kind: "urgency", number: "144", year: 2024 })).toBe("OUG 144/2024");
    expect(refKey({ kind: "ordinary", number: "18", year: 2024 })).toBe("og-18-2024");
  });
});

describe("ordinanceFromActs", () => {
  const oug144 = act("ORDONANȚĂ DE URGENȚĂ", "Guvernul", 'ORDONANȚĂ DE URGENȚĂ nr. 144 din 12 decembrie 2024 privind declararea obiectivului de investiții "Amenajarea complexă Vârfu Câmpului pe râul Siret" drept proiect major EMITENT GUVERNUL ROMÂNIEI Publicat în MONITORUL OFICIAL nr. 1259 din 13 decembrie 2024 Având în vedere faptul că');
  const og18of2024 = act("ORDONANȚĂ", "Guvernul", "ORDONANȚĂ nr. 18 din 31 ianuarie 2024 pentru modificarea art. 55 din Legea sănătății mintale EMITENT GUVERNUL ROMÂNIEI Publicat în MONITORUL OFICIAL nr. 91 din 31 ianuarie 2024 În temeiul art. 108", "278741");
  const og18of2025 = act("ORDONANȚĂ", "Guvernul", "ORDONANȚĂ nr. 18 din 28 august 2025 privind prorogarea termenului EMITENT GUVERNUL ROMÂNIEI Publicat în MONITORUL OFICIAL nr. 801 din 28 august 2025 În temeiul art. 108", "301658");
  const oug18of2024 = act("ORDONANȚĂ DE URGENȚĂ", "Guvernul", "ORDONANȚĂ DE URGENȚĂ nr. 18 din 7 martie 2024 privind aprobarea schemei de ajutor de stat IMM PLUS EMITENT GUVERNUL ROMÂNIEI Publicat în MONITORUL OFICIAL nr. 201 din 11 martie 2024 Luând în considerare", "279773");
  const decision = act("DECIZIE", "Curtea Constituțională", "DECIZIA nr. 144 din 19 martie 2024 referitoare la excepția EMITENT CURTEA CONSTITUȚIONALĂ Publicat în MONITORUL OFICIAL nr. 931 din 17 septembrie 2024", "288815");

  it("finds the ordinance with its date, title, gazette number and date, and the portal page", () => {
    const found = ordinanceFromActs([decision, oug144], { kind: "urgency", number: "144", year: 2024 });
    expect(found).toEqual({
      kind: "urgency", number: "144", year: 2024, issuedOn: "2024-12-12",
      title: 'privind declararea obiectivului de investiții "Amenajarea complexă Vârfu Câmpului pe râul Siret" drept proiect major',
      issuer: "Guvernul României", gazetteNumber: "1259", gazetteOn: "2024-12-13",
      link: "http://legislatie.just.ro/Public/DetaliiDocument/292291", portalId: "292291"
    });
  });

  it("tells ordinances of the same number apart by year and by type (OG 18/2024 is not OG 18/2025 and not OUG 18/2024)", () => {
    const acts = [og18of2025, oug18of2024, og18of2024];
    expect(ordinanceFromActs(acts, { kind: "ordinary", number: "18", year: 2024 })).toMatchObject({ issuedOn: "2024-01-31", gazetteNumber: "91", portalId: "278741" });
    expect(ordinanceFromActs(acts, { kind: "urgency", number: "18", year: 2024 })).toMatchObject({ issuedOn: "2024-03-07", gazetteNumber: "201", gazetteOn: "2024-03-11" });
    expect(ordinanceFromActs(acts, { kind: "ordinary", number: "18", year: 2025 })).toMatchObject({ issuedOn: "2025-08-28" });
  });

  it("returns nothing when no act has that number, year and type, or when it is not the Government's", () => {
    expect(ordinanceFromActs([decision, og18of2025], { kind: "urgency", number: "144", year: 2024 })).toBeUndefined();
    expect(ordinanceFromActs([act("ORDONANȚĂ DE URGENȚĂ", "Parlamentul", oug144.text)], { kind: "urgency", number: "144", year: 2024 })).toBeUndefined();
  });

  it("keeps an ordinance whose gazette line is not printed yet, without inventing one", () => {
    const fresh = act("ORDONANȚĂ DE URGENȚĂ", "Guvernul", "ORDONANȚĂ DE URGENȚĂ nr. 40 din 2 octombrie 2026 privind unele măsuri EMITENT GUVERNUL ROMÂNIEI Având în vedere", "999");
    const found = ordinanceFromActs([fresh], { kind: "urgency", number: "40", year: 2026 });
    expect(found).toMatchObject({ issuedOn: "2026-10-02" });
    expect(found?.gazetteNumber).toBeUndefined();
  });
});
