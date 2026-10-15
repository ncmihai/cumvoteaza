import type { PartyDirectoryEntry } from "./directory-data";

/**
 * The parties list shows the national-minority organisations that have had a member (D-050): the Chamber names 31, and 13 of them never had one (spelling and branch variants
 * of an organisation that did, or bodies that never won a seat). Those stay reachable by their address and are not listed. A hidden variant's name still finds the
 * organisation it is a variant of.
 */
export function neverRepresented(entry: Pick<PartyDirectoryEntry, "kind" | "deputies" | "senators" | "legislatures">): boolean {
  return entry.kind === "minority_organisation" && entry.deputies + entry.senators === 0 && entry.legislatures.length === 0;
}

/** Organisation (slug) → the other spellings the Chamber prints for the same body, which the directory search also matches. */
export const MINORITY_ALIASES: Record<string, string[]> = {
  "asociatia-liga-albanezilor-din-romania": ["Liga Albanezilor din România"],
  "asociatia-partida-romilor-pro-europa": ["Partida Romilor"],
  "comunitatea-rusilor-lipoveni-din-romania": ["Comunitatea Lipovenilor din România"],
  "uniunea-bulgara-din-banat-romania": ["Uniunea Bulgară din Banat - Asociația Culturală Bulgară din București"]
};

export function searchTextOf(entry: Pick<PartyDirectoryEntry, "shortName" | "name" | "slug">): string {
  return [entry.shortName, entry.name, ...(MINORITY_ALIASES[entry.slug] ?? [])].join(" ");
}
