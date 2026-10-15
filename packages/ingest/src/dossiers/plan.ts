import { createHash } from "node:crypto";
import type { SourceSnapshot } from "@cumsevoteaza/parliament-model";
import { classifyDeputiesDocumentKind } from "../parsers/deputies-bill";
import { billIdForIdentifier, canonicalBillIdentifier, identifierRecord, normalizeOfficialIdentifier, type OfficialIdentifier } from "../parsers/identifiers";
import { slugify } from "../parsers/utils";
import { approvedOrdinance, lawTypeOf, type MergedDossier } from "./merge";
import { matchByName, type NameCandidate } from "./member-match";
import type { DossierStep } from "./types";

export interface ExistingBill {
  id: string;
  slug: string;
  title: string;
  identifiers: Record<string, string>;
  chamberOfOrigin: string;
  decisionChamber: string | null;
  lawType: string | null;
  sourceSnapshotIds: string[];
  /** Whether a dossier has been read for this bill, and how many steps it holds: a bill with neither is only what a vote's title made. */
  hasDossier?: boolean;
  stepCount?: number;
}

export interface PlanContext {
  existingBills: ExistingBill[];
  /** `leg2024:cam2:idm34` to a member id. */
  profileKeyToMember: Map<string, string>;
  candidatesByChamber: Record<"deputies" | "senate", NameCandidate[]>;
  /** `cdep:36828` or `senate:<appid>` to the vote we hold. */
  voteByRef: Map<string, { id: string; billId: string | null; heldOn?: string }>;
  /** Every stored bill by id, for the bill a vote is stored under. */
  billById?: Map<string, ExistingBill>;
  slugsTaken: Set<string>;
  /** Ids of bills that were merged into another record (`id_aliases`): a bill must not be created under one of them. */
  aliasIds: Set<string>;
  /** Where each merged-away id now points: the record it was folded into. */
  aliasTargets?: Map<string, string>;
}

export interface SponsorRow {
  id: string;
  sponsorType: "government" | "member" | "citizens" | "other";
  memberId?: string;
  name: string;
  groupLabel?: string;
  memberChamber?: string;
  source: "cdep" | "senate";
  resolution: "profile" | "name" | "ambiguous" | "unmatched" | "none";
}

export interface StepRow {
  id: string;
  occurredOn: string;
  chamber: string;
  stepType: string;
  title: string;
  description?: string;
  committeeName?: string;
  institution?: string;
  committeeRef?: string;
  verdict?: string;
  documentNumber?: string;
  amendmentsAdmitted?: number;
  amendmentsRejected?: number;
  deadlineAmendmentsOn?: string;
  deadlineOn?: string;
  resultFor?: number;
  resultAgainst?: number;
  resultAbstention?: number;
  resultNotVoting?: number;
  voteId?: string;
  voteRef?: string;
  stenogramUrl?: string;
  note?: string;
  source: "cdep" | "senate";
  sourceUrl: string;
  displayOrder: number;
  /** The first document the step prints; resolved to a `documents` row when written. */
  documentUrl?: string;
  /** Every document the step prints, in the page's order (D-032); `documentUrl` is the first of them. */
  documentUrls?: string[];
}

export interface DocumentRow {
  id?: string;
  label: string;
  url: string;
  kind: ReturnType<typeof classifyDeputiesDocumentKind>;
  sourceChamber?: "deputies" | "senate";
  hash: string;
}

export interface BillPlan {
  billId: string;
  slug: string;
  isNew: boolean;
  /** The dossier changed the chamber of origin / the deciding chamber the bill was stored with. */
  originChanged: boolean;
  decisionChanged: boolean;
  /** The pages disagree: one says the Senate was first, the other that the Senate decides (or the same for the Chamber). */
  originConflict: boolean;
  /** A bill created under the id of an old merge that the dossiers prove wrong: the merge's alias is removed when the bill is written. */
  unmerge: boolean;
  /** The stored bill is the one this dossier's own numbers name (its id is the id those numbers give), not just one that shares a number with it. */
  claimsStoredBill: boolean;
  /** Existing bills that also answer to this dossier's numbers (a duplicate to merge by hand; the first is used). */
  alsoMatches: string[];
  bill: { title: string; identifiers: Record<string, string>; chamberOfOrigin: string; decisionChamber: string | null; status: string; lawType: string | null; sourceSnapshotIds: string[] };
  snapshots: SourceSnapshot[];
  dossier: {
    sources: Record<string, { url: string; fetchedAt?: string }>;
    registrations: Array<{ body: string; number: string; date?: string }>;
    initiativeType?: string;
    initiativeKind?: string;
    urgent?: boolean;
    stageText?: string;
    summary?: string;
    tacitDeadline?: string;
    initiatorCountText?: string;
    outcome: string;
    outcomeOn?: string;
    lawNumber?: string;
    lawYear?: number;
    decreeNumber?: string;
    decreeYear?: number;
    decreeOn?: string;
    gazetteNumber?: string;
    gazetteOn?: string;
  };
  steps: StepRow[];
  sponsors: SponsorRow[];
  documents: DocumentRow[];
  /** `replaces` is the placeholder bill (an empty record the vote importer made from the vote page) the vote moves away from. */
  voteLinks: Array<{ voteId: string; billId: string; replaces?: string }>;
  voteConflicts: Array<{ voteId: string; storedBillId: string; reason?: string }>;
  unrecognised: string[];
}

/** Bills the vote importer made from a vote page when it did not know the bill: an id built from the page address, no numbers, no steps. */
export const isPlaceholderBillId = (id: string) => /^bill-(deputies|senate)-https-/.test(id);

/**
 * A bill the vote importer made from a vote's title ("L84/2022 — vot final"): no dossier, no steps, nothing but the number the title printed. The Senate sometimes prints that
 * number with the wrong year, so such a bill can be an empty stub of a real bill under another number.
 */
export function isVoteStub(bill: Pick<ExistingBill, "title" | "identifiers" | "hasDossier" | "stepCount">): boolean {
  if (bill.hasDossier || (bill.stepCount ?? 0) > 0) return false;
  const known = new Set(["senate", "senate_l", "senate_b", "deputies"]);
  return isVoteStyleTitle(bill.title) && Object.keys(bill.identifiers).every((key) => known.has(key));
}

/** What to do with a vote a dossier lists among its steps while it is stored under another bill (D-050, Sprint 19). */
export type VoteLinkDecision = { action: "move"; replaces: string } | { action: "conflict"; reason: "stored_bill_has_its_own_dossier" | "vote_predates_the_bill" };

/**
 * The dossier is the bill's official page and names the vote itself, so it outranks a bill built only from the vote's title: the vote moves to the dossier's bill and the empty stub
 * goes. It does not outrank a stored bill that has a dossier of its own (two bills claiming one vote: the one the vote's title names keeps it, and the case is reported), and a vote
 * held before the dossier's first record cannot belong to it.
 */
export function decideVoteLink(input: { stored: Pick<ExistingBill, "id" | "title" | "identifiers" | "hasDossier" | "stepCount"> | undefined; voteHeldOn?: string; dossierEarliest?: string }): VoteLinkDecision {
  const { stored, voteHeldOn, dossierEarliest } = input;
  if (voteHeldOn && dossierEarliest && voteHeldOn < dossierEarliest) return { action: "conflict", reason: "vote_predates_the_bill" };
  if (stored && isVoteStub(stored)) return { action: "move", replaces: stored.id };
  return { action: "conflict", reason: "stored_bill_has_its_own_dossier" };
}

const sameChamberNumber = (a: string | undefined, b: string | undefined) => Boolean(a && b && a.toLowerCase().replace(/\s+/g, "") === b.toLowerCase().replace(/\s+/g, ""));

/** Two dossiers that name one Senate number but different Chamber numbers are two Chamber registrations, each with its own page (D-025): they must not be one bill. */
export function areDifferentChamberRegistrations(a: Record<string, string>, b: Record<string, string>): boolean {
  const norm = (value: string | undefined) => value?.toLowerCase().replace(/\s+/g, "");
  return Boolean(norm(a.deputies) && norm(b.deputies) && norm(a.deputies) !== norm(b.deputies));
}

const sha = (value: string) => createHash("sha256").update(value).digest("hex");

/** Two spellings of one document address: the Senate appends `?nocache=true`, hosts differ in case. */
export function documentKey(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete("nocache");
    return `${parsed.hostname.toLowerCase().replace(/^www\./, "")}${parsed.pathname}${parsed.search}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

export function existingKeys(bill: ExistingBill): string[] {
  const id = bill.identifiers;
  const keys: string[] = [];
  const add = (prefix: string, value: string | undefined) => value && keys.push(`${prefix}:${value.toLowerCase().replace(/\s+/g, "")}`);
  add("d", id.deputies);
  add("l", id.senate_l);
  add("b", id.senate_b);
  if (id.senate) add(/^L/i.test(id.senate) ? "l" : "b", id.senate);
  return [...new Set(keys)];
}

export function indexExistingBills(bills: ExistingBill[]): Map<string, ExistingBill[]> {
  const index = new Map<string, ExistingBill[]>();
  for (const bill of bills) for (const key of existingKeys(bill)) index.set(key, [...(index.get(key) ?? []), bill]);
  return index;
}

function groupKeys(keys: MergedDossier["keys"]): string[] {
  return [keys.deputies && `d:${keys.deputies.toLowerCase().replace(/\s+/g, "")}`, keys.senateL && `l:${keys.senateL.toLowerCase()}`, ...keys.senateB.map((b) => `b:${b.toLowerCase()}`)].filter(Boolean) as string[];
}

function identifiersOf(keys: MergedDossier["keys"]): OfficialIdentifier[] {
  return [keys.senateL, keys.deputies, ...keys.senateB].map((value) => normalizeOfficialIdentifier(value)).filter((item): item is OfficialIdentifier => Boolean(item));
}

function stepTitle(step: DossierStep): string {
  const lead = step.text.replace(/:$/, "");
  if (step.committee && !lead.includes(step.committee)) return `${lead} ${step.committee}`.slice(0, 400);
  return lead.slice(0, 400) || step.type;
}

/** Two titles that approve different ordinances name different bills. */
export const contradicts = (a: string, b: string) => {
  const first = approvedOrdinance(a);
  const second = approvedOrdinance(b);
  return Boolean(first && second && first !== second);
};

/** The title a vote gave a bill before its dossier was read: "L103/2022 — vot final", "PL-x 135/2022 - Retrimitere la Comisie", "L109/2015 — proiect de lege de respingere". It names the vote, not the bill. */
export const isVoteStyleTitle = (title: string) => /^(?:PL-?x|PLx|BP|L|B)\s?\d+\/\d{4}\s+[—–-]\s+\S/i.test(title.trim());

/**
 * The title a bill is stored with: what is stored stays, unless it is a title a vote gave it (the dossier's own title replaces that: a third of the bills were showing "L103/2022 — vot final" as
 * their title) or contradicts the dossier (it approves another ordinance: an older mislink wrote another bill's title here).
 */
export function chosenBillTitle(existing: string | undefined, dossier: string | undefined, billId: string): string {
  const keepExisting = existing && existing !== "unknown" && !(dossier && isVoteStyleTitle(existing)) && !(dossier && contradicts(existing, dossier));
  return keepExisting ? existing : (dossier ?? existing ?? billId);
}

export function planBill(input: { merged: MergedDossier; snapshots: SourceSnapshot[]; fetchedAt: Partial<Record<"cdep" | "senate", string>>; context: PlanContext; existingIndex: Map<string, ExistingBill[]>; /** Stored bills another dossier already holds. */ exclude?: Set<string> }): BillPlan {
  const { merged, context } = input;
  const found: ExistingBill[] = [];
  for (const key of groupKeys(merged.keys)) for (const bill of input.existingIndex.get(key) ?? []) if (!found.some((item) => item.id === bill.id) && !input.exclude?.has(bill.id)) found.push(bill);
  // A Chamber (PL-x) or Senate (L) number belongs to one bill; a Senate B number is shared by every bill sent on from one Senate registration, and the stored copy of one may be wrong.
  // So a stored bill that matches by PL-x or L ranks before one that matches only by a B number.
  const strongKeys = new Set(groupKeys(merged.keys).filter((key) => !key.startsWith("b:")));
  const isStrong = (bill: ExistingBill) => existingKeys(bill).some((key) => strongKeys.has(key));
  // A stored bill that shares only the Senate B number and carries another Chamber number is another Chamber registration of that Senate bill (D-025), not this one.
  const ownChamber: Record<string, string> = merged.keys.deputies ? { deputies: merged.keys.deputies } : {};
  const matches = found.filter((bill) => isStrong(bill) || !areDifferentChamberRegistrations(bill.identifiers, ownChamber));
  matches.sort((a, b) => Number(isStrong(b)) - Number(isStrong(a)) || Number(b.id.startsWith("bill-l")) - Number(a.id.startsWith("bill-l")) || a.id.localeCompare(b.id));
  const existing = matches[0];

  // A dossier that lost its stored bill to another dossier keeps (or becomes) a bill of its own under its Chamber number only:
  // the Senate number it prints belongs to the dossier that kept the stored bill (the Chamber printed it on the wrong bill).
  const lostItsBill = Boolean(input.exclude?.size);
  const identifiers = identifiersOf(lostItsBill ? { deputies: merged.keys.deputies, senateB: [] } : merged.keys);
  const canonical = canonicalBillIdentifier(identifiers);
  const billId = existing?.id ?? (canonical ? billIdForIdentifier(canonical) : `bill-${slugify(merged.title ?? "unknown").slice(0, 60)}`);
  const slug = existing?.slug ?? slugify(canonical?.value ?? billId);
  // Such a bill keeps only its Chamber number, also on a re-read: it must not take the other dossier's Senate number back (the duplicate merge would fold it in again).
  const mergedIdentifiers = lostItsBill ? identifierRecord(identifiers) : { ...(existing?.identifiers ?? {}), ...identifierRecord(identifiers) };
  const earliest = [...merged.registrations.map((item) => item.date), ...merged.steps.map((step) => step.occurredOn)].filter(Boolean).sort()[0];

  // Initiators: the Chamber's profile link is exact; a Senate name is matched only when it is unique among those who sat that day.
  const sponsors: SponsorRow[] = merged.initiators.map((initiator, index) => {
    let memberId: string | undefined;
    let resolution: SponsorRow["resolution"] = "none";
    if (initiator.profile) {
      memberId = context.profileKeyToMember.get(`leg${initiator.profile.legislature}:cam${initiator.profile.chamber === "senate" ? 1 : 2}:idm${initiator.profile.idm}`);
      resolution = memberId ? "profile" : "unmatched";
    } else if (initiator.kind === "member" && initiator.chamber) {
      const match = matchByName(initiator.name, earliest, context.candidatesByChamber[initiator.chamber]);
      memberId = match.id;
      resolution = match.id ? "name" : match.ambiguous ? "ambiguous" : "unmatched";
    }
    return {
      id: `sponsor-${billId}-${index + 1}`,
      sponsorType: initiator.kind,
      ...(memberId ? { memberId } : {}),
      name: initiator.name,
      ...(initiator.group ? { groupLabel: initiator.group } : {}),
      ...(initiator.chamber ? { memberChamber: initiator.chamber } : {}),
      source: initiator.profile ? "cdep" : "senate",
      resolution
    };
  });

  const documents = new Map<string, DocumentRow>();
  const addDocument = (label: string, url: string, chamber?: DossierStep["chamber"], step?: DossierStep) => {
    const key = documentKey(url);
    if (documents.has(key)) return;
    // A committee's own document is listed under the committee's name: say what it is.
    const named = step?.committee && label === step.committee ? `${step.type === "committee_report_received" ? "Raport" : step.type === "committee_opinion_received" ? "Aviz" : "Document"} — ${label}` : label;
    documents.set(key, {
      label: named.slice(0, 300),
      url,
      kind: classifyDeputiesDocumentKind(`${label} ${url}`),
      ...(chamber === "deputies" || chamber === "senate" ? { sourceChamber: chamber } : {}),
      hash: sha(url)
    });
  };
  for (const item of merged.consulted) addDocument(item.label, item.url);

  const voteLinks: BillPlan["voteLinks"] = [];
  const voteConflicts: BillPlan["voteConflicts"] = [];
  const sourceUrlOf = (source: "cdep" | "senate") => merged.pages.find((page) => page.source === source)?.url ?? "";
  const steps: StepRow[] = merged.steps.map((step, index) => {
    for (const document of step.documents) addDocument(document.label, document.url, step.chamber, step);
    const reference = step.vote?.reference;
    const refKey = reference ? `${reference.source}:${reference.id}` : undefined;
    const vote = refKey ? context.voteByRef.get(refKey) : undefined;
    if (vote) {
      if (!vote.billId || isPlaceholderBillId(vote.billId)) voteLinks.push({ voteId: vote.id, billId, ...(vote.billId ? { replaces: vote.billId } : {}) });
      // A vote stored under the other record of this same dossier is not a conflict: the duplicate merge makes it one bill.
      // A vote the dossier names, stored under a bill this dossier lost to another dossier (an older mislink), moves to this bill.
      // A Senate vote stays with the bill that carries the Senate number: the dossier that lost it keeps only its Chamber number, so only the Chamber's votes follow it.
      else if (input.exclude?.has(vote.billId)) {
        if (!(lostItsBill && reference?.source === "senate")) voteLinks.push({ voteId: vote.id, billId, replaces: vote.billId });
      }
      else if (vote.billId !== billId && !matches.some((bill) => bill.id === vote.billId)) {
        const decision = decideVoteLink({ stored: context.billById?.get(vote.billId), voteHeldOn: vote.heldOn, dossierEarliest: earliest });
        if (decision.action === "move") voteLinks.push({ voteId: vote.id, billId, replaces: decision.replaces });
        else voteConflicts.push({ voteId: vote.id, storedBillId: vote.billId, reason: decision.reason });
      }
    }
    const notes = [step.detail, step.stenogramUrl && undefined].filter(Boolean).join(" | ") || undefined;
    return {
      id: `dstep-${billId}-${index + 1}`,
      occurredOn: step.occurredOn,
      chamber: step.chamber,
      stepType: step.type,
      title: stepTitle(step),
      ...(step.committee ? { committeeName: step.committee } : {}),
      ...(step.institution ? { institution: step.institution } : {}),
      ...(step.committeeRef ? { committeeRef: `${step.committeeRef.source}:${step.committeeRef.id}` } : {}),
      ...(step.verdict ? { verdict: step.verdict } : {}),
      ...(step.documentNumber ? { documentNumber: step.documentNumber } : {}),
      ...(step.amendmentsAdmitted !== undefined ? { amendmentsAdmitted: step.amendmentsAdmitted } : {}),
      ...(step.amendmentsRejected !== undefined ? { amendmentsRejected: step.amendmentsRejected } : {}),
      ...(step.deadlineAmendmentsOn ? { deadlineAmendmentsOn: step.deadlineAmendmentsOn } : {}),
      ...(step.deadlineOn ? { deadlineOn: step.deadlineOn } : {}),
      ...(step.vote?.for !== undefined ? { resultFor: step.vote.for } : {}),
      ...(step.vote?.against !== undefined ? { resultAgainst: step.vote.against } : {}),
      ...(step.vote?.abstention !== undefined ? { resultAbstention: step.vote.abstention } : {}),
      ...(step.vote?.notVoting !== undefined ? { resultNotVoting: step.vote.notVoting } : {}),
      ...(vote ? { voteId: vote.id } : {}),
      ...(refKey ? { voteRef: refKey } : {}),
      ...(step.stenogramUrl ? { stenogramUrl: step.stenogramUrl } : {}),
      ...(notes ? { note: notes } : {}),
      source: step.source,
      sourceUrl: sourceUrlOf(step.source),
      displayOrder: index,
      ...(step.documents[0] ? { documentUrl: step.documents[0].url } : {}),
      ...(step.documents.length ? { documentUrls: step.documents.map((document) => document.url) } : {})
    };
  });

  // Art. 75: the first notified chamber is never the deciding one. A deciding chamber the page states settles a first chamber that was only worked out from dates;
  // two statements that contradict each other settle nothing (the stored values stay and the report lists the bill).
  const sameChamber = Boolean(merged.firstChamber && merged.decisionChamber && merged.firstChamber === merged.decisionChamber);
  const decisionSettlesFirst = sameChamber && merged.decisionChamberStated && !merged.firstChamberStated;
  const originAgrees = !sameChamber || decisionSettlesFirst;
  const settledFirst = decisionSettlesFirst ? (merged.decisionChamber === "senate" ? "deputies" : "senate") : merged.firstChamber;
  const snapshotIds = input.snapshots.map((snapshot) => snapshot.id);
  const fate = merged.fate;
  return {
    billId,
    slug,
    isNew: !existing,
    unmerge: false,
    originChanged: Boolean(existing && existing.chamberOfOrigin !== "unknown" && settledFirst && originAgrees && existing.chamberOfOrigin !== settledFirst),
    decisionChanged: Boolean(existing?.decisionChamber && merged.decisionChamber && originAgrees && existing.decisionChamber !== merged.decisionChamber),
    originConflict: !originAgrees,
    // The dossier whose Chamber number is the one the stored bill already carries keeps it (a later registration of the same Senate bill must not take it over).
    claimsStoredBill: Boolean(existing && ((canonical && existing.id === billIdForIdentifier(canonical)) || sameChamberNumber(existing.identifiers.deputies, merged.keys.deputies))),
    alsoMatches: matches.slice(1).map((bill) => bill.id),
    bill: {
      title: chosenBillTitle(existing?.title, merged.title, billId),
      identifiers: mergedIdentifiers,
      // The dossier says which chamber was notified first (the Senate page prints "Prima cameră", the Chamber's registration dates show it) and which decides:
      // that replaces what an older import stored (for more than half of the bills it had written the Chamber of Deputies as the origin).
      // When the two pages disagree (one says the Senate was first, the other that the Senate decides) nothing is changed: the stored values stay and the report counts it.
      chamberOfOrigin: (originAgrees ? settledFirst : undefined) ?? (existing && existing.chamberOfOrigin !== "unknown" ? existing.chamberOfOrigin : (merged.firstChamber ?? "unknown")),
      decisionChamber: (originAgrees ? merged.decisionChamber : undefined) ?? existing?.decisionChamber ?? merged.decisionChamber ?? null,
      status: merged.stage ?? "unknown",
      lawType: lawTypeOf(merged.character) ?? existing?.lawType ?? null,
      sourceSnapshotIds: [...new Set([...(existing?.sourceSnapshotIds ?? []), ...snapshotIds])]
    },
    snapshots: input.snapshots,
    dossier: {
      sources: Object.fromEntries(merged.pages.map((page) => [page.source, { url: page.url, ...(input.fetchedAt[page.source] ? { fetchedAt: input.fetchedAt[page.source] } : {}) }])),
      // A number printed with only a year keeps it in the number ("L142/2026"); one with a date shows the date.
      registrations: merged.registrations.map((item) => ({ body: item.body, number: item.date || !item.year ? item.number : `${item.number}/${item.year}`, ...(item.date ? { date: item.date } : {}) })),
      initiativeType: merged.initiativeType,
      initiativeKind: merged.initiativeKind,
      urgent: merged.urgent,
      stageText: merged.stage,
      summary: merged.summary,
      tacitDeadline: merged.tacitDeadline,
      initiatorCountText: merged.initiatorCountText,
      outcome: fate.outcome,
      outcomeOn: fate.outcomeOn,
      lawNumber: fate.lawNumber,
      lawYear: fate.lawYear,
      decreeNumber: fate.decreeNumber,
      decreeYear: fate.decreeYear,
      decreeOn: fate.decreeOn,
      gazetteNumber: fate.gazetteNumber,
      gazetteOn: fate.gazetteOn
    },
    steps,
    sponsors,
    documents: [...documents.values()],
    voteLinks,
    voteConflicts,
    unrecognised: merged.unrecognised
  };
}

export interface PlanSummary {
  bills: number;
  newBills: number;
  existingBills: number;
  withSteps: number;
  steps: number;
  stepsByType: Record<string, number>;
  outcomes: Record<string, number>;
  promulgatedWithoutLawNumber: string[];
  promulgatedWithoutGazette: string[];
  sponsors: Record<SponsorRow["resolution"], number>;
  unmatchedSponsorNames: Array<{ name: string; count: number }>;
  voteLinksToWrite: number;
  voteConflicts: Array<{ bill: string; voteId: string; storedBillId: string; reason?: string }>;
  duplicateBills: Array<{ bill: string; alsoMatches: string[] }>;
  /** Bills whose stored chamber of origin / deciding chamber the dossier corrects. */
  originCorrections: { origin: number; decision: number; conflicts: string[] };
  /** Bills re-created under the id of an old merge that the dossiers prove wrong (the two dossiers approve different ordinances). */
  unmergedBills: string[];
  /** Dossiers that resolved to a bill another dossier already took (the first one is written, the other is left out). */
  collidingDossiers: Array<{ bill: string; keptIdentifiers: Record<string, string>; leftOutIdentifiers: Record<string, string>; leftOutSteps: number; leftOutOutcome: string }>;
  unrecognisedWording: Array<{ text: string; count: number }>;
}

export function summarisePlans(plans: BillPlan[], leftOut: BillPlan[] = []): PlanSummary {
  const tally = (target: Record<string, number>, key: string) => void (target[key] = (target[key] ?? 0) + 1);
  const stepsByType: Record<string, number> = {};
  const outcomes: Record<string, number> = {};
  const sponsorCounts: PlanSummary["sponsors"] = { profile: 0, name: 0, ambiguous: 0, unmatched: 0, none: 0 };
  const unmatched = new Map<string, number>();
  const unrecognised = new Map<string, number>();
  const summary: PlanSummary = {
    bills: plans.length,
    newBills: plans.filter((plan) => plan.isNew).length,
    existingBills: plans.filter((plan) => !plan.isNew).length,
    withSteps: plans.filter((plan) => plan.steps.length > 0).length,
    steps: 0,
    stepsByType,
    outcomes,
    promulgatedWithoutLawNumber: [],
    promulgatedWithoutGazette: [],
    sponsors: sponsorCounts,
    unmatchedSponsorNames: [],
    voteLinksToWrite: 0,
    voteConflicts: [],
    duplicateBills: [],
    originCorrections: { origin: plans.filter((plan) => plan.originChanged).length, decision: plans.filter((plan) => plan.decisionChanged).length, conflicts: plans.filter((plan) => plan.originConflict).map((plan) => plan.billId) },
    unmergedBills: plans.filter((plan) => plan.unmerge).map((plan) => plan.billId),
    collidingDossiers: leftOut.map((plan) => ({
      bill: plan.billId,
      keptIdentifiers: plans.find((kept) => kept.billId === plan.billId)?.bill.identifiers ?? {},
      leftOutIdentifiers: plan.bill.identifiers,
      leftOutSteps: plan.steps.length,
      leftOutOutcome: plan.dossier.outcome
    })),
    unrecognisedWording: []
  };
  for (const plan of plans) {
    summary.steps += plan.steps.length;
    for (const step of plan.steps) tally(stepsByType, step.stepType);
    tally(outcomes, plan.dossier.outcome);
    if (plan.dossier.outcome === "promulgated") {
      if (!plan.dossier.lawNumber) summary.promulgatedWithoutLawNumber.push(plan.billId);
      if (!plan.dossier.gazetteNumber) summary.promulgatedWithoutGazette.push(plan.billId);
    }
    for (const sponsor of plan.sponsors) {
      sponsorCounts[sponsor.resolution] += 1;
      if (sponsor.resolution === "unmatched" || sponsor.resolution === "ambiguous") unmatched.set(sponsor.name, (unmatched.get(sponsor.name) ?? 0) + 1);
    }
    summary.voteLinksToWrite += plan.voteLinks.length;
    for (const conflict of plan.voteConflicts) summary.voteConflicts.push({ bill: plan.billId, ...conflict });
    if (plan.alsoMatches.length) summary.duplicateBills.push({ bill: plan.billId, alsoMatches: plan.alsoMatches });
    for (const text of plan.unrecognised) unrecognised.set(text.slice(0, 200), (unrecognised.get(text.slice(0, 200)) ?? 0) + 1);
  }
  summary.unmatchedSponsorNames = [...unmatched].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 40);
  summary.unrecognisedWording = [...unrecognised].map(([text, count]) => ({ text, count })).sort((a, b) => b.count - a.count).slice(0, 80);
  return summary;
}
