import * as cheerio from "cheerio";
import { lawTypeFromCharacter, type Bill, type BillEvent, type BillSponsor, type DocumentSource, type SourceSnapshot } from "@cumsevoteaza/parliament-model";
import { cleanText, slugify, snapshotFor } from "./utils";
import {
  billIdForIdentifier,
  canonicalBillIdentifier,
  findOfficialIdentifiers,
  identifierRecord,
  normalizeOfficialIdentifier,
  yearFromUrl
} from "./identifiers";
import { canonicalizeOfficialUrl } from "../official-urls";
import { classifyDeputiesDocumentKind } from "./deputies-bill";

export interface ParsedSenateBill {
  sourceSnapshot: SourceSnapshot;
  bill: Bill;
  events: BillEvent[];
  sponsors: BillSponsor[];
  documents: DocumentSource[];
  discoveredSources: Array<{
    chamber: "senate" | "deputies";
    kind: "vote" | "bill";
    sourceUrl: string;
    officialId?: string;
    title?: string;
    discoveredOn?: string;
  }>;
}

export function parseSenateBill(html: string, sourceUrl: string): ParsedSenateBill {
  const $ = cheerio.load(html);
  const sourceSnapshot = snapshotFor("senate-bill", sourceUrl, html, "parsed");
  const allText = cleanText($("body").text());
  const fallbackYear = yearFromUrl(sourceUrl);
  const explicitSenate = normalizeOfficialIdentifier(fieldValue($, "Număr de înregistrare Senat"), fallbackYear);
  const explicitDeputies = normalizeOfficialIdentifier(fieldValue($, "Număr de înregistrare Camera Deputaților"), fallbackYear);
  const identifiers = [
    ...(explicitSenate ? [explicitSenate] : []),
    ...(explicitDeputies ? [explicitDeputies] : []),
    ...findOfficialIdentifiers(cleanText($(".lista-legis-panel-2 h4").first().text()), fallbackYear),
    ...findOfficialIdentifiers(cleanText($("#ctl00_B_Center_Lista_grdLista font").first().text()), fallbackYear),
    ...findOfficialIdentifiers(allText, fallbackYear)
  ];
  const canonical = canonicalBillIdentifier(identifiers) ?? normalizeOfficialIdentifier("unknown", fallbackYear);
  const canonicalValue = canonical?.value ?? "unknown";
  const slug = slugify(canonicalValue);
  const billId = canonical ? billIdForIdentifier(canonical) : `bill-${slug}`;
  const title = extractTitle($, canonicalValue);

  const documents: DocumentSource[] = $("a[href$='.pdf'], a[href*='.pdf?']")
    .toArray()
    .slice(0, 30)
    .map((node, index) => {
      const href = $(node).attr("href") ?? "";
      return {
        id: `doc-${billId}-${index + 1}`,
        billId,
        label: cleanText($(node).text()) || `Document ${index + 1}`,
        url: new URL(href.replace(/\\/g, "/"), sourceUrl).toString(),
        // The Senate exposes the same document vocabulary as the Chamber in
        // its link labels ("forma inițiatorului", "raport", "aviz", ...).
        // Preserve that signal so text extraction never falls back to an
        // arbitrary explanatory memo when a proposal is requested.
        documentKind: classifyDeputiesDocumentKind(`${cleanText($(node).text())} ${href}`),
        sourceChamber: "senate"
      };
    });

  const timeline = extractTimeline($, billId, sourceUrl);

  return {
    sourceSnapshot,
    bill: {
      id: billId,
      slug,
      title,
      identifiers: identifierRecord(identifiers.length > 0 ? identifiers : []),
      chamberOfOrigin: /Senat/i.test(allText) ? "senate" : "unknown",
      status: /adoptat/i.test(allText) ? "Adoptat" : "unknown",
      lawType: lawTypeFromCharacter(fieldValue($, "Caracterul legii")),
      sourceSnapshotIds: [sourceSnapshot.id]
    },
    events: timeline.events,
    sponsors: [
      {
        id: `sponsor-${billId}-unknown`,
        billId,
        sponsorType: /Guvern/i.test(allText) ? "government" : "unknown",
        name: /Guvern/i.test(allText) ? "Guvernul României" : "Inițiator necunoscut"
      }
    ],
    documents,
    discoveredSources: timeline.discoveredSources
  };
}

function extractTimeline($: cheerio.CheerioAPI, billId: string, sourceUrl: string) {
  const events: BillEvent[] = [];
  const discoveredSources: ParsedSenateBill["discoveredSources"] = [];

  $("tr").each((_, row) => {
    const rowText = cleanText($(row).text());
    const occurredOn = inferDate(rowText);
    if (!occurredOn || !isTimelineRow(rowText)) return;
    const chamber = chamberFromTimelineRow(rowText);
    const label = timelineLabel(rowText);
    const rowId = `event-${billId}-${occurredOn}-${slugify(label).slice(0, 56)}`;
    events.push({
      id: rowId,
      billId,
      occurredOn,
      chamber,
      label,
      sourceUrl
    });

    $(row)
      .find("a[href]")
      .each((_, link) => {
        const href = $(link).attr("href");
        if (!href || href.startsWith("javascript:")) return;
        const absoluteUrl = canonicalizeOfficialUrl(new URL(href.replace(/\\/g, "/"), sourceUrl).toString());
        if (/VoturiPlenDetaliu\.aspx/i.test(absoluteUrl)) {
          discoveredSources.push({
            chamber: "senate",
            kind: "vote",
            sourceUrl: absoluteUrl,
            title: cleanText($(link).text()) || "rezultat vot",
            discoveredOn: occurredOn
          });
        }
        if (/cdep\.ro\/(?:ords\/)?pls\/steno\/evot2015\.Nominal/i.test(absoluteUrl) || /cdep\.ro\/(?:ords\/)?pls\/steno\/evot2015/i.test(absoluteUrl)) {
          discoveredSources.push({
            chamber: "deputies",
            kind: "vote",
            sourceUrl: absoluteUrl,
            title: cleanText($(link).text()) || "rezultat vot",
            discoveredOn: occurredOn
          });
        }
        if (/cdep\.ro\/(?:ords\/)?pls\/proiecte\/upl_pck2015\.proiect/i.test(absoluteUrl)) {
          discoveredSources.push({
            chamber: "deputies",
            kind: "bill",
            sourceUrl: absoluteUrl,
            title: cleanText($(link).text()) || "fișă Camera Deputaților",
            discoveredOn: occurredOn
          });
        }
      });
  });

  if (events.length === 0) {
    const allText = cleanText($("body").text());
    const registeredDate = inferDate(allText);
    if (/inregistrat|înregistrat/i.test(allText) && registeredDate) {
      events.push({
        id: `event-${billId}-registered`,
        billId,
        occurredOn: registeredDate,
        chamber: "senate",
        label: "Înregistrat la Senat pentru dezbatere",
        sourceUrl
      });
    }
  }

  return {
    events: uniqueBy(events, (event) => event.id),
    discoveredSources: uniqueBy(discoveredSources, (source) => source.sourceUrl)
  };
}

function isTimelineRow(text: string): boolean {
  return /(înregistrat|inregistrat|prezentare|trimis|primit|adoptat|respins|înscris|inscris|dezbatere|rezultat vot|promulgat|publicat)/i.test(text);
}

function chamberFromTimelineRow(text: string): "senate" | "deputies" | "joint" | "unknown" {
  if (/\bCD\b|Camera Deput/i.test(text)) return "deputies";
  if (/\bSE\b|Senat/i.test(text)) return "senate";
  if (/\bPA\b|promulgat|Monitorul Oficial/i.test(text)) return "unknown";
  return "unknown";
}

function timelineLabel(text: string): string {
  return cleanText(text.replace(/^\d{2}[-/.]\d{2}[-/.]\d{4}\s*/, "")).slice(0, 500);
}

function extractTitle($: cheerio.CheerioAPI, senateId: string): string {
  const detailTitle = cleanText($(".lista-legis-panel-2 h4").first().next("p").text());
  if (detailTitle.length > 80) return detailTitle;

  const boldCandidates = $("b")
    .toArray()
    .map((node) => cleanText($(node).text()))
    .filter((text) => text.length > 80 && !text.includes("__VIEWSTATE"));

  const headingCandidate = $("h5")
    .toArray()
    .map((node) => cleanText($(node).text()))
    .find((text) => text.length > 80);

  return headingCandidate ?? boldCandidates[0] ?? senateId;
}

function fieldValue($: cheerio.CheerioAPI, label: string): string | undefined {
  const normalizedLabel = normalize(label);
  let value: string | undefined;

  $("tr").each((_, row) => {
    const cells = $(row).find("td").toArray();
    if (cells.length < 2) return;
    if (normalize($(cells[0]).text()).includes(normalizedLabel)) {
      value = cleanText($(cells[1]).text());
    }
  });

  return value;
}

function normalize(value: string): string {
  return cleanText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function inferDate(text: string): string | undefined {
  const match = text.match(/(\d{2})[-/.](\d{2})[-/.](\d{4})/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : undefined;
}

function uniqueBy<T>(items: T[], getKey: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = getKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
