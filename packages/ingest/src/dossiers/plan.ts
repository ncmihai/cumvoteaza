import { createHash } from "node:crypto";
import type { SourceSnapshot } from "@cumsevoteaza/parliament-model";
import { classifyDeputiesDocumentKind } from "../parsers/deputies-bill";
import { billIdForIdentifier, canonicalBillIdentifier, identifierRecord, normalizeOfficialIdentifier, type OfficialIdentifier } from "../parsers/identifiers";
import { slugify } from "../parsers/utils";
import { lawTypeOf, type MergedDossier } from "./merge";
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
}

export interface PlanContext {
  existingBills: ExistingBill[];
  /** `leg2024:cam2:idm34` to a member id. */
  profileKeyToMember: Map<string, string>;
  candidatesByChamber: Record<"deputies" | "senate", NameCandidate[]>;
  /** `cdep:36828` or `senate:<appid>` to the vote we hold. */
  voteByRef: Map<string, { id: string; billId: string | null }>;
  slugsTaken: Set<string>;
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
  voteConflicts: Array<{ voteId: string; storedBillId: string }>;
  unrecognised: string[];
}

/** Bills the vote importer made from a vote page when it did not know the bill: an id built from the page address, no numbers, no steps. */
export const isPlaceholderBillId = (id: string) => /^bill-(deputies|senate)-https-/.test(id);

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

function existingKeys(bill: ExistingBill): string[] {
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

export function planBill(input: { merged: MergedDossier; snapshots: SourceSnapshot[]; fetchedAt: Partial<Record<"cdep" | "senate", string>>; context: PlanContext; existingIndex: Map<string, ExistingBill[]>; /** Stored bills another dossier already holds. */ exclude?: Set<string> }): BillPlan {
  const { merged, context } = input;
  const matches: ExistingBill[] = [];
  for (const key of groupKeys(merged.keys)) for (const bill of input.existingIndex.get(key) ?? []) if (!matches.some((item) => item.id === bill.id) && !input.exclude?.has(bill.id)) matches.push(bill);
  // A Chamber (PL-x) or Senate (L) number belongs to one bill; a Senate B number is shared by every bill sent on from one Senate registration, and the stored copy of one may be wrong.
  // So a stored bill that matches by PL-x or L ranks before one that matches only by a B number.
  const strongKeys = new Set(groupKeys(merged.keys).filter((key) => !key.startsWith("b:")));
  const isStrong = (bill: ExistingBill) => existingKeys(bill).some((key) => strongKeys.has(key));
  matches.sort((a, b) => Number(isStrong(b)) - Number(isStrong(a)) || Number(b.id.startsWith("bill-l")) - Number(a.id.startsWith("bill-l")) || a.id.localeCompare(b.id));
  const existing = matches[0];

  const identifiers = identifiersOf(merged.keys);
  const canonical = canonicalBillIdentifier(identifiers);
  const billId = existing?.id ?? (canonical ? billIdForIdentifier(canonical) : `bill-${slugify(merged.title ?? "unknown").slice(0, 60)}`);
  const slug = existing?.slug ?? slugify(canonical?.value ?? billId);
  const mergedIdentifiers = { ...(existing?.identifiers ?? {}), ...identifierRecord(identifiers) };
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
      else if (vote.billId !== billId && !matches.some((bill) => bill.id === vote.billId)) voteConflicts.push({ voteId: vote.id, storedBillId: vote.billId });
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
      ...(step.documents[0] ? { documentUrl: step.documents[0].url } : {})
    };
  });

  const snapshotIds = input.snapshots.map((snapshot) => snapshot.id);
  const fate = merged.fate;
  return {
    billId,
    slug,
    isNew: !existing,
    claimsStoredBill: Boolean(existing && canonical && existing.id === billIdForIdentifier(canonical)),
    alsoMatches: matches.slice(1).map((bill) => bill.id),
    bill: {
      title: existing?.title && existing.title !== "unknown" ? existing.title : (merged.title ?? existing?.title ?? billId),
      identifiers: mergedIdentifiers,
      chamberOfOrigin: existing && existing.chamberOfOrigin !== "unknown" ? existing.chamberOfOrigin : (merged.firstChamber ?? "unknown"),
      decisionChamber: existing?.decisionChamber ?? merged.decisionChamber ?? null,
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
  voteConflicts: Array<{ bill: string; voteId: string; storedBillId: string }>;
  duplicateBills: Array<{ bill: string; alsoMatches: string[] }>;
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
