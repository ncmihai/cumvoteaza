import * as cheerio from "cheerio";
import { cleanText } from "../parsers/utils";
import { monthFromText, monthRangeFromText } from "./months";

export type BureauPosition = "Președinte" | "Vicepreședinte" | "Secretar" | "Chestor";

export interface BureauSeat {
  position: BureauPosition;
  /** CDEP's own member number (idm), from the link on the page. */
  idm: string;
  name: string;
  group: string;
  /** "din dec. 2024": the person joined the bureau during the period. */
  sinceMonth?: string;
  /** "până în dec. 2024": the person left the bureau during the period. */
  untilMonth?: string;
  former: boolean;
}

export interface BureauPeriod {
  chamber: "deputies";
  legislature: string;
  /** "decembrie 2024 - februarie 2025" as printed. */
  label: string;
  fromMonth: string;
  /** null for the current period ("prezent"). */
  toMonth: string | null;
  seats: BureauSeat[];
}

function positionOf(text: string): BureauPosition | undefined {
  const value = text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (/^vicepre[sx]edint/.test(value)) return "Vicepreședinte";
  if (/^pre[sx]edint/.test(value)) return "Președinte";
  if (/^secretar/.test(value)) return "Secretar";
  if (/^chestor/.test(value)) return "Chestor";
  return undefined;
}

function noteMonths(note: string): { sinceMonth?: string; untilMonth?: string } {
  const since = note.match(/din\s+([A-Za-zăâîșşțţ]+\.?\s+\d{4})/i)?.[1];
  const until = note.match(/p[âa]n[ăa]\s+[îi]n\s+([A-Za-zăâîșşțţ]+\.?\s+\d{4})/i)?.[1];
  return { sinceMonth: since ? monthFromText(since) : undefined, untilMonth: until ? monthFromText(until) : undefined };
}

/**
 * One page of CDEP's "Biroul permanent al Camerei Deputaților" (`structura2015.bp?ses=N&cam=2&leg=2024`):
 * the bureau during one period, with positions, members, groups and optional "din / până în <month>" notes,
 * followed by the former members of that period. The function cell is empty for the second and later person of a position.
 */
export function parseChamberBureauPage(html: string, sourceUrl: string): BureauPeriod {
  const $ = cheerio.load(html);
  const text = cleanText($("body").text());
  const legislature = text.match(/Legislatura\s+(\d{4})/)?.[1];
  const label = cleanText($("h1").filter((_, element) => /Perioada:/i.test($(element).text())).first().text()).replace(/^Perioada:\s*/i, "");
  const range = monthRangeFromText(label);
  if (!legislature || !label || !range.from || range.to === undefined) throw new Error(`CDEP bureau page without a readable period: ${sourceUrl} ("${label}")`);

  const seats: BureauSeat[] = [];
  const hasFormerSection = /Fo[sș]ti membri ai Biroului/i.test(text);
  // The page has the current bureau first and, when somebody left during the period, a second table of former members.
  $("table.tip01").each((tableIndex, table) => {
    const former = hasFormerSection && tableIndex > 0;
    let position: BureauPosition | undefined;
    $(table).find("tbody tr").each((__, row) => {
      const cells = $(row).children("td");
      if (cells.length < 4) return;
      const given = positionOf(cleanText($(cells[1]).text()));
      if (given) position = given;
      const link = $(cells[2]).find("a[href*='idm=']").first();
      const idm = link.attr("href")?.match(/[?&]idm=(\d+)/)?.[1];
      if (!position || !idm) return;
      seats.push({
        position,
        idm,
        name: cleanText(link.text()),
        group: cleanText($(cells[3]).text()),
        ...noteMonths(cleanText($(cells[4] ?? "").text())),
        former
      });
    });
  });
  if (seats.length === 0) throw new Error(`CDEP bureau page lists nobody: ${sourceUrl}`);
  return { chamber: "deputies", legislature, label, fromMonth: range.from, toMonth: range.to, seats };
}
