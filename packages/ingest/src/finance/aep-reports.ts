import path from "node:path";
import * as cheerio from "cheerio";
import { FetchStoppedError, PoliteFetcher } from "../coverage/polite-fetcher";
import { decodeOfficialBytes, RawCache } from "../coverage/raw-cache";
import { decreePageText } from "../presidency/decree-texts";
import { fold } from "../presidency/text";

/**
 * Party money, from the Permanent Electoral Authority's reports in the Official Gazette (Sprint 15 follow-up). The AEP's own finance site and portal answer programs with a browser check (never
 * bypassed), but every report the AEP publishes after a control mission is also an act on the legislative portal (issuer 288), as an extract of a few paragraphs: for a party and a year the income
 * by source (dues, donations, loans, the state subsidy, other), the expenses, and the articles of Law 334/2006 the control found broken. Each page is saved byte for byte; the numbers are read from
 * the sentences the AEP writes, never estimated, and a report whose sentences are not the ones read here is left out with its reason.
 */
export const AEP_EMITENT = 288;
const BASE = "https://legislatie.just.ro/Public/RezultateCautare";
export const reportListUrl = (title: string, page: number) => `${BASE}?rezultatePerPagina=5&page=${page}&sectiuneact=${AEP_EMITENT}&titlu=${encodeURIComponent(title)}`;
export const reportPageUrl = (portalId: string) => `https://legislatie.just.ro/Public/DetaliiDocument/${portalId}`;
export const reportPageKey = (portalId: string) => `r${portalId}`;
export const reportListKey = (title: string, page: number) => `${fold(title).replace(/[^a-z0-9]+/g, "-")}-p${page}`;

/** The annual control reports: "în urma verificării respectării prevederilor legale privind veniturile și cheltuielile Partidului X în anul 2020". */
export const ANNUAL_TITLE = "respectării prevederilor legale";

const MONTHS: Record<string, string> = { ianuarie: "01", februarie: "02", martie: "03", aprilie: "04", mai: "05", iunie: "06", iulie: "07", august: "08", septembrie: "09", octombrie: "10", noiembrie: "11", decembrie: "12" };
const isoOf = (day: string, month: string, year: string) => (MONTHS[fold(month)] ? `${year}-${MONTHS[fold(month)]}-${day.padStart(2, "0")}` : undefined);

export interface ReportListItem {
  portalId: string;
  number: string;
  issuedOn: string;
  /** What follows the date: "în urma verificării respectării prevederilor legale privind ... în anul 2020". */
  title: string;
  gazetteNumber?: string;
  gazetteOn?: string;
}

export function parseReportList(html: string): { total: number; items: ReportListItem[] } {
  const $ = cheerio.load(html);
  const total = Number(/(\d+)\s*document\(e\)\s*g[aă]sit/i.exec($("body").text().replace(/\s+/g, " "))?.[1] ?? 0);
  const items: ReportListItem[] = [];
  $(".search_result_item").each((_, element) => {
    const portalId = /DetaliiDocument\/(\d+)/.exec($(element).find("a[href^='/Public/DetaliiDocument/']").first().attr("href") ?? "")?.[1];
    const block = $(element).find("p").eq(1).clone();
    block.find("br").replaceWith(" ");
    const text = block.text().replace(/[ ﻿]/g, " ").replace(/\s+/g, " ").trim();
    const head = /RAPORT(?:E)?\s*(?:nr\.\s*([\d.]+)\s*)?din\s+(\d{1,2})\s+([A-Za-zăâîșşțţĂÂÎȘŞȚŢ]+)\s+(\d{4})\s*(.*?)\s*(?:EMITENT|$)/s.exec(text);
    if (!head || !portalId) return;
    const issuedOn = isoOf(head[2]!, head[3]!, head[4]!);
    if (!issuedOn) return;
    const published = /PUBLICAT\s+[ÎI]N:?\s*MONITORUL\s+OFICIAL\s+nr\.\s*(\d+)\s+din\s+(\d{1,2})\s+([A-Za-zăâîșşțţ]+)\s+(\d{4})/i.exec(text);
    items.push({
      portalId,
      number: (head[1] ?? "").replace(/\./g, ""),
      issuedOn,
      title: head[5]!.replace(/\s+/g, " ").trim(),
      ...(published ? { gazetteNumber: published[1]!, gazetteOn: isoOf(published[2]!, published[3]!, published[4]!) ?? undefined } : {})
    });
  });
  return { total, items };
}

/** Where the money came from, as the AEP's own words are sorted. */
export type IncomeKind = "dues" | "donations" | "loans" | "subsidy" | "refund" | "interest" | "other";

export interface IncomeLine {
  /** The AEP's own words ("venituri din cotizații"). */
  label: string;
  kind: IncomeKind;
  lei: number;
}

export interface AnnualReport {
  party: string;
  year: number;
  /** Undefined where the report gives no figures (see `note`). */
  incomeTotal?: number;
  income: IncomeLine[];
  /** What the report says in place of figures ("did not submit the documents"). */
  note?: string;
  expensesTotal?: number;
  /** The articles of Law 334/2006 the control found broken, as the report lists them; empty when it found none. */
  violations: string[];
  noViolations: boolean;
  /** True when the lines add up to the total (a line the report leaves out would show here). */
  linesAddUp: boolean;
}

/** "147.419.259,28" → 147419259.28 */
export const leiOf = (value: string) => (value.includes(",") ? Number(value.replace(/\./g, "").replace(",", ".")) : Number(value.replace(/\./g, "")));

export function incomeKindOf(label: string): IncomeKind {
  const folded = fold(label);
  if (/rambursare/.test(folded)) return "refund";
  if (/subven|bugetul de stat/.test(folded)) return "subsidy";
  if (/cotiza/.test(folded)) return "dues";
  if (/donat/.test(folded)) return "donations";
  if (/imprumut/.test(folded)) return "loans";
  if (/fara scop patrimonial/.test(folded)) return "other";
  if (/dobanz/.test(folded)) return "interest";
  return "other";
}

/**
 * One annual report's text: "Partidul X a obținut în anul 2020 venituri aferente activității curente în sumă totală de 147.419.259,28 lei, astfel: 10.488.373,77 lei reprezentând venituri din cotizații,
 * ... Cheltuielile aferente activității curente au fost în sumă totală de 136.220.834,19 lei. ... au fost încălcate prevederile art. 3 alin. (2), ... din Legea nr. 334/2006". Undefined when the
 * report does not have this shape (a control with other findings is not guessed at).
 */
export function parseAnnualReport(text: string): AnnualReport | undefined {
  const head = /(?:veniturile\s+și\s+cheltuielile|veniturile\s+si\s+cheltuielile)\s+(.+?)\s+în\s+anul\s+(\d{4})/i.exec(text) ?? /înregistrate\s+de\s+(.+?)\s+în\s+anul\s+(\d{4})/i.exec(text);
  // The title writes the party in the genitive ("Partidului Social Democrat"); the body names it as it is called ("Partidul Social Democrat a obținut").
  const named = /(?:înregistrate\s+de|constatat\s+că)\s+((?:Partidul|Alianța|Uniunea|Organizația|Forumul|Asociația|Federația|Comunitatea)\s+.{3,120}?)(?:\s+în\s+(?:anul|anii|perioada)|\s+a\s+obținut)/.exec(text)?.[1];
  const total = /venituri(?:\s+aferente\s+activității\s+curente)?\s+în\s+sumă\s+totală\s+de\s+([\d.]+,\d{2})\s+lei(?:\s*,?\s*astfel\s*:)?([^]*?)(?:Cheltuielile\b|$)/i.exec(text);
  if (!head || !total) return undefined;
  const lines: IncomeLine[] = [];
  for (const match of total[2]!.matchAll(/([\d.]+,\d{2})\s+lei\s*(?:reprezentând|-|–)\s*([^]*?)(?=,?\s*(?:și\s+)?[\d.]+,\d{2}\s+lei|\.\s*$|$)/g)) {
    const label = match[2]!.replace(/\s+/g, " ").replace(/[.,;\s]+$/, "").trim();
    if (label) lines.push({ label, kind: incomeKindOf(label), lei: leiOf(match[1]!) });
  }
  const incomeTotal = leiOf(total[1]!);
  const expenses = /Cheltuielile[^.]*?\s+au\s+fost\s+în\s+sumă\s+totală\s+de\s+([\d.]+,\d{2})\s+lei/i.exec(text);
  const broken = /au\s+fost\s+încălcate\s+prevederile\s+(.+?)\s+din\s+Legea\s+nr\.\s*334\/2006/i.exec(text);
  const violations = broken ? broken[1]!.split(/,\s*(?=(?:ale\s+)?art\.)|\s+și\s+(?:ale\s+)?(?=art\.)/).map((part) => part.replace(/\s+/g, " ").replace(/^ale\s+/, "").trim()).filter(Boolean) : [];
  const sum = Math.round(lines.reduce((acc, line) => acc + line.lei, 0) * 100) / 100;
  return {
    party: cleanParty(named ?? nominative(head[1]!)),
    year: Number(head[2]),
    incomeTotal,
    income: lines,
    ...(expenses ? { expensesTotal: leiOf(expenses[1]!) } : {}),
    violations,
    noViolations: /nu\s+s-au\s+constatat\s+încălcări/i.test(text),
    linesAddUp: lines.length > 0 && Math.abs(sum - incomeTotal) < 0.05
  };
}

/** One control mission's report: the party, the years it covers (income and expenses of each), the articles found broken and the sanction. */
export interface ControlReport {
  party: string;
  years: AnnualReport[];
  violations: string[];
  noViolations: boolean;
  /** The fine ("a fost sancționat cu amendă în cuantum de ...") and the sum ordered confiscated, where the report names them. */
  fineLei?: number;
  confiscatedLei?: number;
  /** True when the party registered no income and no expenses in the period the report covers. */
  nothingRegistered: boolean;
}

const bulletLines = (body: string): IncomeLine[] => {
  const pieces = body.replace(/\s*\.\.\.\s*/g, " ").split(/\s*[–]\s*(?=\d[\d.]*,\d{2}\s+lei)/).slice(1);
  const lines: IncomeLine[] = [];
  let childrenLeft = 0;
  for (const piece of pieces) {
    const match = /^([\d.]+,\d{2})\s+lei\s*[-–]\s*(.*?)\s*[;:.]*\s*$/.exec(piece.trim());
    if (!match) continue;
    const lei = leiOf(match[1]!);
    const label = match[2]!.replace(/\s+/g, " ").trim();
    if (childrenLeft > 0.05) {
      // A line under "din care:" is part of its parent; the parent itself is not counted twice.
      lines.push({ label, kind: incomeKindOf(label), lei });
      childrenLeft -= lei;
      continue;
    }
    if (/din care\s*:?$/i.test(label)) {
      childrenLeft = lei;
      continue;
    }
    lines.push({ label, kind: incomeKindOf(label), lei });
  }
  return lines;
};

/**
 * A report in the form of the 2025 and 2026 controls: one paragraph per year ("În anul 2023, veniturile obținute de Partidul X au fost în valoare totală de 49.264.863,89 lei, după cum urmează:
 * – 2.919.659,09 lei - venituri din cotizații; ...") and a sentence per year for the expenses ("Cheltuielile efectuate în anul 2023 de Partidul X sunt în cuantum de ..."), then the sanctions.
 */
function parseYearParagraphs(text: string): ControlReport | undefined {
  const sections = [...text.matchAll(/În\s+anul\s+(\d{4}),\s+veniturile\s+obținute\s+de\s+(.+?)\s+au\s+fost\s+în\s+valoare\s+totală\s+de\s+([\d.]+,\d{2})\s+lei,?\s*după\s+cum\s+urmează\s*:([^]*?)(?=În\s+anul\s+\d{4},\s+veniturile|Cheltuielile\s+efectuate|II\.\s*Sancțiuni|$)/g)];
  if (sections.length === 0) return undefined;
  const expenses = new Map<number, number>();
  for (const match of text.matchAll(/Cheltuielile\s+efectuate\s+în\s+anul\s+(\d{4})\s+de\s+.+?\s+sunt\s+în\s+cuantum\s+de\s+([\d.]+,\d{2})\s+lei/g)) expenses.set(Number(match[1]), leiOf(match[2]!));
  const years: AnnualReport[] = sections.map((section) => {
    const lines = bulletLines(section[4]!);
    const incomeTotal = leiOf(section[3]!);
    const sum = Math.round(lines.reduce((acc, line) => acc + line.lei, 0) * 100) / 100;
    const expensesTotal = expenses.get(Number(section[1]));
    return { party: section[2]!.replace(/\s+/g, " ").trim(), year: Number(section[1]), incomeTotal, income: lines, ...(expensesTotal === undefined ? {} : { expensesTotal }), violations: [], noViolations: false, linesAddUp: lines.length > 0 && Math.abs(sum - incomeTotal) < 0.05 };
  });
  return { party: years[0]!.party, years, ...sanctionsOf(text), nothingRegistered: false };
}

function sanctionsOf(text: string): Pick<ControlReport, "violations" | "noViolations" | "fineLei" | "confiscatedLei"> {
  const broken = /(?:au\s+fost\s+încălcate\s+prevederile|pentru\s+nerespectarea\s+prevederilor)\s+(.+?)\s+din\s+Legea\s+nr\.\s*334\/2006/i.exec(text);
  const fine = /sancționat[ăa]?\s+cu\s+amendă\s+în\s+(?:cuantum|sumă)\s+de\s+([\d.]+(?:,\d{2})?)\s+(?:de\s+)?lei/i.exec(text);
  const confiscated = /confiscarea\s+sumei\s+de\s+([\d.]+,\d{2})\s+lei/i.exec(text);
  return {
    violations: broken ? broken[1]!.split(/,\s*(?=(?:ale\s+)?art\.)|\s+și\s+(?:ale\s+)?(?=art\.)/).map((part) => part.replace(/\s+/g, " ").replace(/^ale\s+/, "").trim()).filter(Boolean) : [],
    noViolations: /nu\s+s-au\s+constatat\s+încălcări|II\.\s*Sancțiuni\s+aplicate\s+Nu\s+a\s+fost\s+cazul/i.test(text),
    ...(fine ? { fineLei: leiOf(fine[1]!) } : {}),
    ...(confiscated ? { confiscatedLei: leiOf(confiscated[1]!) } : {})
  };
}

const GENITIVE: Array<[RegExp, string]> = [[/^Partidului\b/, "Partidul"], [/^Uniunii\b/, "Uniunea"], [/^Alianței\b/, "Alianța"], [/^Alianţei\b/, "Alianța"], [/^Organizației\b/, "Organizația"], [/^Forumului\b/, "Forumul"], [/^Asociației\b/, "Asociația"], [/^Federației\b/, "Federația"], [/^Comunității\b/, "Comunitatea"]];
const cleanParty = (name: string) => name.replace(/\s*-?\s*extras\b.*$/i, "").replace(/\s+în\s+(?:anul|anii|perioada)\b.*$/i, "").replace(/[\s,.;:-]+$/, "").replace(/\s+/g, " ").trim();
const nominative = (name: string) => GENITIVE.reduce((acc, [pattern, to]) => acc.replace(pattern, to), cleanParty(name)).replace(/^Uniunea Democrate Maghiare\b/, "Uniunea Democrată Maghiară");

/** The years a title or sentence names: "în anul 2018", "în anii 2017-2018", "în anii 2019 și 2020", "în perioada 1.01.2023-31.12.2024". */
export function yearsOf(text: string): number[] {
  const range = /perioada(?:\s+controlată,?\s+respectiv|\s+verificată\s+fiind)?\s+\d{1,2}\.\d{1,2}\.(\d{4})\s*-\s*\d{1,2}\.\d{1,2}\.(\d{4})/.exec(text) ?? /anii\s+(\d{4})\s*-\s*(\d{4})/.exec(text);
  if (range) return Array.from({ length: Number(range[2]) - Number(range[1]) + 1 }, (_, index) => Number(range[1]) + index);
  return [...new Set([...text.matchAll(/(?:anul|anii|anului)\s+(\d{4})(?:\s*(?:și|şi)\s*(?:în\s+anul\s+)?(\d{4}))?/g)].flatMap((match) => [Number(match[1]), ...(match[2] ? [Number(match[2])] : [])]))];
}

const amountPattern = "([\\d.]+(?:,\\d{1,2})?)";

/**
 * The older and the shorter reports write sentences, not lists: "pentru anul 2018 veniturile Partidului X au totalizat 53.304.092,41 lei, fiind obținute din cotizații în sumă de 6.794.189,66 lei,
 * donații în sumă de ...", "Cheltuielile au fost în sumă de 16.362.796,77 lei", "formațiunea politică nu a declarat venituri și cheltuieli pentru anii 2019 și 2020", "nu a transmis documentele".
 * Only the figures a sentence gives are taken; a year with none gets the report's note.
 */
function parseSentenceReport(text: string): ControlReport | undefined {
  const title = /privind\s+veniturile\s+și\s+cheltuielile\s+(?:înregistrate\s+de\s+)?(.+?)\s+în\s+(?:anul|anii|perioada)\b/i.exec(text) ?? /veniturile\s+și\s+cheltuielile\s+(?:înregistrate\s+de\s+)?(.+?)\s+în\s+(?:anul|anii|perioada)/i.exec(text);
  if (!title) return undefined;
  const party = nominative(title[1]!);
  const heading = /RAPORT[^]*?(?:în\s+(?:anul|anii|perioada)[^]*?)(?=EMITENT)/.exec(text)?.[0] ?? "";
  const titleYears = yearsOf(heading);
  // The findings follow the last "Constatări" (the first is in the page's table of contents).
  const marks = [...text.matchAll(/Constat[aă]ri\s*:?/g)];
  const start = marks.length ? marks[marks.length - 1]!.index! : -1;
  const ends = [...text.slice(Math.max(start, 0)).matchAll(/În\s+urma\s+controlului\s+efectuat|II\.\s*Sancțiuni|București,\s+\d/g)];
  if (start < 0) return undefined;
  const segment = text.slice(start, ends.length ? start + ends[0]!.index! : undefined);
  const years = new Map<number, AnnualReport>();
  const ensure = (year: number) => {
    let row = years.get(year);
    if (!row) {
      row = { party, year, income: [], violations: [], noViolations: false, linesAddUp: false };
      years.set(year, row);
    }
    return row;
  };
  let current: number | undefined = titleYears.length === 1 ? titleYears[0] : undefined;
  for (const sentence of segment.split(/\.\s+(?=[A-ZĂÂÎȘȚ])/)) {
    const named = yearsOf(sentence.replace(/^.*?(?=\b(?:pentru|în)\s+anul)/, ""));
    const income = new RegExp(`veniturile[^]*?(?:au\\s+totalizat|în\\s+cuantum\\s+total\\s+de|în\\s+valoare\\s+totală\\s+de)\\s+${amountPattern}\\s+lei([^]*)$`, "i").exec(sentence);
    if (income) {
      const year = named[0] ?? current ?? titleYears[0];
      if (year === undefined) continue;
      current = year;
      const row = ensure(year);
      row.incomeTotal = leiOf(income[1]!);
      let from = 0;
      const tail = income[2]!;
      for (const item of tail.matchAll(/în\s+sumă\s+de\s+([\d.]+(?:,\d{1,2})?)\s+lei/g)) {
        const label = tail.slice(from, item.index).replace(/^[\s,]*(?:și\s+|fiind\s+obținute\s+din\s+|și\s+au\s+fost\s+obținute\s+din\s+|din\s+care\s*:\s*|obținute\s+din\s+)*/i, "").replace(/[\s,]+$/, "").trim();
        from = item.index! + item[0].length;
        if (label) row.income.push({ label, kind: incomeKindOf(label), lei: leiOf(item[1]!) });
      }
      const sum = Math.round(row.income.reduce((acc, line) => acc + line.lei, 0) * 100) / 100;
      row.linesAddUp = row.income.length > 0 && Math.abs(sum - row.incomeTotal) < 0.05;
      continue;
    }
    const expenses = new RegExp(`^Cheltuielile(?:\\s+totale)?(?:\\s+în\\s+anul\\s+(\\d{4}))?\\s+(?:au\\s+fost\\s+în\\s+sumă\\s+de|au\\s+totalizat)\\s+${amountPattern}\\s+lei`, "i").exec(sentence.trim());
    if (expenses) {
      const year = expenses[1] ? Number(expenses[1]) : current;
      if (year !== undefined) ensure(year).expensesTotal = leiOf(expenses[2]!);
      continue;
    }
    const zero = /nu\s+a\s+(?:avut|înregistrat|obținut)\s+venituri|s-a\s+înființat[^]*?nu\s+a\s+avut\s+venituri/i.test(sentence);
    const spent = /efectuat\s+cheltuieli\s+în\s+sumă\s+de\s+([\d.]+(?:,\d{1,2})?)\s+lei/i.exec(sentence);
    const note = /nu\s+a\s+(?:transmis|depus)\b/i.test(sentence) ? "The party did not send the documents the AEP asked for, so the control could not check its income and expenses."
      : /nu\s+a\s+declarat\s+venituri/i.test(sentence) ? "The party declared no income or expenses."
      : zero ? "The party had no income and no expenses in the period."
      : undefined;
    if (note) {
      for (const year of (named.length ? named : titleYears)) {
        const row = ensure(year);
        row.note = note;
        if (zero) { row.incomeTotal = 0; row.expensesTotal = spent ? leiOf(spent[1]!) : 0; row.linesAddUp = true; }
      }
    }
  }
  const rows = [...years.values()].sort((a, b) => a.year - b.year);
  return rows.length ? { party, years: rows, ...sanctionsOf(text), nothingRegistered: rows.every((row) => row.incomeTotal === undefined || row.incomeTotal === 0) } : undefined;
}

/** Every shape of annual control report we read: one year in a sentence (2019 to 2021), a paragraph per year (2025, 2026), or "no income, no expenses". Undefined for any other text. */
export function parseControlReport(text: string): ControlReport | undefined {
  const single = parseAnnualReport(text);
  if (single) return { party: single.party, years: [single], nothingRegistered: false, ...sanctionsOf(text), violations: single.violations.length ? single.violations : sanctionsOf(text).violations, noViolations: single.noViolations || sanctionsOf(text).noViolations };
  const paragraphs = parseYearParagraphs(text);
  if (paragraphs) return paragraphs;
  const sentences = parseSentenceReport(text);
  if (sentences) return sentences;
  const empty = /(?:înregistrate\s+de|echipa\s+de\s+control\s+a\s+constatat\s+că)\s+(.+?)\s+(?:în\s+(?:anul|perioada)|nu\s+a\s+înregistrat)/i.exec(text);
  const none = /nu\s+a\s+înregistrat\s+venituri\s+și\s+nu\s+a\s+efectuat\s+cheltuieli/i.test(text);
  const year = /perioada\s+verificată\s+fiind\s+1\.01\.(\d{4})-31\.12\.(\d{4})/i.exec(text) ?? /în\s+anul\s+(\d{4})/i.exec(text);
  if (none && empty && year) {
    const party = (/(?:Partidul|Alianța|Uniunea|Organizația|Forumul|Asociația|Federația|Comunitatea)\s+[^,.]+?(?=\s+nu\s+a\s+înregistrat)/.exec(text)?.[0] ?? empty[1]!).replace(/\s+/g, " ").trim();
    const first = Number(year[1]);
    const last = Number(year[2] ?? year[1]);
    const years = Array.from({ length: last - first + 1 }, (_, index) => ({ party, year: first + index, incomeTotal: 0, income: [], expensesTotal: 0, violations: [], noViolations: true, linesAddUp: true }));
    return { party, years, ...sanctionsOf(text), nothingRegistered: true };
  }
  return undefined;
}

export interface FetchReportsResult {
  listed: number;
  pagesCached: number;
  pagesMissing: number;
  requested: number;
  failed: string[];
  stoppedBy?: string;
}

/** Saves the result lists of the annual reports and the page of each report, one request at a time, `delayMs` apart. Without `live` it only counts what is saved. */
export async function fetchAnnualReports(options: { repoRoot: string; live: boolean; delayMs?: number; limit?: number; log?: (line: string) => void }): Promise<FetchReportsResult> {
  const cache = new RawCache(path.join(options.repoRoot, "data/coverage/raw"));
  const fetcher = new PoliteFetcher({ maxRequests: options.limit ?? 400, delayMs: options.delayMs ?? 3000, timeoutMs: 90_000, retries: 1 });
  const result: FetchReportsResult = { listed: 0, pagesCached: 0, pagesMissing: 0, requested: 0, failed: [] };
  try {
    const ids = new Set<string>();
    for (let page = 1; page <= 20; page += 1) {
      const key = reportListKey(ANNUAL_TITLE, page);
      let html: string | undefined;
      const saved = await cache.read("legislatie-aep-list", key);
      if (saved) html = decodeOfficialBytes(saved);
      else if (options.live) {
        const url = reportListUrl(ANNUAL_TITLE, page);
        const response = await fetcher.get(url);
        result.requested += 1;
        if (response.status !== 200) throw new Error(`The portal answered ${response.status} for ${key}`);
        await cache.write("legislatie-aep-list", key, response.body, { url, status: 200 });
        html = decodeOfficialBytes(response.body, response.contentType);
      }
      if (!html) break;
      const parsed = parseReportList(html);
      for (const item of parsed.items) ids.add(item.portalId);
      if (parsed.items.length === 0 || page * 50 >= parsed.total) break;
    }
    result.listed = ids.size;
    for (const id of ids) {
      if (await cache.has("legislatie-aep-report", reportPageKey(id))) {
        result.pagesCached += 1;
        continue;
      }
      result.pagesMissing += 1;
      if (!options.live) continue;
      try {
        const response = await fetcher.get(reportPageUrl(id));
        result.requested += 1;
        if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
        if (!/RAPORT/i.test(decodeOfficialBytes(response.body, response.contentType))) throw new Error("the page is not a report");
        await cache.write("legislatie-aep-report", reportPageKey(id), response.body, { url: reportPageUrl(id), status: 200 });
        result.pagesMissing -= 1;
        result.pagesCached += 1;
        options.log?.(`saved report ${id}`);
      } catch (error) {
        if (error instanceof FetchStoppedError) throw error;
        result.failed.push(id);
      }
    }
  } catch (error) {
    if (error instanceof FetchStoppedError) result.stoppedBy = error.message;
    else throw error;
  }
  return result;
}

export interface ReadReport {
  portalId: string;
  report?: ControlReport;
  /** Why a saved page gave no report. */
  skipped?: string;
  title: string;
  issuedOn?: string;
  gazetteNumber?: string;
  gazetteOn?: string;
  number?: string;
}

/** The annual reports in the saved pages, each with its list entry (date, gazette). */
export async function readAnnualReports(repoRoot: string): Promise<ReadReport[]> {
  const cache = new RawCache(path.join(repoRoot, "data/coverage/raw"));
  const entries = new Map<string, ReportListItem>();
  for (const key of await cache.keys("legislatie-aep-list")) {
    const bytes = await cache.read("legislatie-aep-list", key);
    if (bytes) for (const item of parseReportList(decodeOfficialBytes(bytes)).items) entries.set(item.portalId, item);
  }
  const out: ReadReport[] = [];
  for (const [portalId, item] of entries) {
    const bytes = await cache.read("legislatie-aep-report", reportPageKey(portalId));
    if (!bytes) {
      out.push({ portalId, skipped: "page not saved", title: item.title, issuedOn: item.issuedOn, gazetteNumber: item.gazetteNumber, gazetteOn: item.gazetteOn, number: item.number });
      continue;
    }
    const report = parseControlReport(decreePageText(decodeOfficialBytes(bytes)));
    out.push({ portalId, title: item.title, issuedOn: item.issuedOn, gazetteNumber: item.gazetteNumber, gazetteOn: item.gazetteOn, number: item.number, ...(report ? { report } : { skipped: "the text does not have the shape of an annual report (income by source and expenses)" }) });
  }
  return out.sort((a, b) => (a.issuedOn ?? "").localeCompare(b.issuedOn ?? ""));
}
