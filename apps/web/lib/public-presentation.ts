import type {
  Bill,
  ChamberId,
  GovernanceAlignment,
  Government,
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
    .replace(/\s+în termenul acordat pentru avize[\s\S]*$/i, "")
    .replace(/\s+(?:inițiator(?:i)?|initiator(?:i)?|consultare publică|consultați|consultati|prioritate legislativă|prioritate legislativa|data acțiunea|data actiunea):[\s\S]*$/i, "")
    .replace(/\s+/g, " ")
    .trim() || "—";
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
