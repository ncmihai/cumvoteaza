import type {
  Bill,
  ChamberId,
  GovernanceAlignment,
  Government,
  Legislature,
  Member,
  MemberCareerSegment,
  MemberHistoryRow,
  SourceSnapshot,
  Vote,
  VoteTotals
} from "@cumsevoteaza/parliament-model";
import type { AppLocale } from "./i18n";

export type VoteOutcome = "adopted" | "rejected" | "recorded" | "unknown";

export interface VotePresentation {
  id: string;
  identifier: string;
  heading: string;
  officialTitle: string;
  subject?: string;
  chamber: ChamberId;
  heldOn: string;
  voteType: string;
  outcome: VoteOutcome;
  outcomeLabel: string;
  totals: VoteTotals;
  source?: SourcePresentation;
}

export interface BillPresentation {
  id: string;
  slug: string;
  identifier: string;
  heading: string;
  officialTitle: string;
  status: string;
  chamberOfOrigin: Bill["chamberOfOrigin"];
}

export interface SourcePresentation {
  url: string;
  fetchedAt: string;
  status: SourceSnapshot["status"];
  freshness: "current" | "dated" | "stale" | "unknown";
  label: string;
}

export interface MemberActivityPresentation {
  expressedVotes: number;
  coveredRecords: number;
  eligibleVotes?: number;
  participationPercent?: number;
  participationKind: "eligible" | "coverage-only" | "unavailable";
  label: string;
  detail: string;
}

export interface MemberIdentityPresentation {
  name: string;
  office?: string;
}

export interface MemberCareerPresentation {
  segments: MemberCareerSegment[];
  legislatureCount: number;
  affiliationCount: number;
  hasChanges: boolean;
  hasAmbiguousDates: boolean;
  startsOn?: string;
  endsOn?: string;
}

export interface MemberProfileContextPresentation {
  summary: string;
  significance: string;
  evidenceKind: "role" | "committee" | "initiative" | "unavailable";
  roles: MemberHistoryRow[];
  committees: MemberHistoryRow[];
}

export interface DatedGovernmentParticipation {
  government: Government;
  alignment: GovernanceAlignment;
  startsOn: string;
  endsOn?: string;
}

export interface PartyCurrentState {
  status: "current" | "historical" | "unavailable";
  participation?: DatedGovernmentParticipation;
  asOf: string;
}

export interface CompositionSnapshotPresentation {
  chamber: ChamberId;
  asOf: string;
  capacity: number;
  occupied: number;
  vacancies: number;
  unknownAffiliation: number;
  isComplete: boolean;
}

export function presentVote(
  vote: Vote,
  options: {
    locale: AppLocale;
    bill?: Bill;
    source?: SourceSnapshot;
    authoritativeOutcome?: VoteOutcome;
    asOf?: string;
  }
): VotePresentation {
  const identifier = voteIdentifier(vote.title, options.bill);
  const subject = options.bill ? presentBill(options.bill).heading : undefined;
  const outcome = options.authoritativeOutcome ?? "unknown";

  return {
    id: vote.id,
    identifier,
    heading: readableVoteHeading(vote.title, identifier),
    officialTitle: vote.title,
    subject,
    chamber: vote.chamber,
    heldOn: vote.heldOn,
    voteType: vote.voteType,
    outcome,
    outcomeLabel: voteOutcomeLabel(outcome, options.locale),
    totals: vote.totals,
    source: options.source ? presentSource(options.source, options.locale, options.asOf) : undefined
  };
}

export function presentBill(bill: Bill): BillPresentation {
  const identifier = bill.identifiers.deputies ?? bill.identifiers.senate ?? bill.id;
  return {
    id: bill.id,
    slug: bill.slug,
    identifier,
    heading: cleanImportedText(bill.title),
    officialTitle: bill.title,
    status: cleanImportedText(bill.status),
    chamberOfOrigin: bill.chamberOfOrigin
  };
}

export function presentSource(
  source: SourceSnapshot,
  locale: AppLocale,
  asOf = new Date().toISOString().slice(0, 10)
): SourcePresentation {
  const fetchedOn = source.fetchedAt.slice(0, 10);
  const ageDays = dateDistanceInDays(fetchedOn, asOf);
  const freshness = !Number.isFinite(ageDays)
    ? "unknown"
    : ageDays <= 7
      ? "current"
      : ageDays <= 90
        ? "dated"
        : "stale";
  const labels = locale === "ro"
    ? { parsed: "Sursă verificată", partial: "Sursă parțială", failed: "Sursă cu eroare" }
    : { parsed: "Verified source", partial: "Partial source", failed: "Source error" };

  return {
    url: source.sourceUrl,
    fetchedAt: source.fetchedAt,
    status: source.status,
    freshness,
    label: labels[source.status]
  };
}

export function presentMemberActivity(
  counts: {
    for: number;
    against: number;
    abstention: number;
    presentNotVoting: number;
    absent?: number;
    unknown?: number;
  },
  locale: AppLocale,
  eligibleVotes?: number
): MemberActivityPresentation {
  const expressedVotes = counts.for + counts.against + counts.abstention + counts.presentNotVoting;
  const coveredRecords = expressedVotes + (counts.absent ?? 0) + (counts.unknown ?? 0);
  const validEligible = eligibleVotes !== undefined && eligibleVotes > 0 && coveredRecords <= eligibleVotes;
  const participationPercent = validEligible ? Math.round((expressedVotes / eligibleVotes) * 100) : undefined;

  if (validEligible) {
    return {
      expressedVotes,
      coveredRecords,
      eligibleVotes,
      participationPercent,
      participationKind: "eligible",
      label: locale === "ro" ? "participare la voturile eligibile" : "participation in eligible votes",
      detail: `${expressedVotes}/${eligibleVotes}`
    };
  }

  if (coveredRecords > 0) {
    return {
      expressedVotes,
      coveredRecords,
      participationKind: "coverage-only",
      label: locale === "ro" ? "înregistrări de vot acoperite" : "covered vote records",
      detail: locale === "ro"
        ? `${expressedVotes} poziții în ${coveredRecords} înregistrări importate`
        : `${expressedVotes} positions in ${coveredRecords} imported records`
    };
  }

  return {
    expressedVotes,
    coveredRecords,
    participationKind: "unavailable",
    label: locale === "ro" ? "participare indisponibilă" : "participation unavailable",
    detail: locale === "ro" ? "Nu există un numitor eligibil verificat." : "No verified eligible denominator is available."
  };
}

export function presentMemberIdentity(
  member: Pick<Member, "displayName" | "firstName" | "lastName">,
  history: MemberHistoryRow[] = [],
  asOf = new Date().toISOString().slice(0, 10)
): MemberIdentityPresentation {
  const parsed = splitMemberOffice(member.displayName);
  const activeRole = history
    .filter((row) => row.type === "role" && intervalContains(row.startsOn, row.endsOn, asOf))
    .sort((a, b) => b.startsOn.localeCompare(a.startsOn))[0];
  const fallbackName = [member.firstName, member.lastName].filter(Boolean).join(" ").trim();
  return {
    name: parsed.name || fallbackName || member.displayName,
    office: activeRole?.label ?? parsed.office
  };
}

export function presentMemberCareer(
  segments: MemberCareerSegment[],
  legislatures: Legislature[] = []
): MemberCareerPresentation {
  const ordered = [...segments]
    .filter((segment) => Boolean(segment.startsOn))
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn) || a.label.localeCompare(b.label));
  const normalized: MemberCareerSegment[] = [];
  for (const segment of ordered) {
    const previous = normalized.at(-1);
    if (
      previous &&
      previous.label === segment.label &&
      previous.partySlug === segment.partySlug &&
      previous.chamber === segment.chamber &&
      previous.legislatureId === segment.legislatureId &&
      periodsTouch(previous.endsOn, segment.startsOn)
    ) {
      previous.endsOn = laterDate(previous.endsOn, segment.endsOn);
      previous.events = mergeById(previous.events, segment.events);
      previous.governance = mergeGovernanceContexts(previous.governance, segment.governance);
      previous.logoUrl ??= segment.logoUrl;
      previous.color ??= segment.color;
      continue;
    }
    normalized.push({ ...segment, events: [...(segment.events ?? [])], governance: [...(segment.governance ?? [])] });
  }
  const legislatureIds = new Set(normalized.map((segment) => segment.legislatureId).filter(Boolean));
  const knownLegislatures = new Set(legislatures.map((legislature) => legislature.id));
  const legislatureCount = [...legislatureIds].filter((id) => !knownLegislatures.size || knownLegislatures.has(id!)).length;
  const affiliationCount = new Set(normalized.map((segment) => segment.partySlug ?? segment.label)).size;
  const hasAmbiguousDates = normalized.some((segment, index) => {
    const previous = normalized[index - 1];
    return Boolean(previous && (previous.partySlug ?? previous.label) !== (segment.partySlug ?? segment.label) && periodsOverlap(previous.startsOn, previous.endsOn, segment.startsOn, segment.endsOn));
  });
  return {
    segments: normalized,
    legislatureCount,
    affiliationCount,
    hasChanges: normalized.length > 1 || affiliationCount > 1 || legislatureCount > 1,
    hasAmbiguousDates,
    startsOn: normalized[0]?.startsOn,
    endsOn: normalized.at(-1)?.endsOn
  };
}

export function presentMemberProfileContext(input: {
  identity: MemberIdentityPresentation;
  chamberLabel?: string;
  constituency?: string;
  partyLabel?: string;
  legislatureId?: string;
  legislatureLabel?: string;
  history?: MemberHistoryRow[];
  sponsoredBillCount?: number;
  locale: AppLocale;
  asOf?: string;
}): MemberProfileContextPresentation {
  const history = (input.history ?? []).filter((row) => !input.legislatureId || row.legislatureId === input.legislatureId);
  const asOf = input.asOf ?? new Date().toISOString().slice(0, 10);
  const roles = history.filter((row) => row.type === "role" && intervalContains(row.startsOn, row.endsOn, asOf));
  const committees = history.filter((row) => row.type === "committee");
  const place = input.constituency ? ` ${input.locale === "ro" ? "în circumscripția" : "for"} ${input.constituency}` : "";
  const party = input.partyLabel ? `, ${input.locale === "ro" ? "din partea" : "representing"} ${input.partyLabel}` : "";
  const office = input.identity.office ? `${input.identity.office}, ` : "";
  const summary = input.locale === "ro"
    ? `${input.identity.name}, ${office}este parlamentar în ${input.chamberLabel ?? "Parlamentul României"}${place}${party}, în legislatura ${input.legislatureLabel ?? "selectată"}.`
    : `${input.identity.name}, ${office}serves in ${input.chamberLabel ?? "the Romanian Parliament"}${place}${party}, in the ${input.legislatureLabel ?? "selected"} legislature.`;

  if (roles[0]) return {
    summary,
    significance: input.locale === "ro" ? `Deține rolul de ${roles[0].label}; această funcție este contextul instituțional verificat disponibil pentru activitatea sa.` : `Serves as ${roles[0].label}; this is the verified institutional context available for the member's activity.`,
    evidenceKind: "role", roles, committees
  };
  if (committees[0]) return {
    summary,
    significance: input.locale === "ro" ? `Activează în ${committees.map((row) => row.label).slice(0, 2).join(" și ")}, unde sunt analizate și pregătite proiecte înaintea votului în plen.` : `Serves on ${committees.map((row) => row.label).slice(0, 2).join(" and ")}, where bills are examined before plenary votes.`,
    evidenceKind: "committee", roles, committees
  };
  if ((input.sponsoredBillCount ?? 0) > 0) return {
    summary,
    significance: input.locale === "ro" ? `Are ${(input.sponsoredBillCount ?? 0)} inițiative legislative conectate la sursele oficiale în perioada selectată.` : `Has ${(input.sponsoredBillCount ?? 0)} legislative initiatives linked to official sources in the selected period.`,
    evidenceKind: "initiative", roles, committees
  };
  return {
    summary,
    significance: input.locale === "ro" ? "Nu există încă suficiente date structurate despre roluri, comisii sau inițiative pentru a explica responsabil aria sa de influență." : "There is not yet enough structured data on roles, committees, or initiatives to responsibly explain the member's area of influence.",
    evidenceKind: "unavailable", roles, committees
  };
}

export function selectCurrentPartyState(
  participations: DatedGovernmentParticipation[],
  asOf: string
): PartyCurrentState {
  const valid = participations
    .filter((item) => intervalContains(item.startsOn, item.endsOn, asOf))
    .filter((item) => intervalContains(item.government.startsOn, item.government.endsOn, asOf))
    .sort((a, b) => b.startsOn.localeCompare(a.startsOn));

  if (valid[0]) return { status: "current", participation: valid[0], asOf };
  return { status: participations.length ? "historical" : "unavailable", asOf };
}

export function presentCompositionSnapshot(input: {
  chamber: ChamberId;
  asOf: string;
  capacity: number;
  occupied: number;
  unknownAffiliation?: number;
}): CompositionSnapshotPresentation {
  const capacity = Math.max(0, input.capacity);
  const occupied = Math.max(0, Math.min(input.occupied, capacity));
  const unknownAffiliation = Math.max(0, Math.min(input.unknownAffiliation ?? 0, occupied));
  return {
    chamber: input.chamber,
    asOf: input.asOf,
    capacity,
    occupied,
    vacancies: Math.max(0, capacity - occupied),
    unknownAffiliation,
    isComplete: occupied === capacity && unknownAffiliation === 0
  };
}

export function voteOutcomeLabel(outcome: VoteOutcome, locale: AppLocale): string {
  const labels: Record<AppLocale, Record<VoteOutcome, string>> = {
    ro: { adopted: "Adoptat", rejected: "Respins", recorded: "Înregistrat", unknown: "Rezultat neclarificat" },
    en: { adopted: "Adopted", rejected: "Rejected", recorded: "Recorded", unknown: "Outcome not established" }
  };
  return labels[locale][outcome];
}

function voteIdentifier(title: string, bill?: Bill): string {
  const fromBill = bill?.identifiers.deputies ?? bill?.identifiers.senate;
  if (fromBill) return fromBill;
  return title.match(/\b(?:PL-x|Pl-x|L|PH\s+CD)\s*\d+\/\d{4}\b/i)?.[0] ?? title;
}

function readableVoteHeading(title: string, identifier: string): string {
  const normalized = title.replace(/\s+/g, " ").trim();
  const procedural = normalized.match(/(?:vot final|raport de respingere|timp dezbatere|verificare prezen[țt]a)/i)?.[0];
  if (identifier === normalized) return normalized;
  return procedural ? `${identifier} — ${sentenceCase(procedural)}` : identifier;
}

function cleanImportedText(value: string): string {
  return value
    .replace(/^în termenul acordat pentru avize[\s\S]*$/i, "")
    .replace(/\s+în termenul acordat pentru avize[\s\S]*$/i, "")
    .replace(/\s+(?:inițiator(?:i)?|initiator(?:i)?|consultare publică|consultați|consultati|prioritate legislativă|prioritate legislativa|data acțiunea|data actiunea):[\s\S]*$/i, "")
    .replace(/\s+/g, " ")
    .trim() || "—";
}

function splitMemberOffice(displayName: string): MemberIdentityPresentation {
  const normalized = displayName.replace(/\s+/g, " ").trim();
  const parts = normalized.split(/,\s*(?=(?:pre[șşs]edinte|vicepre[șşs]edinte|chestor|secretar|lider|vicelider)\b)/i);
  if (parts.length < 2) return { name: normalized };
  return { name: parts[0]!.trim(), office: normalizeOffice(parts.slice(1).join(", ")) };
}

function normalizeOffice(value: string): string {
  return value
    .replace(/^Presedintele\b/i, "Președintele")
    .replace(/^Presedinte\b/i, "Președinte")
    .replace(/^Vicepresedinte\b/i, "Vicepreședinte")
    .replace(/^Vicepreşedinte\b/i, "Vicepreședinte")
    .replace(/^Preşedintele\b/i, "Președintele")
    .replace(/^Preşedinte\b/i, "Președinte")
    .replace(/\bCamerei Deputatilor\b/i, "Camerei Deputaților")
    .replace(/\bCamerei Deputaţilor\b/i, "Camerei Deputaților")
    .replace(/\bAl Camerei\b/, "al Camerei")
    .replace(/\bSenatului\b/i, "Senatului")
    .trim();
}

function periodsTouch(endsOn: string | undefined, startsOn: string): boolean {
  if (!endsOn) return true;
  const end = new Date(`${endsOn}T00:00:00Z`).getTime();
  const start = new Date(`${startsOn}T00:00:00Z`).getTime();
  return start <= end + 86_400_000;
}

function periodsOverlap(leftStart: string, leftEnd: string | undefined, rightStart: string, rightEnd: string | undefined): boolean {
  return leftStart <= (rightEnd ?? "9999-12-31") && rightStart <= (leftEnd ?? "9999-12-31");
}

function laterDate(left?: string, right?: string): string | undefined {
  if (!left || !right) return undefined;
  return left >= right ? left : right;
}

function mergeById<T extends { id: string }>(left: T[] = [], right: T[] = []): T[] {
  return [...new Map([...left, ...right].map((item) => [item.id, item])).values()];
}

function mergeGovernanceContexts(
  left: NonNullable<MemberCareerSegment["governance"]> = [],
  right: NonNullable<MemberCareerSegment["governance"]> = []
): NonNullable<MemberCareerSegment["governance"]> {
  return [...new Map([...left, ...right].map((item) => [[item.governmentId, item.alignment, item.startsOn, item.endsOn].join("|"), item])).values()];
}

function intervalContains(startsOn: string, endsOn: string | undefined, asOf: string): boolean {
  return startsOn <= asOf && (!endsOn || endsOn >= asOf);
}

function dateDistanceInDays(from: string, to: string): number {
  return Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function sentenceCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}
