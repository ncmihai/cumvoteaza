import { describe, expect, it } from "vitest";
import { headedMissions, lowerCapitals, parseMissionHead, parseMissionList } from "../ministries/missions-parse";
import { headId } from "../ministries/missions-import";

const LIST = `<ul class="country">
<li><a href="#801" class="open_con">AUSTRIA</a><div class="country_area"><div class="info_space"><h4>REPUBLICA AUSTRIA</h4><div class="list_is"><div class="country_info_list"><ul>
<li><h5><a href="/bilateral-relations/1683#801">Profil de ţară</a></h5></li>
<li><h5>Misiuni ale României</h5><ul class="inner_missions"><li><a href="/romanian-missions/3164#801">Ambasada României în Austria</a></li>
<li><h5>Misiuni permanente</h5><ul><li><a href="/romanian-missions/3257#801">Misiunea Permanentă a României pe lângă organizaţiile internaţionale de la Viena</a></li></ul></li>
<li><h5>Consulate generale</h5><ul><li><a href="/romanian-missions/61814#801">Consulatul General al României la Salzburg</a></li></ul></li>
<li><h5>Consulate conduse de consuli onorifici</h5><ul><li><a href="/romanian-missions/3299#801">Consulatul Onorific al României la Eisenstadt</a></li></ul></li>
<li><h5>Institute culturale</h5><ul><li><a href="/romanian-missions/3478#801">Institutul Cultural Român la Viena</a></li></ul></li></ul></li></ul></div></div></div></div></li>
<li><a href="#799" class="open_con">ANDORRA</a><div class="country_area"><div class="info_space"><h4>PRINCIPATUL ANDORRA</h4><div class="list_is"><div class="country_info_list"><ul>
<li><h5><a href="/romanian-missions/3189#813">Reprezentarea diplomatică şi consulară a României în ANDORRA este asigurată de Ambasada României în FRANŢA</a></h5></li></ul></div></div></div></div></li>
<li><a href="#810" class="open_con">DANEMARCA</a><div class="country_area"><div class="info_space"><h4>REGATUL DANEMARCEI</h4><div class="list_is"><div class="country_info_list"><ul>
<li><h5>Misiuni ale României</h5><ul class="inner_missions"><li><h5>Misiuni permanente</h5><ul><li><a href="/romanian-missions/3181#810">Ambasada României în Regatul Danemarcei</a></li></ul></li></ul></li></ul></div></div></div></div></li>
</ul>`;

describe("the list of Romania's missions", () => {
  it("reads each country's missions and gives each the kind its name says, whatever group the list files it under", () => {
    const countries = parseMissionList(LIST);
    expect(countries.map((country) => country.name)).toEqual(["AUSTRIA", "ANDORRA", "DANEMARCA"]);
    expect(countries[0]!.officialName).toBe("REPUBLICA AUSTRIA");
    expect(countries[0]!.missions.map((mission) => `${mission.id}:${mission.kind}`)).toEqual(["3164:embassy", "3257:permanent_mission", "61814:consulate_general", "3299:honorary_consulate", "3478:cultural_institute"]);
    // The list files Denmark's embassy under "Misiuni permanente"; its name makes it an embassy.
    expect(countries[2]!.missions[0]).toMatchObject({ id: "3181", kind: "embassy" });
  });

  it("notes the embassy that covers a country with none of its own", () => {
    const andorra = parseMissionList(LIST)[1]!;
    expect(andorra.missions).toEqual([]);
    expect(andorra.coveredBy?.text).toMatch(/asigurată de Ambasada României în FRANŢA/);
    expect(andorra.coveredBy?.id).toBe("3189");
  });

  it("picks the pages that name a head: embassies, permanent missions and consulates general, not honorary consulates or cultural institutes", () => {
    expect(headedMissions(parseMissionList(LIST)).map((mission) => mission.id)).toEqual(["3164", "3257", "61814", "3181"]);
  });
});

describe("a mission's page", () => {
  const page = (text: string) => `<html><body><nav>Meniu Ambasador : nu</nav><div><p>Ambasada României în Republica Albania</p><p>${text}</p></div><footer>x</footer></body></html>`;

  it("names the ambassador, with the surname's capitals lowered", () => {
    expect(parseMissionHead(page("Ambasador :&nbsp; domnul Octavian ȘERBAN COORDONATE DE CONTACT : Adresă : Rruga E Elbasanit")))
      .toEqual({ role: "Ambasador", kind: "ambassador", name: "Octavian Șerban", printed: "Octavian ȘERBAN" });
    expect(parseMissionHead(page("AMBASADOR : doamna Ioana BIVOLARU"))).toMatchObject({ kind: "ambassador", name: "Ioana Bivolaru" });
  });

  it("reads a chargé d'affaires as heading a mission that has no ambassador, and a consul general", () => {
    expect(parseMissionHead(page("ÎNSĂRCINAT CU AFACERI a.i. : domnul Mihai-Florin BULGARIU Adresă"))).toMatchObject({ kind: "charge_d_affaires", name: "Mihai-Florin Bulgariu" });
    expect(parseMissionHead(page("CONSUL GENERAL : domnul RADU-DUMITRU FLOREA Adresă"))).toMatchObject({ kind: "consul_general", name: "Radu-Dumitru Florea" });
  });

  it("names no one when the page does not", () => {
    expect(parseMissionHead(page("COORDONATE DE CONTACT : Adresă : Strada 1"))).toBeUndefined();
  });

  it("lowers only the words that are all capitals", () => {
    expect(lowerCapitals("Octavian ȘERBAN")).toBe("Octavian Șerban");
    expect(lowerCapitals("POPESCU-TĂRICEANU Călin")).toBe("Popescu-Tăriceanu Călin");
  });

  it("gives one head one id whatever the order of the name's words", () => {
    expect(headId("m1", "Octavian Șerban", "ambassador")).toBe(headId("m1", "Șerban Octavian", "ambassador"));
    expect(headId("m1", "Octavian Șerban", "ambassador")).not.toBe(headId("m1", "Octavian Șerban", "charge_d_affaires"));
  });
});
