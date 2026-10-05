const FULL: Record<string, string> = {
  ianuarie: "01", februarie: "02", martie: "03", aprilie: "04", mai: "05", iunie: "06",
  iulie: "07", august: "08", septembrie: "09", octombrie: "10", noiembrie: "11", decembrie: "12"
};
const SHORT: Record<string, string> = {
  ian: "01", feb: "02", mar: "03", apr: "04", mai: "05", iun: "06", iul: "07", aug: "08", sep: "09", oct: "10", noi: "11", dec: "12"
};

const normalise = (value: string) => value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\./g, "").trim();

/** "decembrie 2024" or "dec. 2024" -> "2024-12"; anything else -> undefined. */
export function monthFromText(value: string): string | undefined {
  const match = normalise(value).match(/^([a-z]+)\s+(\d{4})$/);
  if (!match) return undefined;
  const month = FULL[match[1]!] ?? SHORT[match[1]!];
  return month ? `${match[2]}-${month}` : undefined;
}

/** "feb. - sep. 2025" / "dec 2024 - feb 2025" style periods; the first month may lack its year. */
export function monthRangeFromText(value: string): { from?: string; to?: string | null } {
  const text = normalise(value);
  const range = text.match(/^([a-z]+)(?:\s+(\d{4}))?\s*-\s*([a-z]+)(?:\s+(\d{4}))?$/);
  if (!range) return {};
  const toYear = range[4];
  const fromYear = range[2] ?? toYear;
  const from = fromYear ? monthFromText(`${range[1]} ${fromYear}`) : undefined;
  const to = range[3] === "prezent" ? null : toYear ? monthFromText(`${range[3]} ${toYear}`) : undefined;
  return { from, to };
}
