import { formatDate, type BillDossier, type BillProcedureStep, type BillProcedureStepType, type StepVerdict } from "@cumsevoteaza/parliament-model";
import type { AppLocale } from "./i18n";

const STEP_LABELS: Record<BillProcedureStepType, { ro: string; en: string }> = {
  registered: { ro: "Înregistrat", en: "Registered" },
  sent_to_senate: { ro: "Înaintat la Senat", en: "Sent to the Senate" },
  adopted_by_senate: { ro: "Adoptat de Senat", en: "Adopted by the Senate" },
  sent_to_deputies: { ro: "Trimis la Camera Deputaților", en: "Sent to the Chamber of Deputies" },
  sent_to_committee: { ro: "Trimis la comisie pentru raport", en: "Sent to committee for a report" },
  committee_opinion_requested: { ro: "Trimis la comisie pentru aviz", en: "Sent to committee for an opinion" },
  committee_opinion_received: { ro: "Aviz primit de la comisie", en: "Committee opinion received" },
  committee_report_received: { ro: "Raport primit de la comisie", en: "Committee report received" },
  plenary_debate: { ro: "Dezbatere în plen", en: "Plenary debate" },
  final_vote: { ro: "Vot final", en: "Final vote" },
  promulgation: { ro: "Promulgare", en: "Promulgation" },
  constitutional_review: { ro: "Control de constituționalitate", en: "Constitutional review" },
  other: { ro: "Alt pas", en: "Other step" },
  urgency_requested: { ro: "Procedură de urgență solicitată", en: "Urgent procedure requested" },
  urgency_decided: { ro: "Procedură de urgență aprobată", en: "Urgent procedure approved" },
  government_view_requested: { ro: "Punct de vedere solicitat Guvernului", en: "Government's view requested" },
  government_view_received: { ro: "Punctul de vedere al Guvernului", en: "Government's view received" },
  opinion_requested: { ro: "Aviz solicitat", en: "Opinion requested" },
  opinion_received: { ro: "Aviz primit", en: "Opinion received" },
  agenda_scheduled: { ro: "Înscris pe ordinea de zi", en: "Put on the agenda" },
  adopted: { ro: "Adoptat", en: "Adopted" },
  rejected: { ro: "Respins", en: "Rejected" },
  withdrawn: { ro: "Retras de inițiator", en: "Withdrawn by the initiator" },
  procedure_ended: { ro: "Procedură încetată", en: "Procedure ended" },
  deadline_extended: { ro: "Termen de adoptare prelungit", en: "Adoption deadline extended" },
  competence_decision: { ro: "Stabilirea competenței", en: "Competence decided" },
  constitutional_window: { ro: "Depus pentru sesizarea constituționalității", en: "Filed for a possible constitutional referral" },
  sent_to_president: { ro: "Trimis la Președinte pentru promulgare", en: "Sent to the President for promulgation" },
  published: { ro: "Publicat în Monitorul Oficial", en: "Published in the Official Gazette" }
};

const CHAMBER_LABELS: Record<string, { ro: string; en: string }> = {
  deputies: { ro: "Camera Deputaților", en: "Chamber of Deputies" },
  senate: { ro: "Senat", en: "Senate" },
  joint: { ro: "Ședință comună", en: "Joint sitting" },
  president: { ro: "Președinția", en: "The Presidency" },
  unknown: { ro: "Etapă fără cameră indicată", en: "Chamber not indicated" }
};

const VERDICT_LABELS: Record<StepVerdict, { ro: string; en: string }> = {
  favorable: { ro: "Favorabil", en: "Favourable" },
  unfavorable: { ro: "Nefavorabil", en: "Unfavourable" },
  favorable_with_amendments: { ro: "Favorabil, cu amendamente", en: "Favourable, with amendments" },
  rejection: { ro: "Raport de respingere", en: "Report recommends rejection" }
};

export function stepTypeLabel(type: BillProcedureStepType, locale: AppLocale): string {
  return STEP_LABELS[type]?.[locale] ?? type;
}

export function stepChamberLabel(chamber: string, locale: AppLocale): string {
  return (CHAMBER_LABELS[chamber] ?? CHAMBER_LABELS.unknown!)[locale];
}

/** "Favorabil, cu amendamente (4 admise)": what the report or opinion concluded, with the amendment counts when printed. */
export function verdictLine(step: Pick<BillProcedureStep, "verdict" | "amendmentsAdmitted" | "amendmentsRejected">, locale: AppLocale): string | undefined {
  if (!step.verdict) return undefined;
  const parts: string[] = [];
  if (step.amendmentsAdmitted !== undefined) parts.push(locale === "ro" ? `${step.amendmentsAdmitted} admise` : `${step.amendmentsAdmitted} admitted`);
  if (step.amendmentsRejected !== undefined) parts.push(locale === "ro" ? `${step.amendmentsRejected} respinse` : `${step.amendmentsRejected} rejected`);
  return `${VERDICT_LABELS[step.verdict][locale]}${parts.length ? ` (${parts.join(", ")})` : ""}`;
}

/** "284 pentru · 1 împotrivă · 2 abțineri · 2 nu au votat". */
export function resultLine(result: BillProcedureStep["result"], locale: AppLocale): string | undefined {
  if (!result) return undefined;
  const labels = locale === "ro" ? { for: "pentru", against: "împotrivă", abstention: abstentionRo, notVoting: "nu au votat" } : { for: "for", against: "against", abstention: abstentionEn, notVoting: "did not vote" };
  const parts = (["for", "against", "abstention", "notVoting"] as const).flatMap((key) => {
    const value = result[key];
    if (value === undefined) return [];
    const label = labels[key];
    return [`${value} ${typeof label === "function" ? label(value) : label}`];
  });
  return parts.length ? parts.join(" · ") : undefined;
}
const abstentionRo = (count: number) => (count === 1 ? "abținere" : "abțineri");
const abstentionEn = (count: number) => (count === 1 ? "abstention" : "abstentions");

/** "Termen pentru amendamente: 19 feb. 2026 · termen pentru raport: 3 mar. 2026". */
export function deadlineLine(step: Pick<BillProcedureStep, "deadlineAmendmentsOn" | "deadlineOn" | "stepType">, locale: AppLocale): string | undefined {
  const parts: string[] = [];
  if (step.deadlineAmendmentsOn) parts.push(`${locale === "ro" ? "termen pentru amendamente" : "amendments due"}: ${formatDate(step.deadlineAmendmentsOn, locale)}`);
  if (step.deadlineOn) {
    const label = step.stepType === "committee_opinion_requested" || step.stepType === "opinion_requested" || step.stepType === "government_view_requested" ? (locale === "ro" ? "termen pentru aviz" : "opinion due") : locale === "ro" ? "termen pentru raport" : "report due";
    parts.push(`${label}: ${formatDate(step.deadlineOn, locale)}`);
  }
  return parts.length ? parts.join(" · ") : undefined;
}

export type FateTone = "done" | "stopped" | "open";

export interface FateView {
  tone: FateTone;
  headline: string;
  details: string[];
}

/** The bill's fate in words, only from what the dossier prints; a bill still moving shows the official stage line. */
export function fateView(dossier: BillDossier, locale: AppLocale): FateView {
  const ro = locale === "ro";
  const details: string[] = [];
  if (dossier.outcome === "promulgated") {
    const law = dossier.lawNumber ? `${ro ? "Legea nr." : "Law no."} ${dossier.lawNumber}/${dossier.lawYear ?? ""}`.replace(/\/$/, "") : ro ? "Lege promulgată" : "Promulgated law";
    if (dossier.decreeNumber) details.push(`${ro ? "Decret de promulgare nr." : "Promulgation decree no."} ${dossier.decreeNumber}${dossier.decreeYear ? `/${dossier.decreeYear}` : ""}${dossier.decreeOn ? ` ${ro ? "din" : "of"} ${formatDate(dossier.decreeOn, locale)}` : ""}`);
    if (dossier.gazetteNumber) details.push(`${ro ? "Monitorul Oficial nr." : "Official Gazette no."} ${dossier.gazetteNumber}${dossier.gazetteOn ? ` ${ro ? "din" : "of"} ${formatDate(dossier.gazetteOn, locale)}` : ""}`);
    else details.push(ro ? "Numărul din Monitorul Oficial nu este încă citit din sursă" : "Official Gazette number not yet read from the source");
    return { tone: "done", headline: law, details };
  }
  if (dossier.outcome === "rejected") return { tone: "stopped", headline: ro ? "Respins" : "Rejected", details: dossier.outcomeOn ? [formatDate(dossier.outcomeOn, locale)] : [] };
  if (dossier.outcome === "withdrawn") return { tone: "stopped", headline: ro ? "Retras de inițiator" : "Withdrawn by the initiator", details: dossier.outcomeOn ? [formatDate(dossier.outcomeOn, locale)] : [] };
  if (dossier.outcome === "ended") return { tone: "stopped", headline: ro ? "Procedură încetată" : "Procedure ended", details: dossier.outcomeOn ? [formatDate(dossier.outcomeOn, locale)] : [] };
  return { tone: "open", headline: ro ? "În procedură" : "In progress", details: dossier.stageText ? [dossier.stageText] : [] };
}

const REGISTRATION_LABELS: Record<BillDossier["registrations"][number]["body"], { ro: string; en: string }> = {
  bpi: { ro: "Nr. B.P.I.", en: "B.P.I. no." },
  cdep: { ro: "Camera Deputaților", en: "Chamber of Deputies" },
  senate: { ro: "Senat", en: "Senate" },
  government: { ro: "Adresa Guvernului", en: "Government's letter" }
};

export function registrationLine(registration: BillDossier["registrations"][number], locale: AppLocale): string {
  return `${REGISTRATION_LABELS[registration.body][locale]} ${registration.number}${registration.date ? ` · ${formatDate(registration.date, locale)}` : ""}`;
}

/** Steps run in lanes by chamber: consecutive steps of one chamber share a heading. */
export function groupStepsByChamber<T extends { chamber: string }>(steps: T[]): Array<{ chamber: string; steps: T[] }> {
  const groups: Array<{ chamber: string; steps: T[] }> = [];
  for (const step of steps) {
    const last = groups.at(-1);
    if (last && last.chamber === step.chamber) last.steps.push(step);
    else groups.push({ chamber: step.chamber, steps: [step] });
  }
  return groups;
}
