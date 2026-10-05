import type { Element } from "domhandler";
import * as cheerio from "cheerio";
import { readActionCell } from "./action-cell";
import { deriveFate } from "./fate";
import { fold, isoFromRomanianDate, typeStepWording } from "./step-typing";
import { stepsFromRow } from "./steps";
import type { DossierInitiator, DossierRegistration, DossierStep, ParsedDossier, StepChamber } from "./types";

const BASE = "https://www.senat.ro/";
const squash = (text: string) => text.replace(/ /g, " ").replace(/\s+/g, " ").trim();
const MARKER_CHAMBER: Record<string, StepChamber> = { CD: "deputies", SE: "senate", PA: "president" };

/** "Presură Alexandra - senator PSD; Câciu Adrian - deputat PSD; ..." or "Guvernul României". */
export function parseSenateInitiators(text: string): DossierInitiator[] {
  const cleaned = squash(text);
  if (!cleaned || cleaned === "-") return [];
  if (/^guvern/i.test(fold(cleaned))) return [{ kind: "government", name: "Guvernul României" }];
  return cleaned
    .split(/\s*;\s*/)
    .filter(Boolean)
    .map((part): DossierInitiator => {
      const match = part.match(/^(.*?)\s+-\s+(deputat|senator)\s*(.*)$/i);
      if (!match) return { kind: /cetatean/i.test(fold(part)) ? "citizens" : "other", name: part };
      return { kind: "member", name: squash(match[1]!), chamber: /^deputat/i.test(match[2]!) ? "deputies" : "senate", ...(squash(match[3] ?? "") ? { group: squash(match[3]!) } : {}) };
    });
}

function chamberCode(row: cheerio.Cheerio<Element>, $: cheerio.CheerioAPI): StepChamber {
  const code = squash($(row).children("td").last().text());
  if (MARKER_CHAMBER[code]) return MARKER_CHAMBER[code]!;
  const rowClass = ($(row).attr("class") ?? "").match(/(CD|SE|PA)-row/)?.[1];
  return rowClass ? MARKER_CHAMBER[rowClass]! : "unknown";
}

/** A Senate bill page (`Lista.aspx?an_cls=..&nr_cls=..`): the header facts and every step of the procedure, with the Official Gazette at the end. */
export function parseSenateDossier(html: string, sourceUrl: string): ParsedDossier {
  const $ = cheerio.load(html);
  const labelCells = new Map<string, Element>();
  $("table.legislation-list-table tr").each((_, row) => {
    const cells = $(row).children("td");
    if (cells.length < 2) return;
    const label = squash($(cells[0]).text());
    if (label && !labelCells.has(label)) labelCells.set(label, cells[1] as Element);
  });
  const cellOf = (label: RegExp) => [...labelCells].find(([key]) => label.test(fold(key)))?.[1];
  const text = (label: RegExp) => {
    const cell = cellOf(label);
    return cell ? squash($(cell).text()) : undefined;
  };

  const heading = $(".lista-legis-panel-2 h4").first();
  const selfId = squash(heading.text()).match(/[A-Z]{1,3}\d+\/\d{4}/)?.[0];
  const title = squash(heading.next("p").text()) || undefined;

  const steps: DossierStep[] = [];
  const unrecognised: string[] = [];
  const amendmentDeadlines: Array<{ chamber: StepChamber; date: string; deadline: string }> = [];
  const registrationDates: Record<string, string | undefined> = {};
  $("table.legislative-procedure-table > tbody > tr").each((_, row) => {
    const cells = $(row).children("td");
    if (cells.length < 2) return;
    const date = isoFromRomanianDate(squash($(cells[0]).text()));
    if (!date) return;
    const chamber = chamberCode($(row) as cheerio.Cheerio<Element>, $);
    const cell = readActionCell($, cells[1] as Element, BASE);
    const folded = fold(cell.lead);
    const amendmentDeadline = folded.match(/^termen depunere amendamente:?\s*(.*)$/);
    if (amendmentDeadline) {
      const deadline = isoFromRomanianDate(amendmentDeadline[1]);
      if (deadline) amendmentDeadlines.push({ chamber, date, deadline });
      return;
    }
    if (!cell.lead && cell.committees.length === 0 && cell.documents.length === 0) return;
    const number = cell.lead.match(/cu nr\.\s*([BL]\d+)/i)?.[1]?.toUpperCase();
    if (number) registrationDates[number] ??= date;
    const wording = typeStepWording(cell.lead);
    if (!wording.recognised && cell.lead) unrecognised.push(cell.lead);
    steps.push(...stepsFromRow({ source: "senate", chamber, occurredOn: date, firstOrder: steps.length, cell, wording }));
  });
  for (const item of amendmentDeadlines) {
    for (const step of steps) if (step.type === "sent_to_committee" && step.chamber === item.chamber && step.occurredOn === item.date && !step.deadlineAmendmentsOn) step.deadlineAmendmentsOn = item.deadline;
  }

  const registrations: DossierRegistration[] = [];
  const senateNumber = text(/^numar de inregistrare senat/)?.match(/[A-Z]{1,3}\d+/)?.[0];
  if (senateNumber) registrations.push({ body: "senate", number: senateNumber, date: registrationDates[senateNumber] });
  for (const [number, date] of Object.entries(registrationDates)) if (number !== senateNumber) registrations.push({ body: "senate", number, date });
  const cdepNumber = text(/^numar de inregistrare camera deputatilor/)?.match(/PLX\d+\/\d{4}/i)?.[0];
  if (cdepNumber) registrations.push({ body: "cdep", number: cdepNumber.toUpperCase() });
  const address = text(/^adresa:?$/);
  if (address && /\d/.test(address)) registrations.push({ body: "government", number: address });

  const typeText = text(/^tip initiativa/);
  const initiators = parseSenateInitiators(text(/^initiatori/) ?? "");
  const first = fold(text(/^prima camera/) ?? "");
  const urgent = text(/^procedura de urgenta/);
  const stage = text(/^stadiu/);
  const character = text(/^caracterul legii/);
  const typeFolded = fold(typeText ?? "");

  return {
    source: "senate",
    sourceUrl,
    selfId,
    title,
    registrations,
    initiativeType: typeText,
    initiativeKind: /aprobarea (o\.?u\.?g|ordonantei)/.test(typeFolded) ? "ordinance_approval" : /^proiect/.test(typeFolded) ? (initiators.some((item) => item.kind === "government") ? "government_bill" : "other") : /^propunere/.test(typeFolded) ? "proposal" : typeText ? "other" : undefined,
    firstChamber: /^senat/.test(first) ? "senate" : /camera deputat/.test(first) ? "deputies" : undefined,
    character: character ? fold(character) : undefined,
    urgent: urgent === undefined ? undefined : /^da/.test(fold(urgent)),
    stage,
    tacitDeadline: isoFromRomanianDate(text(/^termen adoptare/)),
    initiators,
    steps,
    consulted: [],
    fate: deriveFate({ steps, stage }),
    unrecognised
  };
}
