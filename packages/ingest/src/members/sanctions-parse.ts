import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import { createHash } from "node:crypto";
import { fold } from "../dossiers/step-typing";

/**
 * D-052: the Chamber's "Sancțiuni aplicate deputaților". Each entry is a stack of paragraphs closed by a rule: a bold headline (date, the sanction in the Chamber's own words, the deputy's name),
 * links to the Permanent Bureau's decision and to the deputy's contestation, the plenary's decision on it (a bold "HCD n/yyyy privind respingerea|admiterea contestației" with its link) and a link to
 * the stenogram. The text is kept as printed; only what the words say plainly is read out of it (the date, the kinds of sanction, a percentage, a number of months, the article), and what they do not say
 * stays unread: a heading that only says "the Bureau's decisions concerning the sanctioning of X" is a decision with no kind.
 */
export type SanctionKind = "warning" | "call_to_order" | "floor_withdrawn" | "written_warning" | "speaking_time_reduced" | "allowance_reduced" | "combined" | "bureau_decision" | "other";

export interface SanctionPart {
  kind: SanctionKind;
  percent?: number;
  months?: number;
  seconds?: number;
}

export interface ParsedSanction {
  /** Stable across re-reads: the legislature, the date and the headline. */
  id: string;
  legislature: string;
  heldOn?: string;
  headline: string;
  /** The deputy as the page prints the name ("Nini-Alexandru PASCALINI"); absent when the headline names no one. */
  nameText?: string;
  groupLabel?: string;
  kind: SanctionKind;
  parts: SanctionPart[];
  article?: string;
  decision?: { label: string; number?: string; dated?: string; url: string };
  contestationFiledUrl?: string;
  contestation?: { outcome: "rejected" | "upheld"; label: string; url?: string };
  stenogramUrl?: string;
}

export interface ParsedSanctionsPage {
  legislature: string;
  entries: ParsedSanction[];
  /** Entries that concern several deputies at once or only announce what a decision says ("Informare privind adoptarea ... Hotărârilor"): not sanctions of one person. */
  informational: string[];
}

const MONTHS: Record<string, number> = { ianuarie: 1, februarie: 2, martie: 3, aprilie: 4, mai: 5, iunie: 6, iulie: 7, august: 8, septembrie: 9, octombrie: 10, noiembrie: 11, decembrie: 12 };
const COUNTS: Record<string, number> = { o: 1, un: 1, una: 1, doua: 2, trei: 3, patru: 4, cinci: 5, sase: 6, sapte: 7, opt: 8, noua: 9, zece: 10 };
const ORIGIN = "https://www.cdep.ro";

const tidy = (value: string) => value.replace(/\s+/g, " ").trim();
const countOf = (word: string) => (/^\d+$/.test(word) ? Number(word) : COUNTS[fold(word)]);

/** "12 iunie 2023 - ..." at the start of a headline. */
export function headlineDate(headline: string): { heldOn?: string; rest: string } {
  const match = fold(headline).match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})\s*-\s*/);
  const month = match ? MONTHS[match[2]!] : undefined;
  if (!match || !month) return { rest: headline };
  return { heldOn: `${match[3]}-${String(month).padStart(2, "0")}-${String(Number(match[1])).padStart(2, "0")}`, rest: headline.slice(headline.search(/\s-\s/) + 3).trim() };
}

/** "vezi decizia Nr.4/23-03-2026" -> number 4, dated 2026-03-23. */
function decisionFromLabel(label: string): { number?: string; dated?: string } {
  const match = label.match(/Nr\.?\s*(\d+)\s*\/\s*(\d{2})-(\d{2})-(\d{4})/i);
  return match ? { number: match[1]!, dated: `${match[4]}-${match[3]}-${match[2]}` } : {};
}

function partsOf(text: string): SanctionPart[] {
  const folded = fold(text);
  const parts: SanctionPart[] = [];
  if (/atentionarea/.test(folded)) parts.push({ kind: "warning" });
  if (/chemarea la ordine/.test(folded)) parts.push({ kind: "call_to_order" });
  if (/retragerea cuvantului/.test(folded)) parts.push({ kind: "floor_withdrawn" });
  if (/avertisment\w* scris/.test(folded)) parts.push({ kind: "written_warning" });
  const speaking = folded.match(/reducerii duratei luarii de cuvant la (\d+) secunde(?:\/interventie)?(?: pe o perioada de (\w+) lun)?/);
  if (speaking) parts.push({ kind: "speaking_time_reduced", seconds: Number(speaking[1]), ...(speaking[2] && countOf(speaking[2]) ? { months: countOf(speaking[2]) } : {}) });
  const allowance = folded.match(/diminuar\w+ (?:a )?indemniz\S* cu (\d+)%\s*(?:pe o perioada de (\w+) lun)?/);
  if (allowance) parts.push({ kind: "allowance_reduced", percent: Number(allowance[1]), ...(allowance[2] && countOf(allowance[2]) ? { months: countOf(allowance[2]) } : {}) });
  return parts;
}

/** The deputy the headline names: after "domnului|doamnei deputat". */
export function nameOf(headline: string): { nameText?: string; groupLabel?: string } {
  const name = headline.match(/(?:domnului|doamnei)\s+deputat(?:ă)?\s+([^,.]+?)(?=\s+(?:pentru|cu aplicarea|de diminuare|membr[uă]|în conformitate|în cadrul)\b|\s*[,.]|\s*$)/i);
  const group = headline.match(/membr[uă]\s+al?\s+Grupului\s+parlamentar\s+(?:al\s+)?([^.,]+)/i) ?? headline.match(/membr[uă]\s+al\s+([^.,]+)/i);
  return { ...(name ? { nameText: tidy(name[1]!) } : {}), ...(group ? { groupLabel: tidy(group[1]!) } : {}) };
}

function articleOf(headline: string): string | undefined {
  const match = headline.match(/(art\.\s*\d+[^;]*?)\s+din\s+Regulament/i);
  return match ? tidy(match[1]!) : undefined;
}

const idOf = (legislature: string, heldOn: string | undefined, headline: string) => `sanction-${legislature}-${createHash("sha256").update(`${heldOn ?? ""}|${tidy(headline)}`).digest("hex").slice(0, 12)}`;

export function parseSanctionsPage(html: string, legislature: string): ParsedSanctionsPage {
  const $ = cheerio.load(html);
  const container = $(".grup-parlamentar-list").first();
  const groups: AnyNode[][] = [[]];
  container.contents().each((_, node) => {
    if (node.type === "tag" && node.name === "hr") groups.push([]);
    else groups[groups.length - 1]!.push(node);
  });

  const entries: ParsedSanction[] = [];
  const informational: string[] = [];
  for (const nodes of groups) {
    const scope = $(nodes);
    const bolds = scope.find("b").add(scope.filter("b")).toArray().map((node) => tidy($(node).text())).filter(Boolean);
    const headline = bolds[0];
    if (!headline) continue;
    // A page links "vezi ..." documents; the label says which one it is.
    const links = scope.find("a").add(scope.filter("a")).toArray().map((node) => ({ label: tidy($(node).text()), href: $(node).attr("href") ?? "" })).filter((link) => link.href);
    const absolute = (href: string) => new URL(href.replace(/\\/g, "/").replace(/ /g, "%20"), ORIGIN).toString();

    const { heldOn, rest } = headlineDate(headline);
    if (/^Informare privind adoptarea/i.test(rest) || (/Hot[ăa]r[âa]rilor/i.test(rest) && !/deputat/i.test(rest))) {
      informational.push(headline);
      continue;
    }
    const { nameText, groupLabel } = nameOf(rest);
    const parts = partsOf(rest);
    const decisionLink = links.find((link) => /vezi decizia/i.test(link.label));
    const filed = links.find((link) => /vezi contesta/i.test(link.label));
    const ruling = links.find((link) => /vezi (respingerea|admiterea) contesta/i.test(link.label));
    const rulingText = bolds.slice(1).find((text) => /^HCD\b/i.test(text));
    const steno = links.find((link) => /stenogram/i.test(link.label));
    const contestation = rulingText && /respingerea|admiterea/i.test(rulingText)
      ? { outcome: (/admiterea/i.test(rulingText) ? "upheld" : "rejected") as "upheld" | "rejected", label: rulingText, ...(ruling ? { url: absolute(ruling.href) } : {}) }
      : undefined;

    entries.push({
      id: idOf(legislature, heldOn, headline),
      legislature,
      ...(heldOn ? { heldOn } : {}),
      headline: rest,
      ...(nameText ? { nameText } : {}),
      ...(groupLabel ? { groupLabel } : {}),
      kind: parts.length === 1 ? parts[0]!.kind : parts.length > 1 ? "combined" : /Deciziile? Biroului permanent/i.test(rest) ? "bureau_decision" : "other",
      parts,
      ...(articleOf(rest) ? { article: articleOf(rest)! } : {}),
      ...(decisionLink ? { decision: { label: decisionLink.label, ...decisionFromLabel(decisionLink.label), url: absolute(decisionLink.href) } } : {}),
      ...(filed ? { contestationFiledUrl: absolute(filed.href) } : {}),
      ...(contestation ? { contestation } : {}),
      ...(steno ? { stenogramUrl: absolute(steno.href) } : {})
    });
  }
  return { legislature, entries, informational };
}
