import { sumAreasBy, type MapArea } from "./election-map";

/**
 * The votes abroad, added up by country for the diaspora map. The AEP's files name the place of each polling station abroad, and the names are spelt several ways from one election to the next
 * ("FRANȚA", "Franţa", "FRANTA"), so an area's key (`abroad:` and the name without capitals or accents) is matched to a country from a list written by hand: the country's ISO 3166-1 codes (alpha-2
 * for its name in the reader's language, numeric for the shape in the world file) and the spellings found in the files. A place that is not in the list is returned apart and counted, never given a country
 * by guess; the 2016 files give the polling stations by city, not by country, and most of them are not in the list for that reason: the map then says so instead of drawing a part of the votes.
 */
// [alpha-2, numeric, the spellings after "abroad:"]
const COUNTRIES: Array<[string, string, ...string[]]> = [
  ["AF", "004", "afganistan", "teatrul-de-operatiuni-afganistan"],
  ["ZA", "710", "africa-de-sud"],
  ["AL", "008", "albania", "republica-albania"],
  ["DZ", "012", "algeria"],
  ["AO", "024", "angola", "republica-angola"],
  ["SA", "682", "arabia-saudita", "regatul-arabiei-saudite"],
  ["AR", "032", "argentina"],
  ["AM", "051", "armenia"],
  ["AU", "036", "australia"],
  ["AT", "040", "austria"],
  ["AZ", "031", "azerbaidjan"],
  ["BY", "112", "belarus", "republica-belarus"],
  ["BE", "056", "belgia"],
  ["BA", "070", "bosnia", "bosnia-hertegovina", "bosnia-herzegovina", "bosnia-si-hertegovina"],
  ["BR", "076", "brazilia"],
  ["BG", "100", "bulgaria", "republica-bulgaria"],
  ["CA", "124", "canada"],
  ["CZ", "203", "cehia", "republica-ceha"],
  ["CL", "152", "chile", "republica-chile"],
  ["CN", "156", "china", "republica-chineza", "republica-populara-chineza", "rep-populara-chineza"],
  ["CY", "196", "cipru", "republica-cipru"],
  ["CO", "170", "columbia", "republica-columbia"],
  ["KP", "408", "coreea-de-nord", "rpd-coreeana", "r-p-d-coreeana-coreea-de-nord"],
  ["KR", "410", "coreea-de-sud", "rep-coreea", "republica-coreea", "republica-coreea-coreea-de-sud"],
  ["HR", "191", "croatia", "republica-croatia"],
  ["CU", "192", "cuba"],
  ["DK", "208", "danemarca"],
  ["EG", "818", "egipt"],
  ["CH", "756", "elvetia"],
  ["AE", "784", "emiratele-arabe-unite"],
  ["EE", "233", "estonia"],
  ["ET", "231", "etiopia"],
  ["RU", "643", "federatia-rusa", "rusia", "rusia-federatie"],
  ["PH", "608", "filipine"],
  ["FI", "246", "finlanda"],
  ["FR", "250", "franta"],
  ["GE", "268", "georgia"],
  ["DE", "276", "germania", "republica-federala-germania"],
  ["GR", "300", "grecia", "republica-elena"],
  ["IN", "356", "india", "republica-india"],
  ["ID", "360", "indonezia", "republica-indonezia"],
  ["JO", "400", "iordania", "regatul-hasemit-al-iordaniei"],
  ["IQ", "368", "irak"],
  ["IR", "364", "iran", "republica-islamica-iran"],
  ["IE", "372", "irlanda"],
  ["IS", "352", "islanda"],
  ["IL", "376", "israel", "statul-israel"],
  ["IT", "380", "italia"],
  ["JP", "392", "japonia"],
  ["KZ", "398", "kazahstan", "republica-kazahstan"],
  ["KE", "404", "kenya"],
  ["XK", "XK", "teatrul-de-operatiuni-kosovo"],
  ["KW", "414", "kuwait", "kuweit"],
  ["LV", "428", "letonia"],
  ["LB", "422", "liban", "republica-libaneza"],
  ["LY", "434", "libia"],
  ["LT", "440", "lituania"],
  ["LU", "442", "luxemburg", "luxembourg"],
  ["MK", "807", "macedonia", "republica-macedonia-de-nord"],
  ["MY", "458", "malaezia", "malayezia", "malaysia"],
  ["ML", "466", "republica-mali"],
  ["MT", "470", "malta"],
  ["MA", "504", "maroc", "regatul-maroc"],
  ["MX", "484", "mexic"],
  ["MD", "498", "rep-moldova", "republica-moldova"],
  ["MC", "492", "principatul-monaco"],
  ["ME", "499", "muntenegru"],
  ["NG", "566", "nigeria", "republica-federala-nigeria"],
  ["NO", "578", "norvegia"],
  ["NZ", "554", "noua-zeelanda"],
  ["NL", "528", "olanda", "regatul-tarilor-de-jos"],
  ["OM", "512", "sultanatul-oman"],
  ["PK", "586", "pakistan", "republica-islamica-pakistan"],
  ["PS", "275", "palestina", "teritoriile-palestinie"],
  ["PE", "604", "peru", "republica-peru"],
  ["PL", "616", "polonia"],
  ["PT", "620", "portugalia"],
  ["QA", "634", "qatar"],
  ["SM", "674", "san-marino", "republica-san-marino"],
  ["SN", "686", "senegal"],
  ["RS", "688", "serbia", "republica-serbia"],
  ["SG", "702", "singapore", "republica-singapore"],
  ["SK", "703", "slovacia", "republica-slovaca"],
  ["SI", "705", "slovenia"],
  ["ES", "724", "spania"],
  ["LK", "144", "sri-lanka"],
  ["US", "840", "sua", "s-u-a", "statele-unite-ale-americii"],
  ["SD", "729", "sudan"],
  ["SE", "752", "suedia"],
  ["SY", "760", "siria", "republica-araba-siriana"],
  ["TH", "764", "thailanda", "regatul-thailandei"],
  ["TZ", "834", "republica-unita-tanzania"],
  ["TN", "788", "tunisia", "republica-tunisiana"],
  ["TR", "792", "turcia", "republica-turcia"],
  ["TM", "795", "turkmenistan"],
  ["UA", "804", "ucraina"],
  ["HU", "348", "ungaria"],
  ["GB", "826", "marea-britanie", "regatul-unit-al-marii-britanii-si-al-irlandei-de-nord", "regatul-unit-al-marii-britanii-si-irlandei-de-nord"],
  ["UY", "858", "uruguay", "republica-orientala-a-uruguayului"],
  ["UZ", "860", "uzbekistan"],
  ["VE", "862", "venezuela"],
  ["VN", "704", "vietnam", "republica-socialista-vietnam"],
  ["ZW", "716", "zimbabwe"]
];

const BY_SPELLING = new Map<string, { alpha2: string; numeric: string }>();
for (const [alpha2, numeric, ...spellings] of COUNTRIES) for (const spelling of spellings) BY_SPELLING.set(spelling, { alpha2, numeric });

/** The key of a country's sum, and the shape's id in the world file: the ISO numeric code ("XK" for Kosovo, which has none). */
export const countryKey = (numeric: string) => `iso:${numeric}`;

export interface AbroadByCountry {
  /** One area per country, `k` = `iso:<numeric>`, `n` = the ISO alpha-2 code (the name is worked out in the reader's language), `c` = 43. */
  countries: MapArea[];
  /** The places of the files that are in no country of the list, as the files print them. */
  left: MapArea[];
  /** The part of the valid votes abroad that is in a country: 1 when every place is. */
  coveredShare: number;
}

/** A country is drawn only when the list covers at least this part of the votes abroad; below it the files give places, not countries (2016). */
export const MIN_COVERED_SHARE = 0.9;

export function abroadByCountry(areas: MapArea[]): AbroadByCountry {
  const abroad = areas.filter((area) => area.c === 43);
  const { sums, left } = sumAreasBy(abroad, (area) => {
    const country = BY_SPELLING.get(area.k.replace(/^abroad:/, ""));
    return country ? { key: countryKey(country.numeric), name: country.alpha2 } : undefined;
  });
  const total = abroad.reduce((sum, area) => sum + area.v, 0);
  const covered = sums.reduce((sum, area) => sum + area.v, 0);
  return { countries: sums.sort((a, b) => b.v - a.v), left, coveredShare: total > 0 ? covered / total : 0 };
}

/** The country's name in the reader's language; the world file's own English name where the browser has none (Kosovo). */
export function countryName(alpha2: string, locale: "ro" | "en", fallback?: string): string {
  try {
    const name = new Intl.DisplayNames([locale], { type: "region", fallback: "none" }).of(alpha2);
    if (name && name !== alpha2) return name;
  } catch { /* an unknown code */ }
  return fallback ?? alpha2;
}
