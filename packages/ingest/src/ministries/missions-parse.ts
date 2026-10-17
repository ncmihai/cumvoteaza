import * as cheerio from "cheerio";

/**
 * D-059 (Block 1c): the Foreign Affairs ministry's own pages about Romania's missions. The list (`mae.ro/romanian-missions`) gives, for each country, its embassy and the other missions with the address of each page, or says which
 * embassy covers the country when it has none of its own. The page of an embassy (and of a permanent mission or a consulate general) names who heads it ("Ambasador : domnul Octavian ȘERBAN"). Honorary consulates and cultural
 * institutes are on the list but are not read: they are not posts the President fills. The names are kept as the page prints them, apart from the capitals the site gives a surname (ȘERBAN becomes Șerban).
 */
export type MissionKind = "embassy" | "representation_office" | "permanent_mission" | "consulate_general" | "consulate" | "honorary_consulate" | "cultural_institute" | "other";

export interface Mission {
  /** mae.ro's own number for the page (`/romanian-missions/3156`). */
  id: string;
  name: string;
  kind: MissionKind;
  url: string;
}

export interface MissionCountry {
  /** The heading of the country in the list ("ALBANIA"), as printed. */
  name: string;
  /** The official name under it ("REPUBLICA ALBANIA"). */
  officialName?: string;
  missions: Mission[];
  /** "Reprezentarea … este asigurată de Ambasada României în FRANŢA": the embassy that covers a country with none of its own, and where. */
  coveredBy?: { text: string; id?: string };
}

const BASE = "https://mae.ro";

function kindOf(group: string | undefined, name: string): MissionKind {
  const g = (group ?? "").normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const n = name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  // The name decides first: the list files some embassies under "Misiuni permanente".
  if (/^ambasada/.test(n)) return "embassy";
  if (/onorific/.test(g) || /consulatul onorific/.test(n)) return "honorary_consulate";
  if (/institut/.test(g) || /institutul cultural/.test(n)) return "cultural_institute";
  if (/^oficiul de reprezentare/.test(n)) return "representation_office";
  if (/misiunea permanenta|delegatia permanenta|reprezentanta permanenta/.test(n) || /misiuni permanente/.test(g)) return "permanent_mission";
  if (/consulatul general/.test(n) || /consulate generale/.test(g)) return "consulate_general";
  if (/consulat/.test(n)) return "consulate";
  return "other";
}

/** The countries of the list with their missions. */
export function parseMissionList(html: string): MissionCountry[] {
  const $ = cheerio.load(html);
  const countries: MissionCountry[] = [];
  $("ul.country > li").each((_, element) => {
    const li = $(element);
    const name = li.find("a.open_con").first().text().replace(/\s+/g, " ").trim();
    if (!name) return;
    const country: MissionCountry = { name, missions: [] };
    const officialName = li.find("h4").first().text().replace(/\s+/g, " ").trim();
    if (officialName) country.officialName = officialName;
    li.find("a[href^='/romanian-missions/']").each((__, link) => {
      const anchor = $(link);
      const href = anchor.attr("href") ?? "";
      const id = /\/romanian-missions\/(\d+)/.exec(href)?.[1];
      const text = anchor.text().replace(/\s+/g, " ").trim();
      if (!id || !text) return;
      if (/asigurat[aă] de/i.test(text)) { country.coveredBy = { text, id }; return; }
      const group = anchor.closest("ul").parent().children("h5").first().text();
      country.missions.push({ id, name: text, kind: kindOf(group, text), url: `${BASE}/romanian-missions/${id}` });
    });
    const covered = li.find("h5").filter((__, node) => /asigurat[aă] de/i.test($(node).text())).first().text().replace(/\s+/g, " ").trim();
    if (covered && !country.coveredBy) country.coveredBy = { text: covered };
    countries.push(country);
  });
  return countries;
}

/** The missions whose page names who heads them: embassies, permanent missions and consulates general. */
export const headedMissions = (countries: MissionCountry[]) => countries.flatMap((country) => country.missions.filter((mission) => mission.kind === "embassy" || mission.kind === "representation_office" || mission.kind === "permanent_mission" || mission.kind === "consulate_general" || mission.kind === "consulate").map((mission) => ({ country: country.name, ...mission })));

export type HeadKind = "ambassador" | "consul_general" | "consul" | "permanent_representative" | "charge_d_affaires" | "acting_head" | "head_of_mission";

export interface MissionHead {
  /** The post as the page words it: "AMBASADOR", "Consul general", "Reprezentant permanent", "ÎNSĂRCINAT CU AFACERI a.i.", "GERANT INTERIMAR". */
  role: string;
  /** The post, read: an "însărcinat cu afaceri" is a chargé d'affaires, who heads a mission while it has no ambassador; a "gerant interimar" does the same for a consulate. */
  kind: HeadKind;
  /** The name, in the form the page prints with the surname's capitals lowered. */
  name: string;
  /** The name exactly as printed. */
  printed: string;
}

const cedilla = (value: string) => value.replace(/ş/g, "ș").replace(/Ş/g, "Ș").replace(/ţ/g, "ț").replace(/Ţ/g, "Ț");

/** ȘERBAN → Șerban, POPESCU-TĂRICEANU → Popescu-Tăriceanu, ŢURCANU → Țurcanu; a word that is not all capitals is left alone. */
export function lowerCapitals(name: string): string {
  return cedilla(name).split(/\s+/).map((word) => (word.length > 1 && word === word.toLocaleUpperCase("ro") && /\p{L}/u.test(word) ? word.split("-").map((part) => part.charAt(0) + part.slice(1).toLocaleLowerCase("ro")).join("-") : word)).join(" ");
}

// The label of the head's line, as the pages print it (with a dot before the colon on some, a letter missing in "CNSUL" on one).
const POSTS = /(Ambasador(?:ul)?|C(?:o)?nsul(?:ul)? general|Consul(?:ul)?(?!\s+general)|Reprezentant(?:ul)? permanent|[ÎI]ns[ăa]rcinat cu afr?aceri(?: a\.?\s?i\.?)?|Delegat(?:ul)? permanent al Rom[âa]niei pe l[âa]ng[ăa] [^:]{2,60}?|Ger[ăa]nt(?:ul)? interimar|[ȘŞS]ef(?:ul)? al (?:misiunii|oficiului|delega[țţt]iei))\.?\s*:\s*((?:domnul|doamna|dl\.?|d-na|dna\.?)\s+)?(.{3,160})/i;
/** Where the name ends on the line: the next label or notice on the page. */
const AFTER_NAME = /\s*(?:\(|COORDONATE|Acredit|Are acreditare|Adres|Telefon|Tel\b|Web|E-?mail|Fax|Program|Contact|Pentru|Atenți|Atenţi|\d)/;

/** Who heads the mission, from its page: the line "Ambasador : domnul Octavian ȘERBAN". Returns nothing when the page names no one (a vacant post, a page of another layout). */
export function parseMissionHead(html: string): MissionHead | undefined {
  const $ = cheerio.load(html);
  $("script, style, nav, header, footer").remove();
  const body = $("body").text().replace(/\u00a0/g, " ").replace(/[\u200b-\u200d\ufeff]/g, "").replace(/[ \t]+/g, " ");
  const lines = body.split("\n").map((line) => line.trim()).filter(Boolean);
  for (const match of lines.slice(0, 400).flatMap((line) => [...line.matchAll(new RegExp(POSTS.source, "gi"))])) {
    const rest = match[3]!;
    const cut = AFTER_NAME.exec(rest);
    // Some pages print "Es Dl." (Excelența Sa, domnul) before the name.
    const printed = (cut ? rest.slice(0, cut.index) : rest).replace(/\s+/g, " ").replace(/^(?:E\.?\s?S\.?|Es)\s+(?:Dl|Dna|Dl\.|Dna\.|domnul|doamna)\s*\.?\s+/i, "").replace(/[.,;]+$/, "").trim();
    const words = printed.split(" ");
    if (words.length < 2 || words.length > 6 || !words.every((word) => /^[\p{L}'’.\-]+$/u.test(word))) continue;
    const role = match[1]!.replace(/\s+/g, " ");
    const folded = role.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    const kind: HeadKind = /ambasador/.test(folded) ? "ambassador" : /consul general|cnsul general/.test(folded) ? "consul_general" : /consul/.test(folded) ? "consul" : /reprezentant/.test(folded) ? "permanent_representative" : /insarcinat/.test(folded) ? "charge_d_affaires" : /delegat permanent/.test(folded) ? "permanent_representative" : /gerant/.test(folded) ? "acting_head" : "head_of_mission";
    return { role, kind, name: lowerCapitals(printed), printed };
  }
  return undefined;
}
