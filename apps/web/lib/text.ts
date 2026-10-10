/**
 * Small text helpers for what the official sources print. The Chamber and the Senate still write the old cedilla letters (ş ţ) and county names in capitals;
 * the page shows the correct comma-below forms and ordinary capitalisation. The stored text is not changed.
 */
export function normalizeRomanian(value: string): string {
  return value.replace(/ş/g, "ș").replace(/Ş/g, "Ș").replace(/ţ/g, "ț").replace(/Ţ/g, "Ț");
}

/** Lower case without accents, for comparing and for addresses: "ARGEŞ" → "arges". */
export function foldKey(value: string | undefined | null): string {
  return (value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** "BISTRIŢA-NĂSĂUD" → "Bistrița-Năsăud". */
export function titleCaseRo(value: string): string {
  return normalizeRomanian(value)
    .toLocaleLowerCase("ro-RO")
    .replace(/(^|[\s\-/])(\p{L})/gu, (_, boundary: string, letter: string) => `${boundary}${letter.toLocaleUpperCase("ro-RO")}`);
}

export function countyLabel(constituency: string, locale: "ro" | "en"): string {
  const key = foldKey(constituency);
  if (key === "la nivel national") return locale === "ro" ? "Locuri naționale (minorități)" : "National seats (minorities)";
  if (key === "diaspora") return locale === "ro" ? "Diaspora" : "Diaspora";
  return titleCaseRo(constituency);
}

const SMALL_WORDS = new Set(["din", "de", "a", "al", "ai", "ale", "și", "pentru", "cu", "la", "în", "cel"]);
const ACRONYMS = new Set(["usr", "plus", "aur", "udmr", "psd", "pnl", "pmp", "alde", "ro.as.it."]);

/** A name the AEP prints in capitals, written the usual way: "ALIANȚA USR PLUS" → "Alianța USR PLUS", "UNIUNEA DEMOCRATĂ MAGHIARĂ DIN ROMÂNIA" → "Uniunea Democrată Maghiară din România", "BISTRIȚA-NĂSĂUD" → "Bistrița-Năsăud". */
export function officialCase(value: string): string {
  return normalizeRomanian(value).toLowerCase().split(/(\s+)/).map((word, index) => {
    if (/^\s+$/.test(word)) return word;
    if (ACRONYMS.has(word) || /^(\p{L}\.){2,}$/u.test(word)) return word.toUpperCase();
    if (index > 0 && SMALL_WORDS.has(word)) return word;
    return word.replace(/(^|[-“"(])(\p{L})/gu, (_, before: string, letter: string) => `${before}${letter.toUpperCase()}`);
  }).join("");
}
