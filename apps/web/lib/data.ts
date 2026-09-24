import { and, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import type { DbClient } from "@cumsevoteaza/db";
import * as schema from "@cumsevoteaza/db";
import tribunalEntitySources from "../../../data/curated/tribunal-political-entity-sources.json";
import {
  demoDataset,
  type Bill,
  type BillEvent,
  type BillProcedureStep,
  type BillSponsor,
  type DocumentSource,
  type AlignmentBasis,
  type Government,
  type GovernanceAlignment,
  type GroupVoteTotal,
  type IndividualVote,
  type Legislature,
  type Member,
  type MemberCareerSegment,
  type MemberCommitteeMembership,
  type MemberGroupMembership,
  type MemberHistoryRow,
  type MemberMandate,
  type MemberMandateRelation,
  type MemberPartyAffiliation,
  type MemberRole,
  type ParliamentaryGroup,
  type Party,
  type PoliticalFormationEvent,
  type SourceSnapshot,
  type Vote
} from "@cumsevoteaza/parliament-model";
import { chamberSeatCount } from "./chamber-seat-counts";
import { uniqueNominalVotes } from "./vote-integrity";
import { dataUnavailable, requireDatabaseOrExplicitDemo } from "./data-availability";
import { getBillExplorerData, getVoteExplorerData } from "./explorer-data";
import { CACHE_TAGS, createWebDbSession, timed } from "./server-db";

export interface VotePageData {
  groupLogoUrls?: Record<string, string>;
  vote: Vote;
  bill?: Bill;
  billProcedureSteps: BillProcedureStep[];
  billDocuments: DocumentSource[];
  billSponsorContexts: BillSponsorContext[];
  source?: SourceSnapshot;
  governmentContext?: GovernmentContextData;
  groupContexts: VoteGroupContext[];
  groups: ParliamentaryGroup[];
  members: Member[];
  groupTotals: GroupVoteTotal[];
  individualVotes: IndividualVote[];
  seatVotes: IndividualVote[];
  seatCapacity?: number;
  seatConstituencies?: Record<string, string>;
  seatPhotoUrls?: Record<string, string>;
  sourceKind: "database" | "demo";
}

export interface VoteDirectoryItem {
  vote: Vote;
  bill?: Bill;
  source?: SourceSnapshot;
}

export interface VoteDirectoryData {
  items: VoteDirectoryItem[];
  sourceKind: "database" | "demo";
}

export interface BillDirectoryItem {
  bill: Bill;
  submittedOn?: string;
  latestEventOn?: string;
  source?: SourceSnapshot;
  voteCount: number;
}

export interface BillDirectoryData {
  items: BillDirectoryItem[];
  sourceKind: "database" | "demo";
}

export interface BillPageData {
  bill: Bill;
  events: BillEvent[];
  procedureSteps: BillProcedureStep[];
  documents: DocumentSource[];
  votes: Vote[];
  source?: SourceSnapshot;
  governmentContext?: GovernmentContextData;
  sponsorContexts: BillSponsorContext[];
  sourceKind: "database" | "demo";
}

export interface GovernmentContextData {
  government: Government;
  asOf: string;
  caretakerSince?: string;
  alignments: Array<{
    party: Party;
    alignment: GovernanceAlignment;
    basis: AlignmentBasis;
    startsOn: string;
    endsOn?: string;
  }>;
  hasCuratedCoalitionData: boolean;
  formationEvents: PoliticalFormationEvent[];
}

export interface VoteGroupContext {
  group: ParliamentaryGroup;
  party?: Party;
  alignment: GovernanceAlignment;
  basis: AlignmentBasis;
  totals: GroupVoteTotal;
}

export interface BillSponsorContext {
  sponsor: BillSponsor;
  member?: Member;
  group?: ParliamentaryGroup;
  party?: Party;
  alignment: GovernanceAlignment;
  basis: AlignmentBasis;
}

export interface MemberDirectoryItem {
  member: Member;
  mandate?: MemberMandate;
  group?: ParliamentaryGroup;
  party?: Party;
  profilePhotoUrl?: string;
  voteCount?: number;
  absenceCount?: number;
  groupSwitchCount?: number;
  serviceDays?: number;
}

export interface MemberDirectoryData {
  members: MemberDirectoryItem[];
  groups: ParliamentaryGroup[];
  parties: Party[];
  legislatures: Legislature[];
  sourceKind: "database" | "demo";
}

export interface MemberPageData {
  member: Member;
  mandate?: MemberMandate;
  group?: ParliamentaryGroup;
  party?: Party;
  profilePhotoUrl?: string;
  currentLogoUrl?: string;
  careerSegments: MemberCareerSegment[];
  source?: SourceSnapshot;
  legislatures: Legislature[];
  selectedLegislature?: Legislature;
  activity?: MemberLegislatureActivityData;
  voteCoverage: Record<string, VoteCoverageData>;
  history: MemberHistoryRow[];
  votes: IndividualVote[];
  voteRecords: Vote[];
  sponsoredBills: Bill[];
  sourceKind: "database" | "demo";
}

export interface MemberLegislatureActivityData {
  voteRecords: number;
  majorVoteRecords: number;
  standardVoteRecords: number;
  routineVoteRecords: number;
  unclassifiedVoteRecords: number;
  votesFor: number;
  votesAgainst: number;
  abstentions: number;
  presentNotVoting: number;
  absent: number;
  unknown: number;
  proposals: number;
  committees: number;
  roles: number;
  firstActivityOn?: string;
  lastActivityOn?: string;
}

type MemberDirectoryFilters = {
  chamber?: string;
  group?: string;
  q?: string;
  legislature?: string;
  sort?: string;
};

export interface VoteCoverageData {
  coverageLevel: "nominal" | "group_totals" | "result_only" | "source_only";
  nominalVotes: number;
  groupTotals: number;
  sourceStatus: "parsed" | "partial" | "failed";
}

export interface PartyPageData {
  party: Party;
  groups: ParliamentaryGroup[];
  members: Member[];
  legislatureSummaries: PartyLegislatureSummary[];
  groupTotals: GroupVoteTotal[];
  votes: Vote[];
  formationEvents: PoliticalFormationEvent[];
  governmentParticipations: PartyGovernmentParticipation[];
  tribunalSources: TribunalPoliticalEntitySource[];
  sourceKind: "database" | "demo";
}

export interface PartyLegislatureSummary {
  legislature: Legislature;
  chamber: MemberMandate["chamber"];
  seatCount: number;
  memberCount: number;
  logoUrls: string[];
  sampleMembers: Member[];
}

export interface PartyGovernmentParticipation {
  government: Government;
  alignment: GovernanceAlignment;
  basis: AlignmentBasis;
  startsOn: string;
  endsOn?: string;
}

type GovernmentPartyAlignmentForCareer = {
  governmentId: string;
  partyId: string;
  alignment: GovernanceAlignment;
  basis: AlignmentBasis;
  startsOn: string;
  endsOn?: string;
};

export interface TribunalPoliticalEntitySource {
  id: string;
  entityType: "party" | "formation";
  entityId: string;
  approvalStatus: "auto_verified" | "manual_verified";
  registryKind: "party" | "alliance" | "other_association";
  tribunalEntityId: string;
  position: number;
  legalName: string;
  shortName?: string;
  sourceUrl: string;
  sourceKind: "official";
  caseNumber?: string;
  decisionNumber?: string;
  hearingDate?: string;
  definitiveDate?: string;
  note: string;
}

const approvedTribunalEntitySources = tribunalEntitySources as TribunalPoliticalEntitySource[];

const getCachedVoteDirectoryData = unstable_cache(
  async (limit: number) => timed("data.vote-directory", () => getVoteDirectoryDataUncached(limit)),
  ["vote-directory-data"],
  { revalidate: 600, tags: [CACHE_TAGS.votes] }
);

const getCachedBillDirectoryData = unstable_cache(
  async (limit: number) => timed("data.bill-directory", () => getBillDirectoryDataUncached(limit)),
  ["bill-directory-data"],
  { revalidate: 600, tags: [CACHE_TAGS.bills] }
);

const getCachedVotePageData = unstable_cache(
  async (id: string) => timed(`data.vote.${id}`, () => getVotePageDataUncached(id)),
  ["vote-page-data-integrity-v2"],
  { revalidate: 900, tags: [CACHE_TAGS.votes] }
);

const getCachedBillPageData = unstable_cache(
  async (id: string) => timed(`data.bill.${id}`, () => getBillPageDataUncached(id)),
  ["bill-page-data"],
  { revalidate: 900, tags: [CACHE_TAGS.bills] }
);

const getCachedMemberDirectoryData = unstable_cache(
  async (filters?: MemberDirectoryFilters) =>
    timed("data.member-directory", () => getMemberDirectoryDataUncached(filters)),
  ["member-directory-data-v2"],
  { revalidate: 600, tags: [CACHE_TAGS.members, CACHE_TAGS.search] }
);

const getCachedMemberPageData = unstable_cache(
  async (slug: string, options: { legislature?: string } = {}) =>
    timed(`data.member.${slug}`, () => getMemberPageDataUncached(slug, options)),
  ["member-page-data"],
  { revalidate: 900, tags: [CACHE_TAGS.members] }
);

const getCachedPartyPageData = unstable_cache(
  async (slug: string) => timed(`data.party.${slug}`, () => getPartyPageDataUncached(slug)),
  ["party-page-data"],
  { revalidate: 900, tags: [CACHE_TAGS.parties, CACHE_TAGS.members] }
);

export async function getVoteDirectoryData(limit = 30): Promise<VoteDirectoryData> {
  return getCachedVoteDirectoryData(limit);
}

async function getVoteDirectoryDataUncached(limit = 30): Promise<VoteDirectoryData> {
  requireDatabaseOrExplicitDemo();
  const dbData = await tryDatabaseVoteDirectory(limit);
  if (dbData) return dbData;
  if (process.env.DATABASE_URL) return dataUnavailable();

  return {
    items: [...demoDataset.votes]
      .sort((a, b) => b.heldOn.localeCompare(a.heldOn))
      .slice(0, limit)
      .map((vote) => ({
        vote,
        bill: demoDataset.bills.find((bill) => bill.id === vote.billId),
        source: demoDataset.sourceSnapshots.find((source) => source.id === vote.sourceSnapshotId)
      })),
    sourceKind: "demo"
  };
}

export async function getBillDirectoryData(limit = 30): Promise<BillDirectoryData> {
  return getCachedBillDirectoryData(limit);
}

async function getBillDirectoryDataUncached(limit = 30): Promise<BillDirectoryData> {
  requireDatabaseOrExplicitDemo();
  const dbData = await tryDatabaseBillDirectory(limit);
  if (dbData) return dbData;
  if (process.env.DATABASE_URL) return dataUnavailable();

  return {
    items: demoDataset.bills
      .map((bill) => directoryBillItem({
        bill,
        events: demoDataset.billEvents.filter((event) => event.billId === bill.id),
        votes: demoDataset.votes.filter((vote) => vote.billId === bill.id),
        sources: demoDataset.sourceSnapshots
      }))
      .sort((a, b) => (b.submittedOn ?? b.latestEventOn ?? "").localeCompare(a.submittedOn ?? a.latestEventOn ?? ""))
      .slice(0, limit),
    sourceKind: "demo"
  };
}

export async function getVotePageData(id: string): Promise<VotePageData | undefined> {
  return getCachedVotePageData(id);
}

async function getVotePageDataUncached(id: string): Promise<VotePageData | undefined> {
  requireDatabaseOrExplicitDemo();
  const dbData = await tryDatabaseVote(id);
  if (dbData) return dbData;
  if (process.env.DATABASE_URL) return undefined;

  const vote = demoDataset.votes.find((item) => item.id === id);
  if (!vote) return undefined;

  return {
    vote,
    bill: demoDataset.bills.find((item) => item.id === vote.billId),
    billProcedureSteps: [],
    billDocuments: [],
    billSponsorContexts: [],
    source: demoDataset.sourceSnapshots.find((item) => item.id === vote.sourceSnapshotId),
    groupContexts: [],
    groups: demoDataset.groups,
    members: demoDataset.members,
    groupTotals: demoDataset.groupVoteTotals.filter((item) => item.voteId === vote.id),
    individualVotes: demoDataset.individualVotes.filter((item) => item.voteId === vote.id),
    seatVotes: demoDataset.individualVotes.filter((item) => item.voteId === vote.id),
    seatConstituencies: Object.fromEntries(demoDataset.mandates.filter((item) => item.chamber === vote.chamber && item.constituency).map((item) => [item.memberId, item.constituency!])),
    seatPhotoUrls: Object.fromEntries(demoDataset.members.filter((item) => item.sourceIds.profilePhoto).map((item) => [item.id, item.sourceIds.profilePhoto!])),
    sourceKind: "demo"
  };
}

export async function getBillPageData(id: string): Promise<BillPageData | undefined> {
  return getCachedBillPageData(id);
}

async function getBillPageDataUncached(id: string): Promise<BillPageData | undefined> {
  requireDatabaseOrExplicitDemo();
  const dbData = await tryDatabaseBill(id);
  if (dbData) return dbData;
  if (process.env.DATABASE_URL) return undefined;

  const bill = demoDataset.bills.find((item) => item.slug === id || item.id === id);
  if (!bill) return undefined;

  return {
    bill,
    events: demoDataset.billEvents.filter((event) => event.billId === bill.id),
    procedureSteps: [],
    documents: demoDataset.documents.filter((document) => document.billId === bill.id),
    votes: demoDataset.votes.filter((vote) => vote.billId === bill.id),
    source: demoDataset.sourceSnapshots.find((item) => bill.sourceSnapshotIds.includes(item.id)),
    sponsorContexts: [],
    sourceKind: "demo"
  };
}

export async function getMemberDirectoryData(filters?: MemberDirectoryFilters): Promise<MemberDirectoryData> {
  return getCachedMemberDirectoryData(filters);
}

async function getMemberDirectoryDataUncached(filters?: MemberDirectoryFilters): Promise<MemberDirectoryData> {
  const dbData = await tryDatabaseMemberDirectory(filters);
  if (dbData) return dbData;

  const items = demoDataset.members.map((member) => {
    const mandate = demoDataset.mandates.find((item) => item.memberId === member.id);
    const membership = demoDataset.groupMemberships.find((item) => item.memberId === member.id && !item.endsOn);
    const group = demoDataset.groups.find((item) => item.id === membership?.groupId);
    const party = demoDataset.parties.find((item) => item.id === group?.partyId);
    return { member, mandate, group, party };
  });

  return {
    members: filterDirectoryItems(items, filters),
    groups: filterMemberDirectoryGroups(demoDataset.groups, demoDataset.mandates, demoDataset.groupMemberships, demoDataset.legislatures, filters),
    parties: demoDataset.parties,
    legislatures: demoDataset.legislatures,
    sourceKind: "demo"
  };
}

export async function getMemberPageData(slug: string, options: { legislature?: string } = {}): Promise<MemberPageData | undefined> {
  return getCachedMemberPageData(slug, options);
}

async function getMemberPageDataUncached(slug: string, options: { legislature?: string } = {}): Promise<MemberPageData | undefined> {
  const dbData = await tryDatabaseMember(slug, options);
  if (dbData) return dbData;

  const member = demoDataset.members.find((item) => item.slug === slug || item.id === slug);
  if (!member) return undefined;
  const history = demoDataset.memberHistory[member.id] ?? [];
  const groupMembership = demoDataset.groupMemberships.find((item) => item.memberId === member.id && !item.endsOn);
  const group = demoDataset.groups.find((item) => item.id === groupMembership?.groupId);
  const party = demoDataset.parties.find((item) => item.id === group?.partyId);
  const mandate = demoDataset.mandates.find((item) => item.memberId === member.id);
  const legislatures = demoDataset.legislatures.filter((legislature) => demoDataset.mandates.some((item) => item.memberId === member.id && item.legislatureId === legislature.id));
  const selectedLegislature = legislatures.find((legislature) => legislature.id === options.legislature) ?? legislatures[0];
  const selectedMandate = selectedLegislature
    ? demoDataset.mandates.find((item) => item.memberId === member.id && item.legislatureId === selectedLegislature.id)
    : mandate;
  const source = demoDataset.sourceSnapshots.find((item) => item.id === groupMembership?.sourceSnapshotId);
  const votes = demoDataset.individualVotes.filter((vote) => {
    const record = demoDataset.votes.find((item) => item.id === vote.voteId);
    return vote.memberId === member.id && (!selectedLegislature || (record && record.heldOn >= selectedLegislature.startsOn && record.heldOn < selectedLegislature.endsOn));
  });
  const voteRecords = demoDataset.votes.filter((vote) => votes.some((individualVote) => individualVote.voteId === vote.id));
  const sponsoredBills = demoDataset.billSponsors
    .filter((sponsor) => sponsor.memberId === member.id)
    .flatMap((sponsor) => demoDataset.bills.filter((bill) => bill.id === sponsor.billId))
    .filter((bill) => {
      const events = demoDataset.billEvents.filter((event) => event.billId === bill.id);
      return !selectedLegislature || events.some((event) => event.occurredOn >= selectedLegislature.startsOn && event.occurredOn < selectedLegislature.endsOn);
    });

  return {
    member,
    mandate: selectedMandate,
    group,
    party,
    profilePhotoUrl: member.sourceIds.profilePhoto,
    currentLogoUrl: groupMembership?.logoUrl,
    careerSegments: buildMemberCareerSegments(history, demoDataset.groups, demoDataset.parties, []),
    source,
    legislatures,
    selectedLegislature,
    activity: activityFromRows(votes, sponsoredBills.length, history),
    voteCoverage: {},
    history,
    votes,
    voteRecords,
    sponsoredBills,
    sourceKind: "demo"
  };
}

export async function getPartyPageData(slug: string): Promise<PartyPageData | undefined> {
  return getCachedPartyPageData(slug);
}

async function getPartyPageDataUncached(slug: string): Promise<PartyPageData | undefined> {
  const dbData = await tryDatabaseParty(slug);
  if (dbData) return dbData;

  const party = demoDataset.parties.find((item) => item.slug === slug || item.id === slug);
  if (!party) return undefined;
  const groups = demoDataset.groups.filter((group) => group.partyId === party.id);
  const groupIds = new Set(groups.map((group) => group.id));
  const members = demoDataset.members.filter((member) =>
    demoDataset.groupMemberships.some((membership) => membership.memberId === member.id && groupIds.has(membership.groupId))
  );
  const groupTotals = demoDataset.groupVoteTotals.filter((total) => groupIds.has(total.groupId));
  const votes = demoDataset.votes.filter((vote) => groupTotals.some((total) => total.voteId === vote.id));
  return {
    party,
    groups,
    members,
    legislatureSummaries: [],
    groupTotals,
    votes,
    formationEvents: [],
    governmentParticipations: [],
    tribunalSources: tribunalSourcesForEntity("party", party.id),
    sourceKind: "demo"
  };
}

async function tryDatabaseVote(id: string): Promise<VotePageData | undefined> {
  if (!process.env.DATABASE_URL) return undefined;

  const session = createWebDbSession();
  try {
    const [voteRow] = await session.db.select().from(schema.votes).where(eq(schema.votes.id, id)).limit(1);
    if (!voteRow) return undefined;

    const [billRow] = voteRow.billId
      ? await session.db.select().from(schema.bills).where(eq(schema.bills.id, voteRow.billId)).limit(1)
      : [];
    const [billProcedureRows, billDocumentRows, billSponsorRows] = billRow
      ? await Promise.all([
          session.db
            .select()
            .from(schema.billProcedureSteps)
            .where(eq(schema.billProcedureSteps.billId, billRow.id)),
          session.db.select().from(schema.documents).where(eq(schema.documents.billId, billRow.id)),
          session.db.select().from(schema.billSponsors).where(eq(schema.billSponsors.billId, billRow.id))
        ])
      : [[], [], []];
    const [sourceRow] = await session.db
      .select()
      .from(schema.sourceSnapshots)
      .where(eq(schema.sourceSnapshots.id, voteRow.sourceSnapshotId))
      .limit(1);
    const groupTotalRows = await session.db
      .select()
      .from(schema.groupVoteTotals)
      .where(eq(schema.groupVoteTotals.voteId, voteRow.id));
    const individualVoteRows = await session.db
      .select()
      .from(schema.individualVotes)
      .where(eq(schema.individualVotes.voteId, voteRow.id));
    const individualVotes = individualVoteRows.map(mapIndividualVote);
    const rosterRows = await session.db.execute<VoteRosterRow>(sql`
      select
        mm.id as mandate_id,
        mm.member_id as mandate_member_id,
        mm.legislature_id as mandate_legislature_id,
        mm.chamber as mandate_chamber,
        mm.starts_on as mandate_starts_on,
        mm.ends_on as mandate_ends_on,
        mm.constituency as mandate_constituency,
        mm.status as mandate_status,
        mm.source_snapshot_id as mandate_source_snapshot_id,
        l.id as legislature_id,
        l.label as legislature_label,
        l.starts_on as legislature_starts_on,
        l.ends_on as legislature_ends_on,
        mgm.id as membership_id,
        mgm.member_id as membership_member_id,
        mgm.group_id as membership_group_id,
        mgm.starts_on as membership_starts_on,
        mgm.ends_on as membership_ends_on,
        mgm.logo_url as membership_logo_url,
        mgm.source_snapshot_id as membership_source_snapshot_id
      from member_mandates mm
      join legislatures l on l.id = mm.legislature_id
      left join lateral (
        select mgm.*
        from member_group_memberships mgm
        where mgm.member_id = mm.member_id
          and mgm.starts_on <= ${voteRow.heldOn}::date
          and coalesce(mgm.ends_on, date '9999-12-31') >= ${voteRow.heldOn}::date
        order by mgm.starts_on desc, mgm.id desc
        limit 1
      ) mgm on true
      where mm.chamber = ${voteRow.chamber}
        and mm.starts_on <= ${voteRow.heldOn}::date
        and coalesce(mm.ends_on, l.ends_on) >= ${voteRow.heldOn}::date
        and ${voteRow.heldOn}::date >= l.starts_on
        and ${voteRow.heldOn}::date < l.ends_on
    `);
    const scopedMemberIds = uniqueStrings([
      ...individualVoteRows.map((row) => row.memberId),
      ...rosterRows.map((row) => row.mandate_member_id)
    ]);
    const scopedGroupIds = uniqueStrings([
      ...individualVoteRows.map((row) => row.groupId ?? ""),
      ...groupTotalRows.map((row) => row.groupId),
      ...rosterRows.map((row) => row.membership_group_id ?? "")
    ]);
    const [memberRows, groupRows] = await Promise.all([
      scopedMemberIds.length > 0
        ? session.db.select().from(schema.members).where(inArray(schema.members.id, scopedMemberIds))
        : [],
      scopedGroupIds.length > 0
        ? session.db.select().from(schema.parliamentaryGroups).where(inArray(schema.parliamentaryGroups.id, scopedGroupIds))
        : []
    ]);
    const groups = groupRows.map(mapGroup);
    const partyIds = uniqueStrings(groups.map((group) => group.partyId ?? ""));
    const partyRows = partyIds.length > 0
      ? await session.db.select().from(schema.parties).where(inArray(schema.parties.id, partyIds))
      : [];
    const parties = partyRows.map(mapParty);
    const mandates = rosterRows.map(mapVoteRosterMandate);
    const memberships = rosterRows.flatMap((row) => row.membership_id ? [mapVoteRosterMembership(row)] : []);
    const photoAssets = scopedMemberIds.length ? await session.db.select().from(schema.storedAssets).where(and(inArray(schema.storedAssets.entityId, scopedMemberIds), eq(schema.storedAssets.assetType, "photo"), eq(schema.storedAssets.fetchStatus, "stored"))) : [];
    const seatPhotoUrls = Object.fromEntries(memberRows.flatMap((row) => {
      const mandate = mandates.find((item) => item.memberId === row.id);
      const url = storedAssetUrl(photoAssets, "photo", row.id, mandate?.legislatureId, voteRow.chamber);
      return url ? [[row.id, url]] : [];
    }));
    // Party assets from the official Senate vote page (2026-09-08).
    // A member's election-list logo may represent a previous party, so it must
    // not be used as the group's logo.
    const officialPartyLogos: Record<string, string> = voteRow.heldOn >= "2024-12-01" ? {
      AUR: "https://www.senat.ro/Poze/Partide/2020/aur.png",
      PNL: "https://www.senat.ro/Poze/Partide/2020/pnl.png",
      PSD: "https://www.senat.ro/Poze/Partide/2020/psd.png",
      UDMR: "https://www.senat.ro/POZE/Partide/2020/udmr_.png",
      USR: "https://www.senat.ro/Poze/Partide/2020/USR_RGB_patrat_alb.png"
    } : {};
    const logoUrls = Object.values(officialPartyLogos);
    const logoAssets = logoUrls.length
      ? await session.db.select().from(schema.storedAssets).where(inArray(schema.storedAssets.officialUrl, logoUrls))
      : [];
    const groupLogoUrls: Record<string, string> = {};
    for (const group of groups) {
      const party = parties.find((party) => party.id === group.partyId);
      const officialUrl = officialPartyLogos[party?.shortName ?? group.shortName];
      if (officialUrl) groupLogoUrls[group.id] = storedAssetUrlByOfficialUrl(logoAssets, officialUrl) ?? officialUrl;
    }
    const legislatures = uniqueBy(rosterRows.map(mapVoteRosterLegislature), (legislature) => legislature.id);
    const governmentContext = await loadGovernmentContextForDate(session.db, voteRow.heldOn, partyIds);
    const groupTotals = groupTotalRows.map(mapGroupVoteTotal);
    const contextGroupTotals = groupTotals.length > 0 ? groupTotals : groupTotalsFromIndividualVotes(voteRow.id, individualVotes);

    return {
      vote: mapVote(voteRow),
      bill: billRow ? mapBill(billRow) : undefined,
      billProcedureSteps: billProcedureRows
        .map(mapBillProcedureStep)
        .sort((a, b) => `${a.occurredOn}-${a.displayOrder}`.localeCompare(`${b.occurredOn}-${b.displayOrder}`)),
      billDocuments: billDocumentRows.map(mapDocument),
      billSponsorContexts: billSponsorRows.length > 0
        ? await loadBillSponsorContexts(session.db, billSponsorRows.map(mapBillSponsor), voteRow.heldOn)
        : [],
      source: sourceRow ? mapSource(sourceRow) : undefined,
      governmentContext,
      groupContexts: buildVoteGroupContexts(contextGroupTotals, groups, parties, governmentContext),
      groupLogoUrls,
      groups,
      members: memberRows.map(mapMember),
      groupTotals,
      individualVotes,
      seatCapacity: chamberSeatCount(voteRow.chamber, voteRow.heldOn, legislatures),
      seatVotes: buildVoteSeatRows({
        vote: mapVote(voteRow),
        members: memberRows.map(mapMember),
        individualVotes,
        mandates,
        memberships,
        legislatures
      }),
      seatConstituencies: Object.fromEntries(mandates.filter((item) => item.constituency).map((item) => [item.memberId, item.constituency!])),
      seatPhotoUrls,
      sourceKind: "database"
    };
  } catch {
    return dataUnavailable();
  } finally {
    await session.close();
  }
}

async function tryDatabaseVoteDirectory(limit: number): Promise<VoteDirectoryData | undefined> {
  if (!process.env.DATABASE_URL) return undefined;

  try {
    const data = await getVoteExplorerData({ limit });
    if (data.sourceKind !== "database") return undefined;
    return {
      items: data.items.map(({ vote, bill, source }) => ({ vote, bill, source })),
      sourceKind: "database"
    };
  } catch {
    return undefined;
  }
}

async function tryDatabaseBillDirectory(limit: number): Promise<BillDirectoryData | undefined> {
  if (!process.env.DATABASE_URL) return undefined;

  try {
    const data = await getBillExplorerData({ limit });
    if (data.sourceKind !== "database") return undefined;
    return {
      items: data.items.map(({ bill, submittedOn, latestEventOn, source, voteCount }) => ({
        bill,
        submittedOn,
        latestEventOn,
        source,
        voteCount
      })),
      sourceKind: "database"
    };
  } catch {
    return undefined;
  }
}

async function tryDatabaseBill(id: string): Promise<BillPageData | undefined> {
  if (!process.env.DATABASE_URL) return undefined;

  const session = createWebDbSession();
  try {
    const [billRow] = await session.db
      .select()
      .from(schema.bills)
      .where(or(eq(schema.bills.id, id), eq(schema.bills.slug, id)))
      .limit(1);
    if (!billRow) return undefined;

    const [eventRows, procedureRows, documentRows, voteRows, sponsorRows] = await Promise.all([
      session.db.select().from(schema.billEvents).where(eq(schema.billEvents.billId, billRow.id)),
      session.db.select().from(schema.billProcedureSteps).where(eq(schema.billProcedureSteps.billId, billRow.id)),
      session.db.select().from(schema.documents).where(eq(schema.documents.billId, billRow.id)),
      session.db.select().from(schema.votes).where(eq(schema.votes.billId, billRow.id)),
      session.db.select().from(schema.billSponsors).where(eq(schema.billSponsors.billId, billRow.id))
    ]);
    const sourceId = Array.isArray(billRow.sourceSnapshotIds) ? billRow.sourceSnapshotIds[0] : undefined;
    const [sourceRow] = sourceId
      ? await session.db.select().from(schema.sourceSnapshots).where(eq(schema.sourceSnapshots.id, sourceId)).limit(1)
      : [];
    const events = eventRows.map(mapBillEvent).sort((a, b) => a.occurredOn.localeCompare(b.occurredOn));
    const sponsorContexts: BillSponsorContext[] = events[0]
      ? await loadBillSponsorContexts(session.db, sponsorRows.map(mapBillSponsor), events[0].occurredOn)
      : sponsorRows.map((row) => ({
          sponsor: mapBillSponsor(row),
          alignment: "unknown" as const,
          basis: "unknown" as const
        }));
    const sponsorPartyIds = uniqueStrings(sponsorContexts.map((item) => item.party?.id ?? ""));
    const governmentContext = events[0] ? await loadGovernmentContextForDate(session.db, events[0].occurredOn, sponsorPartyIds) : undefined;

    return {
      bill: mapBill(billRow),
      events,
      procedureSteps: procedureRows
        .map(mapBillProcedureStep)
        .sort((a, b) => `${a.occurredOn}-${a.displayOrder}`.localeCompare(`${b.occurredOn}-${b.displayOrder}`)),
      documents: documentRows.map(mapDocument),
      votes: voteRows.map(mapVote),
      source: sourceRow ? mapSource(sourceRow) : undefined,
      governmentContext,
      sponsorContexts: governmentContext ? sponsorContexts.map((item) => ({
        ...item,
        ...resolvePartyAlignment(item.party?.id, governmentContext)
      })) : sponsorContexts,
      sourceKind: "database"
    };
  } catch {
    return dataUnavailable();
  } finally {
    await session.close();
  }
}

async function tryDatabaseMemberDirectory(filters?: MemberDirectoryFilters): Promise<MemberDirectoryData | undefined> {
  if (!process.env.DATABASE_URL) return undefined;

  const session = createWebDbSession();
  try {
    const conditions = memberDirectoryConditions(filters);
    const where = conditions.length ? sql`where ${sql.join(conditions, sql` and `)}` : sql``;
    const orderBy = memberDirectoryOrderSql(filters?.sort);
    const stats = memberDirectoryStatsSql(filters?.sort);
    const [memberRows, groupRows, partyRows, legislatureRows] = await Promise.all([
      session.db.execute<MemberDirectoryRow>(sql`
        with
        ${stats.ctes}
        scoped as (
          select
            m.id as member_id,
            m.person_id as member_person_id,
            m.slug as member_slug,
            m.first_name as member_first_name,
            m.last_name as member_last_name,
            m.display_name as member_display_name,
            m.source_ids as member_source_ids,
            mm.id as mandate_id,
            mm.member_id as mandate_member_id,
            mm.legislature_id as mandate_legislature_id,
            mm.chamber as mandate_chamber,
            mm.starts_on as mandate_starts_on,
            mm.ends_on as mandate_ends_on,
            mm.constituency as mandate_constituency,
            mm.status as mandate_status,
            mm.source_snapshot_id as mandate_source_snapshot_id,
            pg.id as group_id,
            pg.party_id as group_party_id,
            pg.chamber as group_chamber,
            pg.short_name as group_short_name,
            pg.name as group_name,
            pg.color as group_color,
            p.id as party_id,
            p.slug as party_slug,
            p.short_name as party_short_name,
            p.name as party_name,
            p.color as party_color,
            photo_asset.id as profile_photo_asset_id,
            coalesce(vote_stats.vote_count, 0)::int as vote_count,
            coalesce(vote_stats.absence_count, 0)::int as absence_count,
            ${stats.select}
            row_number() over (partition by coalesce(m.person_id, m.id) order by mm.starts_on desc, mm.id desc) as rn
          from member_mandates mm
          join members m on m.id = mm.member_id
          left join lateral (
            select mgm.*
            from member_group_memberships mgm
            join parliamentary_groups pg_filter on pg_filter.id = mgm.group_id
            where mgm.member_id = mm.member_id
              and mgm.starts_on <= coalesce(mm.ends_on, date '9999-12-31')
              and coalesce(mgm.ends_on, date '9999-12-31') >= mm.starts_on
              and pg_filter.chamber = mm.chamber
            order by mgm.starts_on desc, mgm.id desc
            limit 1
          ) mgm on true
          left join parliamentary_groups pg on pg.id = mgm.group_id
          left join parties p on p.id = pg.party_id
          left join lateral (
            select sa.id
            from stored_assets sa
            where sa.entity_id = m.id and sa.asset_type = 'photo' and sa.fetch_status = 'stored'
            order by (sa.legislature_id = mm.legislature_id) desc, sa.updated_at desc
            limit 1
          ) photo_asset on true
          left join lateral (
            select coalesce(sum(
              mla.votes_for + mla.votes_against + mla.abstentions + mla.present_not_voting
            ), 0)::int as vote_count,
            coalesce(sum(mla.absent), 0)::int as absence_count
            from member_legislature_activity mla
            where mla.member_id = m.id
              and mla.legislature_id = mm.legislature_id
              and mla.chamber = mm.chamber
          ) vote_stats on true
          ${stats.joins}
          ${where}
        )
        select *
        from scoped
        where rn = 1
        order by ${orderBy}
        limit 500
      `),
      session.db.execute<typeof schema.parliamentaryGroups.$inferSelect>(memberDirectoryGroupsSql(filters)),
      session.db.select().from(schema.parties),
      session.db.select().from(schema.legislatures)
    ]);
    const groups = groupRows.map(mapGroup);
    const parties = partyRows.map(mapParty);
    const legislatures = legislatureRows.map(mapLegislature).sort((a, b) => b.startsOn.localeCompare(a.startsOn));
    return {
      members: memberRows.map(mapMemberDirectoryRow),
      groups,
      parties,
      legislatures,
      sourceKind: "database"
    };
  } catch {
    return undefined;
  } finally {
    await session.close();
  }
}

async function tryDatabaseMember(slug: string, options: { legislature?: string } = {}): Promise<MemberPageData | undefined> {
  if (!process.env.DATABASE_URL) return undefined;

  const session = createWebDbSession();
  try {
    let [memberRow] = await session.db
      .select()
      .from(schema.members)
      .where(or(eq(schema.members.slug, slug), eq(schema.members.id, slug)))
      .limit(1);
    if (!memberRow) {
      memberRow = await findMemberByLegacySlug(session.db, slug);
    }
    if (!memberRow) return undefined;

    const relatedMemberRows = memberRow.personId
      ? await session.db.select().from(schema.members).where(eq(schema.members.personId, memberRow.personId))
      : [memberRow];
    const relatedMembers = relatedMemberRows.map(mapMember);
    const memberIds = relatedMembers.map((member) => member.id);
    const mandateRows = await session.db.select().from(schema.memberMandates).where(inArray(schema.memberMandates.memberId, memberIds));
    const membershipRows = await session.db
      .select()
      .from(schema.memberGroupMemberships)
      .where(inArray(schema.memberGroupMemberships.memberId, memberIds));
    const partyAffiliationRows = await session.db
      .select()
      .from(schema.memberPartyAffiliations)
      .where(inArray(schema.memberPartyAffiliations.memberId, memberIds));
    const committeeRows = await session.db
      .select()
      .from(schema.memberCommitteeMemberships)
      .where(inArray(schema.memberCommitteeMemberships.memberId, memberIds));
    const roleRows = await session.db.select().from(schema.memberRoles).where(inArray(schema.memberRoles.memberId, memberIds));
    const mandateIds = mandateRows.map((item) => item.id);
    const relationRows =
      mandateIds.length > 0
        ? await session.db.select().from(schema.memberMandateRelations).where(inArray(schema.memberMandateRelations.mandateId, mandateIds))
        : [];
    const groups = (await session.db.select().from(schema.parliamentaryGroups)).map(mapGroup);
    const parties = (await session.db.select().from(schema.parties)).map(mapParty);
    const memberships = membershipRows.map(mapMemberGroupMembership);
    const mandates = mandateRows.map(mapMemberMandate);
    const storedAssetRows = memberIds.length > 0
      ? await session.db
          .select()
          .from(schema.storedAssets)
          .where(and(inArray(schema.storedAssets.entityId, memberIds), eq(schema.storedAssets.fetchStatus, "stored")))
      : [];
    const formationEventRows = await session.db.select().from(schema.politicalFormationEvents);
    const formationEventEntityRows = await session.db.select().from(schema.politicalFormationEventEntities);
    const formationEvents = mapPoliticalFormationEvents(formationEventRows, formationEventEntityRows);
    const governmentRows = await session.db.select().from(schema.governments);
    const governmentAlignmentRows = await session.db.select().from(schema.governmentPartyAlignments);
    const governments = governmentRows.map(mapGovernment);
    const governmentAlignments = governmentAlignmentRows.map((row) => ({
      governmentId: row.governmentId,
      partyId: row.partyId,
      alignment: row.alignment,
      basis: row.basis,
      startsOn: row.startsOn,
      endsOn: row.endsOn ?? undefined
    }));
    const legislatureRows = await session.db.select().from(schema.legislatures);
    const legislatures = legislatureRows
      .map(mapLegislature)
      .filter((legislature) => mandates.some((mandate) => mandate.legislatureId === legislature.id))
      .sort((a, b) => b.startsOn.localeCompare(a.startsOn));
    const selectedLegislature = legislatures.find((legislature) => legislature.id === options.legislature) ?? legislatures[0];
    const mandate = latestMandate(mandates.filter((item) => !selectedLegislature || item.legislatureId === selectedLegislature.id)) ?? latestMandate(mandates);
    const member = relatedMembers.find((item) => item.id === mandate?.memberId) ?? mapMember(memberRow);
    const currentMembership =
      mandate && selectedLegislature
        ? latestMembershipDuring(
            memberships.filter((membership) => membership.memberId === mandate.memberId),
            mandate.startsOn,
            earliestDate(mandate.endsOn, selectedLegislature.endsOn)
          )
        : latestMembership(memberships.filter((membership) => !mandate || membership.memberId === mandate.memberId));
    const group = groups.find((item) => item.id === currentMembership?.groupId);
    const party = parties.find((item) => item.id === group?.partyId);
    const sourceId =
      currentMembership?.sourceSnapshotId ??
      mandate?.sourceSnapshotId ??
      membershipRows.find((item) => item.sourceSnapshotId)?.sourceSnapshotId;
    const [sourceRow] = sourceId
      ? await session.db.select().from(schema.sourceSnapshots).where(eq(schema.sourceSnapshots.id, sourceId)).limit(1)
      : [];

    const selectedVotes = selectedLegislature
      ? await getMemberVotesForLegislature(session.db, memberIds, selectedLegislature.id)
      : { individualVotes: [], voteRecords: [] };
    const sponsoredBills = selectedLegislature
      ? await getMemberSponsoredBillsForLegislature(session.db, memberIds, selectedLegislature.id)
      : [];
    const activity = selectedLegislature
      ? await getMemberLegislatureActivity(session.db, memberIds, selectedLegislature.id)
      : undefined;
    const voteCoverage = await getVoteCoverage(session.db, selectedVotes.voteRecords.map((vote) => vote.id));
    const historySourceIds = [...new Set([
      ...mandates,
      ...memberships,
      ...partyAffiliationRows,
      ...relationRows,
      ...committeeRows,
      ...roleRows
    ].map((row) => row.sourceSnapshotId).filter((id): id is string => Boolean(id)))];
    const historySources = historySourceIds.length
      ? await session.db.select().from(schema.sourceSnapshots).where(inArray(schema.sourceSnapshots.id, historySourceIds))
      : [];
    const historySourceUrls = new Map(historySources.map((row) => [row.id, row.sourceUrl]));
    const history = buildMemberHistory({
      mandates,
      groupMemberships: memberships,
      partyAffiliations: partyAffiliationRows.map(mapMemberPartyAffiliation),
      mandateRelations: relationRows.map(mapMemberMandateRelation),
      committees: committeeRows.map(mapMemberCommitteeMembership),
      roles: roleRows.map(mapMemberRole),
      groups,
      parties,
      legislatures,
      formationEvents,
      votes: selectedVotes.individualVotes,
      sourceUrls: historySourceUrls
    });
    const resolvedHistory = resolveHistoryAssetUrls(history, storedAssetRows);
    const profilePhotoUrl =
      storedAssetUrl(storedAssetRows, "photo", member.id, selectedLegislature?.id, mandate?.chamber);
    const logoUrl =
      storedAssetUrl(storedAssetRows, "party_logo", member.id, selectedLegislature?.id, mandate?.chamber) ??
      storedAssetUrlByOfficialUrl(storedAssetRows, currentMembership?.logoUrl);

    return {
      member,
      mandate,
      group,
      party,
      profilePhotoUrl,
      currentLogoUrl: logoUrl,
      careerSegments: buildMemberCareerSegments(resolvedHistory, groups, parties, formationEvents, governments, governmentAlignments),
      source: sourceRow ? mapSource(sourceRow) : undefined,
      legislatures,
      selectedLegislature,
      activity: activity ?? activityFromRows(selectedVotes.individualVotes, sponsoredBills.length, history),
      voteCoverage,
      history: resolvedHistory,
      votes: selectedVotes.individualVotes,
      voteRecords: selectedVotes.voteRecords,
      sponsoredBills,
      sourceKind: "database"
    };
  } catch {
    return undefined;
  } finally {
    await session.close();
  }
}

async function tryDatabaseParty(slug: string): Promise<PartyPageData | undefined> {
  if (!process.env.DATABASE_URL) return undefined;

  const session = createWebDbSession();
  try {
    const [partyRow] = await session.db
      .select()
      .from(schema.parties)
      .where(or(eq(schema.parties.slug, slug), eq(schema.parties.id, slug)))
      .limit(1);
    if (!partyRow) return undefined;
    const party = mapParty(partyRow);
    const groups = (await session.db.select().from(schema.parliamentaryGroups).where(eq(schema.parliamentaryGroups.partyId, party.id))).map(mapGroup);
    const groupIds = groups.map((group) => group.id);
    const [memberRows, totalRows, voteRows, legislatureSummaryRows, legislatureMemberRows] = groupIds.length > 0
      ? await Promise.all([
          session.db.execute<typeof schema.members.$inferSelect>(sql`
            select distinct
              m.id,
              m.person_id as "personId",
              m.slug,
              m.first_name as "firstName",
              m.last_name as "lastName",
              m.display_name as "displayName",
              m.source_ids as "sourceIds"
            from members m
            join member_group_memberships mgm on mgm.member_id = m.id
            where mgm.group_id in (${sql.join(groupIds.map((groupId) => sql`${groupId}`), sql`, `)})
            order by m.display_name asc
            limit 500
          `),
          session.db.select().from(schema.groupVoteTotals).where(inArray(schema.groupVoteTotals.groupId, groupIds)).limit(200),
          session.db.execute<typeof schema.votes.$inferSelect>(sql`
            select distinct
              v.id,
              v.bill_id as "billId",
              v.chamber,
              v.title,
              v.held_on as "heldOn",
              v.vote_type as "voteType",
              v.present,
              v.for_count as "forCount",
              v.against,
              v.abstention,
              v.present_not_voting as "presentNotVoting",
              v.absent,
              v.source_snapshot_id as "sourceSnapshotId"
            from votes v
            join group_vote_totals gvt on gvt.vote_id = v.id
            where gvt.group_id in (${sql.join(groupIds.map((groupId) => sql`${groupId}`), sql`, `)})
            order by v.held_on desc, v.id desc
            limit 200
          `),
          session.db.execute<PartyLegislatureSummaryRow>(sql`
            select
              l.id as legislature_id,
              l.label as legislature_label,
              l.starts_on as legislature_starts_on,
              l.ends_on as legislature_ends_on,
              mm.chamber as chamber,
              count(distinct coalesce(m.person_id, m.id)) filter (
                where mm.starts_on <= l.starts_on
                  and coalesce(mm.ends_on, l.ends_on) >= l.starts_on
                  and (
                    (
                      mpa.id is not null
                      and mpa.starts_on <= l.starts_on
                      and coalesce(mpa.ends_on, l.ends_on) >= l.starts_on
                    )
                    or (
                      pg.id is not null
                      and mgm.starts_on <= l.starts_on
                      and coalesce(mgm.ends_on, l.ends_on) >= l.starts_on
                    )
                  )
              )::int as seat_count,
              count(distinct coalesce(m.person_id, m.id))::int as member_count,
              array_remove(array_agg(distinct coalesce(mpa.logo_url, mgm.logo_url)), null) as logo_urls
            from member_mandates mm
            join legislatures l on l.id = mm.legislature_id
            join members m on m.id = mm.member_id
            left join member_party_affiliations mpa
              on mpa.member_id = mm.member_id
              and mpa.party_id = ${party.id}
              and mpa.starts_on <= coalesce(mm.ends_on, l.ends_on)
              and coalesce(mpa.ends_on, l.ends_on) >= mm.starts_on
            left join member_group_memberships mgm
              on mgm.member_id = mm.member_id
              and mgm.starts_on <= coalesce(mm.ends_on, l.ends_on)
              and coalesce(mgm.ends_on, l.ends_on) >= mm.starts_on
            left join parliamentary_groups pg
              on pg.id = mgm.group_id
              and pg.party_id = ${party.id}
              and pg.chamber = mm.chamber
            where mpa.id is not null or pg.id is not null
            group by l.id, l.label, l.starts_on, l.ends_on, mm.chamber
            order by l.starts_on desc, mm.chamber asc
          `),
          session.db.execute<PartyLegislatureMemberRow>(sql`
            select distinct on (l.id, mm.chamber, coalesce(m.person_id, m.id))
              l.id as legislature_id,
              mm.chamber as chamber,
              m.id as member_id,
              m.person_id as member_person_id,
              m.slug as member_slug,
              m.first_name as member_first_name,
              m.last_name as member_last_name,
              m.display_name as member_display_name,
              m.source_ids as member_source_ids
            from member_mandates mm
            join legislatures l on l.id = mm.legislature_id
            join members m on m.id = mm.member_id
            left join member_party_affiliations mpa
              on mpa.member_id = mm.member_id
              and mpa.party_id = ${party.id}
              and mpa.starts_on <= coalesce(mm.ends_on, l.ends_on)
              and coalesce(mpa.ends_on, l.ends_on) >= mm.starts_on
            left join member_group_memberships mgm
              on mgm.member_id = mm.member_id
              and mgm.starts_on <= coalesce(mm.ends_on, l.ends_on)
              and coalesce(mgm.ends_on, l.ends_on) >= mm.starts_on
            left join parliamentary_groups pg
              on pg.id = mgm.group_id
              and pg.party_id = ${party.id}
              and pg.chamber = mm.chamber
            where mpa.id is not null or pg.id is not null
            order by l.id, mm.chamber, coalesce(m.person_id, m.id), m.display_name asc
          `)
        ])
      : [[], [], [], [], []];
    const members = memberRows.map(mapMember);
    const groupTotals = totalRows.map(mapGroupVoteTotal);
    const votes = voteRows.map(mapVote);
    const sampleMembersByLegislature = new Map<string, Member[]>();
    for (const row of legislatureMemberRows) {
      const key = `${row.legislature_id}|${row.chamber}`;
      const current = sampleMembersByLegislature.get(key) ?? [];
      if (current.length < 12) current.push(mapPartyLegislatureMember(row));
      sampleMembersByLegislature.set(key, current);
    }
    const rawLegislatureSummaries = legislatureSummaryRows.map((row) => ({
      legislature: {
        id: row.legislature_id,
        label: row.legislature_label,
        startsOn: dateString(row.legislature_starts_on),
        endsOn: dateString(row.legislature_ends_on)
      },
      chamber: row.chamber,
      seatCount: Number(row.seat_count ?? 0),
      memberCount: Number(row.member_count ?? 0),
      logoUrls: jsonStringArray(row.logo_urls).slice(0, 4),
      sampleMembers: sampleMembersByLegislature.get(`${row.legislature_id}|${row.chamber}`) ?? []
    }));
    const logoOfficialUrls = Array.from(new Set(rawLegislatureSummaries.flatMap((summary) => summary.logoUrls)));
    const storedLogoRows = logoOfficialUrls.length > 0
      ? await session.db
          .select()
          .from(schema.storedAssets)
          .where(and(inArray(schema.storedAssets.officialUrl, logoOfficialUrls), eq(schema.storedAssets.fetchStatus, "stored")))
      : [];
    const legislatureSummaries = rawLegislatureSummaries.map((summary) => ({
      ...summary,
      logoUrls: summary.logoUrls.flatMap((logoUrl) => {
        const storedUrl = storedAssetUrlByOfficialUrl(storedLogoRows, logoUrl);
        return storedUrl ? [storedUrl] : [];
      })
    }));
    const [formationEventRows, formationEventEntityRows, governmentAlignmentRows, governmentRows] = await Promise.all([
      session.db.select().from(schema.politicalFormationEvents),
      session.db.select().from(schema.politicalFormationEventEntities),
      session.db.select().from(schema.governmentPartyAlignments).where(eq(schema.governmentPartyAlignments.partyId, party.id)),
      session.db.select().from(schema.governments)
    ]);
    const formationEvents = mapPoliticalFormationEvents(formationEventRows, formationEventEntityRows)
      .filter((event) => event.entities.some((entity) => entity.entityType === "party" && entity.entityId === party.id))
      .sort((a, b) => a.date.localeCompare(b.date) || a.titleRo.localeCompare(b.titleRo, "ro"));
    const governmentsById = new Map(governmentRows.map((row) => [row.id, mapGovernment(row)]));
    const governmentParticipations = governmentAlignmentRows
      .flatMap((row): PartyGovernmentParticipation[] => {
        const government = governmentsById.get(row.governmentId);
        return government
          ? [
              {
                government,
                alignment: row.alignment,
                basis: row.basis,
                startsOn: row.startsOn,
                endsOn: row.endsOn ?? undefined
              }
            ]
          : [];
      })
      .sort((a, b) => b.startsOn.localeCompare(a.startsOn) || a.government.name.localeCompare(b.government.name, "ro"));
    return {
      party,
      groups,
      members,
      legislatureSummaries,
      groupTotals,
      votes,
      formationEvents,
      governmentParticipations,
      tribunalSources: tribunalSourcesForEntity("party", party.id),
      sourceKind: "database"
    };
  } catch {
    return undefined;
  } finally {
    await session.close();
  }
}

function mapBill(row: typeof schema.bills.$inferSelect): Bill {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    identifiers: row.identifiers,
    chamberOfOrigin: row.chamberOfOrigin === "senate" || row.chamberOfOrigin === "deputies" ? row.chamberOfOrigin : "unknown",
    decisionChamber: row.decisionChamber ?? undefined,
    status: row.status,
    sourceSnapshotIds: row.sourceSnapshotIds
  };
}

function mapVote(row: typeof schema.votes.$inferSelect): Vote {
  return {
    id: row.id,
    billId: row.billId ?? undefined,
    chamber: row.chamber,
    title: row.title,
    heldOn: row.heldOn,
    voteType: row.voteType,
    motionKind: row.motionKind,
    prominence: row.prominence,
    classificationConfidence: row.classificationConfidence,
    yesMeaning: row.yesMeaning,
    totals: {
      present: row.present,
      for: row.forCount,
      against: row.against,
      abstention: row.abstention,
      presentNotVoting: row.presentNotVoting,
      absent: row.absent ?? undefined
    },
    sourceSnapshotId: row.sourceSnapshotId
  };
}

function mapSource(row: typeof schema.sourceSnapshots.$inferSelect): SourceSnapshot {
  return {
    id: row.id,
    sourceUrl: row.sourceUrl,
    fetchedAt: row.fetchedAt.toISOString(),
    contentHash: row.contentHash,
    parser: row.parser,
    parserVersion: row.parserVersion,
    status: row.status,
    notes: row.notes ?? undefined
  };
}

function mapGroup(row: typeof schema.parliamentaryGroups.$inferSelect): ParliamentaryGroup {
  return {
    id: row.id,
    partyId: row.partyId ?? undefined,
    chamber: row.chamber,
    shortName: row.shortName,
    name: row.name,
    color: row.color
  };
}

function mapParty(row: typeof schema.parties.$inferSelect): Party {
  return {
    id: row.id,
    slug: row.slug,
    shortName: row.shortName,
    name: row.name,
    color: row.color
  };
}

function mapGovernment(row: typeof schema.governments.$inferSelect): Government {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    legislatureId: row.legislatureId ?? undefined,
    primeMinisterPersonId: row.primeMinisterPersonId ?? undefined,
    startsOn: row.startsOn,
    endsOn: row.endsOn ?? undefined,
    basis: row.basis,
    investitureVoteId: row.investitureVoteId ?? undefined,
    sourceSnapshotId: row.sourceSnapshotId ?? undefined
  };
}

async function loadGovernmentContextForDate(db: DbClient, date: string, relevantEntityIds: string[] = []): Promise<GovernmentContextData | undefined> {
  const governmentRows = await db.select().from(schema.governments).where(sql`
    ${schema.governments.startsOn} <= ${date}::date
    and coalesce(${schema.governments.endsOn}, date '9999-12-31') >= ${date}::date
  `);
  const government = governmentRows
    .map(mapGovernment)
    .sort((a, b) => b.startsOn.localeCompare(a.startsOn) || a.name.localeCompare(b.name, "ro"))
    .at(0);
  if (!government) return undefined;

  const alignmentRows = await db.select().from(schema.governmentPartyAlignments).where(sql`
    ${schema.governmentPartyAlignments.governmentId} = ${government.id}
    and ${schema.governmentPartyAlignments.startsOn} <= ${date}::date
    and coalesce(${schema.governmentPartyAlignments.endsOn}, date '9999-12-31') >= ${date}::date
  `);
  const partyIds = uniqueStrings(alignmentRows.map((row) => row.partyId));
  const partyRows = partyIds.length > 0
    ? await db.select().from(schema.parties).where(inArray(schema.parties.id, partyIds))
    : [];
  const partiesById = new Map(partyRows.map((row) => [row.id, mapParty(row)]));
  const caretakerRows = await db.select({ occurredOn: schema.compositionEvents.occurredOn })
    .from(schema.compositionEvents)
    .where(sql`
      ${schema.compositionEvents.governmentId} = ${government.id}
      and ${schema.compositionEvents.eventType} = 'no_confidence_motion'
      and ${schema.compositionEvents.occurredOn} <= ${date}::date
    `);
  const caretakerSince = caretakerRows.map((row) => row.occurredOn).sort().at(0);

  return {
    government,
    asOf: date,
    caretakerSince,
    alignments: alignmentRows
      .flatMap((row) => {
        const party = partiesById.get(row.partyId);
        return party
          ? [{
              party,
              alignment: row.alignment,
              basis: row.basis,
              startsOn: row.startsOn,
              endsOn: row.endsOn ?? undefined
            }]
          : [];
      })
      .sort((a, b) => alignmentSortWeight(a.alignment) - alignmentSortWeight(b.alignment) || a.party.shortName.localeCompare(b.party.shortName, "ro")),
    hasCuratedCoalitionData: alignmentRows.length > 0,
    formationEvents: await loadRelevantFormationEventsForDate(db, date, uniqueStrings([
      ...relevantEntityIds,
      ...alignmentRows.map((row) => row.partyId)
    ]))
  };
}

async function loadRelevantFormationEventsForDate(db: DbClient, date: string, entityIds: string[]): Promise<PoliticalFormationEvent[]> {
  if (entityIds.length === 0) return [];
  const eventRows = await db.select().from(schema.politicalFormationEvents).where(sql`
    ${schema.politicalFormationEvents.date} <= ${date}::date
  `);
  const eventEntityRows = await db.select().from(schema.politicalFormationEventEntities);
  const entityIdSet = new Set(entityIds);
  return mapPoliticalFormationEvents(eventRows, eventEntityRows)
    .filter((event) => event.entities.some((entity) => entityIdSet.has(entity.entityId)))
    .sort((a, b) => b.date.localeCompare(a.date) || a.titleRo.localeCompare(b.titleRo, "ro"))
    .slice(0, 6);
}

function buildVoteGroupContexts(
  totals: GroupVoteTotal[],
  groups: ParliamentaryGroup[],
  parties: Party[],
  governmentContext?: GovernmentContextData
): VoteGroupContext[] {
  const groupsById = new Map(groups.map((group) => [group.id, group]));
  const partiesById = new Map(parties.map((party) => [party.id, party]));
  return totals
    .flatMap((total) => {
      const group = groupsById.get(total.groupId);
      if (!group) return [];
      const party = group.partyId ? partiesById.get(group.partyId) : undefined;
      const alignment = resolvePartyAlignment(party?.id, governmentContext, group.shortName);
      return [{ group, party, totals: total, ...alignment }];
    })
    .sort((a, b) => alignmentSortWeight(a.alignment) - alignmentSortWeight(b.alignment) || a.group.shortName.localeCompare(b.group.shortName, "ro"));
}

function groupTotalsFromIndividualVotes(voteId: string, votes: IndividualVote[]): GroupVoteTotal[] {
  const byGroup = new Map<string, GroupVoteTotal>();
  for (const vote of votes) {
    if (!vote.groupId) continue;
    const current = byGroup.get(vote.groupId) ?? {
      id: `derived-group-total-${voteId}-${vote.groupId}`,
      voteId,
      groupId: vote.groupId,
      for: 0,
      against: 0,
      abstention: 0,
      presentNotVoting: 0
    };
    if (vote.choice === "for") current.for += 1;
    if (vote.choice === "against") current.against += 1;
    if (vote.choice === "abstention") current.abstention += 1;
    if (vote.choice === "present_not_voting") current.presentNotVoting += 1;
    byGroup.set(vote.groupId, current);
  }
  return [...byGroup.values()];
}

function resolvePartyAlignment(
  partyId?: string,
  governmentContext?: GovernmentContextData,
  groupLabel?: string
): { alignment: GovernanceAlignment; basis: AlignmentBasis } {
  if (!partyId) {
    const normalized = normalizeTextForComparison(groupLabel ?? "");
    return {
      alignment: normalized.includes("neafiliat") ? "unaffiliated" : "unknown",
      basis: normalized.includes("neafiliat") ? "manual_curation" : "unknown"
    };
  }
  const explicit = governmentContext?.alignments.find((item) => item.party.id === partyId);
  if (explicit) return { alignment: explicit.alignment, basis: explicit.basis };
  if (governmentContext?.hasCuratedCoalitionData) return { alignment: "opposition", basis: "manual_curation" };
  return { alignment: "unknown", basis: "unknown" };
}

async function loadBillSponsorContexts(db: DbClient, sponsors: BillSponsor[], date: string): Promise<BillSponsorContext[]> {
  const memberIds = uniqueStrings(sponsors.map((sponsor) => sponsor.memberId ?? ""));
  const [memberRows, membershipRows] = await Promise.all([
    memberIds.length > 0 ? db.select().from(schema.members).where(inArray(schema.members.id, memberIds)) : [],
    memberIds.length > 0
      ? db.execute<BillSponsorMembershipRow>(sql`
          select distinct on (mgm.member_id)
            mgm.member_id as member_id,
            pg.id as group_id,
            pg.party_id as group_party_id,
            pg.chamber as group_chamber,
            pg.short_name as group_short_name,
            pg.name as group_name,
            pg.color as group_color
          from member_group_memberships mgm
          join parliamentary_groups pg on pg.id = mgm.group_id
          where mgm.member_id in (${sql.join(memberIds.map((memberId) => sql`${memberId}`), sql`, `)})
            and mgm.starts_on <= ${date}::date
            and coalesce(mgm.ends_on, date '9999-12-31') >= ${date}::date
          order by mgm.member_id, mgm.starts_on desc, mgm.id desc
        `)
      : []
  ]);
  const membersById = new Map(memberRows.map((row) => [row.id, mapMember(row)]));
  const groupsByMemberId = new Map(membershipRows.map((row) => [row.member_id, mapBillSponsorGroup(row)]));
  const partyIds = uniqueStrings(membershipRows.map((row) => row.group_party_id ?? ""));
  const partyRows = partyIds.length > 0 ? await db.select().from(schema.parties).where(inArray(schema.parties.id, partyIds)) : [];
  const partiesById = new Map(partyRows.map((row) => [row.id, mapParty(row)]));

  return sponsors.map((sponsor) => {
    const group = sponsor.memberId ? groupsByMemberId.get(sponsor.memberId) : undefined;
    const party = group?.partyId ? partiesById.get(group.partyId) : undefined;
    return {
      sponsor,
      member: sponsor.memberId ? membersById.get(sponsor.memberId) : undefined,
      group,
      party,
      alignment: "unknown",
      basis: "unknown"
    };
  });
}

function mapBillSponsorGroup(row: BillSponsorMembershipRow): ParliamentaryGroup {
  return {
    id: row.group_id,
    partyId: row.group_party_id ?? undefined,
    chamber: row.group_chamber,
    shortName: row.group_short_name,
    name: row.group_name,
    color: row.group_color
  };
}

function alignmentSortWeight(alignment: GovernanceAlignment): number {
  if (alignment === "government") return 0;
  if (alignment === "governing_support") return 1;
  if (alignment === "mixed") return 2;
  if (alignment === "opposition") return 3;
  if (alignment === "unaffiliated") return 4;
  return 5;
}

function normalizeTextForComparison(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function mapMember(row: typeof schema.members.$inferSelect): Member {
  return {
    id: row.id,
    personId: row.personId ?? undefined,
    slug: row.slug,
    firstName: row.firstName,
    lastName: row.lastName,
    displayName: row.displayName,
    sourceIds: row.sourceIds
  };
}

function mapPartyLegislatureMember(row: PartyLegislatureMemberRow): Member {
  return {
    id: row.member_id,
    personId: row.member_person_id ?? undefined,
    slug: row.member_slug,
    firstName: row.member_first_name,
    lastName: row.member_last_name,
    displayName: row.member_display_name,
    sourceIds: jsonRecord(row.member_source_ids)
  };
}

function mapMemberDirectoryRow(row: MemberDirectoryRow): MemberDirectoryItem {
  return {
    member: {
      id: row.member_id,
      personId: row.member_person_id ?? undefined,
      slug: row.member_slug,
      firstName: row.member_first_name,
      lastName: row.member_last_name,
      displayName: row.member_display_name,
      sourceIds: jsonRecord(row.member_source_ids)
    },
    mandate: {
      id: row.mandate_id,
      memberId: row.mandate_member_id,
      legislatureId: row.mandate_legislature_id,
      chamber: row.mandate_chamber,
      startsOn: dateString(row.mandate_starts_on),
      endsOn: row.mandate_ends_on ? dateString(row.mandate_ends_on) : undefined,
      constituency: row.mandate_constituency ?? undefined,
      status: row.mandate_status === "active" || row.mandate_status === "ended" || row.mandate_status === "unknown" ? row.mandate_status : "unknown",
      sourceSnapshotId: row.mandate_source_snapshot_id ?? undefined
    },
    group: row.group_id
      ? {
          id: row.group_id,
          partyId: row.group_party_id ?? undefined,
          chamber: row.group_chamber!,
          shortName: row.group_short_name!,
          name: row.group_name!,
          color: row.group_color!
        }
      : undefined,
    party: row.party_id
      ? {
          id: row.party_id,
          slug: row.party_slug!,
          shortName: row.party_short_name!,
          name: row.party_name!,
          color: row.party_color!
        }
      : undefined,
    profilePhotoUrl: row.profile_photo_asset_id ? `/api/assets/${encodeURIComponent(row.profile_photo_asset_id)}` : undefined,
    voteCount: Number(row.vote_count ?? 0),
    absenceCount: Number(row.absence_count ?? 0),
    groupSwitchCount: Number(row.stat_switches ?? 0),
    serviceDays: Number(row.stat_seniority_days ?? 0)
  };
}

function mapVoteRosterMandate(row: VoteRosterRow): MemberMandate {
  return {
    id: row.mandate_id,
    memberId: row.mandate_member_id,
    legislatureId: row.mandate_legislature_id,
    chamber: row.mandate_chamber,
    startsOn: dateString(row.mandate_starts_on),
    endsOn: row.mandate_ends_on ? dateString(row.mandate_ends_on) : undefined,
    constituency: row.mandate_constituency ?? undefined,
    status: row.mandate_status === "active" || row.mandate_status === "ended" || row.mandate_status === "unknown" ? row.mandate_status : "unknown",
    sourceSnapshotId: row.mandate_source_snapshot_id ?? undefined
  };
}

function mapVoteRosterMembership(row: VoteRosterRow): MemberGroupMembership {
  return {
    id: row.membership_id!,
    memberId: row.membership_member_id!,
    groupId: row.membership_group_id!,
    startsOn: dateString(row.membership_starts_on!),
    endsOn: row.membership_ends_on ? dateString(row.membership_ends_on) : undefined,
    logoUrl: row.membership_logo_url ?? undefined,
    sourceSnapshotId: row.membership_source_snapshot_id ?? undefined
  };
}

function mapVoteRosterLegislature(row: VoteRosterRow): Legislature {
  return {
    id: row.legislature_id,
    label: row.legislature_label,
    startsOn: dateString(row.legislature_starts_on),
    endsOn: dateString(row.legislature_ends_on)
  };
}

function mapGroupVoteTotal(row: typeof schema.groupVoteTotals.$inferSelect): GroupVoteTotal {
  return {
    id: row.id,
    voteId: row.voteId,
    groupId: row.groupId,
    for: row.forCount,
    against: row.against,
    abstention: row.abstention,
    presentNotVoting: row.presentNotVoting
  };
}

function mapBillSponsor(row: typeof schema.billSponsors.$inferSelect): BillSponsor {
  const sponsorType = ["member", "government", "group", "unknown"].includes(row.sponsorType)
    ? row.sponsorType as BillSponsor["sponsorType"]
    : "unknown";
  return {
    id: row.id,
    billId: row.billId,
    sponsorType,
    memberId: row.memberId ?? undefined,
    name: row.name
  };
}

function mapIndividualVote(row: typeof schema.individualVotes.$inferSelect): IndividualVote {
  return {
    id: row.id,
    voteId: row.voteId,
    memberId: row.memberId,
    groupId: row.groupId ?? undefined,
    choice: row.choice,
    voteMethod: row.voteMethod ?? undefined
  };
}

function mapMemberMandate(row: typeof schema.memberMandates.$inferSelect): MemberMandate {
  return {
    id: row.id,
    memberId: row.memberId,
    legislatureId: row.legislatureId,
    chamber: row.chamber,
    startsOn: row.startsOn,
    endsOn: row.endsOn ?? undefined,
    constituency: row.constituency ?? undefined,
    status: row.status === "active" || row.status === "ended" || row.status === "unknown" ? row.status : "unknown",
    sourceSnapshotId: row.sourceSnapshotId ?? undefined
  };
}

function mapLegislature(row: typeof schema.legislatures.$inferSelect): Legislature {
  return {
    id: row.id,
    label: row.label,
    startsOn: row.startsOn,
    endsOn: row.endsOn
  };
}

function mapPoliticalFormationEvents(
  rows: Array<typeof schema.politicalFormationEvents.$inferSelect>,
  entityRows: Array<typeof schema.politicalFormationEventEntities.$inferSelect>
): PoliticalFormationEvent[] {
  return rows.map((row) => ({
    id: row.id,
    date: row.date,
    eventType: row.eventType,
    titleRo: row.titleRo,
    titleEn: row.titleEn,
    descriptionRo: row.descriptionRo,
    descriptionEn: row.descriptionEn,
    sourceUrl: row.sourceUrl ?? undefined,
    sourceKind: row.sourceKind,
    entities: entityRows
      .filter((entity) => entity.eventId === row.id)
      .map((entity) => ({
        eventId: entity.eventId,
        entityType: entity.entityType,
        entityId: entity.entityId,
        role: entity.role
      }))
  }));
}

function mapMemberGroupMembership(row: typeof schema.memberGroupMemberships.$inferSelect): MemberGroupMembership {
  return {
    id: row.id,
    memberId: row.memberId,
    groupId: row.groupId,
    startsOn: row.startsOn,
    endsOn: row.endsOn ?? undefined,
    logoUrl: row.logoUrl ?? undefined,
    sourceSnapshotId: row.sourceSnapshotId ?? undefined
  };
}

function mapMemberPartyAffiliation(row: typeof schema.memberPartyAffiliations.$inferSelect): MemberPartyAffiliation {
  return {
    id: row.id,
    memberId: row.memberId,
    partyId: row.partyId,
    startsOn: row.startsOn,
    endsOn: row.endsOn ?? undefined,
    logoUrl: row.logoUrl ?? undefined,
    sourceSnapshotId: row.sourceSnapshotId ?? undefined
  };
}

function mapMemberMandateRelation(row: typeof schema.memberMandateRelations.$inferSelect) {
  return {
    id: row.id,
    mandateId: row.mandateId,
    relation: "replaces" as const,
    relatedMemberId: row.relatedMemberId ?? undefined,
    relatedName: row.relatedName,
    relatedOfficialUrl: row.relatedOfficialUrl ?? undefined,
    sourceSnapshotId: row.sourceSnapshotId ?? undefined
  };
}

function mapMemberCommitteeMembership(row: typeof schema.memberCommitteeMemberships.$inferSelect): MemberCommitteeMembership {
  return {
    id: row.id,
    memberId: row.memberId,
    committeeName: row.committeeName,
    chamber: row.chamber,
    role: row.role ?? undefined,
    startsOn: row.startsOn,
    endsOn: row.endsOn ?? undefined,
    sourceSnapshotId: row.sourceSnapshotId ?? undefined
  };
}

function mapMemberRole(row: typeof schema.memberRoles.$inferSelect): MemberRole {
  return {
    id: row.id,
    memberId: row.memberId,
    title: row.title,
    chamber: row.chamber,
    startsOn: row.startsOn,
    endsOn: row.endsOn ?? undefined,
    sourceSnapshotId: row.sourceSnapshotId ?? undefined
  };
}

function mapBillEvent(row: typeof schema.billEvents.$inferSelect): BillEvent {
  return {
    id: row.id,
    billId: row.billId,
    occurredOn: row.occurredOn,
    chamber:
      row.chamber === "senate" || row.chamber === "deputies" || row.chamber === "joint" || row.chamber === "unknown"
        ? row.chamber
        : "unknown",
    label: row.label,
    sourceUrl: row.sourceUrl ?? undefined
  };
}

function mapBillProcedureStep(row: typeof schema.billProcedureSteps.$inferSelect): BillProcedureStep {
  return {
    id: row.id,
    billId: row.billId,
    occurredOn: row.occurredOn,
    chamber:
      row.chamber === "senate" || row.chamber === "deputies" || row.chamber === "joint" || row.chamber === "unknown"
        ? row.chamber
        : "unknown",
    stepType: row.stepType,
    title: row.title,
    description: row.description ?? undefined,
    committeeName: row.committeeName ?? undefined,
    documentId: row.documentId ?? undefined,
    sourceUrl: row.sourceUrl ?? undefined,
    displayOrder: row.displayOrder
  };
}

function mapDocument(row: typeof schema.documents.$inferSelect): DocumentSource {
  return {
    id: row.id,
    billId: row.billId,
    label: row.label,
    url: row.url,
    documentKind: row.documentKind,
    sourceChamber: row.sourceChamber ?? undefined,
    officialUrlHash: row.officialUrlHash ?? undefined,
    textAssetId: row.textAssetId ?? undefined,
    textStatus: row.textStatus,
    textPreview: row.textPreview ?? undefined,
    lastTextAttemptAt: row.lastTextAttemptAt?.toISOString()
  };
}

async function getMemberVotesForLegislature(
  db: DbClient,
  memberIds: string[],
  legislatureId: string
): Promise<{ individualVotes: IndividualVote[]; voteRecords: Vote[] }> {
  if (memberIds.length === 0) return { individualVotes: [], voteRecords: [] };
  const rows = await db.execute<MemberVoteRow>(sql`
    select
      iv.id as individual_vote_id,
      iv.vote_id as individual_vote_vote_id,
      iv.member_id as individual_vote_member_id,
      iv.group_id as individual_vote_group_id,
      iv.choice as individual_vote_choice,
      iv.vote_method as individual_vote_method,
      v.id as vote_id,
      v.bill_id as vote_bill_id,
      v.chamber as vote_chamber,
      v.title as vote_title,
      v.held_on as vote_held_on,
      v.vote_type as vote_type,
      v.motion_kind as vote_motion_kind,
      v.prominence as vote_prominence,
      v.classification_confidence as vote_classification_confidence,
      v.yes_meaning as vote_yes_meaning,
      v.present as vote_present,
      v.for_count as vote_for_count,
      v.against as vote_against,
      v.abstention as vote_abstention,
      v.present_not_voting as vote_present_not_voting,
      v.absent as vote_absent,
      v.source_snapshot_id as vote_source_snapshot_id
    from individual_votes iv
    join votes v on v.id = iv.vote_id
    join legislatures l on l.id = ${legislatureId}
    where iv.member_id in (${sql.join(memberIds.map((memberId) => sql`${memberId}`), sql`, `)})
      and v.held_on >= l.starts_on
      and v.held_on < l.ends_on
    order by v.held_on desc, v.id desc
    limit 100
  `);
  const voteById = new Map<string, Vote>();
  const individualVotes = rows.map((row) => {
    const vote = voteFromMemberVoteRow(row);
    voteById.set(vote.id, vote);
    return {
      id: row.individual_vote_id,
      voteId: row.individual_vote_vote_id,
      memberId: row.individual_vote_member_id,
      groupId: row.individual_vote_group_id ?? undefined,
      choice: row.individual_vote_choice,
      voteMethod: row.individual_vote_method ?? undefined
    };
  });
  return { individualVotes, voteRecords: [...voteById.values()] };
}

async function getMemberSponsoredBillsForLegislature(
  db: DbClient,
  memberIds: string[],
  legislatureId: string
): Promise<Bill[]> {
  if (memberIds.length === 0) return [];
  const rows = await db.execute<MemberBillRow>(sql`
    select distinct
      b.id,
      b.slug,
      b.title,
      b.identifiers,
      b.chamber_of_origin,
      b.status,
      b.source_snapshot_ids,
      coalesce(min(be.occurred_on), date '0001-01-01') as sort_date
    from bill_sponsors bs
    join bills b on b.id = bs.bill_id
    left join bill_events be on be.bill_id = b.id
    join legislatures l on l.id = ${legislatureId}
    where bs.member_id in (${sql.join(memberIds.map((memberId) => sql`${memberId}`), sql`, `)})
      and exists (
        select 1
        from bill_events be2
        where be2.bill_id = b.id
          and be2.occurred_on >= l.starts_on
          and be2.occurred_on < l.ends_on
      )
    group by b.id, b.slug, b.title, b.identifiers, b.chamber_of_origin, b.status, b.source_snapshot_ids
    order by sort_date desc, b.id desc
    limit 100
  `);
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    identifiers: jsonRecord(row.identifiers),
    chamberOfOrigin: row.chamber_of_origin === "senate" || row.chamber_of_origin === "deputies" ? row.chamber_of_origin : "unknown",
    status: row.status,
    sourceSnapshotIds: jsonStringArray(row.source_snapshot_ids)
  }));
}

async function getMemberLegislatureActivity(
  db: DbClient,
  memberIds: string[],
  legislatureId: string
): Promise<MemberLegislatureActivityData | undefined> {
  if (memberIds.length === 0) return undefined;
  try {
    const rows = await db.execute<MemberActivityRow>(sql`
      select
        sum(vote_records)::int as vote_records,
        sum(major_vote_records)::int as major_vote_records,
        sum(standard_vote_records)::int as standard_vote_records,
        sum(routine_vote_records)::int as routine_vote_records,
        sum(unclassified_vote_records)::int as unclassified_vote_records,
        sum(votes_for)::int as votes_for,
        sum(votes_against)::int as votes_against,
        sum(abstentions)::int as abstentions,
        sum(present_not_voting)::int as present_not_voting,
        sum(absent)::int as absent,
        sum(unknown)::int as unknown,
        sum(proposals)::int as proposals,
        sum(committees)::int as committees,
        sum(roles)::int as roles,
        min(first_activity_on) as first_activity_on,
        max(last_activity_on) as last_activity_on
      from member_legislature_activity
      where member_id in (${sql.join(memberIds.map((memberId) => sql`${memberId}`), sql`, `)})
        and legislature_id = ${legislatureId}
    `);
    const row = rows[0];
    if (!row) return undefined;
    return {
      voteRecords: Number(row.vote_records ?? 0),
      majorVoteRecords: Number(row.major_vote_records ?? 0),
      standardVoteRecords: Number(row.standard_vote_records ?? 0),
      routineVoteRecords: Number(row.routine_vote_records ?? 0),
      unclassifiedVoteRecords: Number(row.unclassified_vote_records ?? 0),
      votesFor: Number(row.votes_for ?? 0),
      votesAgainst: Number(row.votes_against ?? 0),
      abstentions: Number(row.abstentions ?? 0),
      presentNotVoting: Number(row.present_not_voting ?? 0),
      absent: Number(row.absent ?? 0),
      unknown: Number(row.unknown ?? 0),
      proposals: Number(row.proposals ?? 0),
      committees: Number(row.committees ?? 0),
      roles: Number(row.roles ?? 0),
      firstActivityOn: row.first_activity_on ? dateString(row.first_activity_on) : undefined,
      lastActivityOn: row.last_activity_on ? dateString(row.last_activity_on) : undefined
    };
  } catch {
    return undefined;
  }
}

async function getVoteCoverage(db: DbClient, voteIds: string[]): Promise<Record<string, VoteCoverageData>> {
  if (voteIds.length === 0) return {};
  try {
    const rows = await db.execute<VoteCoverageRow>(sql`
      select vote_id, coverage_level, nominal_votes, group_totals, source_status
      from vote_coverage_summaries
      where vote_id in (${sql.join(voteIds.map((voteId) => sql`${voteId}`), sql`, `)})
    `);
    return Object.fromEntries(
      rows.map((row) => [
        row.vote_id,
        {
          coverageLevel: row.coverage_level,
          nominalVotes: Number(row.nominal_votes),
          groupTotals: Number(row.group_totals),
          sourceStatus: row.source_status
        }
      ])
    );
  } catch {
    return {};
  }
}

function activityFromRows(votes: IndividualVote[], proposals: number, history: MemberHistoryRow[]): MemberLegislatureActivityData {
  return {
    voteRecords: votes.length,
    majorVoteRecords: 0,
    standardVoteRecords: 0,
    routineVoteRecords: 0,
    unclassifiedVoteRecords: votes.length,
    votesFor: votes.filter((vote) => vote.choice === "for").length,
    votesAgainst: votes.filter((vote) => vote.choice === "against").length,
    abstentions: votes.filter((vote) => vote.choice === "abstention").length,
    presentNotVoting: votes.filter((vote) => vote.choice === "present_not_voting").length,
    absent: votes.filter((vote) => vote.choice === "absent").length,
    unknown: votes.filter((vote) => vote.choice === "unknown").length,
    proposals,
    committees: history.filter((row) => row.type === "committee").length,
    roles: history.filter((row) => row.type === "role").length
  };
}

function voteFromMemberVoteRow(row: MemberVoteRow): Vote {
  return {
    id: row.vote_id,
    billId: row.vote_bill_id ?? undefined,
    chamber: row.vote_chamber,
    title: row.vote_title,
    heldOn: dateString(row.vote_held_on),
    voteType: row.vote_type,
    motionKind: row.vote_motion_kind,
    prominence: row.vote_prominence,
    classificationConfidence: row.vote_classification_confidence,
    yesMeaning: row.vote_yes_meaning,
    totals: {
      present: Number(row.vote_present),
      for: Number(row.vote_for_count),
      against: Number(row.vote_against),
      abstention: Number(row.vote_abstention),
      presentNotVoting: Number(row.vote_present_not_voting),
      absent: row.vote_absent === null || row.vote_absent === undefined ? undefined : Number(row.vote_absent)
    },
    sourceSnapshotId: row.vote_source_snapshot_id
  };
}

function dateString(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function jsonRecord(value: unknown): Record<string, string> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, string>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, string> : {};
    } catch {
      return {};
    }
  }
  return {};
}

function jsonStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
    } catch {
      return [];
    }
  }
  return [];
}

function directoryBillItem(input: {
  bill: Bill;
  events: BillEvent[];
  votes: Vote[];
  sources: SourceSnapshot[];
}): BillDirectoryItem {
  const sortedEvents = [...input.events].sort((a, b) => a.occurredOn.localeCompare(b.occurredOn));
  const submittedOn = sortedEvents[0]?.occurredOn;
  const latestEventOn = sortedEvents.at(-1)?.occurredOn;
  const sourceId = input.bill.sourceSnapshotIds[0];

  return {
    bill: input.bill,
    submittedOn,
    latestEventOn,
    source: input.sources.find((source) => source.id === sourceId),
    voteCount: input.votes.length
  };
}

export function buildVoteSeatRows(input: {
  vote: Vote;
  members?: Member[];
  individualVotes: IndividualVote[];
  mandates: MemberMandate[];
  memberships: MemberGroupMembership[];
  legislatures: Legislature[];
}): IndividualVote[] {
  // Known person links reconcile multiple imported member identities; never merge by name.
  const representativeByPerson = new Map<string, string>();
  const canonicalIds = new Map<string, string>();
  const nominalMemberIds = new Set(input.individualVotes.map((row) => row.memberId));
  const orderedMembers = [...(input.members ?? [])].sort((a, b) => Number(nominalMemberIds.has(b.id)) - Number(nominalMemberIds.has(a.id)) || a.id.localeCompare(b.id));
  for (const member of orderedMembers) {
    if (member.personId) {
      if (!representativeByPerson.has(member.personId)) representativeByPerson.set(member.personId, member.id);
      canonicalIds.set(member.id, representativeByPerson.get(member.personId)!);
    }
  }
  const canonical = (id: string) => canonicalIds.get(id) ?? id;
  input = { ...input,
    individualVotes: input.individualVotes.map((row) => ({ ...row, memberId: canonical(row.memberId) })),
    mandates: input.mandates.map((row) => ({ ...row, memberId: canonical(row.memberId) })),
    memberships: input.memberships.map((row) => ({ ...row, memberId: canonical(row.memberId) }))
  };
  const votedByMember = new Map(uniqueNominalVotes(input.individualVotes).map((vote) => [vote.memberId, vote]));
  const legislatureById = new Map(input.legislatures.map((legislature) => [legislature.id, legislature]));
  const chamberMemberIds = new Set(
    input.mandates
      .filter(
        (mandate) =>
          mandate.chamber === input.vote.chamber &&
          activeMandateOnDate(mandate, legislatureById.get(mandate.legislatureId), input.vote.heldOn)
      )
      .map((mandate) => mandate.memberId)
  );

  for (const vote of input.individualVotes) {
    chamberMemberIds.add(vote.memberId);
  }

  const currentMembershipByMember = new Map<string, MemberGroupMembership | undefined>();
  for (const memberId of chamberMemberIds) {
    currentMembershipByMember.set(
      memberId,
      latestMembershipOn(input.memberships.filter((membership) => membership.memberId === memberId), input.vote.heldOn)
    );
  }

  const orderedMemberIds = [...chamberMemberIds]
    .sort((a, b) => {
      const groupA = votedByMember.get(a)?.groupId ?? currentMembershipByMember.get(a)?.groupId ?? "";
      const groupB = votedByMember.get(b)?.groupId ?? currentMembershipByMember.get(b)?.groupId ?? "";
      return groupA.localeCompare(groupB, "ro") || a.localeCompare(b, "ro");
    });
  // Preserve roster conflicts for reconciliation; never arbitrarily trim people to capacity.
  const visibleMemberIds = orderedMemberIds;

  return visibleMemberIds.map((memberId) => {
      const existing = votedByMember.get(memberId);
      const membership = currentMembershipByMember.get(memberId);
      if (existing) {
        return {
          ...existing,
          groupId: existing.groupId ?? membership?.groupId
        };
      }
      return {
        id: `${input.vote.id}-${memberId}-unknown`,
        voteId: input.vote.id,
        memberId,
        groupId: membership?.groupId,
        choice: "unknown"
      };
    });
}

function latestMembership(memberships: MemberGroupMembership[]): MemberGroupMembership | undefined {
  return [...memberships]
    .sort((a, b) => {
      if (!a.endsOn && b.endsOn) return -1;
      if (a.endsOn && !b.endsOn) return 1;
      return b.startsOn.localeCompare(a.startsOn);
    })
    .at(0);
}

function latestMembershipOn(memberships: MemberGroupMembership[], date: string): MemberGroupMembership | undefined {
  const active = memberships.filter((membership) => activeOnDate(membership.startsOn, membership.endsOn, date));
  return [...(active.length > 0 ? active : [])].sort((a, b) => b.startsOn.localeCompare(a.startsOn)).at(0);
}

function latestMembershipDuring(memberships: MemberGroupMembership[], startsOn: string, endsOn: string | undefined): MemberGroupMembership | undefined {
  const active = memberships.filter((membership) => {
    const membershipEndsOn = membership.endsOn ?? "9999-12-31";
    const periodEndsOn = endsOn ?? "9999-12-31";
    return membership.startsOn <= periodEndsOn && membershipEndsOn >= startsOn;
  });
  return [...active].sort((a, b) => b.startsOn.localeCompare(a.startsOn)).at(0);
}

function activeMandateOnDate(mandate: MemberMandate, legislature: Legislature | undefined, date: string): boolean {
  return activeOnDate(mandate.startsOn, earliestDate(mandate.endsOn, legislature?.endsOn), date);
}

function activeOnDate(startsOn: string, endsOn: string | undefined | null, date: string): boolean {
  return startsOn <= date && (!endsOn || endsOn >= date);
}

function earliestDate(...dates: Array<string | undefined | null>): string | undefined {
  return dates.filter((date): date is string => Boolean(date)).sort()[0];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function uniqueBy<T>(values: T[], key: (value: T) => string): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const itemKey = key(value);
    if (seen.has(itemKey)) return false;
    seen.add(itemKey);
    return true;
  });
}

function latestMandate(mandates: MemberMandate[]): MemberMandate | undefined {
  return [...mandates]
    .sort((a, b) => {
      if (!a.endsOn && b.endsOn) return -1;
      if (a.endsOn && !b.endsOn) return 1;
      return b.startsOn.localeCompare(a.startsOn);
    })
    .at(0);
}

function filterDirectoryItems(
  items: MemberDirectoryItem[],
  filters?: MemberDirectoryFilters
): MemberDirectoryItem[] {
  const query = normalizeSearch(filters?.q);
  const groupFilters = parseGroupFilters(filters?.group);
  return items
    .filter((item) => !filters?.chamber || item.mandate?.chamber === filters.chamber)
    .filter((item) => !filters?.legislature || item.mandate?.legislatureId === filters.legislature)
    .filter((item) => groupFilters.length === 0 || groupFilters.some((groupFilter) => matchesMemberGroupFilter(item, groupFilter)))
    .filter((item) => {
      if (!query) return true;
      return [item.member.displayName, item.member.firstName, item.member.lastName, item.group?.shortName, item.party?.shortName]
        .map(normalizeSearch)
        .some((value) => value.includes(query));
    })
    .sort((a, b) => {
      if (filters?.sort === "votes") return (b.voteCount ?? 0) - (a.voteCount ?? 0) || a.member.displayName.localeCompare(b.member.displayName, "ro");
      if (filters?.sort === "absent") return (b.absenceCount ?? 0) - (a.absenceCount ?? 0) || a.member.displayName.localeCompare(b.member.displayName, "ro");
      return a.member.displayName.localeCompare(b.member.displayName, "ro");
    });
}

function memberDirectoryConditions(filters?: MemberDirectoryFilters) {
  const conditions = [];
  if (filters?.chamber === "senate" || filters?.chamber === "deputies") {
    conditions.push(sql`mm.chamber = ${filters.chamber}`);
  }
  if (filters?.legislature) {
    conditions.push(sql`mm.legislature_id = ${filters.legislature}`);
  }
  if (filters?.q?.trim()) {
    const pattern = `%${normalizeSearch(filters.q)}%`;
    conditions.push(sql`(
      ${normalizedSql(sql`m.display_name || ' ' || m.slug || ' ' || coalesce(pg.short_name, '') || ' ' || coalesce(p.short_name, '')`)} like ${pattern}
      or exists (
        select 1
        from entity_search_index esi
        where esi.entity_type = 'member'
          and esi.entity_id = m.id
          and esi.search_text like ${pattern}
      )
    )`);
  }
  const groupFilters = parseGroupFilters(filters?.group);
  if (groupFilters.length > 0) {
    conditions.push(sql`(${sql.join(groupFilters.map(memberGroupCondition), sql` or `)})`);
  }
  return conditions;
}

function memberDirectoryOrderSql(sort?: string) {
  if (sort === "votes") {
    return sql`vote_count desc, member_display_name asc, member_id asc`;
  }
  if (sort === "absent") {
    return sql`absence_count desc, member_display_name asc, member_id asc`;
  }
  if (sort === "seniority") {
    return sql`stat_seniority_days desc, member_display_name asc, member_id asc`;
  }
  if (sort === "switches") {
    return sql`stat_switches desc, member_display_name asc, member_id asc`;
  }
  return sql`member_display_name asc, member_id asc`;
}

function memberDirectoryStatsSql(sort?: string) {
  if (sort === "switches") {
    return {
      ctes: sql`
        switch_stats as (
          select
            coalesce(mgm2m.person_id, mgm2m.id) as person_key,
            greatest(count(distinct mgm2.group_id) - 1, 0)::int as stat_switches
          from member_group_memberships mgm2
          join members mgm2m on mgm2m.id = mgm2.member_id
          group by coalesce(mgm2m.person_id, mgm2m.id)
        ),
      `,
      joins: sql`left join switch_stats sst on sst.person_key = coalesce(m.person_id, m.id)`,
      select: sql`
        coalesce(sst.stat_switches, 0) as stat_switches,
        0 as stat_seniority_days,
      `
    };
  }
  if (sort === "seniority") {
    return {
      ctes: sql`
        seniority_stats as (
          select
            coalesce(mm2m.person_id, mm2m.id) as person_key,
            coalesce(sum(
              greatest(
                least(
                  coalesce(mm2.ends_on, current_date),
                  coalesce(l2.ends_on, current_date),
                  current_date
                )::date - mm2.starts_on::date,
                0
              )
            )::int, 0) as stat_seniority_days
          from member_mandates mm2
          join members mm2m on mm2m.id = mm2.member_id
          left join legislatures l2 on l2.id = mm2.legislature_id
          group by coalesce(mm2m.person_id, mm2m.id)
        ),
      `,
      joins: sql`left join seniority_stats snt on snt.person_key = coalesce(m.person_id, m.id)`,
      select: sql`
        0 as stat_switches,
        coalesce(snt.stat_seniority_days, 0) as stat_seniority_days,
      `
    };
  }
  return {
    ctes: sql``,
    joins: sql``,
    select: sql`
      0 as stat_switches,
      0 as stat_seniority_days,
    `
  };
}

function memberDirectoryGroupsSql(filters?: { chamber?: string; legislature?: string }) {
  const conditions = [];
  if (filters?.chamber === "senate" || filters?.chamber === "deputies") {
    conditions.push(sql`pg.chamber = ${filters.chamber}`);
  }
  if (filters?.legislature) {
    conditions.push(sql`exists (
      select 1
      from member_group_memberships mgm
      join member_mandates mm on mm.member_id = mgm.member_id and mm.chamber = pg.chamber
      where mgm.group_id = pg.id
        and mm.legislature_id = ${filters.legislature}
        and mgm.starts_on <= coalesce(mm.ends_on, date '9999-12-31')
        and coalesce(mgm.ends_on, date '9999-12-31') >= mm.starts_on
    )`);
  }
  const where = conditions.length ? sql`where ${sql.join(conditions, sql` and `)}` : sql``;
  return sql`
    select distinct
      pg.id,
      pg.party_id as "partyId",
      pg.chamber,
      pg.short_name as "shortName",
      pg.name,
      pg.color
    from parliamentary_groups pg
    ${where}
    order by pg.chamber, pg.short_name
  `;
}

function memberGroupCondition(groupFilter: string) {
  if (groupFilter.startsWith("group-name:")) {
    const key = groupFilter.replace(/^group-name:/, "");
    return sql`${normalizedGroupSql(sql`coalesce(p.short_name, pg.short_name)`)} = ${key}`;
  }
  return sql`(pg.id = ${groupFilter} or p.id = ${groupFilter})`;
}

function parseGroupFilters(value?: string): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizedSql(value: ReturnType<typeof sql>) {
  return sql`lower(translate(${value}, 'ăâîșşțţĂÂÎȘŞȚŢ', 'aaissttAAISSTT'))`;
}

function normalizedGroupSql(value: ReturnType<typeof sql>) {
  return sql`regexp_replace(${normalizedSql(value)}, '[^a-z0-9]', '', 'g')`;
}

function matchesMemberGroupFilter(item: MemberDirectoryItem, groupFilter: string): boolean {
  if (item.group?.id === groupFilter) return true;
  if (item.party?.id === groupFilter) return true;
  return groupFilter.startsWith("group-name:")
    ? normalizeGroupFilterKey(item.group?.shortName) === groupFilter.replace(/^group-name:/, "")
    : false;
}

function normalizeGroupFilterKey(value?: string): string {
  return normalizeSearch(value).replace(/[^a-z0-9]/g, "");
}

function filterMemberDirectoryGroups(
  groups: ParliamentaryGroup[],
  mandates: MemberMandate[],
  memberships: MemberGroupMembership[],
  legislatures: Legislature[],
  filters?: { chamber?: string; legislature?: string }
): ParliamentaryGroup[] {
  const chamber = filters?.chamber === "senate" || filters?.chamber === "deputies" ? filters.chamber : undefined;
  const legislature = filters?.legislature ? legislatures.find((item) => item.id === filters.legislature) : undefined;
  if (!chamber && !legislature) return groups;

  return groups
    .filter((group) => !chamber || group.chamber === chamber)
    .filter((group) => {
      if (!legislature) return true;
      return memberships.some((membership) => {
        if (membership.groupId !== group.id) return false;
        return mandates.some(
          (mandate) =>
            mandate.memberId === membership.memberId &&
            mandate.legislatureId === legislature.id &&
            mandate.chamber === group.chamber &&
            membership.startsOn <= earliestDate(mandate.endsOn, legislature.endsOn)! &&
            (membership.endsOn ?? "9999-12-31") >= mandate.startsOn
        );
      });
    });
}

function normalizeSearch(value?: string): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function storedAssetUrl(
  assets: Array<typeof schema.storedAssets.$inferSelect>,
  assetType: "photo" | "party_logo" | "cv",
  memberId: string,
  legislatureId?: string,
  chamber?: string
): string | undefined {
  const candidates = assets.filter((asset) => asset.assetType === assetType && asset.entityId === memberId && storedAssetPublicUrl(asset));
  return (
    storedAssetPublicUrl(candidates.find((asset) => asset.legislatureId === legislatureId && asset.chamber === chamber)) ??
    storedAssetPublicUrl(candidates.find((asset) => asset.legislatureId === legislatureId)) ??
    storedAssetPublicUrl(candidates[0]) ??
    undefined
  );
}

function storedAssetUrlByOfficialUrl(
  assets: Array<typeof schema.storedAssets.$inferSelect>,
  officialUrl?: string
): string | undefined {
  if (!officialUrl) return undefined;
  return storedAssetPublicUrl(assets.find((asset) => asset.officialUrl === officialUrl));
}

function storedAssetPublicUrl(asset?: typeof schema.storedAssets.$inferSelect): string | undefined {
  if (!asset || asset.fetchStatus !== "stored") return undefined;
  if (asset.storageProvider === "digi_storage" && asset.storagePath) return `/api/assets/${encodeURIComponent(asset.id)}`;
  if (asset.storageProvider === "vercel_blob" && asset.blobUrl) return asset.blobUrl;
  if (asset.publicUrl) return asset.publicUrl;
  if (asset.blobUrl) return asset.blobUrl;
  return undefined;
}

function resolveHistoryAssetUrls(
  history: MemberHistoryRow[],
  assets: Array<typeof schema.storedAssets.$inferSelect>
): MemberHistoryRow[] {
  return history.map((row) => ({
    ...row,
    logoUrl: storedAssetUrlByOfficialUrl(assets, row.logoUrl)
  }));
}

function firstSourceId(members: Member[], key: string): string | undefined {
  return members.map((member) => member.sourceIds[key]).find(Boolean);
}

function buildMemberCareerSegments(
  history: MemberHistoryRow[],
  groups: ParliamentaryGroup[],
  parties: Party[],
  formationEvents: PoliticalFormationEvent[],
  governments: Government[] = [],
  governmentAlignments: GovernmentPartyAlignmentForCareer[] = []
): MemberCareerSegment[] {
  const groupByLabel = new Map(groups.map((group) => [group.shortName, group]));
  const partyByLabel = new Map(parties.map((party) => [party.shortName, party]));
  const partyById = new Map(parties.map((party) => [party.id, party]));
  const partyIdByLabel = new Map(parties.map((party) => [party.shortName, party.id]));
  const partyRows = history.filter((row) => row.type === "party");
  const groupFallbackRows = history.filter((row) => row.type === "group" && !partyRows.some((partyRow) =>
    partyRow.chamber === row.chamber && rangesOverlap(partyRow.startsOn, partyRow.endsOn, row.startsOn, row.endsOn)
  ));
  const rows = [...partyRows, ...groupFallbackRows]
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn) || a.label.localeCompare(b.label));
  const segments: MemberCareerSegment[] = [];
  for (const row of normalizeCareerRows(rows, partyIdByLabel, formationEvents)) {
    const previous = segments.at(-1);
    if (
      previous &&
      previous.label === row.label &&
      previous.chamber === row.chamber &&
      previous.legislatureId === row.legislatureId &&
      datesTouch(previous.endsOn, row.startsOn)
    ) {
      previous.endsOn = row.endsOn;
      previous.events = [...(previous.events ?? []), ...careerEventsForRow(row, partyIdByLabel, formationEvents)];
      continue;
    }
    const group = groupByLabel.get(row.label);
    const party = partyByLabel.get(row.label);
    const groupParty = group?.partyId ? partyById.get(group.partyId) : undefined;
    segments.push({
      id: `career-${row.id}`,
      startsOn: row.startsOn,
      endsOn: row.endsOn,
      legislatureId: row.legislatureId,
      chamber: row.chamber,
      label: row.label,
      details: row.details,
      logoUrl: row.logoUrl,
      partySlug: row.partySlug ?? party?.slug ?? groupParty?.slug,
      sourceUrl: row.sourceUrl,
      color: group?.color ?? party?.color,
      events: careerEventsForRow(row, partyIdByLabel, formationEvents),
      governance: governanceForCareerRow(row, partyIdByLabel, governments, governmentAlignments)
    });
  }
  return dedupeCareerSegments(segments);
}

function buildMemberHistory(input: {
  mandates: MemberMandate[];
  mandateRelations: MemberMandateRelation[];
  groupMemberships: MemberGroupMembership[];
  partyAffiliations: MemberPartyAffiliation[];
  committees: MemberCommitteeMembership[];
  roles: MemberRole[];
  groups: ParliamentaryGroup[];
  parties: Party[];
  legislatures: Legislature[];
  formationEvents?: PoliticalFormationEvent[];
  votes: IndividualVote[];
  sourceUrls?: Map<string, string>;
}): MemberHistoryRow[] {
  const votesFor = input.votes.filter((vote) => vote.choice === "for").length;
  const votesAgainst = input.votes.filter((vote) => vote.choice === "against").length;
  const abstentions = input.votes.filter((vote) => vote.choice === "abstention").length;
  const counts = { votesFor, votesAgainst, abstentions, proposals: 0 };

  const rows: MemberHistoryRow[] = [
    ...input.mandates.map((mandate) => {
      const legislature = input.legislatures.find((item) => item.id === mandate.legislatureId);
      return {
        id: `history-${mandate.id}`,
        startsOn: mandate.startsOn,
        endsOn: displayEndsOn(mandate.endsOn, mandate, legislature),
        legislatureId: mandate.legislatureId,
        chamber: mandate.chamber,
        type: "mandate" as const,
        label: "Mandat parlamentar",
        details: cleanHistoryDetail(mandate.constituency) ?? mandate.status,
        sourceUrl: mandate.sourceSnapshotId ? input.sourceUrls?.get(mandate.sourceSnapshotId) : undefined,
        ...counts
      };
    }),
    ...input.mandateRelations.flatMap((relation) => {
      const mandate = input.mandates.find((item) => item.id === relation.mandateId);
      if (!mandate) return [];
      return [
        {
          id: `history-${relation.id}`,
          startsOn: mandate.startsOn,
          endsOn: mandate.endsOn,
          legislatureId: mandate.legislatureId,
          chamber: mandate.chamber,
          type: "relation" as const,
          label: "Înlocuire mandat",
          details: `Înlocuiește pe ${relation.relatedName}`,
          sourceUrl: relation.relatedOfficialUrl ?? (relation.sourceSnapshotId ? input.sourceUrls?.get(relation.sourceSnapshotId) : undefined),
          ...counts
        }
      ];
    }),
    ...input.groupMemberships.map((membership) => {
      const group = input.groups.find((item) => item.id === membership.groupId);
      const party = group?.partyId ? input.parties.find((item) => item.id === group.partyId) : undefined;
      const mandate = mandateForMemberPeriod(input.mandates, membership.memberId, membership.startsOn);
      const legislature = input.legislatures.find((item) => item.id === mandate?.legislatureId);
      return {
        id: `history-${membership.id}`,
        startsOn: membership.startsOn,
        endsOn: displayEndsOn(membership.endsOn, mandate, legislature),
        legislatureId: mandate?.legislatureId,
        chamber: mandate?.chamber ?? group?.chamber ?? "senate",
        type: "group" as const,
        label: group?.shortName ?? membership.groupId,
        details: group?.name ?? "Grup parlamentar",
        logoUrl: membership.logoUrl,
        partySlug: party?.slug,
        sourceUrl: membership.sourceSnapshotId ? input.sourceUrls?.get(membership.sourceSnapshotId) : undefined,
        ...counts
      };
    }),
    ...input.partyAffiliations.map((affiliation) => {
      const party = input.parties.find((item) => item.id === affiliation.partyId);
      const mandate = mandateForMemberPeriod(input.mandates, affiliation.memberId, affiliation.startsOn);
      const legislature = input.legislatures.find((item) => item.id === mandate?.legislatureId);
      return {
        id: `history-${affiliation.id}`,
        startsOn: affiliation.startsOn,
        endsOn: displayEndsOn(affiliation.endsOn, mandate, legislature),
        legislatureId: mandate?.legislatureId,
        chamber: mandate?.chamber ?? chamberForMemberPeriod(input.mandates, affiliation.memberId, affiliation.startsOn),
        type: "party" as const,
        label: party?.shortName ?? affiliation.partyId,
        details: party?.name ?? "Formațiune politică",
        logoUrl: affiliation.logoUrl,
        partySlug: party?.slug,
        sourceUrl: affiliation.sourceSnapshotId ? input.sourceUrls?.get(affiliation.sourceSnapshotId) : undefined,
        ...counts
      };
    }),
    ...input.committees.map((committee) => {
      const mandate = mandateForMemberPeriod(input.mandates, committee.memberId, committee.startsOn);
      const legislature = input.legislatures.find((item) => item.id === mandate?.legislatureId);
      return {
        id: `history-${committee.id}`,
        startsOn: committee.startsOn,
        endsOn: displayEndsOn(committee.endsOn, mandate, legislature),
        legislatureId: mandate?.legislatureId,
        chamber: committee.chamber,
        type: "committee" as const,
        label: committee.committeeName,
        details: committee.role ?? "Membru",
        sourceUrl: committee.sourceSnapshotId ? input.sourceUrls?.get(committee.sourceSnapshotId) : undefined,
        ...counts
      };
    }),
    ...input.roles.map((role) => {
      const mandate = mandateForMemberPeriod(input.mandates, role.memberId, role.startsOn);
      const legislature = input.legislatures.find((item) => item.id === mandate?.legislatureId);
      return {
        id: `history-${role.id}`,
        startsOn: role.startsOn,
        endsOn: displayEndsOn(role.endsOn, mandate, legislature),
        legislatureId: mandate?.legislatureId,
        chamber: role.chamber,
        type: "role" as const,
        label: role.title,
        details: "Rol parlamentar",
        sourceUrl: role.sourceSnapshotId ? input.sourceUrls?.get(role.sourceSnapshotId) : undefined,
        ...counts
      };
    })
  ];

  return normalizeHistoryDisplayRows(rows, input.parties, input.formationEvents ?? [])
    .sort((a, b) => b.startsOn.localeCompare(a.startsOn));
}

function normalizeCareerRows(
  rows: MemberHistoryRow[],
  partyIdByLabel: Map<string, string>,
  formationEvents: PoliticalFormationEvent[]
): MemberHistoryRow[] {
  const mergerEvents = formationEvents.filter((event) =>
    event.eventType === "party_merged" || event.eventType === "party_absorbed"
  );
  const normalized = rows.map((row) => ({ ...row }));

  for (const event of mergerEvents) {
    const absorbed = event.entities.find((entity) => entity.role === "absorbed" && entity.entityType === "party")?.entityId;
    const absorber = event.entities.find((entity) => entity.role === "absorber" && entity.entityType === "party")?.entityId;
    if (!absorbed || !absorber) continue;

    const absorbedLabels = labelsForPartyId(partyIdByLabel, absorbed);
    const absorberLabels = labelsForPartyId(partyIdByLabel, absorber);
    for (const row of normalized) {
      if (!absorbedLabels.includes(row.label) && !absorberLabels.includes(row.label)) continue;
      const hasOverlappingAbsorbedRow = normalized.some(
        (candidate) =>
          candidate !== row &&
          absorbedLabels.includes(candidate.label) &&
          candidate.legislatureId === row.legislatureId &&
          rangesOverlap(candidate.startsOn, candidate.endsOn, row.startsOn, row.endsOn)
      );
      if (absorbedLabels.includes(row.label) && row.startsOn < event.date && (!row.endsOn || row.endsOn >= event.date)) {
        row.endsOn = previousDay(event.date);
      }
      if (absorberLabels.includes(row.label) && hasOverlappingAbsorbedRow && row.startsOn < event.date && (!row.endsOn || row.endsOn >= event.date)) {
        row.startsOn = event.date;
      }
    }
  }

  const unique = new Map<string, MemberHistoryRow>();
  for (const row of normalized) {
    if (row.endsOn && row.startsOn > row.endsOn) continue;
    const key = [row.type, row.label, row.startsOn, row.endsOn ?? "", row.legislatureId ?? "", row.chamber].join("|");
    if (!unique.has(key)) unique.set(key, row);
  }
  return [...unique.values()].sort((a, b) => a.startsOn.localeCompare(b.startsOn) || a.label.localeCompare(b.label));
}

function normalizeHistoryDisplayRows(
  rows: MemberHistoryRow[],
  parties: Party[],
  formationEvents: PoliticalFormationEvent[]
): MemberHistoryRow[] {
  if (formationEvents.length === 0) return rows;
  const partyIdByLabel = new Map(parties.map((party) => [party.shortName, party.id]));
  const temporalRows = rows.filter((row) => row.type === "party" || row.type === "group");
  const stableRows = rows.filter((row) => row.type !== "party" && row.type !== "group");
  return [
    ...stableRows,
    ...normalizeCareerRows(temporalRows, partyIdByLabel, formationEvents)
  ];
}

function careerEventsForRow(
  row: MemberHistoryRow,
  partyIdByLabel: Map<string, string>,
  formationEvents: PoliticalFormationEvent[]
): NonNullable<MemberCareerSegment["events"]> {
  const partyId = partyIdByLabel.get(row.label);
  if (!partyId) return [];
  return formationEvents
    .filter((event) => event.entities.some((entity) => entity.entityType === "party" && entity.entityId === partyId))
    .filter((event) => dateTouchesRange(event.date, row.startsOn, row.endsOn))
    .map((event) => ({
      id: event.id,
      date: event.date,
      labelRo: event.titleRo,
      labelEn: event.titleEn,
      descriptionRo: event.descriptionRo,
      descriptionEn: event.descriptionEn,
      sourceUrl: event.sourceUrl
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function governanceForCareerRow(
  row: MemberHistoryRow,
  partyIdByLabel: Map<string, string>,
  governments: Government[],
  alignments: GovernmentPartyAlignmentForCareer[]
): NonNullable<MemberCareerSegment["governance"]> {
  const partyId = partyIdByLabel.get(row.label);
  if (!partyId) return [];

  const contexts: NonNullable<MemberCareerSegment["governance"]> = [];
  for (const government of governments.filter((item) => rangesOverlap(item.startsOn, item.endsOn, row.startsOn, row.endsOn))) {
    const governmentAlignments = alignments.filter((item) => item.governmentId === government.id);
    if (governmentAlignments.length === 0) continue;

    const windowStart = maxDate(row.startsOn, government.startsOn);
    const windowEnd = minOptionalDate(row.endsOn, government.endsOn);
    const partyAlignments = governmentAlignments
      .filter((item) => item.partyId === partyId)
      .filter((item) => rangesOverlap(item.startsOn, item.endsOn, windowStart, windowEnd));

    if (partyAlignments.length === 0) {
      contexts.push({
        governmentId: government.id,
        governmentName: government.name,
        alignment: "opposition",
        basis: "manual_curation",
        startsOn: windowStart,
        endsOn: windowEnd
      });
      continue;
    }

    contexts.push(
      ...partyAlignments.map((alignment) => ({
        governmentId: government.id,
        governmentName: government.name,
        alignment: alignment.alignment,
        basis: alignment.basis,
        startsOn: maxDate(windowStart, alignment.startsOn),
        endsOn: minOptionalDate(windowEnd, alignment.endsOn)
      }))
    );

    const firstAlignmentStart = partyAlignments
      .map((alignment) => alignment.startsOn)
      .sort((a, b) => a.localeCompare(b))[0];
    const lastAlignmentEnd = partyAlignments
      .map((alignment) => alignment.endsOn)
      .filter((value): value is string => Boolean(value))
      .sort((a, b) => b.localeCompare(a))[0];
    if (firstAlignmentStart && windowStart < firstAlignmentStart) {
      contexts.push({
        governmentId: government.id,
        governmentName: government.name,
        alignment: "opposition",
        basis: "manual_curation",
        startsOn: windowStart,
        endsOn: previousDay(firstAlignmentStart)
      });
    }
    if (lastAlignmentEnd && (!windowEnd || nextDay(lastAlignmentEnd) <= windowEnd)) {
      contexts.push({
        governmentId: government.id,
        governmentName: government.name,
        alignment: "opposition",
        basis: "manual_curation",
        startsOn: nextDay(lastAlignmentEnd),
        endsOn: windowEnd
      });
    }
  }

  return mergeCareerGovernanceContexts(contexts);
}

function mergeCareerGovernanceContexts(contexts: NonNullable<MemberCareerSegment["governance"]>): NonNullable<MemberCareerSegment["governance"]> {
  const byKey = new Map<string, NonNullable<MemberCareerSegment["governance"]>[number]>();
  for (const context of contexts) {
    if (context.endsOn && context.startsOn > context.endsOn) continue;
    const key = [context.governmentId, context.alignment, context.startsOn, context.endsOn ?? ""].join("|");
    if (!byKey.has(key)) byKey.set(key, context);
  }
  return [...byKey.values()].sort((a, b) => a.startsOn.localeCompare(b.startsOn) || a.governmentName.localeCompare(b.governmentName, "ro"));
}

function dedupeCareerSegments(segments: MemberCareerSegment[]): MemberCareerSegment[] {
  const byKey = new Map<string, MemberCareerSegment>();
  for (const segment of segments) {
    const key = [
      segment.label,
      segment.startsOn,
      segment.endsOn ?? "",
      segment.legislatureId ?? "",
      segment.chamber
    ].join("|");
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, segment);
      continue;
    }
    existing.events = [...(existing.events ?? []), ...(segment.events ?? [])];
    existing.governance = [...(existing.governance ?? []), ...(segment.governance ?? [])];
    existing.logoUrl ??= segment.logoUrl;
    existing.color ??= segment.color;
  }
  return [...byKey.values()]
    .map((segment) => {
      const events = new Map((segment.events ?? []).map((event) => [event.id, event]));
      return {
        ...segment,
        events: [...events.values()].sort((a, b) => a.date.localeCompare(b.date)),
        governance: mergeCareerGovernanceContexts(segment.governance ?? [])
      };
    })
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn) || a.label.localeCompare(b.label));
}

function tribunalSourcesForEntity(entityType: TribunalPoliticalEntitySource["entityType"], entityId: string): TribunalPoliticalEntitySource[] {
  return approvedTribunalEntitySources
    .filter((source) => source.entityType === entityType && source.entityId === entityId)
    .sort((a, b) => a.registryKind.localeCompare(b.registryKind) || a.position - b.position);
}

function labelsForPartyId(partyIdByLabel: Map<string, string>, partyId: string): string[] {
  return [...partyIdByLabel.entries()].filter(([, id]) => id === partyId).map(([label]) => label);
}

function rangesOverlap(aStart: string, aEnd: string | undefined, bStart: string, bEnd: string | undefined): boolean {
  return aStart <= (bEnd ?? "9999-12-31") && bStart <= (aEnd ?? "9999-12-31");
}

function maxDate(left: string, right: string): string {
  return left >= right ? left : right;
}

function minOptionalDate(left: string | undefined, right: string | undefined): string | undefined {
  if (!left) return right;
  if (!right) return left;
  return left <= right ? left : right;
}

function dateTouchesRange(date: string, startsOn: string, endsOn?: string): boolean {
  return date >= startsOn && (!endsOn || date <= nextDay(endsOn));
}

function datesTouch(leftEnd: string | undefined, rightStart: string): boolean {
  return Boolean(leftEnd && (leftEnd === rightStart || nextDay(leftEnd) === rightStart));
}

function displayEndsOn(endsOn: string | undefined, mandate?: MemberMandate, legislature?: Legislature): string | undefined {
  if (endsOn) return endsOn;
  if (mandate?.endsOn) return mandate.endsOn;
  if (legislature && legislature.endsOn < todayIso()) return legislature.endsOn;
  return undefined;
}

function previousDay(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function nextDay(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

async function findMemberByLegacySlug(
  db: DbClient,
  slug: string
): Promise<typeof schema.members.$inferSelect | undefined> {
  const baseSlug = slug.replace(/-(deputies|senate)-[a-z0-9-]+$/i, "");
  if (!baseSlug || baseSlug === slug) return undefined;
  const rows = await db.select().from(schema.members).where(ilike(schema.members.slug, `${baseSlug}%`));
  return rows
    .filter((row) => row.slug === baseSlug || row.slug.startsWith(`${baseSlug}-`))
    .sort((a, b) => memberLegislatureRank(b) - memberLegislatureRank(a) || a.slug.length - b.slug.length)[0];
}

function memberLegislatureRank(row: typeof schema.members.$inferSelect): number {
  const sourceIds = row.sourceIds && typeof row.sourceIds === "object" && !Array.isArray(row.sourceIds) ? row.sourceIds : {};
  const key = Object.keys(sourceIds).find((item) => item.startsWith("deputies:") || item.startsWith("senate:"));
  const year = key?.match(/:(\d{4})$/)?.[1];
  return year ? Number(year) : row.id.includes("-2020-") ? 2020 : 2024;
}

function cleanHistoryDetail(value?: string): string | undefined {
  const cleaned = (value ?? "")
    .replace(/data validării.*$/i, "")
    .replace(/data validarii.*$/i, "")
    .replace(/\bn\.\s*\d.*$/i, "")
    .replace(/Formaţiunea politică.*$/i, "")
    .replace(/Formatiunea politica.*$/i, "")
    .trim();
  return cleaned || undefined;
}

function mandateForMemberPeriod(mandates: MemberMandate[], memberId: string, date: string): MemberMandate | undefined {
  const memberMandates = mandates.filter((mandate) => mandate.memberId === memberId);
  return (
    memberMandates
      .filter((mandate) => mandate.startsOn <= date && (!mandate.endsOn || mandate.endsOn >= date))
      .sort((a, b) => b.startsOn.localeCompare(a.startsOn))[0] ??
    memberMandates.sort((a, b) => b.startsOn.localeCompare(a.startsOn))[0]
  );
}

function chamberForMemberPeriod(mandates: MemberMandate[], memberId: string, date: string): MemberMandate["chamber"] {
  return mandateForMemberPeriod(mandates, memberId, date)?.chamber ?? "deputies";
}

type DateValue = Date | string;

type MemberDirectoryRow = {
  member_id: string;
  member_person_id: string | null;
  member_slug: string;
  member_first_name: string;
  member_last_name: string;
  member_display_name: string;
  member_source_ids: unknown;
  mandate_id: string;
  mandate_member_id: string;
  mandate_legislature_id: string;
  mandate_chamber: MemberMandate["chamber"];
  mandate_starts_on: DateValue;
  mandate_ends_on: DateValue | null;
  mandate_constituency: string | null;
  mandate_status: string;
  mandate_source_snapshot_id: string | null;
  group_id: string | null;
  group_party_id: string | null;
  group_chamber: ParliamentaryGroup["chamber"] | null;
  group_short_name: string | null;
  group_name: string | null;
  group_color: string | null;
  party_id: string | null;
  party_slug: string | null;
  party_short_name: string | null;
  party_name: string | null;
  party_color: string | null;
  profile_photo_asset_id: string | null;
  vote_count: number;
  absence_count: number;
  stat_switches: number;
  stat_seniority_days: number;
};

type PartyLegislatureSummaryRow = {
  legislature_id: string;
  legislature_label: string;
  legislature_starts_on: DateValue;
  legislature_ends_on: DateValue;
  chamber: MemberMandate["chamber"];
  seat_count: number;
  member_count: number;
  logo_urls: unknown;
};

type PartyLegislatureMemberRow = {
  legislature_id: string;
  chamber: MemberMandate["chamber"];
  member_id: string;
  member_person_id: string | null;
  member_slug: string;
  member_first_name: string;
  member_last_name: string;
  member_display_name: string;
  member_source_ids: unknown;
};

type VoteRosterRow = {
  mandate_id: string;
  mandate_member_id: string;
  mandate_legislature_id: string;
  mandate_chamber: MemberMandate["chamber"];
  mandate_starts_on: DateValue;
  mandate_ends_on: DateValue | null;
  mandate_constituency: string | null;
  mandate_status: string;
  mandate_source_snapshot_id: string | null;
  legislature_id: string;
  legislature_label: string;
  legislature_starts_on: DateValue;
  legislature_ends_on: DateValue;
  membership_id: string | null;
  membership_member_id: string | null;
  membership_group_id: string | null;
  membership_starts_on: DateValue | null;
  membership_ends_on: DateValue | null;
  membership_logo_url: string | null;
  membership_source_snapshot_id: string | null;
};

type MemberVoteRow = {
  individual_vote_id: string;
  individual_vote_vote_id: string;
  individual_vote_member_id: string;
  individual_vote_group_id: string | null;
  individual_vote_choice: IndividualVote["choice"];
  individual_vote_method: string | null;
  vote_id: string;
  vote_bill_id: string | null;
  vote_chamber: Vote["chamber"];
  vote_title: string;
  vote_held_on: DateValue;
  vote_type: string;
  vote_motion_kind: NonNullable<Vote["motionKind"]>;
  vote_prominence: NonNullable<Vote["prominence"]>;
  vote_classification_confidence: NonNullable<Vote["classificationConfidence"]>;
  vote_yes_meaning: NonNullable<Vote["yesMeaning"]>;
  vote_present: number;
  vote_for_count: number;
  vote_against: number;
  vote_abstention: number;
  vote_present_not_voting: number;
  vote_absent: number | null;
  vote_source_snapshot_id: string;
};

type MemberBillRow = {
  id: string;
  slug: string;
  title: string;
  identifiers: unknown;
  chamber_of_origin: string;
  status: string;
  source_snapshot_ids: unknown;
};

type BillSponsorMembershipRow = {
  member_id: string;
  group_id: string;
  group_party_id: string | null;
  group_chamber: ParliamentaryGroup["chamber"];
  group_short_name: string;
  group_name: string;
  group_color: string;
};

type MemberActivityRow = {
  vote_records: number | null;
  major_vote_records: number | null;
  standard_vote_records: number | null;
  routine_vote_records: number | null;
  unclassified_vote_records: number | null;
  votes_for: number | null;
  votes_against: number | null;
  abstentions: number | null;
  present_not_voting: number | null;
  absent: number | null;
  unknown: number | null;
  proposals: number | null;
  committees: number | null;
  roles: number | null;
  first_activity_on: DateValue | null;
  last_activity_on: DateValue | null;
};

type VoteCoverageRow = {
  vote_id: string;
  coverage_level: VoteCoverageData["coverageLevel"];
  nominal_votes: number;
  group_totals: number;
  source_status: VoteCoverageData["sourceStatus"];
};
