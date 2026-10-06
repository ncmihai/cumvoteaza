import { slugify } from "../parsers/utils";

/** D-029: one row per organisation, whatever the legislature. */
export type PartyKind = "party" | "minority_organisation" | "minority_group" | "independent" | "unaffiliated";

/** The Chamber still prints the old cedilla letters (ş ţ); the comma-below forms (ș ț) are the correct ones. Only the display changes, the source stays as printed. */
export function normalizeRomanian(value: string): string {
  return value.replace(/ş/g, "ș").replace(/Ş/g, "Ș").replace(/ţ/g, "ț").replace(/Ţ/g, "Ț");
}

function fold(value: string): string {
  return normalizeRomanian(value).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Organisations that start like a minority association but are parties. */
const NOT_MINORITY = new Set(["uniunea-nationala-pentru-progresul-romaniei"]);

export function classifyOrganisation(name: string): PartyKind {
  const folded = fold(name);
  if (/^independent\b/.test(folded)) return "independent";
  if (/^fara adeziune\b/.test(folded)) return "unaffiliated";
  if (/^minoritati\b/.test(folded)) return "minority_group";
  if (/^(uniunea|asociatia|comunitatea|federatia|forumul|liga|partida romilor)\b/.test(folded) && !NOT_MINORITY.has(slugify(folded))) return "minority_organisation";
  return "party";
}

/** "FD", "PLS", "PPU-SL": the Chamber prints only the abbreviation, so the full name is not known. A real one-word name such as "PRO România" is not an abbreviation. */
export function isAbbreviationOnly(name: string, shortName: string): boolean {
  const value = name.trim();
  return value === shortName.trim() && !/\s/.test(value) && /^[A-ZĂÂÎȘȚŞŢ0-9][A-ZĂÂÎȘȚŞŢ0-9.'\-]*$/.test(value);
}

/** The key two spellings of one organisation share across legislatures. Independents and unaffiliated members get one key each. */
export function organisationKey(name: string): string {
  const kind = classifyOrganisation(name);
  if (kind === "independent") return "independent";
  if (kind === "unaffiliated") return "fara-adeziune";
  return slugify(normalizeRomanian(name));
}

export interface OrganisationIdentity {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  kind: PartyKind;
  fullNameKnown: boolean;
}

export function organisationIdentity(label: string, shortName: string): OrganisationIdentity {
  const name = normalizeRomanian(label.trim());
  const short = normalizeRomanian(shortName.trim());
  const key = organisationKey(name);
  return { id: `party-org-${key}`, slug: key, name, shortName: short, kind: classifyOrganisation(name), fullNameKnown: !isAbbreviationOnly(name, short) };
}
