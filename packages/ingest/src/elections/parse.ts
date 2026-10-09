/**
 * Sprint 15 (D-038): the readers of the election files. The AEP's CSVs come in three encodings (UTF-8 with a BOM, UTF-16, Windows-1250), with semicolons or commas, one row per polling
 * station and one column per list after the statistics columns a to g; the mandates come as a long CSV (2020) or a wide spreadsheet (2016).
 */
export function decodeElectionBytes(bytes: Buffer): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return bytes.subarray(2).toString("utf16le");
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return Buffer.from(bytes.subarray(2)).swap16().toString("utf16le");
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return bytes.subarray(3).toString("utf8");
  const asUtf8 = bytes.toString("utf8");
  // A file in Windows-1250 holds bytes that are not valid UTF-8; then each byte is a letter ("ţ" is 0xFE).
  return asUtf8.includes("�") ? new TextDecoder("windows-1250").decode(bytes) : asUtf8;
}

/** Rows of a delimited text; a field in double quotes may hold the delimiter, and "" is a quote. */
export function parseDelimited(text: string): string[][] {
  const firstLine = text.slice(0, text.indexOf("\n") === -1 ? text.length : text.indexOf("\n"));
  const delimiter = firstLine.split(";").length >= firstLine.split(",").length ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === delimiter) { row.push(field); field = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
    } else field += char;
  }
  row.push(field);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  return rows;
}

export interface ListVotes {
  circumscriptionNumber: number;
  circumscription: string;
  list: string;
  votes: number;
}

const isStatisticsColumn = (name: string) => /^[a-g]\d?$/i.test(name.trim());
const toInt = (value: string | undefined) => {
  const parsed = Number((value ?? "").trim());
  return Number.isFinite(parsed) ? Math.round(parsed) : 0;
};

/**
 * The votes of every list in every circumscription, summed over the polling stations of a file. The first columns name the circumscription; the columns after the last statistics column
 * (a, a1, ..., g) are the lists. A cell left empty is no vote.
 */
export function sumListVotes(rows: string[][]): ListVotes[] {
  const header = rows[0] ?? [];
  const number = header.findIndex((name) => /numar\s+circumscrip/i.test(name.normalize("NFD").replace(/\p{M}/gu, "")));
  const name = header.findIndex((value) => /denumire\s+circumscrip/i.test(value.normalize("NFD").replace(/\p{M}/gu, "")));
  if (number < 0 || name < 0) throw new Error("The file has no circumscription columns");
  let lastStatistic = -1;
  header.forEach((column, index) => { if (isStatisticsColumn(column)) lastStatistic = index; });
  if (lastStatistic < 0) throw new Error("The file has no statistics columns");
  const totals = new Map<string, ListVotes>();
  for (const row of rows.slice(1)) {
    const circumscriptionNumber = toInt(row[number]);
    if (!circumscriptionNumber) continue;
    const circumscription = (row[name] ?? "").trim();
    for (let column = lastStatistic + 1; column < header.length; column += 1) {
      const list = (header[column] ?? "").trim();
      if (!list) continue;
      const key = `${circumscriptionNumber}|${list}`;
      const entry = totals.get(key) ?? { circumscriptionNumber, circumscription, list, votes: 0 };
      entry.votes += toInt(row[column]);
      totals.set(key, entry);
    }
  }
  return [...totals.values()];
}

export interface ListMandates {
  circumscriptionNumber: number;
  circumscription: string;
  list: string;
  mandates: number;
}

/** The long form: circumscription number, name, list, mandates (2020). */
export function readMandatesLong(rows: string[][]): ListMandates[] {
  return rows.slice(1).flatMap((row) => {
    const circumscriptionNumber = toInt(row[0]);
    const mandates = toInt(row[3]);
    return circumscriptionNumber && row[2]?.trim() ? [{ circumscriptionNumber, circumscription: (row[1] ?? "").trim(), list: row[2]!.trim(), mandates }] : [];
  });
}

/** The wide form: a row per circumscription, a column per list (2016). */
export function readMandatesWide(rows: Array<Array<string | number>>): ListMandates[] {
  const header = (rows[0] ?? []).map(String);
  const out: ListMandates[] = [];
  for (const row of rows.slice(1)) {
    const circumscriptionNumber = toInt(String(row[0] ?? ""));
    if (!circumscriptionNumber) continue;
    for (let column = 2; column < header.length; column += 1) {
      const mandates = toInt(String(row[column] ?? ""));
      if (header[column]?.trim() && mandates > 0) out.push({ circumscriptionNumber, circumscription: String(row[1] ?? "").trim(), list: header[column]!.trim(), mandates });
    }
  }
  return out;
}
