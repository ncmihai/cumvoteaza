import * as cheerio from "cheerio";
import { cleanText } from "../parsers/utils";

export type SenateBureauPosition = "Președinte" | "Vicepreședinte" | "Secretar" | "Chestor";

export interface SenateBureauRole {
  position: SenateBureauPosition;
  /** YYYY-MM-DD, as the card gives it ("de la data de 03.09.2025"). */
  since: string;
  /** Absent for the current role. */
  until?: string;
}

export interface SenateOfficialMetric {
  metric: "initiatives" | "political_declarations" | "questions" | "interpellations" | "interpellations_prime_minister" | "speeches" | "motions_signed" | "evote_attendance";
  value: number;
  /** "87 of 95 sittings"; "105 speeches in 162 sittings". */
  outOf?: number;
  /** "43 initiatives, of which 6 became law". */
  detail?: number;
}

export interface ParsedSenateCard {
  bureau: SenateBureauRole[];
  metrics: SenateOfficialMetric[];
}

const positionOf = (text: string): SenateBureauPosition | undefined => {
  const value = text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (/^vicepre[sx]edint/.test(value)) return "Vicepreședinte";
  if (/^pre[sx]edint/.test(value)) return "Președinte";
  if (/^secretar/.test(value)) return "Secretar";
  if (/^chestor/.test(value)) return "Chestor";
  return undefined;
};

const isoDate = (value: string | undefined): string | undefined => {
  const match = value?.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  return match ? `${match[3]}-${match[2]!.padStart(2, "0")}-${match[1]!.padStart(2, "0")}` : undefined;
};

/** Metric labels as the card writes them, keyed by their element id suffix. */
const METRICS: Array<[string, SenateOfficialMetric["metric"], RegExp]> = [
  ["lnkInitiative", "initiatives", /\((\d+)\s+din care\s+(\d+)/i],
  ["Declaratii", "political_declarations", /\((\d+)\)/],
  ["Intrebari", "questions", /\((\d+)\)/],
  ["IntPrim", "interpellations_prime_minister", /\((\d+)\)/],
  ["Interpelari", "interpellations", /\((\d+)\)/],
  ["LuariCuvint", "speeches", /\((\d+)\s+[îi]n\s+(\d+)/i],
  ["Motiuni", "motions_signed", /\((\d+)\)/],
  ["Voturi", "evote_attendance", /\((\d+)\s+[sşș]edin[tţț]e\s+dintr-un total de\s+(\d+)/i]
];

function bureauFrom($: cheerio.CheerioAPI, heading: RegExp): SenateBureauRole[] {
  const roles: SenateBureauRole[] = [];
  $("h5").filter((_, element) => heading.test(cleanText($(element).text()))).each((_, element) => {
    $(element).nextAll("table").first().find("tbody tr").each((__, row) => {
      const text = cleanText($(row).children("td").last().text());
      const position = positionOf(text);
      const since = isoDate(text.match(/de la data de\s*([\d.]+)/i)?.[1]);
      const until = isoDate(text.match(/p[âa]n[ăa] la data de\s*([\d.]+)/i)?.[1]);
      if (position && since) roles.push({ position, since, ...(until ? { until } : {}) });
    });
  });
  return roles;
}

/**
 * A senator's card on senat.ro (`FisaSenator.aspx?ParlamentarID=<guid>`): the activity counts the Senate publishes
 * and the dated history of the person's seat in the Permanent Bureau. The counts sit in one list on the card itself.
 */
export function parseSenateCard(html: string): ParsedSenateCard {
  const $ = cheerio.load(html);
  const metrics: SenateOfficialMetric[] = [];
  for (const [suffix, metric, pattern] of METRICS) {
    // Interpelări (2) must not be read as Interpelări adresate Prim Ministrului (0): match on the element id.
    const link = $(`a[id$='_${suffix}']`).first();
    const text = cleanText(link.text());
    const match = text.match(pattern);
    if (!match) continue;
    const first = Number(match[1]);
    const second = match[2] === undefined ? undefined : Number(match[2]);
    metrics.push(metric === "initiatives" ? { metric, value: first, detail: second } : second === undefined ? { metric, value: first } : { metric, value: first, outOf: second });
  }
  // The history lists finished and current stretches alike; the "current" table repeats the open one.
  const all = [...bureauFrom($, /^Biroul permanent:?$/i), ...bureauFrom($, /^Istoric Biroul permanent:?$/i)];
  const seen = new Set<string>();
  const bureau = all.filter((role) => {
    const key = `${role.position}|${role.since}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => a.since.localeCompare(b.since));
  return { bureau, metrics };
}
