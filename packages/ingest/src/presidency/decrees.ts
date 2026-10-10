import { parseLegislatieSearch } from "../dossiers/gazette-lookup";
import type { DecreeKind } from "@cumsevoteaza/parliament-model";
import { fold } from "./text";

/**
 * Sprint 14 (D-037): one presidential decree from the legislative portal's record, and the type its title gives it. The portal's record holds the title ("DECRET nr. 794 din 6 octombrie 2026
 * privind desemnarea candidatului ... EMITENT Președintele României PUBLICAT ÎN Monitorul Oficial nr. 842 din 06 octombrie 2026"), the text of the decree (which names the people it concerns,
 * decorated private persons among them, so the text is never stored in the database) and the signature at its end.
 */
const MONTHS: Record<string, string> = { ianuarie: "01", februarie: "02", martie: "03", aprilie: "04", mai: "05", iunie: "06", iulie: "07", august: "08", septembrie: "09", octombrie: "10", noiembrie: "11", decembrie: "12" };

export { fold };

export interface DecreeRecord {
  number: number;
  year: number;
  issuedOn: string;
  /** What follows the date: "privind desemnarea candidatului la funcția de prim-ministru". */
  subject: string;
  gazetteNumber?: string;
  gazetteOn?: string;
  portalUrl: string;
  portalId?: string;
  /** Who signed it, from the signature at the end: "KLAUS-WERNER IOHANNIS", "ILIE-GAVRIL BOLOJAN" (interim), "NICUȘOR-DANIEL DAN". */
  signer?: string;
  signedAsInterim?: boolean;
  /** The decree's own text, used by the readers of named offices; not stored. */
  text: string;
}

const isoOf = (day: string, month: string, year: string) => {
  const mm = MONTHS[fold(month)];
  return mm ? `${year}-${mm}-${day.padStart(2, "0")}` : undefined;
};

/** The signature that closes the text: "PREȘEDINTELE ROMÂNIEI KLAUS-WERNER IOHANNIS București, 22 noiembrie 2021. Nr. 1.123." */
export function signatureOf(text: string): { name: string; interim: boolean } | undefined {
  // Closed by the place and date, or, on a decree the Prime Minister countersigns, by "În temeiul art. 100 alin. (2) ... contrasemnăm acest decret".
  const match = /PRE[SȘŞ]EDINTELE ROM[AÂ]NIEI\s*(-\s*interimar\s*-)?\s*([A-ZĂÂÎȘŞȚŢ][A-ZĂÂÎȘŞȚŢ.\- ]{3,50}?)\s+(?:Bucure[sșş]ti,|[ÎI]n temeiul art\. 100)/.exec(text);
  return match ? { name: match[2]!.replace(/\s+/g, " ").trim(), interim: Boolean(match[1]) } : undefined;
}

/** The decrees of the President in a page of the portal's answer; any other act (a decree of another body, a law that mentions a decree) is left out. */
export function parseDecreePage(xml: string): DecreeRecord[] {
  const records: DecreeRecord[] = [];
  for (const act of parseLegislatieSearch(xml)) {
    // The portal writes the issuer with a question mark where the letter ș should be ("Pre?edintele României").
    if (fold(act.type) !== "decret" || !/pre.?edintele rom.?niei/.test(fold(act.issuer))) continue;
    const head = /DECRET\s+nr\.\s*([\d.]+)\s*\*{0,2}\)?\s+din\s+(\d{1,2})\s+([A-Za-zăâîșşțţĂÂÎȘŞȚŢ]+)\s+(\d{4})\s*(.*?)\s*EMITENT/s.exec(act.title);
    if (!head) continue;
    const issuedOn = isoOf(head[2]!, head[3]!, head[4]!);
    const number = Number(head[1]!.replace(/\./g, ""));
    if (!issuedOn || !Number.isFinite(number)) continue;
    const published = /PUBLICAT\s+[ÎI]N\s+Monitorul\s+Oficial\s+nr\.\s*(\d+)\s+din\s+(\d{1,2})\s+([A-Za-zăâîșşțţ]+)\s+(\d{4})/i.exec(act.title);
    const signature = signatureOf(act.text);
    const portalId = /DetaliiDocument\/(\d+)/.exec(act.link)?.[1];
    records.push({
      number,
      year: Number(head[4]),
      issuedOn,
      subject: head[5]!.replace(/\s+/g, " ").trim(),
      ...(published ? { gazetteNumber: published[1]!, gazetteOn: isoOf(published[2]!, published[3]!, published[4]!) ?? undefined } : {}),
      portalUrl: act.link,
      ...(portalId ? { portalId } : {}),
      ...(signature ? { signer: signature.name, signedAsInterim: signature.interim } : {}),
      text: act.text
    });
  }
  return records;
}

/** The kinds of decree whose text names a person holding or taking a public office; the other kinds (decorations, pardons, judges and prosecutors, ranks) never have a name read from them. */
export const REGISTER_KINDS = new Set<DecreeKind>(["government", "pm_designation", "diplomacy", "constitutional_court", "judiciary_leadership", "presidential_staff"]);

export interface NamedPerson {
  name: string;
  /** The sentence of the decree that names them, as printed (cut at 300 characters). */
  role: string;
  /** The whole sentence, which the reader of the action and the office needs (an ambassador's sentence names every country before the verb); it is not stored. */
  sentence: string;
}

const HONORIFIC_NAME = /\b(?:[Dd]omnul|[Dd]omnului|[Dd]oamna|[Dd]oamnei)\s+([A-ZĂÂÎȘŞȚŢ][\p{L}'’-]*(?:\s+[A-ZĂÂÎȘŞȚŢ][\p{L}'’.-]*){1,4})/gu;

/**
 * The people a decree of an office-holding kind names ("Se numește domnul X în funcția de ..."), read from its operative part (after "decretează:" and before the signature),
 * each with the sentence that names them. Nothing is read from the other kinds.
 */
export function namedPersons(kind: DecreeKind, text: string): NamedPerson[] {
  if (!REGISTER_KINDS.has(kind)) return [];
  const start = /d\s*e\s*c\s*r\s*e\s*t\s*e\s*a\s*z\s*[ăa]\s*:/i.exec(text);
  if (!start) return [];
  const end = text.search(/PRE[SȘŞ]EDINTELE ROM[AÂ]NIEI/);
  const body = text.slice(start.index + start[0].length, end > start.index ? end : undefined).replace(/^\s*\+?\s*(ARTICOL UNIC|Articolul\s*\d+)\s*/i, "");
  const sentences = body.split(/(?<=[.;])\s+(?=(?:\+\s*)?[A-ZĂÂÎȘŞȚŢ])/).map((sentence) => sentence.replace(/^\+\s*(ARTICOL UNIC|Articolul\s*\d+)\s*/i, "").trim()).filter(Boolean);
  const people = new Map<string, NamedPerson>();
  for (const sentence of sentences) {
    for (const match of sentence.matchAll(HONORIFIC_NAME)) {
      const name = match[1]!.replace(/\.$/, "").replace(/\s+/g, " ").trim();
      if (name.split(" ").length < 2 || people.has(fold(name))) continue;
      people.set(fold(name), { name, role: sentence.length > 300 ? `${sentence.slice(0, 297)}…` : sentence, sentence });
    }
  }
  return [...people.values()];
}
