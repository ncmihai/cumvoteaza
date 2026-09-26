/** Search normalization only; official display spelling remains untouched. */
export function normalizeVoteSearch(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("ro").trim();
}

export function matchesVoteSearch(query: string, fields: Array<string | undefined>): boolean {
  const haystack = normalizeVoteSearch(fields.filter(Boolean).join(" "));
  return normalizeVoteSearch(query).split(/\s+/).every((term) => haystack.includes(term));
}
