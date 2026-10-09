/** Letters without accents, lower case, single spaces: how titles and names are compared. */
export const fold = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
