import * as cheerio from "cheerio";
import { cleanText } from "./utils";

export type MotionKind = "censure" | "simple";
export type MotionOutcome = "adopted" | "rejected" | "unknown";

export interface ParsedMotionListRow {
  title: string;
  initiators: string;
  number: number;
  filedOn: string;
  outcome: MotionOutcome;
  detailUrl?: string;
  documentUrl?: string;
}

export interface ParsedMotionSignatory {
  officialId: string;
  chamber: "deputies" | "senate";
  legislatureYear: string;
  displayName: string;
  groupLabel: string;
}

export interface ParsedMotionDetail {
  kind: MotionKind;
  number: number;
  filedOn: string;
  title: string;
  initiators: string;
  outcome: MotionOutcome;
  votesFor?: number;
  votesAgainst?: number;
  votesAbstain?: number;
  /** "Prezentare în şedinţa ... din DD.MM.YYYY" and "Vot în şedinţa ... din DD.MM.YYYY", when the page states them. */
  presentedOn?: string;
  votedOn?: string;
  signatoriesDeputies?: number;
  signatoriesSenators?: number;
  documentUrl?: string;
  signatories: ParsedMotionSignatory[];
}

/** CDEP's motion lists ("Moţiuni de cenzură", "Moţiuni simple"): one row per motion with its official result. */
export function parseMotionsList(html: string, sourceUrl: string): ParsedMotionListRow[] {
  const $ = cheerio.load(html);
  const rows: ParsedMotionListRow[] = [];
  $("tbody tr").each((_, row) => {
    const cells = $(row).find("td").toArray();
    if (cells.length < 5) return;
    const numberAndDate = cleanText($(cells[3]).text()).match(/^(\d+)\s*\/\s*(\d{2})-(\d{2})-(\d{4})$/);
    if (!numberAndDate) return;
    const link = $(cells[1]).find("a").first();
    const pdf = $(cells[5] ?? cells[4]).find("a[href$='.pdf'], a[href*='.pdf']").first().attr("href");
    rows.push({
      title: cleanText($(cells[1]).text()),
      initiators: cleanText($(cells[2]).text()),
      number: Number(numberAndDate[1]),
      filedOn: `${numberAndDate[4]}-${numberAndDate[3]}-${numberAndDate[2]}`,
      outcome: outcomeFromText($(cells[4]).text()),
      detailUrl: link.attr("href") ? new URL(link.attr("href")!, sourceUrl).toString() : undefined,
      documentUrl: pdf ? new URL(pdf, sourceUrl).toString() : undefined
    });
  });
  return rows;
}

/** One motion's page: official result, vote totals, signatory counts and the named signatories by group. */
export function parseMotionDetail(html: string, sourceUrl: string): ParsedMotionDetail | undefined {
  const $ = cheerio.load(html);
  const box = $(".boxDep").first();
  const text = cleanText(box.text());
  const kindMatch = text.match(/^Mo[tţț]iune\s+(de\s+cenzur[ăa]|simpl[ăa])/i);
  const numberAndDate = text.match(/Nr\.\/Data\s+[iî]nregistr[ăa]rii:\s*(\d+)\s*\/\s*(\d{2})\.(\d{2})\.(\d{4})/i);
  if (!kindMatch || !numberAndDate) return undefined;

  const count = (pattern: RegExp) => {
    const match = text.match(pattern);
    return match ? Number(match[1]) : undefined;
  };
  const signed = text.match(/semnat[ăa]\s+de\s+c[ăa]tre\s+(\d+)\s+parlamentari\s*\((\d+)\s+deputa[tţț]i\s+[sşș]i\s+(\d+)\s+senatori\)/i);
  const signedByDeputiesOnly = text.match(/semnat[ăa]\s+de\s+c[ăa]tre\s+(\d+)\s+deputa[tţț]i/i);
  const dateAfter = (label: RegExp) => {
    const match = text.match(new RegExp(`${label.source}[^.]*?din\\s+(\\d{2})\\.(\\d{2})\\.(\\d{4})`, "i"));
    return match ? `${match[3]}-${match[2]}-${match[1]}` : undefined;
  };
  const pdf = box.find("a[href*='.pdf']").first().attr("href");
  const signatories: ParsedMotionSignatory[] = [];
  $("b").each((_, label) => {
    const groupLabel = cleanText($(label).text());
    if (!/^(Deputa[tţț]i|Senatori)\b/i.test(groupLabel)) return;
    const list = $(label).nextAll("ol").first();
    list.find("li a[href*='structura']").each((__, link) => {
      const href = $(link).attr("href") ?? "";
      const officialId = href.match(/[?&]idm=(\d+)/i)?.[1];
      const cam = href.match(/[?&]cam=(\d)/i)?.[1];
      const legislatureYear = href.match(/[?&]leg=(\d{4})/i)?.[1];
      if (!officialId || !legislatureYear || (cam !== "1" && cam !== "2")) return;
      signatories.push({ officialId, chamber: cam === "1" ? "senate" : "deputies", legislatureYear, displayName: cleanText($(link).text()), groupLabel: groupLabel.replace(/^(Deputa[tţț]i|Senatori)\s*/i, "") });
    });
  });

  return {
    kind: /cenzur/i.test(kindMatch[1] ?? "") ? "censure" : "simple",
    number: Number(numberAndDate[1]),
    filedOn: `${numberAndDate[4]}-${numberAndDate[3]}-${numberAndDate[2]}`,
    title: cleanText($(".boxTitle h1").first().text()),
    initiators: cleanText(box.find("b").eq(1).text()),
    outcome: outcomeFromText(text.match(/Rezultat:\s*([^\s.,;]+)/i)?.[1] ?? ""),
    votesFor: count(/pentru\s+mo[tţț]iune:\s*(\d+)/i),
    votesAgainst: count(/[iî]mpotriva\s+mo[tţț]iunii:\s*(\d+)/i),
    votesAbstain: count(/ab[tţț]ineri:\s*(\d+)/i),
    presentedOn: dateAfter(/(?:Prezentare|Informare)\s+[iî]n\s+[sşș]edin[tţț]a/),
    votedOn: dateAfter(/Vot\s+[iî]n\s+[sşș]edin[tţț]a/),
    signatoriesDeputies: signed ? Number(signed[2]) : signedByDeputiesOnly ? Number(signedByDeputiesOnly[1]) : undefined,
    signatoriesSenators: signed ? Number(signed[3]) : signedByDeputiesOnly ? 0 : undefined,
    documentUrl: pdf ? new URL(pdf, sourceUrl).toString() : undefined,
    signatories
  };
}

function outcomeFromText(value: string): MotionOutcome {
  const normalized = cleanText(value).normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  if (normalized.startsWith("adoptat")) return "adopted";
  if (normalized.startsWith("respins")) return "rejected";
  return "unknown";
}
