import type { ReadCell } from "./action-cell";
import { typeStepWording, voteCountsIn, type TypedWording } from "./step-typing";
import type { DossierSourceName, DossierStep, StepChamber, StepType } from "./types";

/** Steps that name the committees they concern: a list of committees in one row becomes one step per committee. */
const COMMITTEE_STEPS = new Set<StepType>(["sent_to_committee", "committee_opinion_requested", "committee_opinion_received", "committee_report_received", "competence_decision"]);

export interface RowInput {
  source: DossierSourceName;
  chamber: StepChamber;
  occurredOn: string;
  /** Order of the first step this row yields. */
  firstOrder: number;
  cell: ReadCell;
  wording: TypedWording;
}

/** One procedure row to its steps. Everything stays as the page printed it; the wording only types it. */
export function stepsFromRow({ source, chamber, occurredOn, firstOrder, cell, wording }: RowInput): DossierStep[] {
  // The counts are printed under the sentence, next to the link to the vote page.
  const counts = wording.vote ?? (wording.type === "adopted" || wording.type === "rejected" ? voteCountsIn(cell.fullText) : undefined);
  const notes = [cell.fullText.match(/face parte din categoria legilor \w+/i)?.[0], cell.fullText.match(/titlu:\s*(.+?)(?:\s+rezultat vot|\s+pentru\s*=|\s*consultati|$)/i)?.[0]].filter(Boolean);
  const base: Omit<DossierStep, "order" | "committee" | "committeeRef" | "documents"> = {
    source,
    chamber,
    occurredOn,
    type: wording.type,
    text: cell.lead,
    ...(wording.institution ? { institution: wording.institution } : {}),
    ...(wording.verdict ? { verdict: wording.verdict } : {}),
    ...(wording.documentNumber ? { documentNumber: wording.documentNumber } : {}),
    ...(wording.amendmentsAdmitted !== undefined ? { amendmentsAdmitted: wording.amendmentsAdmitted } : {}),
    ...(wording.amendmentsRejected !== undefined ? { amendmentsRejected: wording.amendmentsRejected } : {}),
    ...(cell.deadlineAmendmentsOn ? { deadlineAmendmentsOn: cell.deadlineAmendmentsOn } : {}),
    ...((wording.deadlineOn ?? cell.deadlineOn) ? { deadlineOn: wording.deadlineOn ?? cell.deadlineOn } : {}),
    ...(counts || cell.vote ? { vote: { ...(counts ?? {}), ...(cell.vote ? { reference: cell.vote } : {}) } } : {}),
    ...(cell.stenogramUrl ? { stenogramUrl: cell.stenogramUrl } : {}),
    ...(notes.length ? { detail: notes.join(" | ") } : {})
  };

  if (wording.committee) {
    const named = cell.committees.find((committee) => committee.name === wording.committee) ?? cell.committees[0];
    return [{ ...base, order: firstOrder, committee: wording.committee, ...(named?.ref ? { committeeRef: named.ref } : {}), documents: [...(named?.documents ?? []), ...cell.documents] }];
  }
  if (COMMITTEE_STEPS.has(wording.type) && cell.committees.length > 0) {
    return cell.committees.map((committee, index) => ({
      ...base,
      order: firstOrder + index,
      committee: committee.name,
      ...(committee.ref ? { committeeRef: committee.ref } : {}),
      documents: [...committee.documents, ...(index === 0 ? cell.documents : [])]
    }));
  }
  return [{ ...base, order: firstOrder, documents: cell.documents }];
}

export { typeStepWording };
