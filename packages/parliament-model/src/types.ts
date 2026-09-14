export type Locale = "ro" | "en";

export type ChamberId = "senate" | "deputies";

export type VoteChoice =
  | "for"
  | "against"
  | "abstention"
  | "present_not_voting"
  | "absent"
  | "unknown";

export type VoteMotionKind =
  | "final_adoption"
  | "final_rejection"
  | "rejection_report"
  | "amendment"
  | "committee_referral"
  | "reconsideration"
  | "confidence"
  | "no_confidence"
  | "institutional_resolution"
  | "procedural_timing"
  | "agenda_or_schedule"
  | "quorum_or_presence"
  | "internal_procedure"
  | "unknown";

export type VoteProminence = "major" | "standard" | "routine" | "unclassified";

export type VoteClassificationConfidence = "verified" | "high" | "medium" | "low";

export type VoteClassificationBasis =
  | "official_metadata"
  | "deterministic_rule"
  | "contextual_inference"
  | "manual_review"
  | "unclassified";

export type VoteYesMeaning =
  | "supports_adoption"
  | "supports_rejection"
  | "supports_amendment"
  | "supports_referral"
  | "supports_reconsideration"
  | "supports_confidence"
  | "supports_no_confidence"
  | "supports_resolution"
  | "supports_procedure"
  | "confirms_presence"
  | "unknown";

export type SourceStatus = "parsed" | "partial" | "failed";

export type DocumentKind =
  | "proposal"
  | "senate_adopted_form"
  | "committee_report"
  | "committee_opinion"
  | "adopted_form"
  | "promulgation_form"
  | "other";

export type DocumentTextStatus = "pending" | "stored" | "missing" | "failed" | "unsupported";

export type BillProcedureStepType =
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
  | "other";

export type GovernanceAlignment =
  | "government"
  | "governing_support"
  | "opposition"
  | "mixed"
  | "unaffiliated"
  | "unknown";

export type AlignmentBasis =
  | "official_investiture"
  | "official_coalition"
  | "parliamentary_group_declaration"
  | "computed_vote_support"
  | "manual_curation"
  | "unknown";

export type CompositionEventType =
  | "legislature_start"
  | "legislature_end"
  | "government_designated"
  | "government_invested"
  | "government_ended"
  | "minister_appointed"
  | "minister_ended"
  | "reshuffle"
  | "no_confidence_motion"
  | "confidence_vote"
  | "coalition_change"
  | "group_change"
  | "member_mandate_start"
  | "member_mandate_end"
  | "committee_change"
  | "role_change"
  | "other";

export type PoliticalFormationEventType =
  | "party_founded"
  | "party_reestablished"
  | "alliance_formed"
  | "alliance_dissolved"
  | "party_merged"
  | "party_split"
  | "party_renamed"
  | "party_absorbed"
  | "other";

export type PoliticalFormationEventSourceKind = "official" | "wikipedia" | "curated";

export type PoliticalFormationEventEntityType = "party" | "formation";

export type PoliticalFormationEventEntityRole =
  | "absorbed"
  | "absorber"
  | "alliance_member"
  | "renamed_from"
  | "renamed_to"
  | "split_from"
  | "split_to"
  | "subject";

export interface SourceSnapshot {
  id: string;
  sourceUrl: string;
  fetchedAt: string;
  contentHash: string;
  parser: string;
  parserVersion: string;
  status: SourceStatus;
  notes?: string;
}

export interface Legislature {
  id: string;
  label: string;
  startsOn: string;
  endsOn: string;
}

export interface Party {
  id: string;
  slug: string;
  shortName: string;
  name: string;
  color: string;
}

export interface ParliamentaryGroup {
  id: string;
  partyId?: string;
  chamber: ChamberId;
  shortName: string;
  name: string;
  color: string;
}

export interface Person {
  id: string;
  slug: string;
  displayName: string;
  normalizedName: string;
  birthDate?: string;
  sourceIds: Record<string, string>;
}

export interface Member {
  id: string;
  personId?: string;
  slug: string;
  firstName: string;
  lastName: string;
  displayName: string;
  sourceIds: Record<string, string>;
}

export interface Government {
  id: string;
  slug: string;
  name: string;
  legislatureId?: string;
  primeMinisterPersonId?: string;
  startsOn: string;
  endsOn?: string;
  basis: AlignmentBasis;
  investitureVoteId?: string;
  sourceSnapshotId?: string;
}

export interface GovernmentRole {
  id: string;
  governmentId: string;
  personId: string;
  title: string;
  ministry?: string;
  ministryId?: string;
  startsOn: string;
  endsOn?: string;
  sourceSnapshotId?: string;
}

export interface Ministry {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  descriptionRo: string;
  descriptionEn: string;
  active: boolean;
}

export interface MinistryAlias {
  id: string;
  ministryId: string;
  name: string;
  startsOn?: string;
  endsOn?: string;
}

export interface GovernmentPartyAlignment {
  id: string;
  governmentId: string;
  partyId: string;
  alignment: GovernanceAlignment;
  basis: AlignmentBasis;
  startsOn: string;
  endsOn?: string;
  sourceSnapshotId?: string;
}

export interface GovernmentGroupAlignment {
  id: string;
  governmentId: string;
  groupId: string;
  alignment: GovernanceAlignment;
  basis: AlignmentBasis;
  startsOn: string;
  endsOn?: string;
  sourceSnapshotId?: string;
}

export interface MemberGovernanceAlignment {
  id: string;
  memberId: string;
  governmentId?: string;
  alignment: GovernanceAlignment;
  basis: AlignmentBasis;
  startsOn: string;
  endsOn?: string;
  sourceSnapshotId?: string;
}

export interface CompositionEvent {
  id: string;
  eventType: CompositionEventType;
  title: string;
  description?: string;
  occurredOn: string;
  endsOn?: string;
  legislatureId?: string;
  governmentId?: string;
  chamber?: ChamberId;
  memberId?: string;
  personId?: string;
  partyId?: string;
  groupId?: string;
  sourceSnapshotId?: string;
}

export interface PoliticalFormationEventEntity {
  eventId: string;
  entityType: PoliticalFormationEventEntityType;
  entityId: string;
  role: PoliticalFormationEventEntityRole;
}

export interface PoliticalFormationEvent {
  id: string;
  date: string;
  eventType: PoliticalFormationEventType;
  titleRo: string;
  titleEn: string;
  descriptionRo: string;
  descriptionEn: string;
  sourceUrl?: string;
  sourceKind: PoliticalFormationEventSourceKind;
  entities: PoliticalFormationEventEntity[];
}

export interface MemberMandate {
  id: string;
  memberId: string;
  legislatureId: string;
  chamber: ChamberId;
  startsOn: string;
  endsOn?: string;
  constituency?: string;
  status: "active" | "ended" | "unknown";
  sourceSnapshotId?: string;
}

export interface MemberGroupMembership {
  id: string;
  memberId: string;
  groupId: string;
  startsOn: string;
  endsOn?: string;
  currentSnapshotOn?: string;
  logoUrl?: string;
  sourceSnapshotId?: string;
}

export interface MemberPartyAffiliation {
  id: string;
  memberId: string;
  partyId: string;
  startsOn: string;
  endsOn?: string;
  logoUrl?: string;
  sourceSnapshotId?: string;
}

export interface MemberMandateRelation {
  id: string;
  mandateId: string;
  relation: "replaces";
  relatedMemberId?: string;
  relatedName: string;
  relatedOfficialUrl?: string;
  sourceSnapshotId?: string;
}

export interface MemberCommitteeMembership {
  id: string;
  memberId: string;
  committeeName: string;
  chamber: ChamberId;
  startsOn: string;
  endsOn?: string;
  role?: string;
  sourceSnapshotId?: string;
}

export interface MemberRole {
  id: string;
  memberId: string;
  title: string;
  chamber: ChamberId;
  startsOn: string;
  endsOn?: string;
  sourceSnapshotId?: string;
}

export interface Bill {
  id: string;
  slug: string;
  title: string;
  identifiers: Record<string, string>;
  chamberOfOrigin: ChamberId | "unknown";
  decisionChamber?: ChamberId;
  status: string;
  sourceSnapshotIds: string[];
}

export interface BillEvent {
  id: string;
  billId: string;
  occurredOn: string;
  chamber: ChamberId | "joint" | "unknown";
  label: string;
  sourceUrl?: string;
}

export interface BillSponsor {
  id: string;
  billId: string;
  sponsorType: "member" | "government" | "group" | "unknown";
  memberId?: string;
  name: string;
}

export interface DocumentSource {
  id: string;
  billId: string;
  label: string;
  url: string;
  documentKind?: DocumentKind;
  sourceChamber?: ChamberId;
  officialUrlHash?: string;
  textAssetId?: string;
  textStatus?: DocumentTextStatus;
  textPreview?: string;
  lastTextAttemptAt?: string;
}

export interface BillProcedureStep {
  id: string;
  billId: string;
  occurredOn: string;
  chamber: ChamberId | "joint" | "unknown";
  stepType: BillProcedureStepType;
  title: string;
  description?: string;
  committeeName?: string;
  documentId?: string;
  sourceUrl?: string;
  displayOrder: number;
}

export interface BillDocumentTextChunk {
  id: string;
  documentId: string;
  billId: string;
  chunkIndex: number;
  text: string;
}

export interface VoteTotals {
  present: number;
  for: number;
  against: number;
  abstention: number;
  presentNotVoting: number;
  absent?: number;
}

export interface Vote {
  id: string;
  billId?: string;
  chamber: ChamberId;
  title: string;
  heldOn: string;
  voteType: string;
  motionKind?: VoteMotionKind;
  prominence?: VoteProminence;
  classificationConfidence?: VoteClassificationConfidence;
  yesMeaning?: VoteYesMeaning;
  totals: VoteTotals;
  sourceSnapshotId: string;
}

export interface GroupVoteTotal {
  id: string;
  voteId: string;
  groupId: string;
  for: number;
  against: number;
  abstention: number;
  presentNotVoting: number;
}

export interface IndividualVote {
  id: string;
  voteId: string;
  memberId: string;
  groupId?: string;
  choice: VoteChoice;
  voteMethod?: string;
}

export interface MemberHistoryRow {
  id: string;
  startsOn: string;
  endsOn?: string;
  legislatureId?: string;
  chamber: ChamberId;
  type: "mandate" | "group" | "party" | "committee" | "role" | "relation";
  label: string;
  details: string;
  logoUrl?: string;
  partySlug?: string;
  sourceUrl?: string;
  votesFor: number;
  votesAgainst: number;
  abstentions: number;
  proposals: number;
}

export interface MemberCareerSegment {
  id: string;
  startsOn: string;
  endsOn?: string;
  legislatureId?: string;
  chamber: ChamberId;
  label: string;
  details?: string;
  logoUrl?: string;
  partySlug?: string;
  sourceUrl?: string;
  color?: string;
  events?: MemberCareerEvent[];
  governance?: MemberCareerGovernanceContext[];
}

export interface MemberCareerGovernanceContext {
  governmentId: string;
  governmentName: string;
  alignment: GovernanceAlignment;
  basis: AlignmentBasis;
  startsOn: string;
  endsOn?: string;
}

export interface MemberCareerEvent {
  id: string;
  date: string;
  labelRo: string;
  labelEn: string;
  descriptionRo: string;
  descriptionEn: string;
  sourceUrl?: string;
}

export interface NormalizedDataset {
  legislatures: Legislature[];
  parties: Party[];
  groups: ParliamentaryGroup[];
  people?: Person[];
  members: Member[];
  governments?: Government[];
  governmentRoles?: GovernmentRole[];
  governmentPartyAlignments?: GovernmentPartyAlignment[];
  governmentGroupAlignments?: GovernmentGroupAlignment[];
  memberGovernanceAlignments?: MemberGovernanceAlignment[];
  compositionEvents?: CompositionEvent[];
  mandates: MemberMandate[];
  groupMemberships: MemberGroupMembership[];
  partyAffiliations: MemberPartyAffiliation[];
  committeeMemberships: MemberCommitteeMembership[];
  roles: MemberRole[];
  bills: Bill[];
  billEvents: BillEvent[];
  billProcedureSteps?: BillProcedureStep[];
  billSponsors: BillSponsor[];
  documents: DocumentSource[];
  billDocumentTextChunks?: BillDocumentTextChunk[];
  votes: Vote[];
  groupVoteTotals: GroupVoteTotal[];
  individualVotes: IndividualVote[];
  sourceSnapshots: SourceSnapshot[];
  memberHistory: Record<string, MemberHistoryRow[]>;
}
