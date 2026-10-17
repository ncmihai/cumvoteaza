import * as cheerio from "cheerio";
import { createHash } from "node:crypto";
import { parseCvUpdatedOn } from "./profile-facts";

/**
 * D-050 (reopening D-036): the CV a member filed with the Chamber, read into entries of three sections: professional experience, education, and social and political
 * activity. The text of an entry is kept as filed (whitespace tidied, nothing added). Dates are read only where the entry starts with a date or a range; an entry
 * whose dates are unclear keeps them as text and has no parsed dates. Everything outside those three sections is dropped, which is what keeps the personal-information
 * block (contact details, family) out: it is never read into an entry. Lines that look like an e-mail address or a phone number are dropped as well, wherever they are.
 *
 * The pages use at least five layouts (Europass tables with a "Perioada" row, tables with the dates in the left column, paragraphs separated by blank lines,
 * lists of "date, line break, role", and free lines), so the page is first flattened to lines, then cut into entries by the same few rules for every layout.
 */

export type CvSection = "experience" | "education" | "political";
export type DatePrecision = "day" | "month" | "year";

export interface CvDate { date: string; precision: DatePrecision }

export interface CvEntry {
  section: CvSection;
  /** Order in the CV within its section, from 0. */
  position: number;
  lines: string[];
  rawText: string;
  datesText?: string;
  starts?: CvDate;
  ends?: CvDate;
  /** The range ends with "prezent" or "în curs". */
  isCurrent: boolean;
  contentHash: string;
}

export interface ParsedCv {
  updatedOn?: string;
  entries: CvEntry[];
  /** Headings the page has, as printed, for the report (the ones read and the ones skipped). */
  headings: Array<{ text: string; read: CvSection | undefined }>;
  /** Lines dropped because they looked like contact details. */
  droppedContactLines: number;
}

const HEADING = "§§ ";
const CELL = " ⟂ ";

const FOLD: Record<string, string> = { ş: "s", ș: "s", Ş: "s", Ș: "s", ţ: "t", ț: "t", Ţ: "t", Ț: "t", ă: "a", Ă: "a", â: "a", Â: "a", î: "i", Î: "i", ã: "a" };
/** Lower case without Romanian diacritics, one character for one, so positions in the folded text are positions in the original. */
export function foldRo(text: string): string {
  return [...text].map((char) => FOLD[char] ?? char.toLowerCase()).join("");
}

const SECTION_HEADINGS: Array<[CvSection, RegExp]> = [
  ["experience", /^(experien\w*(\s+(profesional\w*|de munca))?|activitat\w*\s+profesional\w*|cariera\s+profesional\w*)\b/],
  ["education", /^(educat\w*|studii|pregatire|formare(\s+profesional\w*)?|instruire)\b/],
  // The Chamber's own variants of "social and political activity": party posts, posts in an organisation, civic activity.
  ["political", /^(activit\w*\s+(sociale?\s+)?(si\s+)?politic\w*|cariera\s+politic\w*|activitate\s+sociala\s+si\s+politica|functii,?\s+activitati\s+intr-(un|o)\s+(partid|organizatie)\w*|activitate\s+civica)\b/]
];

function classifyHeading(text: string): CvSection | undefined {
  const folded = foldRo(text).replace(/\s+/g, " ").trim();
  return SECTION_HEADINGS.find(([, pattern]) => pattern.test(folded))?.[0];
}

const MONTH_NAMES = "ianuarie|februarie|martie|aprilie|mai|iunie|iulie|august|septembrie|octombrie|noiembrie|decembrie";
const MONTH_ABBREVIATIONS = "ian|feb|mar|apr|iun|iul|aug|sept|sep|oct|noi|nov|dec";
const MONTH_NUMBERS: Record<string, number> = { ianuarie: 1, ian: 1, februarie: 2, feb: 2, martie: 3, mar: 3, aprilie: 4, apr: 4, mai: 5, iunie: 6, iun: 6, iulie: 7, iul: 7, august: 8, aug: 8, septembrie: 9, sept: 9, sep: 9, octombrie: 10, oct: 10, noiembrie: 11, noi: 11, nov: 11, decembrie: 12, dec: 12 };

const DAY = String.raw`\d{1,2}[./]\d{1,2}[./]\d{4}`;
const DAY_MONTH_NAME_YEAR = String.raw`\d{1,2}\s+(?:${MONTH_NAMES}|${MONTH_ABBREVIATIONS})\.?\s+\d{4}`;
const MONTH_YEAR_NUMERIC = String.raw`\d{1,2}[./]\d{4}`;
const MONTH_YEAR_NAME = String.raw`(?:${MONTH_NAMES}|${MONTH_ABBREVIATIONS})\.?\s*\d{4}`;
const YEAR = String.raw`(?:19|20)\d{2}`;
const ONE_DATE = String.raw`(?:${DAY}|${DAY_MONTH_NAME_YEAR}|${MONTH_YEAR_NAME}|${MONTH_YEAR_NUMERIC}|${YEAR})`;
const PRESENT = String.raw`(?:in\s+prezent|prezent|in\s+curs|actual|prezent)`;
const RANGE = new RegExp(String.raw`(?<![\d./])(${ONE_DATE})\s*(?:-|–|—|pana\s+(?:in|la)|/)\s*(${ONE_DATE}|${PRESENT})(?![\d])`);
/** The line with every date and "prezent" taken out, folded: what is left is the words (the role, the employer). */
export function withoutDates(line: string): string {
  return foldRo(line).replace(new RegExp(String.raw`(?<![\d./])${ONE_DATE}(?![\d])`, "g"), " ").replace(new RegExp(String.raw`\b${PRESENT}\b`, "g"), " ").replace(/[\s,;:()\-–—/]+/g, " ").trim();
}

const LEADING_DATE = new RegExp(String.raw`^\s*(${ONE_DATE})(?![\d./])`);

function parseOneDate(token: string): CvDate | undefined {
  const text = token.trim().replace(/\s+/g, " ");
  let match = new RegExp(`^(\\d{1,2})[./](\\d{1,2})[./](\\d{4})$`).exec(text);
  if (match) {
    const [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
    return { date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`, precision: "day" };
  }
  match = new RegExp(`^(\\d{1,2})\\s+(${MONTH_NAMES}|${MONTH_ABBREVIATIONS})\\.?\\s+(\\d{4})$`).exec(text);
  if (match) {
    const [day, month, year] = [Number(match[1]), MONTH_NUMBERS[match[2]!]!, Number(match[3])];
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
    return { date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`, precision: "day" };
  }
  match = /^(\d{1,2})[./](\d{4})$/.exec(text);
  if (match) {
    const [month, year] = [Number(match[1]), Number(match[2])];
    return month >= 1 && month <= 12 ? { date: `${year}-${String(month).padStart(2, "0")}-01`, precision: "month" } : undefined;
  }
  match = new RegExp(`^(${MONTH_NAMES}|${MONTH_ABBREVIATIONS})\\.?\\s*(\\d{4})$`).exec(text);
  if (match) return { date: `${match[2]}-${String(MONTH_NUMBERS[match[1]!]).padStart(2, "0")}-01`, precision: "month" };
  match = /^(\d{4})$/.exec(text);
  return match ? { date: `${match[1]}-01-01`, precision: "year" } : undefined;
}

/** The dates of an entry from its first two lines, and the text they were read from. `undefined` when no range or leading year is there, or when they contradict each other. */
export function parseEntryDates(lines: string[]): { datesText: string; starts?: CvDate; ends?: CvDate; isCurrent: boolean } | undefined {
  const head = lines.slice(0, 2).join("\n");
  const folded = foldRo(head);
  const range = RANGE.exec(folded);
  if (range) {
    const datesText = head.slice(range.index, range.index + range[0].length).trim();
    const starts = parseOneDate(range[1]!);
    const endToken = range[2]!;
    const isCurrent = new RegExp(`^${PRESENT}$`).test(endToken);
    const ends = isCurrent ? undefined : parseOneDate(endToken);
    // Ranges that run backwards, or years outside the plausible span, are read as unclear rather than corrected.
    const thisYear = new Date().getUTCFullYear();
    const plausible = (value?: CvDate) => !value || (Number(value.date.slice(0, 4)) >= 1940 && Number(value.date.slice(0, 4)) <= thisYear + 1);
    if (!starts || (!isCurrent && !ends) || !plausible(starts) || !plausible(ends) || (ends && ends.date < starts.date)) return { datesText, isCurrent: false };
    return { datesText, starts, ...(ends ? { ends } : {}), isCurrent };
  }
  const lone = LEADING_DATE.exec(folded);
  if (lone) {
    const starts = parseOneDate(lone[1]!);
    const datesText = head.slice(lone.index + lone[0].indexOf(lone[1]!), lone.index + lone[0].indexOf(lone[1]!) + lone[1]!.length);
    return starts ? { datesText, starts, isCurrent: false } : { datesText, isCurrent: false };
  }
  return undefined;
}

const EUROPASS_LABEL = /^(perioada|functia(\s+sau\s+postul\s+ocupat)?|postul\s+ocupat|principalele\s+(activitati|responsabilitati)[\w\s,şșţț]*|numele\s+si\s+adresa\s+angajatorului|numele\s+si\s+tipul\s+institutiei[\w\s,]*|tipul\s+activitatii\s+sau\s+sectorul\s+de\s+activitate|calificarea\s*\/?\s*diploma\s+obtinuta|domeniul[\w\s\/]*|nivelul\s+in\s+clasificarea[\w\s,]*|locul\s+de\s+munca|angajator|firma|departament|oras\s+lucru|tipul\s+de\s+activitate|disciplinele\s+principale[\w\s\/,]*|competente\s+profesionale\s+dobandite)\s*:?$/;
export const CONTACT_LINE = /@|\b(?:tel|telefon|fax|mobil|gsm|e-?mail)\b\s*[.:]|(?:\+|00)?40[\s.-]?\d[\d\s.-]{7,}|\b0\d{2,3}[\s.-]?\d{3}[\s.-]?\d{3,4}\b/i;
/** What the Chamber's page prints after the CV: the postal address and the time the page was made. It is never part of an entry. */
const FOOTER_LINE = /^(adresa\s+postala|data\s+actualizare|(luni|marti|miercuri|joi|vineri|sambata|duminica),?\s+\d{1,2}\s+[a-z]+\s+\d{4})/;
// Personal data is never kept, wherever the page prints it: marital and family status, sex, birth date and place, nationality, citizenship, home address.
export const FAMILY_LINE = /^(stare\s+civila|copii|numar\s+copii|statut\s+familial|sexul?|data\s+nasterii|locul\s+nasterii|nationalitatea|cetatenia|domiciliul|adresa\s+de\s+domiciliu)\b/;

/** The page as lines: headings marked, table cells of a row joined, breaks kept as empty lines (they separate entries). */
export function flatten(html: string): string[] {
  const $ = cheerio.load(html);
  $("script, style, noscript").remove();
  // A line break between blocks is the page's own separator between entries ("¶"); one inside a list item or a table cell only ends a line.
  $("br").each((_, element) => { $(element).replaceWith($(element).closest("li, td, th").length ? "\n" : "\n¶\n"); });
  // A heading is the banner div of the Chamber's CV pages (bandaCV, bandaCV2025) or a left-column cell printed as a heading.
  // The heading's own tags (h3, b) would each start a line, so its text is collapsed to one string first.
  const markHeading = (element: Parameters<typeof $>[0]) => { const text = $(element).text().replace(/\s+/g, " ").trim(); $(element).empty().text(`${HEADING}${text}`); };
  $("div[id^='bandaCV']").each((_, element) => { markHeading(element); });
  $("td h3.maj").each((_, element) => { if (!$(element).closest("div[id^='bandaCV']").length) markHeading(element); });
  $("p, li, div, h1, h2, h3, h4, ul, ol, table").each((_, element) => { $(element).prepend("\n").append("\n"); });
  // A table row becomes one line, "label ⟂ value", the value's own lines following; so the label stays with the first line of its value.
  $("tr").each((_, row) => {
    const cells = $(row).children("td, th").toArray().map((cell) => $(cell).text());
    if (cells.length >= 2) {
      const head = cells.slice(0, -1).map((text) => text.replace(/\s+/g, " ").trim());
      $(row).empty().text(`\n${head.join(CELL)}${CELL}${cells.at(-1)!.replace(/^\s+/, "")}\n`);
    } else $(row).prepend("\n").append("\n");
  });
  const lines = $.root().text().replace(/ /g, " ").split("\n").map((line) => line.replace(/\s+/g, " ").trim());
  // Block boundaries leave empty lines that mean nothing; only the explicit breaks ("¶") separate entries.
  const flattened: string[] = [];
  for (const raw of lines) {
    if (raw === "") continue;
    const line = raw === "¶" ? "" : raw;
    if (line === "" && (flattened.length === 0 || flattened.at(-1) === "")) continue;
    flattened.push(line);
  }
  return flattened;
}

export const hash = (text: string) => createHash("sha1").update(text).digest("hex").slice(0, 16);

export function parseCv(html: string): ParsedCv {
  const lines = flatten(html);
  const headings: ParsedCv["headings"] = [];
  const entries: CvEntry[] = [];
  let section: CvSection | undefined;
  let current: string[] | undefined;
  let droppedContactLines = 0;
  const counters: Record<CvSection, number> = { experience: 0, education: 0, political: 0 };

  const close = () => {
    if (current && section) {
      const kept = current.filter((line) => line !== "");
      if (kept.some((line) => /\p{L}{3}/u.test(line))) {
        const clipped = kept.slice(0, 40);
        const rawText = clipped.join("\n").slice(0, 2000);
        const dates = parseEntryDates(clipped);
        entries.push({
          section, position: counters[section]++, lines: clipped, rawText,
          ...(dates ? { datesText: dates.datesText, ...(dates.starts ? { starts: dates.starts } : {}), ...(dates.ends ? { ends: dates.ends } : {}) } : {}),
          isCurrent: dates?.isCurrent ?? false,
          contentHash: hash(rawText)
        });
      }
    }
    current = undefined;
  };
  const open = (first?: string) => { close(); current = first === undefined ? [] : [first]; };

  for (const original of lines) {
    if (original.startsWith(HEADING)) {
      close();
      const [title, ...rest] = original.slice(HEADING.length).split(CELL);
      const text = (title ?? "").trim();
      section = classifyHeading(text);
      headings.push({ text, read: section });
      // A heading in the left cell of a table row can carry the section's first content in the right cell.
      const inline = rest.join(" ").trim();
      if (section && inline) open(inline);
      continue;
    }
    if (!section) continue;
    if (FOOTER_LINE.test(foldRo(original))) { close(); section = undefined; continue; }
    if (CONTACT_LINE.test(original)) { droppedContactLines += 1; continue; }
    if (FAMILY_LINE.test(foldRo(original))) continue;

    if (original === "") { close(); continue; }

    if (original.includes(CELL)) {
      const [labelRaw, ...valueParts] = original.split(CELL);
      const label = (labelRaw ?? "").trim();
      const value = valueParts.join(" ").replace(/\s+/g, " ").trim();
      const foldedLabel = foldRo(label).replace(/\s+/g, " ");
      if (EUROPASS_LABEL.test(foldedLabel)) {
        // A "Perioada" row starts an entry; the other labelled rows (post, employer, sector) join the entry in progress.
        if (/^perioada\b/.test(foldedLabel)) open(value || undefined);
        else if (value) (current ??= []).push(value);
        continue;
      }
      if (label === "" || /^[-–—]+$/.test(label)) { if (value) (current ??= []).push(value); continue; }
      if (RANGE.test(foldRo(label)) || LEADING_DATE.test(foldRo(label))) {
        // The dates are in the left column: the row is one entry, dates first.
        open(label);
        if (value) current!.push(...value.split(/\n/).map((part) => part.trim()).filter(Boolean));
        continue;
      }
      (current ??= []).push(value ? `${label}: ${value}` : label);
      continue;
    }

    if (EUROPASS_LABEL.test(foldRo(original))) continue;

    const folded = foldRo(original);
    const startsWithDate = (RANGE.exec(folded)?.index ?? 99) < 3 || (LEADING_DATE.test(folded) && /^\s*(?:\d{1,2}[./]){0,2}(?:19|20)\d{2}\s*(?:-|–|—|\s|$)|^\s*(?:[a-z]+\.?)\s*(?:19|20)\d{2}\s*(?:-|–|—|$)/.test(folded));
    if (current === undefined || startsWithDate) open(original);
    else current.push(original);
  }
  close();
  return { ...(parseCvUpdatedOn(cheerio.load(html).root().text()) ? { updatedOn: parseCvUpdatedOn(cheerio.load(html).root().text())! } : {}), entries, headings, droppedContactLines };
}
