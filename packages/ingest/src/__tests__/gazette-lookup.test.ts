import { describe, expect, it } from "vitest";
import { lawGazette, parseLegislatieSearch } from "../dossiers/gazette-lookup";

const act = (type: string, issuer: string, text: string) => `<a:Legi><a:DataVigoare>2025-12-23</a:DataVigoare><a:Emitent>${issuer}</a:Emitent><a:LinkHtml>http://legislatie.just.ro/Public/DetaliiDocument/1</a:LinkHtml><a:Numar>244</a:Numar><a:Text>${text}</a:Text><a:TipAct>${type}</a:TipAct><a:Titlu>t</a:Titlu></a:Legi>`;
const xml = `<s:Envelope><s:Body><SearchResponse><SearchResult>${[
  act("HOTĂRÂRE", "Guvernul", " HOTĂRÂRE nr. 244 din 13 martie 2025 privind un bun   Publicat în MONITORUL OFICIAL nr. 238 din 18 martie 2025 "),
  act("LEGE", "Parlamentul", " LEGE nr. 244 din 23 decembrie 2025 privind abilitarea Guvernului de a emite ordonanțe EMITENT PARLAMENTUL ROMÂNIEI Publicat în MONITORUL OFICIAL nr. 1194 din 23 decembrie 2025 Parlamentul României adoptă prezenta lege. cu modificările publicate în Monitorul Oficial nr. 12 din 3 ianuarie 2001"),
  act("DECRET", "Președintele României", " DECRET nr. 244 din 5 mai 2025 pentru numirea unui judecător Publicat în MONITORUL OFICIAL nr. 405 din 7 mai 2025 ")
].join("")}</SearchResult></SearchResponse></s:Body></s:Envelope>`;

describe("legislatie.just.ro law lookup", () => {
  it("reads the acts of a search answer", () => {
    expect(parseLegislatieSearch(xml).map((item) => item.type)).toEqual(["HOTĂRÂRE", "LEGE", "DECRET"]);
  });

  it("finds the law of Parliament with that number, its own date and the gazette that published it (not a decision or a decree of the same number)", () => {
    expect(lawGazette(parseLegislatieSearch(xml), "244")).toEqual({ gazetteNumber: "1194", gazetteOn: "2025-12-23", lawOn: "2025-12-23", link: "http://legislatie.just.ro/Public/DetaliiDocument/1" });
  });

  it("finds nothing when no law carries the number", () => {
    expect(lawGazette(parseLegislatieSearch(xml), "245")).toBeUndefined();
  });
});
