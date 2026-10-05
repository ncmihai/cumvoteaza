import type { Element } from "domhandler";
import * as cheerio from "cheerio";
import { readActionCell } from "./action-cell";
import { deriveFate } from "./fate";
import { fold, isoFromRomanianDate, typeStepWording } from "./step-typing";
import { stepsFromRow } from "./steps";
import type { DossierDocumentLink, DossierInitiator, DossierRegistration, DossierStep, ParsedDossier, StepChamber } from "./types";

const BASE = "https://www.cdep.ro/";
const squash = (text: string) => text.replace(/ /g, " ").replace(/\s+/g, " ").trim();

const MARKER_CHAMBER: Record<string, StepChamber> = { CD: "deputies", SE: "senate", PA: "president" };

/** "Pl-x nr. 56/2026" → "PL-x 56/2026". */
function selfIdFrom(text: string): string | undefined {
  const match = text.match(/P[lL]-?x\s*(?:nr\.?)?\s*(\d+)\s*\/\s*(\d{4})/i);
  return match ? `PL-x ${Number(match[1])}/${match[2]}` : undefined;
}

function registrations($: cheerio.CheerioAPI, labelCells: Map<string, Element>): DossierRegistration[] {
  const result: DossierRegistration[] = [];
  const dates = (text: string) => [...text.matchAll(/(\d+)\s*\/\s*(\d{2}\.\d{2}\.\d{4})/g)].map((m) => ({ number: m[1]!, date: isoFromRomanianDate(m[2]) }));
  for (const [label, cell] of labelCells) {
    const value = squash($(cell).text());
    if (/^- b\.?p\.?i/i.test(label)) for (const item of dates(value)) result.push({ body: "bpi", ...item });
    else if (/^- camera deputa/i.test(label)) for (const item of dates(value)) result.push({ body: "cdep", ...item });
    else if (/^- senat/i.test(label)) {
      for (const m of value.matchAll(/([A-Z]{1,3}\d+)\s*\/\s*(\d{2}\.\d{2}\.\d{4})/g)) result.push({ body: "senate", number: m[1]!, date: isoFromRomanianDate(m[2]) });
    } else if (/^- guvern/i.test(label)) for (const item of dates(value)) result.push({ body: "government", ...item });
  }
  return result;
}

function initiatorsFrom($: cheerio.CheerioAPI, cell: Element): { initiators: DossierInitiator[]; countText?: string } {
  const root = $(cell);
  const lead = squash(root.contents().toArray().filter((node) => node.type === "text").map((node) => (node as unknown as { data: string }).data).join(" "));
  const initiators: DossierInitiator[] = [];
  root.find("table tr").each((_, row) => {
    const cells = $(row).children("td");
    const label = squash($(cells[0]).text()).replace(/:$/, "");
    const chamber = /^deputati/i.test(fold(label)) ? "deputies" : /^senatori/i.test(fold(label)) ? "senate" : undefined;
    const group = label.includes(" - ") ? label.split(" - ").slice(1).join(" - ").trim() : undefined;
    $(cells[1]).find("a[href*='structura2015.mp']").each((__, anchor) => {
      const href = $(anchor).attr("href") ?? "";
      const params = new URL(href, BASE).searchParams;
      const idm = Number(params.get("idm"));
      const legislature = Number(params.get("leg"));
      const cam = params.get("cam");
      const profileChamber = cam === "1" ? "senate" : cam === "2" ? "deputies" : chamber;
      initiators.push({
        kind: "member",
        name: squash($(anchor).text()),
        ...(profileChamber ? { chamber: profileChamber } : {}),
        ...(group ? { group } : {}),
        ...(idm && legislature && profileChamber ? { profile: { legislature, chamber: profileChamber, idm } } : {})
      });
    });
  });
  if (initiators.length === 0 && lead) {
    const folded = fold(lead);
    if (/^guvern/.test(folded)) initiators.push({ kind: "government", name: "Guvernul României" });
    else initiators.push({ kind: /cetatean/.test(folded) ? "citizens" : "other", name: lead.replace(/:$/, "") });
  }
  return { initiators, countText: lead || undefined };
}

function documentsFrom($: cheerio.CheerioAPI, cell: Element): DossierDocumentLink[] {
  const documents: DossierDocumentLink[] = [];
  $(cell).find("tr").each((_, row) => {
    const href = $(row).find("a[href]").first().attr("href");
    const label = squash($(row).children("td").last().text());
    if (href && label) documents.push({ label, url: new URL(href.replace(/\\/g, "/"), BASE).toString() });
  });
  return documents;
}

function initiativeKind(type: string | undefined, government: boolean): ParsedDossier["initiativeKind"] {
  const folded = fold(type ?? "");
  if (/aprobarea (o\.?u\.?g|ordonantei)/.test(folded)) return "ordinance_approval";
  if (/^proiect/.test(folded)) return government ? "government_bill" : "other";
  if (/^propunere/.test(folded)) return "proposal";
  return type ? "other" : undefined;
}

/** A Chamber of Deputies bill page (`upl_pck2015.proiect`): the header facts, the initiators with profile links, and every step of the procedure. */
export function parseCdepDossier(html: string, sourceUrl: string): ParsedDossier {
  const $ = cheerio.load(html);
  const labelCells = new Map<string, Element>();
  $("tr").each((_, row) => {
    const cells = $(row).children("td");
    if (cells.length < 2) return;
    const label = squash($(cells[0]).text());
    if (/:$/.test(label) && label.length < 60 && !labelCells.has(label)) labelCells.set(label, cells[1] as Element);
  });
  const text = (label: RegExp) => {
    const entry = [...labelCells].find(([key]) => label.test(fold(key)));
    return entry ? squash($(entry[1]).text()) : undefined;
  };
  const cellOf = (label: RegExp) => [...labelCells].find(([key]) => label.test(fold(key)))?.[1];

  const initiatorCell = cellOf(/^initiator/);
  const { initiators, countText } = initiatorCell ? initiatorsFrom($, initiatorCell) : { initiators: [], countText: undefined };
  const consultedCell = cellOf(/^consultati/);
  const typeText = text(/^tip initiativa/);
  const stageCell = cellOf(/^stadiu/);
  const stageText = stageCell
    ? squash(
        $(stageCell)
          .clone()
          .find("a")
          .each((_, anchor) => void $(anchor).append(" "))
          .end()
          .text()
      )
    : undefined;
  const urgent = text(/^procedura de urgenta/);
  const decision = fold(text(/^camera decizionala/) ?? "");
  const decisionChamber = /deputat/.test(decision) ? ("deputies" as const) : /senat/.test(decision) ? ("senate" as const) : undefined;

  // The procedure table: a marker cell (CD, SE, PA) spans the rows of its group; each step row has a date (blank = same day) and an action cell.
  const steps: DossierStep[] = [];
  const unrecognised: string[] = [];
  const table = $("table").toArray().find((candidate) => /actiunea/i.test(fold($(candidate).children("tbody").children("tr").first().text() || $(candidate).children("tr").first().text())));
  if (table) {
    let chamber: StepChamber = "unknown";
    let date: string | undefined;
    const rows = $(table).children("tbody").children("tr").length ? $(table).children("tbody").children("tr") : $(table).children("tr");
    rows.each((_, row) => {
      const marker = $(row).children("td[rowspan]").toArray().map((cell) => squash($(cell).text())).find((value) => MARKER_CHAMBER[value]);
      if (marker) {
        chamber = MARKER_CHAMBER[marker]!;
        return;
      }
      const cells = $(row).children("td");
      if ($(row).attr("valign") !== "top" || cells.length < 3) return;
      const rowDate = isoFromRomanianDate(squash($(cells[0]).text()));
      date = rowDate ?? date;
      if (!date) return;
      const cell = readActionCell($, cells[2] as Element, BASE);
      if (!cell.lead && cell.committees.length === 0 && cell.documents.length === 0) return;
      const wording = typeStepWording(cell.lead);
      if (!wording.recognised && cell.lead) unrecognised.push(cell.lead);
      steps.push(...stepsFromRow({ source: "cdep", chamber, occurredOn: date, firstOrder: steps.length, cell, wording }));
    });
  }

  const character = text(/^caracter/) ?? steps.map((step) => step.detail?.match(/legilor (ordinare|organice)/i)?.[1]).find(Boolean);
  const registrationList = registrations($, new Map([...labelCells].map(([label, cell]) => [label, cell])));
  const govAddress = text(/^adresa guvernului|^adresa:/);
  if (govAddress && /\d/.test(govAddress) && !registrationList.some((item) => item.body === "government")) registrationList.push({ body: "government", number: govAddress });
  // A promulgated bill's stage cell prints the law's number as a link followed by the law's title: keep the number ("Lege 53/2026").
  const lawLink = stageCell ? $(stageCell).find("a").toArray().map((anchor) => squash($(anchor).text())).find((value) => /^Lege \d+\/\d{4}$/i.test(value)) : undefined;
  const stage = lawLink ?? stageText;

  return {
    source: "cdep",
    sourceUrl,
    selfId: selfIdFrom($("title").text() || $(".detalii-initiativa").text() || ""),
    title: squash($(".detalii-initiativa h4").first().text()) || undefined,
    registrations: registrationList,
    initiativeType: typeText,
    initiativeKind: initiativeKind(typeText, initiators.some((item) => item.kind === "government")),
    decisionChamber,
    character: character?.toLowerCase(),
    urgent: urgent === undefined ? undefined : /^da/i.test(fold(urgent)),
    stage,
    summary: text(/^obiect de reglementare/),
    tacitDeadline: isoFromRomanianDate(text(/^termen adoptare/)),
    initiators,
    initiatorCountText: countText,
    steps,
    consulted: consultedCell ? documentsFrom($, consultedCell) : [],
    fate: deriveFate({ steps, stage, decisionChamber }),
    unrecognised
  };
}
