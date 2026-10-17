/**
 * The places a diplomatic post or a polling station abroad can be: countries (with their ISO 3166-1 codes), the Holy See, two states that no longer exist, and the international organisations Romania keeps a permanent mission to.
 * Sources spell them in many ways ("FRANȚA", "Franţa", "Republica Franceză", "Franța"), so each place carries the spellings found in the President's decrees and in the AEP's election files, written by hand;
 * a spelling is compared without accents, capitals or punctuation. A phrase that is in no list is not given a place by guess (the callers keep it apart and count it).
 */
export type PlaceKind = "country" | "holy-see" | "historical" | "organisation";

export interface Place {
  /** The address-safe key: the lower-case ISO alpha-2 code for a country ("it"), a short word for the rest ("un-ny"). */
  key: string;
  kind: PlaceKind;
  /** ISO 3166-1 alpha-2 (upper case) for a country; the name is worked out from it in the reader's language. */
  iso2?: string;
  /** ISO 3166-1 numeric: the id of the shape in the world file ("XK" for Kosovo, which has none). */
  numeric?: string;
  nameRo: string;
  nameEn: string;
  /** The flag file in /flags (without .svg), where a flag exists. */
  flag?: string;
}

/** A phrase compared without accents, capitals or punctuation: "Republica Franceză" and "REPUBLICA FRANCEZA" are one. */
export function normalizePlace(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

// [alpha-2, numeric, ...spellings]
type CountryRow = [string, string, ...string[]];
const COUNTRIES: CountryRow[] = [
  ["AD", "020", "andorra", "principatul andorra", "principatul andorrei"],
  ["AE", "784", "emiratele arabe unite"],
  ["AF", "004", "afganistan", "teatrul de operatiuni afganistan"],
  ["AG", "028", "antigua si barbuda"],
  ["AL", "008", "albania", "republica albania"],
  ["AM", "051", "armenia", "republica armenia"],
  ["AO", "024", "angola", "republica angola"],
  ["AR", "032", "argentina", "republica argentina"],
  ["AT", "040", "austria", "republica austria"],
  ["AU", "036", "australia"],
  ["AZ", "031", "azerbaidjan", "republica azerbaidjan"],
  ["BA", "070", "bosnia", "bosnia si hertegovina", "bosnia si herzegovina", "bosnia hertegovina", "bosnia herzegovina", "republica bosnia hertegovina"],
  ["BB", "052", "barbados"],
  ["BD", "050", "bangladesh", "republica populara bangladesh"],
  ["BE", "056", "belgia", "regatul belgiei"],
  ["BF", "854", "burkina faso", "statul burkina faso"],
  ["BG", "100", "bulgaria", "republica bulgaria"],
  ["BH", "048", "bahrain", "regatul bahrain"],
  ["BI", "108", "burundi", "republica burundi"],
  ["BJ", "204", "benin", "republica benin", "republica populara benin"],
  ["BN", "096", "brunei darussalam", "sultanatul brunei darussalam"],
  ["BO", "068", "bolivia", "statul plurinational al boliviei"],
  ["BR", "076", "brazilia", "republica federativa a braziliei"],
  ["BS", "044", "bahamas", "comunitatea bahamas", "federatia bahamas"],
  ["BT", "064", "bhutan", "regatul bhutan"],
  ["BW", "072", "botswana", "republica botswana"],
  ["BY", "112", "belarus", "republica belarus"],
  ["BZ", "084", "belize"],
  ["CA", "124", "canada"],
  ["CF", "140", "republica centrafricana", "r centrafricana", "centrafrica"],
  ["CG", "178", "republica congo", "congo"],
  ["CD", "180", "republica democratica congo", "republica zair"],
  ["CH", "756", "elvetia", "confederatia elvetiana"],
  ["CI", "384", "cote d ivoire", "republica cote d ivoire", "cote divoire", "republica coasta de fildes", "coasta de fildes"],
  ["CL", "152", "chile", "republica chile"],
  ["CM", "120", "camerun", "republica camerun"],
  ["CN", "156", "china", "republica chineza", "republica populara chineza", "rep populara chineza"],
  ["CO", "170", "columbia", "colombia", "republica columbia"],
  ["CR", "188", "costa rica", "republica costa rica"],
  ["CU", "192", "cuba", "republica cuba"],
  ["CV", "132", "republica capului verde", "capul verde", "cabo verde", "republica cabo verde"],
  ["CY", "196", "cipru", "republica cipru"],
  ["CZ", "203", "cehia", "republica ceha"],
  ["DE", "276", "germania", "republica federala germania"],
  ["DJ", "262", "republica djibouti", "djibouti"],
  ["DK", "208", "danemarca", "regatul danemarcei"],
  ["DM", "212", "commonwealth dominica", "uniunea dominica", "dominica"],
  ["DO", "214", "republica dominicana"],
  ["DZ", "012", "algeria", "republica algeriana democratica si populara", "republica algeriana democrata si populara"],
  ["EC", "218", "ecuador", "republica ecuador"],
  ["EE", "233", "estonia", "republica estonia"],
  ["EG", "818", "egipt", "republica araba egipt"],
  ["ER", "232", "eritreea", "statul eritreea"],
  ["ES", "724", "spania", "regatul spaniei"],
  ["ET", "231", "etiopia", "republica federala democrata a etiopiei"],
  ["FI", "246", "finlanda", "republica finlanda"],
  ["FJ", "242", "fiji", "republica fiji"],
  ["FM", "583", "statele federate ale microneziei", "micronesia"],
  ["FR", "250", "franta", "republica franceza"],
  ["GA", "266", "gabon", "republica gaboneza"],
  ["GB", "826", "marea britanie", "regatul unit", "regatul unit al marii britanii si irlandei de nord", "regatul unit al marii britanii si al irlandei de nord"],
  ["GD", "308", "grenada"],
  ["GE", "268", "georgia", "republica georgia"],
  ["GH", "288", "ghana", "republica ghana"],
  ["GM", "270", "gambia", "republica gambia"],
  ["GN", "324", "guineea", "republica guineea"],
  ["GQ", "226", "republica guineea ecuatoriala"],
  ["GR", "300", "grecia", "republica elena"],
  ["GT", "320", "guatemala", "republica guatemala"],
  ["GW", "624", "guineea bissau", "republica guineea bissau"],
  ["GY", "328", "guyana", "republica guyana", "republica cooperatista guyana"],
  ["HN", "340", "honduras", "republica honduras"],
  ["HR", "191", "croatia", "republica croatia"],
  ["HT", "332", "haiti"],
  ["HU", "348", "ungaria", "republica ungara"],
  ["ID", "360", "indonezia", "republica indonezia"],
  ["IE", "372", "irlanda", "republica irlanda"],
  ["IL", "376", "israel", "statul israel"],
  ["IN", "356", "india", "republica india"],
  ["IQ", "368", "irak", "republica irak"],
  ["IR", "364", "iran", "republica islamica iran"],
  ["IS", "352", "islanda", "republica islanda"],
  ["IT", "380", "italia", "republica italiana"],
  ["JM", "388", "jamaica"],
  ["JO", "400", "iordania", "regatul hasemit al iordaniei"],
  ["JP", "392", "japonia"],
  ["KE", "404", "kenya", "kenia", "republica kenya"],
  ["KG", "417", "republica kargaza", "kargazstan", "republica kirgizstan", "kirgizstan", "republica kirghiza"],
  ["KH", "116", "cambodgia", "regatul cambodgiei"],
  ["KI", "296", "kiribati", "republica kiribati"],
  ["KM", "174", "uniunea comorelor", "comore"],
  ["KN", "659", "federatia sfantul cristofor si nevis", "federatia saint kitts si nevis", "saint kitts si nevis"],
  ["KP", "408", "coreea de nord", "rpd coreeana", "r p d coreeana coreea de nord", "republica populara democrata coreeana"],
  ["KR", "410", "coreea de sud", "rep coreea", "republica coreea", "republica coreea coreea de sud"],
  ["KW", "414", "kuweit", "kuwait", "statul kuweit", "statul kuwait"],
  ["KZ", "398", "kazahstan", "republica kazahstan"],
  ["LA", "418", "laos", "republica democrata si populara laos", "republica democratica si populara laos", "republica democrata populara laos", "republica democratica populara laos", "republica populara democrata laos", "republica populara democratica laos"],
  ["LR", "430", "liberia", "republica liberia"],
  ["MW", "454", "malawi", "republica malawi"],
  ["VC", "670", "saint vincent si grenadine", "saint vincent", "sfantul vincent si grenadinele"],
  ["LB", "422", "liban", "republica liban", "republica libaneza"],
  ["LC", "662", "saint lucia"],
  ["LI", "438", "liechtenstein", "principatul liechtenstein"],
  ["LK", "144", "sri lanka", "republica democratica socialista sri lanka", "republica democrata socialista sri lanka"],
  ["LS", "426", "lesotho", "regatul lesotho"],
  ["LT", "440", "lituania", "republica lituania"],
  ["LU", "442", "luxemburg", "luxembourg", "marele ducat de luxemburg", "marele ducat al luxemburgului"],
  ["LV", "428", "letonia", "republica letonia"],
  ["LY", "434", "libia", "statul libia", "marea jamahirie araba libiana populara socialista"],
  ["MA", "504", "maroc", "regatul maroc"],
  ["MC", "492", "monaco", "principatul monaco"],
  ["MD", "498", "rep moldova", "republica moldova"],
  ["ME", "499", "muntenegru", "republica muntenegru"],
  ["MG", "450", "madagascar", "republica madagascar"],
  ["MH", "584", "republica insulelor marshall", "insulele marshall"],
  ["MK", "807", "macedonia", "republica macedonia", "fosta republica iugoslava a macedoniei", "republica macedonia fosta republica iugoslava a macedoniei", "republica macedonia de nord"],
  ["ML", "466", "mali", "republica mali"],
  ["MM", "104", "myanmar", "uniunea myanmar", "republica uniunea myanmar"],
  ["MN", "496", "mongolia", "republica populara mongolia"],
  ["MR", "478", "mauritania", "republica islamica mauritania"],
  ["MT", "470", "malta", "republica malta"],
  ["MU", "480", "mauritius", "republica mauritius"],
  ["MV", "462", "maldive", "republica maldivelor"],
  ["MX", "484", "mexic", "statele unite mexicane"],
  ["MY", "458", "malaezia", "malayezia", "malaysia"],
  ["MZ", "508", "mozambic", "republica mozambic"],
  ["NA", "516", "namibia", "republica namibia"],
  ["NE", "562", "niger", "republica niger"],
  ["NG", "566", "nigeria", "republica nigeria", "republica federala nigeria"],
  ["NI", "558", "nicaragua", "republica nicaragua"],
  ["NL", "528", "olanda", "regatul tarilor de jos", "regatul tarilor de jos olanda"],
  ["NO", "578", "norvegia", "regatul norvegiei"],
  ["NP", "524", "nepal", "republica federala democratica nepal", "republica federala nepal"],
  ["NR", "520", "nauru", "republica nauru"],
  ["NZ", "554", "noua zeelanda"],
  ["OM", "512", "oman", "sultanatul oman"],
  ["PA", "591", "panama", "republica panama"],
  ["PE", "604", "peru", "republica peru"],
  ["PG", "598", "papua noua guinee", "statul independent papua noua guinee"],
  ["PH", "608", "filipine", "republica filipine", "republica filipinelor"],
  ["PK", "586", "pakistan", "republica islamica pakistan"],
  ["PL", "616", "polonia", "republica polona"],
  ["PS", "275", "palestina", "teritoriile palestinie", "teritoriile palestiniene"],
  ["PT", "620", "portugalia", "republica portugheza"],
  ["PW", "585", "palau", "republica palau"],
  ["PY", "600", "paraguay", "republica paraguay"],
  ["QA", "634", "qatar", "statul qatar"],
  ["RS", "688", "serbia", "republica serbia"],
  ["RU", "643", "rusia", "rusia federatie", "federatia rusa"],
  ["RW", "646", "rwanda", "republica rwanda", "republica ruandeza"],
  ["SA", "682", "arabia saudita", "regatul arabiei saudite"],
  ["SB", "090", "insulele solomon"],
  ["SC", "690", "seychelles", "republica seychelles"],
  ["SD", "729", "sudan", "republica sudan"],
  ["SE", "752", "suedia", "regatul suediei"],
  ["SG", "702", "singapore", "republica singapore"],
  ["SI", "705", "slovenia", "republica slovenia"],
  ["SK", "703", "slovacia", "republica slovaca"],
  ["SL", "694", "sierra leone", "republica sierra leone"],
  ["SM", "674", "san marino", "republica san marino"],
  ["SN", "686", "senegal", "republica senegal"],
  ["ST", "678", "sao tome si principe", "republica democrata sao tome si principe"],
  ["SO", "706", "somalia", "republica somalia"],
  ["SR", "740", "surinam", "suriname", "republica surinam", "republica suriname"],
  ["SS", "728", "sudanul de sud", "republica sudanul de sud"],
  ["SV", "222", "el salvador", "republica el salvador"],
  ["SY", "760", "siria", "republica araba siriana"],
  ["SZ", "748", "eswatini", "swaziland", "regatul eswatini", "regatul swaziland"],
  ["TD", "148", "ciad", "republica ciad"],
  ["TG", "768", "togo", "republica togoleza"],
  ["TH", "764", "thailanda", "regatul thailandei"],
  ["TJ", "762", "tadjikistan", "republica tadjikistan"],
  ["TL", "626", "timorul de est", "republica democrata a timorului de est"],
  ["TM", "795", "turkmenistan"],
  ["TN", "788", "tunisia", "republica tunisiana"],
  ["TO", "776", "tonga", "regatul tonga"],
  ["TR", "792", "turcia", "republica turcia"],
  ["TT", "780", "republica trinidad si tobago", "trinidad si tobago", "republica trinidad tobago"],
  ["TV", "798", "tuvalu"],
  ["TZ", "834", "tanzania", "republica unita a tanzaniei", "republica unita tanzania"],
  ["UA", "804", "ucraina"],
  ["UG", "800", "uganda", "republica uganda"],
  ["US", "840", "sua", "s u a", "statele unite ale americii"],
  ["UY", "858", "uruguay", "republica orientala a uruguayului"],
  ["UZ", "860", "uzbekistan", "republica uzbekistan"],
  ["VE", "862", "venezuela", "republica venezuela", "republica bolivariana a venezuelei", "republica bolivariana venezuela"],
  ["VN", "704", "vietnam", "republica socialista vietnam"],
  ["VU", "548", "vanuatu", "republica vanuatu"],
  ["WS", "882", "samoa", "statul independent samoa", "insulele samoa"],
  ["XK", "XK", "kosovo", "teatrul de operatiuni kosovo"],
  ["YE", "887", "yemen", "republica yemen"],
  ["ZA", "710", "africa de sud", "republica africa de sud"],
  ["ZM", "894", "zambia", "republica zambia"],
  ["ZW", "716", "zimbabwe", "republica zimbabwe"]
];

const OTHERS: Array<Place & { spellings: string[] }> = [
  { key: "va", kind: "holy-see", iso2: "VA", numeric: "336", nameRo: "Sfântul Scaun", nameEn: "The Holy See", flag: "va", spellings: ["sfantul scaun", "sfantu scaun", "vatican"] },
  { key: "yu", kind: "historical", nameRo: "Iugoslavia (până în 2003)", nameEn: "Yugoslavia (until 2003)", spellings: ["republica federala iugoslavia", "republica socialista federativa iugoslavia", "iugoslavia"] },
  { key: "cs", kind: "historical", nameRo: "Serbia și Muntenegru (2003–2006)", nameEn: "Serbia and Montenegro (2003–2006)", spellings: ["serbia si muntenegru"] },
  { key: "un-ny", kind: "organisation", nameRo: "Organizația Națiunilor Unite (New York)", nameEn: "United Nations (New York)", flag: "un", spellings: ["organizatia natiunilor unite de la new york", "organizatia natiunilor unite", "onu new york"] },
  { key: "un-ge", kind: "organisation", nameRo: "Organizația Națiunilor Unite (Geneva)", nameEn: "United Nations (Geneva)", flag: "un", spellings: ["misiunea permanenta a romaniei pe langa o n u de la geneva", "misiunea permanenta de la geneva", "oficiul natiunilor unite de la geneva si organizatiile internationale", "oficiul natiunilor unite de la geneva"] },
  { key: "un-geneva-offices", kind: "organisation", nameRo: "Oficiul Națiunilor Unite și instituțiile specializate (Geneva)", nameEn: "UN Office and specialised agencies (Geneva)", flag: "un", spellings: ["oficiul natiunilor unite si institutiile specializate", "oficiul natiunilor unite si institutiile specializate geneva"] },
  { key: "un-vienna", kind: "organisation", nameRo: "Organizațiile internaționale de la Viena", nameEn: "International organisations in Vienna", flag: "un", spellings: ["organizatiile internationale de la viena", "organizatiile internationale si negocierile multilaterale de la viena", "organizatiile internationale si negocierile de la viena"] },
  { key: "unesco", kind: "organisation", nameRo: "UNESCO (Paris)", nameEn: "UNESCO (Paris)", spellings: ["unesco", "delegatia permanenta a romaniei pe langa unesco paris", "delegatia permanenta a romaniei pe langa unesco"] },
  { key: "coe", kind: "organisation", nameRo: "Consiliul Europei (Strasbourg)", nameEn: "Council of Europe (Strasbourg)", spellings: ["consiliul europei", "consiliul europei de la strasbourg"] },
  { key: "nato", kind: "organisation", nameRo: "NATO (Bruxelles)", nameEn: "NATO (Brussels)", spellings: ["nato", "nato si sef al delegatiei permanente a romaniei la nato"] },
  { key: "eu", kind: "organisation", nameRo: "Uniunea Europeană (Bruxelles)", nameEn: "European Union (Brussels)", flag: "eu", spellings: ["uniunea europeana de la bruxelles", "uniunea europeana", "comunitatile europene si alte organisme internationale", "comunitatile europene"] },
  { key: "blacksea", kind: "organisation", nameRo: "Organizația Cooperării Economice la Marea Neagră", nameEn: "Black Sea Economic Cooperation Organisation", spellings: ["organizatia cooperarii economice la marea neagra o c e m n", "organizatia cooperarii economice la marea neagra"] },
  { key: "smom", kind: "organisation", nameRo: "Ordinul Suveran Militar de Malta", nameEn: "Sovereign Military Order of Malta", spellings: ["ordinul suveran militar de malta", "ordinul suveran de malta"] }
];

const BY_SPELLING = new Map<string, Place>();
const BY_KEY = new Map<string, Place>();

function register(place: Place, spellings: string[]) {
  BY_KEY.set(place.key, place);
  for (const spelling of spellings) BY_SPELLING.set(normalizePlace(spelling), place);
}

for (const [iso2, numeric, ...spellings] of COUNTRIES) {
  register({ key: iso2.toLowerCase(), kind: "country", iso2, numeric, nameRo: iso2, nameEn: iso2, flag: iso2.toLowerCase() }, spellings);
}
for (const { spellings, ...place } of OTHERS) register(place, spellings);

/** The place a phrase names, or nothing. A leading "Republica", "Regatul" or "Statul" is tried off when the whole phrase is in no list. */
export function placeOf(phrase: string): Place | undefined {
  const normal = normalizePlace(phrase);
  if (!normal) return undefined;
  const direct = BY_SPELLING.get(normal);
  if (direct) return direct;
  const stripped = normal.replace(/^(republica|regatul|statul|principatul|sultanatul) /, "");
  return stripped === normal ? undefined : BY_SPELLING.get(stripped);
}

export function placeByKey(key: string): Place | undefined {
  return BY_KEY.get(key);
}

export function allPlaces(): Place[] {
  return [...BY_KEY.values()];
}

/** A place's name in the reader's language: from the ISO code through the browser's own names for a country, as written here for the rest. */
export function placeName(place: Place, locale: "ro" | "en"): string {
  if (place.kind === "country" && place.iso2) {
    if (place.iso2 === "XK") return "Kosovo";
    try {
      const name = new Intl.DisplayNames([locale], { type: "region", fallback: "none" }).of(place.iso2);
      if (name && name !== place.iso2) return name;
    } catch { /* an unknown code */ }
    return place.iso2;
  }
  return locale === "ro" ? place.nameRo : place.nameEn;
}
