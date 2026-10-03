import * as cheerio from "cheerio";
import { createHash } from "node:crypto";
import { lawTypeFromCharacter, type Bill, type BillEvent, type BillProcedureStep, type BillSponsor, type ChamberId, type DocumentKind, type DocumentSource, type SourceSnapshot } from "@cumsevoteaza/parliament-model";
import { cleanText, slugify, snapshotFor } from "./utils";
import { billIdForIdentifier, canonicalBillIdentifier, findOfficialIdentifiers, identifierRecord, normalizeOfficialIdentifier } from "./identifiers";

export interface ParsedDeputiesBill {
  sourceSnapshot: SourceSnapshot;
  bill: Bill;
  events: BillEvent[];
  procedureSteps: BillProcedureStep[];
  sponsors: BillSponsor[];
  documents: DocumentSource[];
}

export function parseDeputiesBill(html: string, sourceUrl: string): ParsedDeputiesBill {
  const $ = cheerio.load(html);
  const sourceSnapshot = snapshotFor("deputies-bill", sourceUrl, html, "parsed");
  const bodyText = cleanText($("body").text());
  const titleText = cleanText($("h1, h2, h3, h4").toArray().map((node) => $(node).text()).join(" "));
  const urlIdentifier = normalizeOfficialIdentifier(idFromUrl(sourceUrl));
  const identifiers = [...findOfficialIdentifiers(bodyText), ...(urlIdentifier ? [urlIdentifier] : [])];
  const canonical = canonicalBillIdentifier(identifiers) ?? urlIdentifier;
  const canonicalValue = canonical?.value ?? idFromUrl(sourceUrl);
  const billSlug = slugify(canonicalValue);
  const billId = canonical ? billIdForIdentifier(canonical) : `bill-${billSlug}`;
  const title = extractTitle($, titleText, canonicalValue);
  const documents = extractDocuments($, billId, sourceUrl);
  const procedureSteps = extractProcedureSteps($, billId, sourceUrl, documents);
  const events = procedureSteps.map((step) => ({
    id: `event-${step.id.replace(/^step-/, "")}`,
    billId,
    occurredOn: step.occurredOn,
    chamber: step.chamber,
    label: step.description ? `${step.title}: ${step.description}`.slice(0, 500) : step.title,
    sourceUrl: step.sourceUrl
  }));

  return {
    sourceSnapshot,
    bill: {
      id: billId,
      slug: billSlug,
      title,
      identifiers: identifierRecord(identifiers),
      chamberOfOrigin: chamberOfOrigin(bodyText),
      decisionChamber: decisionChamber(bodyText),
      status: extractStatus(bodyText),
      lawType: lawTypeFromCharacter(characterField($)),
      sourceSnapshotIds: [sourceSnapshot.id]
    },
    events,
    procedureSteps,
    sponsors: [
      {
        id: `sponsor-${billId}-primary`,
        billId,
        sponsorType: /Initiator:\s*Guvern|Iniţiator:\s*Guvern/i.test(bodyText) ? "government" : "unknown",
        name: sponsorName(bodyText)
      }
    ],
    documents
  };
}

/** The "Caracter:" row of the bill's summary table ("ordinar", "organic"). */
function characterField($: cheerio.CheerioAPI): string | undefined {
  const row = $("tr").toArray().find((node) => /^caracter:?$/i.test(cleanText($(node).children("td").first().text())));
  return row ? cleanText($(row).children("td").eq(1).text()) : undefined;
}

function extractDocuments($: cheerio.CheerioAPI, billId: string, sourceUrl: string): DocumentSource[] {
  return $("a[href$='.pdf'], a[href*='.pdf?'], a[href*='/docs?']")
    .toArray()
    .slice(0, 80)
    .map((node, index) => {
      const href = $(node).attr("href") ?? "";
      const url = new URL(href.replace(/\\/g, "/"), sourceUrl).toString();
      const rowText = cleanText($(node).closest("tr, p, li, div, td").text());
      const label = cleanText($(node).text()) || documentLabelFromContext(rowText) || `Document ${index + 1}`;
      return {
        id: `doc-${billId}-${index + 1}`,
        billId,
        label,
        url,
        documentKind: classifyDeputiesDocumentKind(`${label} ${rowText} ${url}`),
        sourceChamber: sourceChamberFromText(`${label} ${rowText}`),
        officialUrlHash: sha256(url)
      };
    });
}

function extractProcedureSteps($: cheerio.CheerioAPI, billId: string, sourceUrl: string, documents: DocumentSource[]): BillProcedureStep[] {
  const steps: BillProcedureStep[] = [];
  $("tr").each((_, row) => {
    const cells = $(row).find("td").toArray();
    const rowText = cleanText($(row).text());
    const date = inferDate(rowText);
    if (!date || rowText.length < 12) return;
    const actionCell = cells.length > 1 ? cells[cells.length - 1] : row;
    const action = cleanText($(actionCell).text()).replace(/^\d{2}[./-]\d{2}[./-]\d{4}\s*/, "");
    if (!action || action.length < 5 || /^(data|actiunea|acțiunea)$/i.test(action)) return;
    const linkedDocument = firstDocumentForRow($, row, sourceUrl, documents);
    const title = stepTitle(action);
    const displayOrder = steps.length;
    steps.push({
      id: `step-${billId}-${date}-${displayOrder}-${slugify(title).slice(0, 44)}`,
      billId,
      occurredOn: date,
      chamber: chamberFromText(rowText),
      stepType: classifyStepType(action),
      title,
      description: action.length > title.length ? action : undefined,
      committeeName: extractCommitteeName(action),
      documentId: linkedDocument?.id,
      sourceUrl,
      displayOrder
    });
  });
  return uniqueBy(steps, (step) => step.id).slice(0, 120);
}

function extractTitle($: cheerio.CheerioAPI, headingText: string, fallback: string): string {
  const heading = $("h4, h3, h2")
    .toArray()
    .map((node) => cleanText($(node).text()))
    .find((text) => text.length > 30 && /proiect|lege|propunere/i.test(text));
  if (heading) return heading;
  const match = headingText.match(/(?:Proiect|Propunere)[^.]{30,500}/i);
  return cleanText(match?.[0] ?? fallback);
}

function idFromUrl(sourceUrl: string): string {
  const url = new URL(sourceUrl);
  const nr = url.searchParams.get("nr");
  const an = url.searchParams.get("an");
  const idp = url.searchParams.get("idp");
  if (nr && an) return `PL-x ${nr}/${an}`;
  return `PL-x idp-${idp ?? slugify(sourceUrl)}`;
}

function chamberOfOrigin(text: string): Bill["chamberOfOrigin"] {
  if (/înaintat la Senat|inaintat la Senat|trimis la Senat/i.test(text)) return "deputies";
  if (/transmis(?:ă)? Camerei Deputa/i.test(text)) return "senate";
  return text.includes("Camera Deputa") ? "deputies" : "unknown";
}

function decisionChamber(text: string): ChamberId | undefined {
  const normalized = text.normalize("NFD").replace(/\p{Diacritic}/gu, "");
  if (/camera\s+decizionala[^|.\n]*camera deputatilor/i.test(normalized)) return "deputies";
  if (/camera\s+decizionala[^|.\n]*senat/i.test(normalized)) return "senate";
  if (/camer[ăa]\s+decizional[ăa]\s*:\s*camera deputa/i.test(text)) return "deputies";
  if (/camer[ăa]\s+decizional[ăa]\s*:\s*senat/i.test(text)) return "senate";
  return undefined;
}

function extractStatus(text: string): string {
  const match = text.match(/Stadiu:\s*([^|]{3,240})/i);
  return cleanText(match?.[1] ?? "unknown");
}

function sponsorName(text: string): string {
  if (/Initiator:\s*Guvern|Iniţiator:\s*Guvern/i.test(text)) return "Guvernul României";
  const match = text.match(/Initiator:\s*([^|]{3,160})|Iniţiator:\s*([^|]{3,160})/i);
  return cleanText(match?.[1] ?? match?.[2] ?? "Inițiator necunoscut");
}

function documentLabelFromContext(text: string): string | undefined {
  return cleanText(text.split(/\s{2,}|(?=Forma|Adresa|Raport|Aviz|Proiect)/i).find((part) => part.length > 3) ?? "");
}

export function classifyDeputiesDocumentKind(text: string): DocumentKind {
  const normalized = normalize(text);
  const filename = normalized.split(/[/?#]/).pop() ?? normalized;
  if (/^forma adoptata de camera|^forma adoptata de deputat/.test(normalized)) return "adopted_form";
  if (/^forma pentru promulgare/.test(normalized)) return "promulgation_form";
  if (/promulgare/.test(normalized) || /_stema\.pdf$/.test(normalized)) return "promulgation_form";
  if (/forma adoptata de camera|forma adoptata de deputat/.test(normalized)) return "adopted_form";
  if (/_cd_|cd\d+_|_cd\.pdf$/.test(normalized)) return "adopted_form";
  if (
    /_pr_|proiect de lege|propunere legislativa|forma initiatorului/.test(normalized) ||
    /^pl\d+\.pdf$/.test(filename) ||
    /\/pl\d+_pr_|\/pl\d+_pr_plx_/.test(normalized)
  ) {
    return "proposal";
  }
  if (/forma adoptata de senat/.test(normalized)) return "senate_adopted_form";
  if (/raport/.test(normalized) || /^rp\d+\.pdf$/.test(filename) || /\/rp\d+\.pdf$/.test(normalized)) return "committee_report";
  if (/aviz/.test(normalized) || /^av\d+\.pdf$/.test(filename) || /\/av\d+\.pdf$/.test(normalized)) return "committee_opinion";
  return "other";
}

function sourceChamberFromText(text: string): ChamberId | undefined {
  const normalized = normalize(text);
  if (/senat|\bse\s*$/.test(normalized)) return "senate";
  if (/camera deputatilor|\bcd\s*$/.test(normalized)) return "deputies";
  return undefined;
}

function firstDocumentForRow($: cheerio.CheerioAPI, row: any, sourceUrl: string, documents: DocumentSource[]) {
  const href = $(row).find("a[href$='.pdf'], a[href*='.pdf?'], a[href*='/docs?']").first().attr("href");
  if (!href) return undefined;
  const url = new URL(href.replace(/\\/g, "/"), sourceUrl).toString();
  const hash = sha256(url);
  return documents.find((document) => document.officialUrlHash === hash || document.url === url);
}

function chamberFromText(text: string): BillProcedureStep["chamber"] {
  const normalized = normalize(text);
  if (/camera deputatilor|\bcd\s*$|biroul permanent al camerei deputatilor/.test(normalized)) return "deputies";
  if (/senat|\bse\s*$/.test(normalized)) return "senate";
  return "unknown";
}

function classifyStepType(text: string): BillProcedureStep["stepType"] {
  const normalized = normalize(text);
  if (/sesizare asupra constitutionalitatii|curtea constitutionala|constitutional/.test(normalized)) return "constitutional_review";
  if (/vot final|adoptat de camera|respins de camera|rezultat vot|adoptat de senat|respins de senat/.test(normalized)) {
    if (/senat/.test(normalized)) return "adopted_by_senate";
    return "final_vote";
  }
  if (/promulgare/.test(normalized)) return "promulgation";
  if (/dezbatere in plen|plenul camerei|ordinea de zi/.test(normalized)) return "plenary_debate";
  if (/primire raport|raport favorabil|raport de la/.test(normalized)) return "committee_report_received";
  if (/primire aviz|aviz de la/.test(normalized)) return "committee_opinion_received";
  if (/trimis pentru aviz/.test(normalized)) return "committee_opinion_requested";
  if (/trimis pentru raport|trimis la comis/.test(normalized)) return "sent_to_committee";
  if (/inaintat la senat|trimis la senat/.test(normalized)) return "sent_to_senate";
  if (/camera deputatilor|biroul permanent al camerei deputatilor|inregistrat la camera/.test(normalized)) return "sent_to_deputies";
  if (/prezentare|depunere|inregistrare/.test(normalized)) return "registered";
  return "other";
}

function stepTitle(text: string): string {
  const firstLine = cleanText(text.split(/\n|(?=trimis pentru)|(?=primire)|(?=dezbatere)|(?=adoptat)|(?=respins)/i)[0] ?? text);
  return firstLine.slice(0, 180) || "Etapă procedurală";
}

function extractCommitteeName(text: string): string | undefined {
  const match = text.match(/(Comisia\s+[^;\n.]{8,180})/i);
  return match?.[1] ? cleanText(match[1]) : undefined;
}

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function inferDate(text: string): string | undefined {
  const match = text.match(/(\d{2})[./-](\d{2})[./-](\d{4})/);
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
