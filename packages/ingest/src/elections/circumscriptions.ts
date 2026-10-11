const plain = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** The 43 circumscriptions of the parliamentary elections, which the presidential results also use for the counties (Bucharest 42, abroad 43). */
export const COUNTY_NAMES = ["ALBA", "ARAD", "ARGEŞ", "BACĂU", "BIHOR", "BISTRIŢA-NĂSĂUD", "BOTOŞANI", "BRAŞOV", "BRĂILA", "BUZĂU", "CARAŞ-SEVERIN", "CĂLĂRAŞI", "CLUJ", "CONSTANŢA", "COVASNA", "DÂMBOVIŢA", "DOLJ", "GALAŢI", "GIURGIU", "GORJ", "HARGHITA", "HUNEDOARA", "IALOMIŢA", "IAŞI", "ILFOV", "MARAMUREŞ", "MEHEDINŢI", "MUREŞ", "NEAMŢ", "OLT", "PRAHOVA", "SATU MARE", "SĂLAJ", "SIBIU", "SUCEAVA", "TELEORMAN", "TIMIŞ", "TULCEA", "VASLUI", "VÂLCEA", "VRANCEA", "MUNICIPIUL BUCUREŞTI"];

export function circumscriptionOfCounty(name: string): number | undefined {
  const folded = plain(name);
  if (/^(municipiul )?bucuresti$/.test(folded)) return 42;
  const at = COUNTY_NAMES.findIndex((county) => plain(county) === folded);
  return at < 0 ? undefined : at + 1;
}

