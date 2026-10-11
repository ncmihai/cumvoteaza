import { describe, expect, it } from "vitest";
import type { AreaReading } from "../elections/areas";
import { buildNameIndex, matchName, placeKind, readAreas2012, readIndependents2012, resolveLocality } from "../elections/areas-2012";

const area = (key: string, circumscriptionNumber: number, name: string) => ({ key, circumscriptionNumber, name, sections: 1, registered: 0, present: 0, valid: 0, invalid: 0, votes: new Map<string, number>() });
const later: AreaReading = {
  areas: [
    area("1017", 1, "MUNICIPIUL ALBA IULIA"), area("1151", 1, "ORAŞ ABRUD"), area("2130", 1, "ALBAC"), area("5001", 1, "ORAŞ CÂMPENI"),
    area("6001", 15, "MUNICIPIUL SFÂNTU GHEORGHE"), area("7001", 40, "MOVILIŢA"), area("8001", 31, "ORAŞ PĂTÂRLAGELE"), area("9001", 5, "ORAŞ MARGHITA"), area("9002", 5, "MARGHITA"),
    area("151870", 36, "MUNICIPIUL ROŞIORI DE VEDE"), area("95612", 24, "ALEXANDRU I. CUZA"), area("59880", 13, "UNGURAŞ"),
    area("abroad:franta", 43, "FRANTA")
  ],
  lists: new Map(), aliases: [], withoutCommune: 0
};
const { index } = buildNameIndex([later]);

describe("matching a 2012 locality to a commune of the later elections", () => {
  it("writes â and î as one letter and drops diacritics, hyphens and the type word", () => {
    expect(matchName("MUNICIPIUL ALBA IULIA")).toBe("alba iulia");
    expect(matchName("ORAŞ CÎMPENI")).toBe(matchName("ORAŞ CÂMPENI"));
    expect(matchName("BOLINTIN-VALE")).toBe("bolintin vale");
    expect(placeKind("MUNICIPIUL X")).toBe("municipiul");
    expect(placeKind("ORAŞ X")).toBe("oras");
    expect(placeKind("X")).toBe("comuna");
  });

  it("finds the commune by the strictest way that gives exactly one", () => {
    expect(resolveLocality(index, 1, "MUNICIPIUL ALBA IULIA")).toEqual({ siruta: "1017", how: "exact" });
    // The 2012 file leaves "ORAŞ" off some towns.
    expect(resolveLocality(index, 1, "ABRUD")).toEqual({ siruta: "1151", how: "name" });
    // A letter lost to the file's encoding.
    expect(resolveLocality(index, 40, "MOVILI_A")).toEqual({ siruta: "7001", how: "pattern" });
    // â typed as a, ŭ stripped: "PATARLAGELE" is Pătârlagele, "SFANTU" is Sfântu.
    expect(resolveLocality(index, 31, "ORAS PATARLAGELE")).toEqual({ siruta: "8001", how: "loose" });
    expect(resolveLocality(index, 15, "MUNICIPIUL SFANTU GHEORGHE")).toEqual({ siruta: "6001", how: "loose" });
    // The three spelled another way, linked by hand.
    expect(resolveLocality(index, 36, "MUNICIPIUL ROŞIORII DE VEDE")?.siruta).toBe("151870");
    expect(resolveLocality(index, 24, "ALEXANDRU IOAN CUZA")?.siruta).toBe("95612");
    expect(resolveLocality(index, 13, "UNGUARŞ")?.siruta).toBe("59880");
  });

  it("never guesses: two communes of the same name and no kind in the file are no match, and the same name in another county is not this one", () => {
    expect(resolveLocality(index, 5, "MARGHITA")).toEqual({ siruta: "9002", how: "exact" });
    expect(resolveLocality(index, 6, "ALBAC")).toBeUndefined();
    expect(resolveLocality(index, 1, "COMUNA INEXISTENTA")).toBeUndefined();
  });
});

const HEADER = "numarCircumscriptie;numeCircumscriptie;numarSectie;Localitate;numarColegiu;numeTipColegiu;NrAlegatoriListe;NrAlegatoriListePermanent;NrAlegatoriListeSuplimentare;NrAlegatoriUrnaSpeciala;NrAlegatoriPrezentatiLaUrne;NrAlegatoriPrezentiLaUrneListaPermanenta;NrAlegatoriPrezentiLaUrneListaSuplimentara;NrAlegatoriPrezentiLaUrneListaSpeciala;NrBuletineVotPrimite;NrBuletineVotAnulate;TotalVoturiValabilExprimateLaNivelSectie;NrVoturiNule;NrVoturiAlbe;NumeCandidat;numeCompetitor;pozitieBuletin;VoturiCandidat";
const row = (circ: number, station: number, place: string, college: string, valid: number, candidate: string, competitor: string, votes: number) =>
  `${circ};X;${station};${place};1;${college};1000;990;10;0;700;690;10;0;1664;966;${valid};20;3;${candidate};${competitor};1;${votes}`;

describe("readAreas2012", () => {
  it("adds a station's figures once however many candidates it lists, sums the competitors' votes, and keeps the independents together", () => {
    const text = [HEADER,
      row(1, 1, "MUNICIPIUL ALBA IULIA", "CAMERA DEPUTATILOR", 677, "A", "UNIUNEA SOCIAL LIBERALĂ", 400),
      row(1, 1, "MUNICIPIUL ALBA IULIA", "CAMERA DEPUTATILOR", 677, "B", "PARTIDUL ROMÂNIA MARE", 77),
      row(1, 1, "MUNICIPIUL ALBA IULIA", "CAMERA DEPUTATILOR", 677, "C D", "NULL", 200),
      row(1, 1, "MUNICIPIUL ALBA IULIA", "SENAT", 650, "E", "UNIUNEA SOCIAL LIBERALĂ", 650),
      row(1, 2, "MUNICIPIUL ALBA IULIA", "CAMERA DEPUTATILOR", 600, "A", "UNIUNEA SOCIAL LIBERALĂ", 600),
      row(1, 3, "ALBAC", "CAMERA DEPUTATILOR", 100, "A", "UNIUNEA SOCIAL LIBERALĂ", 100),
      row(43, 1, "FRANTA", "CAMERA DEPUTATILOR", 10, "A", "UNIUNEA SOCIAL LIBERALĂ", 10)
    ].join("\n");
    const result = readAreas2012(text, index);
    const alba = result.deputies.areas.find((item) => item.key === "1017")!;
    expect(alba).toMatchObject({ sections: 2, registered: 1980, present: 1400, valid: 1277, invalid: 46 });
    expect(alba.votes.get("uniunea social liberala")).toBe(1000);
    expect(alba.votes.get("independents")).toBe(200);
    expect(result.deputies.lists.get("independents")).toEqual({ name: "", independents: true });
    expect(result.senate.areas.find((item) => item.key === "1017")).toMatchObject({ sections: 1, valid: 650 });
    expect(result.deputies.areas.find((item) => item.key === "abroad:franta")).toMatchObject({ circumscriptionNumber: 43, valid: 10 });
    expect(result.unmatched).toEqual([]);
    expect(result.matchedBy.exact).toBe(6);
  });

  it("keeps a locality no later election names out of the map and says so", () => {
    const text = [HEADER, row(1, 1, "COMUNA NOUA", "CAMERA DEPUTATILOR", 50, "A", "UNIUNEA SOCIAL LIBERALĂ", 50)].join("\n");
    const result = readAreas2012(text, index);
    expect(result.deputies.areas.map((item) => item.key)).toEqual(["unknown:1"]);
    expect(result.unmatched).toEqual([{ circumscription: 1, name: "COMUNA NOUA", sections: 1 }]);
    expect(result.deputies.withoutCommune).toBe(1);
  });

  it("names the independent candidates, whom the circumscription spreadsheets list by their own name", () => {
    const text = [HEADER, row(5, 1, "ORADEA", "CAMERA DEPUTATILOR", 10, "NOANE GHEORGHE-VIOREL", "NULL", 4), row(5, 1, "ORADEA", "CAMERA DEPUTATILOR", 10, "ION POPESCU", "UNIUNEA SOCIAL LIBERALĂ", 6)].join("\n");
    expect([...readIndependents2012(text)]).toEqual(["noane gheorghe viorel"]);
  });
});
