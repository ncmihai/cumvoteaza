/**
 * What a bill dossier page says, read into one shape for both chambers' pages (D-025).
 * Everything here is "as published": nothing is computed from other data, and an unknown stays unknown.
 */

export type DossierSourceName = "cdep" | "senate";

/** Where a step happened. "president" covers the rows the Chamber marks PA and the Senate marks PA (promulgation, the Official Gazette). */
export type StepChamber = "deputies" | "senate" | "president" | "unknown";

/** Mirrors the `bill_procedure_step_type` enum. Old values stay for rows written before Sprint 7. */
export type StepType =
  | "registered"
  | "sent_to_senate"
  | "adopted_by_senate"
  | "sent_to_deputies"
  | "sent_to_committee"
  | "committee_opinion_requested"
  | "committee_opinion_received"
  | "committee_report_received"
  | "plenary_debate"
  | "final_vote"
  | "promulgation"
  | "constitutional_review"
  | "other"
  | "urgency_requested"
  | "urgency_decided"
  | "government_view_requested"
  | "government_view_received"
  | "opinion_requested"
  | "opinion_received"
  | "agenda_scheduled"
  | "adopted"
  | "rejected"
  | "withdrawn"
  | "procedure_ended"
  | "deadline_extended"
  | "competence_decision"
  | "constitutional_window"
  | "sent_to_president"
  | "published";

/** What a committee report, an opinion or the Government's view concluded, in the source's own words reduced to a few values. */
export type Verdict = "favorable" | "unfavorable" | "favorable_with_amendments" | "rejection";

export interface VoteReference {
  source: DossierSourceName;
  /** Chamber: the `idv` of the vote page. Senate: the `AppID` in lower case. */
  id: string;
}

export interface DossierDocumentLink {
  label: string;
  url: string;
}

export interface DossierStep {
  source: DossierSourceName;
  chamber: StepChamber;
  /** ISO date. A row the Chamber prints without a date takes the date of the row above it. */
  occurredOn: string;
  /** Position in the page, from 0. */
  order: number;
  type: StepType;
  /** The sentence as published, whitespace folded. */
  text: string;
  /** What follows the sentence on the row and is not a document or a committee (a note such as "face parte din categoria legilor organice"). */
  detail?: string;
  /** A parliamentary committee the step concerns (one step per committee). */
  committee?: string;
  /** The page's own identifier of that committee: the Chamber's `idc`, the Senate's `ComisieID`. */
  committeeRef?: { source: DossierSourceName; id: string };
  /** An outside body: Consiliul Legislativ, Consiliul Economic și Social, the Government, ... */
  institution?: string;
  verdict?: Verdict;
  /** Registration number of the report, opinion or view ("213", "596/27.08.2025"). */
  documentNumber?: string;
  amendmentsAdmitted?: number;
  amendmentsRejected?: number;
  deadlineAmendmentsOn?: string;
  deadlineOn?: string;
  vote?: { for?: number; against?: number; abstention?: number; notVoting?: number; reference?: VoteReference };
  documents: DossierDocumentLink[];
  stenogramUrl?: string;
}

export type InitiatorKind = "government" | "member" | "citizens" | "other";

export interface DossierInitiator {
  kind: InitiatorKind;
  /** As published ("Cîmpan Cristian-Emanuel", "Guvernul României"). */
  name: string;
  /** "deputat" or "senator" when the page says it. */
  chamber?: "deputies" | "senate";
  /** The group or party label printed beside the name ("PSD", "neafiliati", "minoritati"). */
  group?: string;
  /** The Chamber's profile link: legislature, chamber and number of the member's page (resolves to exactly one member). */
  profile?: { legislature: number; chamber: "deputies" | "senate"; idm: number };
}

export interface DossierRegistration {
  /** "bpi" (Chamber's initiative register), "cdep", "senate", "government" (the Government's address number). */
  body: "bpi" | "cdep" | "senate" | "government";
  /** As published: "497", "L535", "PLX127", "E91". */
  number: string;
  date?: string;
}

export type BillOutcome = "in_progress" | "promulgated" | "rejected" | "withdrawn" | "ended";

export interface DossierFate {
  outcome: BillOutcome;
  outcomeOn?: string;
  lawNumber?: string;
  lawYear?: number;
  decreeNumber?: string;
  decreeYear?: number;
  decreeOn?: string;
  gazetteNumber?: string;
  gazetteOn?: string;
}

export interface ParsedDossier {
  source: DossierSourceName;
  sourceUrl: string;
  /** The identifier the page announces for itself ("PL-x 56/2026", "L316/2025"). */
  selfId?: string;
  title?: string;
  registrations: DossierRegistration[];
  /** "Tip inițiativă" as printed ("Propunere legislativa pentru modificarea L. nr. 350/2005"). */
  initiativeType?: string;
  initiativeKind?: "proposal" | "government_bill" | "ordinance_approval" | "other";
  firstChamber?: "deputies" | "senate";
  decisionChamber?: "deputies" | "senate";
  /** "ordinar" | "organic" | "constitutional" when the page says it. */
  character?: string;
  urgent?: boolean;
  /** "Stadiu" as printed. */
  stage?: string;
  /** "Obiect de reglementare" (the Chamber's own summary of what the bill does). */
  summary?: string;
  tacitDeadline?: string;
  initiators: DossierInitiator[];
  initiatorCountText?: string;
  steps: DossierStep[];
  /** The consulted documents the header lists (explanatory memorandum, Legislative Council opinion, ...). */
  consulted: DossierDocumentLink[];
  fate: DossierFate;
  /** Wording of steps the typing rules did not recognise, for the report. */
  unrecognised: string[];
}
