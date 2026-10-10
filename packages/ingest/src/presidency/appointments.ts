import type { DecreeKind, OfficeKey } from "@cumsevoteaza/parliament-model";
import { fold } from "./text";

/**
 * Sprint 18 (D-042): what a decree does to the person it names, and the office it concerns, read from the sentence that names them ("Domnul X se numește în funcția de procuror general ... pe o perioadă de 3 ani").
 * Plain phrases; a sentence no rule knows is "other" with the action "other", so the share we could not read is known.
 */
export type AppointmentAction = "appointment" | "reappointment" | "interim" | "designation" | "release" | "resignation" | "dismissal" | "recall" | "rank" | "other";

export interface AppointmentFacts {
  action: AppointmentAction;
  office: OfficeKey;
  /** The office as the decree words it ("procuror-șef al Direcției Naționale Anticorupție"), cut at 200 characters. */
  title?: string;
}

const has = (text: string, pattern: RegExp) => pattern.test(text);

export function actionOf(sentence: string): AppointmentAction {
  const s = fold(sentence);
  if (has(s, /\bse recheama\b/)) return "recall";
  if (has(s, /\bse acorda gradul diplomatic\b/)) return "rank";
  if (has(s, /\bse revoca\b/)) return "dismissal";
  if (has(s, /\bse ia act de demisia\b|\bca urmare a demisiei\b|\bdemisia\b/)) return "resignation";
  if (has(s, /\bse reinvesteste\b|\breinvestirea\b|\bse prelungeste\b/)) return "reappointment";
  if (has(s, /\bse elibereaza\b|\beste eliberat|\beste eliberata\b|\bse incheie\b|\binceteaza\b/)) return "release";
  if (has(s, /\bse desemneaza\b/)) return has(s, /\binterimar\b/) ? "interim" : "designation";
  if (has(s, /\bse numeste\b|\bse numesc\b|\beste numit|\beste numita\b|\bse acrediteaza\b|\bse invesm?este\b/)) return "appointment";
  // "doamna X își va încheia misiunea în termen de cel mult 90 de zile": an ambassador's mission ends.
  if (has(s, /\bincheia misiunea\b|\bincetarea misiunii\b/)) return "release";
  return "other";
}

/** The office as the sentence words it: what follows "în funcția de", "în calitate de" or "din calitatea de", up to the term, the reason or the end of the sentence. */
export function titleOf(sentence: string): string | undefined {
  const match = /(?:[iî]n|din)\s+(?:func[tț]ia|func[tţ]ia|calitate(?:a)?)\s+(?:de\s+)?(.+?)(?:\s*:|\s*,?\s*(?:pe|pentru)\s+o\s+perioad[aă]|\s*,?\s*ca\s+urmare|\s*,\s*la\s+cerere|\s+[sşș]i\s+se\s+constat[aă]|\s*,\s*[iî]ncep[aâ]nd|\.\s*$|$)/i.exec(sentence.replace(/\s+/g, " "));
  const title = match?.[1]?.trim().replace(/[.,;]+$/, "");
  if (!title) return undefined;
  return title.length > 200 ? `${title.slice(0, 197)}…` : title;
}

const DNA = /directiei nationale anticoruptie/;
const DIICOT = /directiei de investigare a infractiunilor de criminalitate organizata/;

/** The office a decree of this kind concerns, from the title the sentence gives (or the whole sentence when it gives none). */
export function officeOf(kind: DecreeKind, sentence: string, title: string | undefined): OfficeKey {
  const t = fold(title ?? sentence);
  const s = fold(sentence);
  if (kind === "constitutional_court") return "ccr-judge";
  if (kind === "pm_designation") return "pm-candidate";
  if (kind === "presidential_staff") {
    if (has(t, /consilier prezidential/) || has(s, /consilier prezidential/)) return "presidential-adviser";
    if (has(t, /consilier de stat/) || has(s, /consilier de stat/)) return "state-counsellor";
    return "other";
  }
  if (kind === "judiciary_leadership") {
    if (has(t, /\bpresedinte(le)? al inaltei curti/) && !has(t, /\bvicepresedinte/)) return "iccj-president";
    if (has(t, /\bvicepresedinte/)) return "iccj-vice-president";
    if (has(t, /presedinte(le)? de sectie|presedinte(le)? al sectiei/)) return "iccj-section-president";
    if (has(t, /^(prim-?adjunct|adjunct)\b.*procurorului general|^(prim-?adjunct|adjunct)\b.*procurorului[ -]general/)) return "prosecutor-general-deputy";
    if (has(t, /^procuror(ul)? general\b/)) return "prosecutor-general";
    if (has(t, /(adjunct al procurorului[- ]sef|procuror[- ]sef adjunct) al/)) return has(t, DNA) ? "dna-deputy" : has(t, DIICOT) ? "diicot-deputy" : "prosecutor-section-chief";
    if (has(t, /\bprocuror[- ]?sef\b.* al sectiei|\bprocuror[- ]?sef\b.* al sectiilor/)) return "prosecutor-section-chief";
    if (has(t, /^procuror[- ]?sef\b/)) return has(t, DNA) ? "dna-chief" : has(t, DIICOT) ? "diicot-chief" : "prosecutor-section-chief";
    return "other";
  }
  if (kind === "government") {
    if (has(t, /^viceprim-?ministru|viceprim-?ministru\b/) && !has(t, /\bministrul\b/)) return "deputy-prime-minister";
    if (has(t, /^prim-?ministru\b/)) return "prime-minister";
    if (has(t, /\bministru|\bministrul\b/)) return "minister";
    return "other";
  }
  if (kind === "diplomacy") {
    if (has(s, /gradul diplomatic/)) return "diplomatic-rank";
    if (has(s, /misiunea/)) return "ambassador";
    if (has(t, /\bambasador/) || has(s, /\bambasador/)) return "ambassador";
    if (has(t, /\bconsul/) || has(s, /\bconsul/)) return "consul";
    if (has(t, /reprezentant permanent/) || has(s, /reprezentant permanent/)) return "permanent-representative";
    return "other";
  }
  return "other";
}

export function classifyAppointment(kind: DecreeKind, sentence: string): AppointmentFacts {
  const title = titleOf(sentence);
  return { action: actionOf(sentence), office: officeOf(kind, sentence, title), ...(title ? { title } : {}) };
}
