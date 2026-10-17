import { sumAreasBy, type MapArea } from "./election-map";
import { placeOf } from "./places";

/**
 * The votes abroad, added up by country for the diaspora map. The AEP's files name the place of each polling station abroad, and the names are spelt several ways from one election to the next
 * ("FRANȚA", "Franţa", "FRANTA"), so an area's key (`abroad:` and the name without capitals or accents) is matched to a country through the list of places written by hand (`lib/places.ts`: ISO codes and
 * the spellings found in the files). A place that is not in the list is returned apart and counted, never given a country by guess; the 2016 files give the polling stations by city, not by country, and most of
 * them are not in the list for that reason: the map then says so instead of drawing a part of the votes.
 */
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
    const place = placeOf(area.k.replace(/^abroad:/, "").replace(/-/g, " "));
    return place?.numeric && place.iso2 ? { key: countryKey(place.numeric), name: place.iso2 } : undefined;
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
