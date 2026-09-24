import { unstable_cache } from "next/cache";
import { dataUnavailable, requireDatabaseOrExplicitDemo } from "./data-availability";
import * as schema from "@cumsevoteaza/db";
import {
  type CompositionEvent,
  demoDataset,
  type AlignmentBasis,
  type ChamberId,
  type Government,
  type GovernmentRole,
  type GovernanceAlignment,
  type Legislature,
  type Member,
  type MemberGroupMembership,
  type MemberMandate,
  type ParliamentaryGroup,
  type Party,
  type Person
} from "@cumsevoteaza/parliament-model";
import { CACHE_TAGS, createWebDbSession, timed } from "./server-db";

export type CompositionMode = "official" | "computed";

export interface CompositionSeat {
  member: Pick<Member, "id" | "slug" | "displayName">;
  group?: Pick<ParliamentaryGroup, "id" | "shortName" | "name" | "color">;
  alignment: GovernanceAlignment;
  alignmentBasis: AlignmentBasis;
}

export interface ChamberComposition {
  chamber: ChamberId;
  seats: CompositionSeat[];
  groups: Array<{
    group: Pick<ParliamentaryGroup, "id" | "shortName" | "name" | "color">;
    party?: Pick<Party, "id" | "slug" | "shortName" | "name" | "color">;
    seats: number;
    alignment: GovernanceAlignment;
  }>;
}

export interface CompositionPageData {
  mode: CompositionMode;
  asOf: string;
  chambers: ChamberComposition[];
  sourceKind: "database" | "demo";
}

export interface CompositionTimelineStop {
  id: string;
  legislature: Legislature;
  compositionDate: string;
  activeGovernment?: Government;
  governments: Government[];
  primeMinister?: Person;
  primeMinisterRole?: GovernmentRole;
  primeMinisters: Array<{ person: Person; days: number }>;
  cabinet: Array<{ role: GovernmentRole; person: Person; member?: Pick<Member, "id" | "slug" | "displayName">; evidenceUrl?: string }>;
  investitureCabinet: Array<{ role: GovernmentRole; person: Person; member?: Pick<Member, "id" | "slug" | "displayName">; evidenceUrl?: string }>;
  caretakerSince?: string;
  cabinetEvidenceUrl?: string;
  events: CompositionEvent[];
  sourceStatus: "manual" | "verified";
  chambers: ChamberComposition[];
}

export interface CompositionTimelineData {
  mode: CompositionMode;
  asOf: string;
  stops: CompositionTimelineStop[];
  currentComposition?: CompositionPageData;
  sourceKind: "database" | "demo";
}

interface AlignmentRow {
  targetId: string;
  alignment: GovernanceAlignment;
  basis: AlignmentBasis;
  startsOn: string;
  endsOn?: string | null;
}

interface CompositionSourceRows {
  legislatures: Legislature[];
  members: Member[];
  mandates: MemberMandate[];
  memberships: MemberGroupMembership[];
  groups: ParliamentaryGroup[];
  parties: Party[];
  memberAlignments: AlignmentRow[];
  groupAlignments: AlignmentRow[];
  partyAlignments: AlignmentRow[];
}

const getCachedCurrentCompositionData = unstable_cache(
  async (mode: CompositionMode) => timed(`composition.current.${mode}`, () => getCurrentCompositionDataUncached(mode)),
  ["current-composition-data-integrity-v2"],
  { revalidate: 900, tags: [CACHE_TAGS.composition, CACHE_TAGS.members, CACHE_TAGS.parties] }
);

const getCachedCompositionTimelineData = unstable_cache(
  async (mode: CompositionMode) => timed(`composition.timeline.${mode}`, () => getCompositionTimelineDataUncached(mode)),
  ["composition-timeline-data-integrity-v6"],
  { revalidate: 3600, tags: [CACHE_TAGS.composition, CACHE_TAGS.members, CACHE_TAGS.parties] }
);

export async function getCurrentCompositionData(mode: CompositionMode): Promise<CompositionPageData> {
  return getCachedCurrentCompositionData(mode);
}

async function getCurrentCompositionDataUncached(mode: CompositionMode): Promise<CompositionPageData> {
  requireDatabaseOrExplicitDemo();
  const dbData = await tryDatabaseCurrentComposition(mode);
  if (dbData) return dbData;
  if (process.env.DATABASE_URL) return dataUnavailable();
  return demoComposition(mode);
}

export async function getCompositionTimelineData(mode: CompositionMode): Promise<CompositionTimelineData> {
  return getCachedCompositionTimelineData(mode);
}

async function getCompositionTimelineDataUncached(mode: CompositionMode): Promise<CompositionTimelineData> {
  const currentComposition = await getCurrentCompositionData(mode);
  const dbData = await tryDatabaseCompositionTimeline(mode, currentComposition);
  if (dbData) return dbData;
  if (process.env.DATABASE_URL) return dataUnavailable();
  return {
    mode,
    asOf: currentComposition.asOf,
    stops: [],
    currentComposition,
    sourceKind: currentComposition.sourceKind
  };
}

async function tryDatabaseCompositionTimeline(
  mode: CompositionMode,
  currentComposition: CompositionPageData
): Promise<CompositionTimelineData | undefined> {
  if (!process.env.DATABASE_URL) return undefined;

  const session = createWebDbSession();
  try {
    const [
      governmentRows,
      peopleRows,
      roleRows,
      eventRows,
      memberRows,
      mandateRows,
      membershipRows,
      legislatureRows,
      groupRows,
      partyRows,
      memberAlignmentRows,
      groupAlignmentRows,
      partyAlignmentRows,
      sourceSnapshotRows
    ] = await Promise.all([
      session.db.select().from(schema.governments),
      session.db.select().from(schema.people),
      session.db.select().from(schema.governmentRoles),
      session.db.select().from(schema.compositionEvents),
      session.db.select().from(schema.members),
      session.db.select().from(schema.memberMandates),
      session.db.select().from(schema.memberGroupMemberships),
      session.db.select().from(schema.legislatures),
      session.db.select().from(schema.parliamentaryGroups),
      session.db.select().from(schema.parties),
      session.db.select().from(schema.memberGovernanceAlignments),
      session.db.select().from(schema.governmentGroupAlignments),
      session.db.select().from(schema.governmentPartyAlignments),
      session.db.select().from(schema.sourceSnapshots)
    ]);
    const compositionRows = mapCompositionRows({
      memberRows,
      mandateRows,
      membershipRows,
      legislatureRows,
      groupRows,
      partyRows,
      memberAlignmentRows,
      groupAlignmentRows,
      partyAlignmentRows
    });
    const people = peopleRows.map(mapPerson);
    const peopleById = new Map(people.map((person) => [person.id, person]));
    const memberByPersonId = new Map(
      memberRows
        .filter((member) => member.personId)
        .map((member) => [member.personId!, { id: member.id, slug: member.slug, displayName: member.displayName }])
    );
    const sourceUrlById = new Map(sourceSnapshotRows.map((source) => [source.id, source.sourceUrl]));
    const roles = roleRows.map(mapGovernmentRole);
    const governments = governmentRows.map(mapGovernment);
    const governmentsById = new Map(governments.map((government) => [government.id, government]));
    const events = eventRows
      .map(mapCompositionEvent)
      .filter((event) => isTimelineEvent(event.eventType))
      .sort((a, b) => a.occurredOn.localeCompare(b.occurredOn) || a.title.localeCompare(b.title, "ro"));
    const legislatures = legislatureRows.map(mapLegislature).sort((a, b) => b.startsOn.localeCompare(a.startsOn));
    const today = new Date().toISOString().slice(0, 10);

    return {
      mode,
      asOf: currentComposition.asOf,
      currentComposition,
      sourceKind: "database",
      stops: legislatures.flatMap((legislature) => {
        const legislatureGovernments = governments
          .filter((government) => governmentBelongsToLegislature(government, legislature))
          .sort((a, b) => b.startsOn.localeCompare(a.startsOn));
        const legislatureEvents = events.filter((event) => {
          if (event.legislatureId === legislature.id) return true;
          const government = event.governmentId ? governmentsById.get(event.governmentId) : undefined;
          if (government) return governmentBelongsToLegislature(government, legislature);
          return dateInLegislature(event.occurredOn, legislature);
        });
        if (legislatureGovernments.length === 0 && legislatureEvents.length === 0) return [];

        const compositionDate = compositionDateForLegislature(legislature, compositionRows.mandates, today);
        const activeGovernment =
          legislatureGovernments.find((government) => isActiveGovernment(government, compositionDate)) ?? legislatureGovernments[0];
        const primeMinister = activeGovernment?.primeMinisterPersonId ? peopleById.get(activeGovernment.primeMinisterPersonId) : undefined;
        const primeMinisterRole = activeGovernment
          ? roles.find((role) => role.governmentId === activeGovernment.id && role.personId === activeGovernment.primeMinisterPersonId)
          : undefined;
        const primeMinisters = rankedPrimeMinistersForLegislature({
          governments: legislatureGovernments,
          roles,
          peopleById,
          legislature
        });
        const cabinet = activeGovernment
          ? roles
              .filter((role) => role.governmentId === activeGovernment.id && role.startsOn <= compositionDate && (!role.endsOn || role.endsOn >= compositionDate))
              .flatMap((role) => {
                const person = peopleById.get(role.personId);
                return person ? [{ role, person, member: memberByPersonId.get(role.personId), evidenceUrl: role.sourceSnapshotId ? sourceUrlById.get(role.sourceSnapshotId) : undefined }] : [];
              })
              .sort((a, b) => cabinetRoleRank(a.role) - cabinetRoleRank(b.role) || a.person.displayName.localeCompare(b.person.displayName, "ro"))
          : [];
        const investitureCabinet = activeGovernment
          ? roles
              .filter((role) => role.governmentId === activeGovernment.id && role.startsOn <= activeGovernment.startsOn && (!role.endsOn || role.endsOn >= activeGovernment.startsOn))
              .flatMap((role) => {
                const person = peopleById.get(role.personId);
                return person ? [{ role, person, member: memberByPersonId.get(role.personId), evidenceUrl: role.sourceSnapshotId ? sourceUrlById.get(role.sourceSnapshotId) : undefined }] : [];
              })
              .sort((a, b) => cabinetRoleRank(a.role) - cabinetRoleRank(b.role) || a.person.displayName.localeCompare(b.person.displayName, "ro"))
          : [];
        const caretakerSince = activeGovernment
          ? legislatureEvents.find((event) => event.governmentId === activeGovernment.id && event.eventType === "no_confidence_motion" && event.occurredOn <= compositionDate)?.occurredOn
          : undefined;
        const cabinetEvidenceUrl = cabinet
          .filter((item) => item.role.sourceSnapshotId !== activeGovernment?.sourceSnapshotId)
          .map((item) => (item.role.sourceSnapshotId ? sourceUrlById.get(item.role.sourceSnapshotId) : undefined))
          .find((url): url is string => Boolean(url));
        const stopComposition = buildComposition({
          mode,
          asOf: compositionDate,
          ...compositionRows,
          sourceKind: "database"
        });
        return [
          {
            id: legislature.id,
            legislature,
            compositionDate,
            activeGovernment,
            governments: legislatureGovernments,
            primeMinister,
            primeMinisterRole,
            primeMinisters,
            cabinet,
            investitureCabinet,
            caretakerSince,
            cabinetEvidenceUrl,
            events: legislatureEvents,
            sourceStatus: legislatureGovernments.some((government) => government.sourceSnapshotId) || legislatureEvents.some((event) => event.sourceSnapshotId) ? "verified" : "manual",
            chambers: hasCompositionSeats(stopComposition) ? stopComposition.chambers : []
          }
        ];
      })
    };
  } catch {
    return undefined;
  } finally {
    await session.close();
  }
}

async function tryDatabaseCurrentComposition(mode: CompositionMode): Promise<CompositionPageData | undefined> {
  if (!process.env.DATABASE_URL) return undefined;

  const session = createWebDbSession();
  try {
    const today = new Date().toISOString().slice(0, 10);
    const [memberRows, mandateRows, membershipRows, legislatureRows, groupRows, partyRows, memberAlignmentRows, groupAlignmentRows, partyAlignmentRows] =
      await Promise.all([
        session.db.select().from(schema.members),
        session.db.select().from(schema.memberMandates),
        session.db.select().from(schema.memberGroupMemberships),
        session.db.select().from(schema.legislatures),
        session.db.select().from(schema.parliamentaryGroups),
        session.db.select().from(schema.parties),
        session.db.select().from(schema.memberGovernanceAlignments),
        session.db.select().from(schema.governmentGroupAlignments),
        session.db.select().from(schema.governmentPartyAlignments)
      ]);

    const compositionRows = mapCompositionRows({
      memberRows,
      mandateRows,
      membershipRows,
      legislatureRows,
      groupRows,
      partyRows,
      memberAlignmentRows,
      groupAlignmentRows,
      partyAlignmentRows
    });

    return buildComposition({
      mode,
      asOf: today,
      ...compositionRows,
      sourceKind: "database"
    });
  } catch {
    return undefined;
  } finally {
    await session.close();
  }
}

function demoComposition(mode: CompositionMode): CompositionPageData {
  const asOf = new Date().toISOString().slice(0, 10);
  return buildComposition({
    mode,
    asOf,
    members: demoDataset.members,
    mandates: demoDataset.mandates,
    memberships: demoDataset.groupMemberships,
    legislatures: demoDataset.legislatures,
    groups: demoDataset.groups,
    parties: demoDataset.parties,
    memberAlignments: [],
    groupAlignments: [],
    partyAlignments: [],
    sourceKind: "demo"
  });
}

function buildComposition(input: {
  mode: CompositionMode;
  asOf: string;
  members: Member[];
  mandates: MemberMandate[];
  memberships: MemberGroupMembership[];
  legislatures: Legislature[];
  groups: ParliamentaryGroup[];
  parties: Party[];
  memberAlignments: AlignmentRow[];
  groupAlignments: AlignmentRow[];
  partyAlignments: AlignmentRow[];
  sourceKind: "database" | "demo";
}): CompositionPageData {
  const memberById = new Map(input.members.map((member) => [member.id, member]));
  const legislatureById = new Map(input.legislatures.map((legislature) => [legislature.id, legislature]));
  const groupById = new Map(input.groups.map((group) => [group.id, group]));
  const partyById = new Map(input.parties.map((party) => [party.id, party]));
  const hasKnownOfficialAlignment = hasActiveOfficialAlignment(input, input.asOf);

  const chambers: ChamberComposition[] = (["deputies", "senate"] as ChamberId[]).map((chamber) => {
    const seats = input.mandates
      .filter((mandate) => mandate.chamber === chamber && activeMandateOn(mandate, legislatureById.get(mandate.legislatureId), input.asOf))
      .flatMap((mandate) => {
        const member = memberById.get(mandate.memberId);
        if (!member) return [];
        const membership = activeMembershipOn(
          input.memberships.filter((item) => item.memberId === member.id),
          groupById,
          chamber,
          input.asOf
        );
        const group = membership ? groupById.get(membership.groupId) : undefined;
        const party = group?.partyId ? partyById.get(group.partyId) : undefined;
        const alignment = resolveAlignment({
          mode: input.mode,
          asOf: input.asOf,
          memberId: member.id,
          groupId: group?.id,
          partyId: party?.id,
          memberAlignments: input.memberAlignments,
          groupAlignments: input.groupAlignments,
          partyAlignments: input.partyAlignments,
          hasKnownOfficialAlignment
        });
        return [
          {
            member: compactMember(member),
            group: group ? compactGroup(group) : undefined,
            ...alignment
          }
        ];
      })
      .sort(
        (a, b) =>
          groupSortKey(a.group).localeCompare(groupSortKey(b.group), "ro") ||
          a.member.displayName.localeCompare(b.member.displayName, "ro")
      );
    const groups = [...new Set(seats.flatMap((seat) => (seat.group ? [seat.group.id] : [])))]
      .flatMap((groupId) => {
        const group = groupById.get(groupId);
        if (!group) return [];
        const party = group.partyId ? partyById.get(group.partyId) : undefined;
        const groupSeats = seats.filter((seat) => seat.group?.id === group.id);
        return [
          {
            group: compactGroup(group),
            party: party ? compactParty(party) : undefined,
            seats: groupSeats.length,
            alignment: mostCommonAlignment(groupSeats.map((seat) => seat.alignment))
          }
        ];
      })
      .sort((a, b) => b.seats - a.seats || a.group.shortName.localeCompare(b.group.shortName, "ro"));

    return { chamber, seats, groups };
  });

  return {
    mode: input.mode,
    asOf: input.asOf,
    chambers,
    sourceKind: input.sourceKind
  };
}

function compactMember(member: Member): Pick<Member, "id" | "slug" | "displayName"> {
  return {
    id: member.id,
    slug: member.slug,
    displayName: member.displayName
  };
}

function compactGroup(group: ParliamentaryGroup): Pick<ParliamentaryGroup, "id" | "shortName" | "name" | "color"> {
  return {
    id: group.id,
    shortName: group.shortName,
    name: group.name,
    color: group.color
  };
}

function compactParty(party: Party): Pick<Party, "id" | "slug" | "shortName" | "name" | "color"> {
  return {
    id: party.id,
    slug: party.slug,
    shortName: party.shortName,
    name: party.name,
    color: party.color
  };
}

function hasCompositionSeats(composition: CompositionPageData): boolean {
  return composition.chambers.some((chamber) => chamber.seats.length > 0);
}

function compositionDateForLegislature(legislature: Legislature, mandates: MemberMandate[], today: string): string {
  if (today >= legislature.startsOn && today < legislature.endsOn) return today;
  const chamberFirstDates = (["deputies", "senate"] as ChamberId[])
    .map((chamber) =>
      mandates
        .filter((mandate) => mandate.legislatureId === legislature.id && mandate.chamber === chamber)
        .map((mandate) => mandate.startsOn)
        .sort()[0]
    )
    .filter((date): date is string => Boolean(date));
  return latestDate(legislature.startsOn, ...chamberFirstDates);
}

function rankedPrimeMinistersForLegislature(input: {
  governments: Government[];
  roles: GovernmentRole[];
  peopleById: Map<string, Person>;
  legislature: Legislature;
}): Array<{ person: Person; days: number }> {
  const daysByPerson = new Map<string, number>();
  for (const government of input.governments) {
    const role = input.roles.find((item) => item.governmentId === government.id && item.personId === government.primeMinisterPersonId);
    if (!government.primeMinisterPersonId || /interimar/i.test(`${government.name} ${role?.title ?? ""}`)) continue;
    const startsOn = latestDate(government.startsOn, input.legislature.startsOn);
    const endsOn = earliestDate(government.endsOn, input.legislature.endsOn) ?? input.legislature.endsOn;
    daysByPerson.set(government.primeMinisterPersonId, (daysByPerson.get(government.primeMinisterPersonId) ?? 0) + daysBetweenInclusive(startsOn, endsOn));
  }
  return [...daysByPerson.entries()]
    .flatMap(([personId, days]) => {
      const person = input.peopleById.get(personId);
      return person ? [{ person, days }] : [];
    })
    .sort((a, b) => b.days - a.days || a.person.displayName.localeCompare(b.person.displayName, "ro"));
}

function cabinetRoleRank(role: GovernmentRole): number {
  const title = role.title.toLocaleLowerCase("ro");
  if (title.includes("prim-ministru") && !title.includes("viceprim")) return 0;
  if (title.includes("viceprim")) return 1;
  return 2;
}

function daysBetweenInclusive(start: string, end: string): number {
  const startTime = Date.parse(`${start}T00:00:00.000Z`);
  const endTime = Date.parse(`${end}T00:00:00.000Z`);
  return Math.max(0, Math.round((endTime - startTime) / 86_400_000) + 1);
}

function latestDate(...dates: Array<string | undefined | null>): string {
  return dates.filter((date): date is string => Boolean(date)).sort((a, b) => b.localeCompare(a))[0] ?? "0000-01-01";
}

function resolveAlignment(input: {
  mode: CompositionMode;
  asOf: string;
  memberId: string;
  groupId?: string;
  partyId?: string;
  memberAlignments: AlignmentRow[];
  groupAlignments: AlignmentRow[];
  partyAlignments: AlignmentRow[];
  hasKnownOfficialAlignment: boolean;
}): { alignment: GovernanceAlignment; alignmentBasis: AlignmentBasis } {
  const member = latestAlignment(input.memberAlignments.filter((row) => row.targetId === input.memberId), input.mode, input.asOf);
  if (input.groupId && /(?:unaffiliated|neafiliat)/i.test(input.groupId)) {
    return { alignment: "unaffiliated", alignmentBasis: "parliamentary_group_declaration" };
  }
  const group = input.groupId
    ? latestAlignment(input.groupAlignments.filter((row) => row.targetId === input.groupId), input.mode, input.asOf)
    : undefined;
  if (group) return { alignment: group.alignment, alignmentBasis: group.basis };
  const party = input.partyId
    ? latestAlignment(input.partyAlignments.filter((row) => row.targetId === input.partyId), input.mode, input.asOf)
    : undefined;
  const resolved = [
    member ? { row: member, specificity: 3 } : undefined,
    group ? { row: group, specificity: 2 } : undefined,
    party ? { row: party, specificity: 1 } : undefined
  ]
    .filter((item): item is { row: AlignmentRow; specificity: number } => Boolean(item))
    .sort((a, b) => b.row.startsOn.localeCompare(a.row.startsOn) || b.specificity - a.specificity)[0]?.row;
  if (resolved) return { alignment: resolved.alignment, alignmentBasis: resolved.basis };
  if (input.mode === "official" && input.hasKnownOfficialAlignment && (input.partyId || input.groupId)) {
    return { alignment: "opposition", alignmentBasis: "manual_curation" };
  }
  return { alignment: "unknown", alignmentBasis: "unknown" };
}

function hasActiveOfficialAlignment(
  input: Pick<CompositionSourceRows, "memberAlignments" | "groupAlignments" | "partyAlignments"> & { mode: CompositionMode },
  asOf: string
): boolean {
  if (input.mode !== "official") return false;
  return [...input.memberAlignments, ...input.groupAlignments, ...input.partyAlignments].some(
    (row) => row.basis !== "computed_vote_support" && activeOn(row.startsOn, row.endsOn, asOf)
  );
}

function latestAlignment(rows: AlignmentRow[], mode: CompositionMode, asOf: string): AlignmentRow | undefined {
  return rows
    .filter((row) => activeOn(row.startsOn, row.endsOn ?? undefined, asOf))
    .filter((row) => (mode === "computed" ? row.basis === "computed_vote_support" : row.basis !== "computed_vote_support"))
    .sort((a, b) => b.startsOn.localeCompare(a.startsOn))[0];
}

function activeMembershipOn(
  rows: MemberGroupMembership[],
  groupById: Map<string, ParliamentaryGroup>,
  chamber: ChamberId,
  asOf: string
): MemberGroupMembership | undefined {
  return rows
    .filter((row) => activeOn(row.startsOn, row.endsOn, asOf))
    .filter((row) => groupById.get(row.groupId)?.chamber === chamber)
    .sort((a, b) => {
      const aSnapshot = a.currentSnapshotOn && a.currentSnapshotOn <= asOf ? a.currentSnapshotOn : "";
      const bSnapshot = b.currentSnapshotOn && b.currentSnapshotOn <= asOf ? b.currentSnapshotOn : "";
      return (
        bSnapshot.localeCompare(aSnapshot) ||
        b.startsOn.localeCompare(a.startsOn) ||
        b.id.localeCompare(a.id)
      );
    })[0];
}

function activeOn(startsOn: string, endsOn: string | undefined | null, date: string): boolean {
  return startsOn <= date && (!endsOn || endsOn >= date);
}

function activeMandateOn(mandate: MemberMandate, legislature: Legislature | undefined, date: string): boolean {
  const boundedEndsOn = earliestDate(mandate.endsOn, legislature?.endsOn);
  return activeOn(mandate.startsOn, boundedEndsOn, date);
}

function earliestDate(...dates: Array<string | undefined | null>): string | undefined {
  return dates.filter((date): date is string => Boolean(date)).sort()[0];
}

function groupSortKey(group?: Pick<ParliamentaryGroup, "shortName">): string {
  if (!group) return "zzzz";
  return group.shortName;
}

function mostCommonAlignment(values: GovernanceAlignment[]): GovernanceAlignment {
  const counts = new Map<GovernanceAlignment, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";
}

function mapCompositionRows(input: {
  memberRows: Array<typeof schema.members.$inferSelect>;
  mandateRows: Array<typeof schema.memberMandates.$inferSelect>;
  membershipRows: Array<typeof schema.memberGroupMemberships.$inferSelect>;
  legislatureRows: Array<typeof schema.legislatures.$inferSelect>;
  groupRows: Array<typeof schema.parliamentaryGroups.$inferSelect>;
  partyRows: Array<typeof schema.parties.$inferSelect>;
  memberAlignmentRows: Array<typeof schema.memberGovernanceAlignments.$inferSelect>;
  groupAlignmentRows: Array<typeof schema.governmentGroupAlignments.$inferSelect>;
  partyAlignmentRows: Array<typeof schema.governmentPartyAlignments.$inferSelect>;
}): CompositionSourceRows {
  return {
    legislatures: input.legislatureRows.map((row) => ({
      id: row.id,
      label: row.label,
      startsOn: row.startsOn,
      endsOn: row.endsOn
    })),
    members: input.memberRows.map((row) => ({
      id: row.id,
      personId: row.personId ?? undefined,
      slug: row.slug,
      firstName: row.firstName,
      lastName: row.lastName,
      displayName: row.displayName,
      sourceIds: row.sourceIds
    })),
    mandates: input.mandateRows.map((row) => ({
      id: row.id,
      memberId: row.memberId,
      legislatureId: row.legislatureId,
      chamber: row.chamber,
      startsOn: row.startsOn,
      endsOn: row.endsOn ?? undefined,
      constituency: row.constituency ?? undefined,
      status: row.status as MemberMandate["status"],
      sourceSnapshotId: row.sourceSnapshotId ?? undefined
    })),
    memberships: input.membershipRows.map((row) => ({
      id: row.id,
      memberId: row.memberId,
      groupId: row.groupId,
      startsOn: row.startsOn,
      endsOn: row.endsOn ?? undefined,
      currentSnapshotOn: row.currentSnapshotOn ?? undefined,
      sourceSnapshotId: row.sourceSnapshotId ?? undefined
    })),
    groups: input.groupRows.map((row) => ({
      id: row.id,
      partyId: row.partyId ?? undefined,
      chamber: row.chamber,
      shortName: row.shortName,
      name: row.name,
      color: row.color
    })),
    parties: input.partyRows.map((row) => ({
      id: row.id,
      slug: row.slug,
      shortName: row.shortName,
      name: row.name,
      color: row.color
    })),
    memberAlignments: input.memberAlignmentRows.map((row) => ({
      targetId: row.memberId,
      alignment: row.alignment,
      basis: row.basis,
      startsOn: row.startsOn,
      endsOn: row.endsOn
    })),
    groupAlignments: input.groupAlignmentRows.map((row) => ({
      targetId: row.groupId,
      alignment: row.alignment,
      basis: row.basis,
      startsOn: row.startsOn,
      endsOn: row.endsOn
    })),
    partyAlignments: input.partyAlignmentRows.map((row) => ({
      targetId: row.partyId,
      alignment: row.alignment,
      basis: row.basis,
      startsOn: row.startsOn,
      endsOn: row.endsOn
    }))
  };
}

function mapPerson(row: typeof schema.people.$inferSelect): Person {
  return {
    id: row.id,
    slug: row.slug,
    displayName: row.displayName,
    normalizedName: row.normalizedName,
    birthDate: row.birthDate ?? undefined,
    sourceIds: row.sourceIds
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

function mapGovernmentRole(row: typeof schema.governmentRoles.$inferSelect): GovernmentRole {
  return {
    id: row.id,
    governmentId: row.governmentId,
    personId: row.personId,
    title: row.title,
    ministry: row.ministry ?? undefined,
    ministryId: row.ministryId ?? undefined,
    startsOn: row.startsOn,
    endsOn: row.endsOn ?? undefined,
    sourceSnapshotId: row.sourceSnapshotId ?? undefined
  };
}

function mapCompositionEvent(row: typeof schema.compositionEvents.$inferSelect): CompositionEvent {
  return {
    id: row.id,
    eventType: row.eventType,
    title: row.title,
    description: row.description ?? undefined,
    occurredOn: row.occurredOn,
    endsOn: row.endsOn ?? undefined,
    legislatureId: row.legislatureId ?? undefined,
    governmentId: row.governmentId ?? undefined,
    chamber: row.chamber ?? undefined,
    memberId: row.memberId ?? undefined,
    personId: row.personId ?? undefined,
    partyId: row.partyId ?? undefined,
    groupId: row.groupId ?? undefined,
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

function isTimelineEvent(type: CompositionEvent["eventType"]): boolean {
  return [
    "legislature_start",
    "legislature_end",
    "government_designated",
    "government_invested",
    "government_ended",
    "no_confidence_motion",
    "confidence_vote",
    "coalition_change",
    "reshuffle"
  ].includes(type);
}

function isActiveGovernment(government: Government, date: string): boolean {
  return activeOn(government.startsOn, government.endsOn, date);
}

function governmentBelongsToLegislature(government: Government, legislature: Legislature): boolean {
  if (government.legislatureId) return government.legislatureId === legislature.id;
  return rangesOverlap(government.startsOn, government.endsOn, legislature.startsOn, legislature.endsOn);
}

function dateInLegislature(date: string, legislature: Legislature): boolean {
  return date >= legislature.startsOn && date < legislature.endsOn;
}

function rangesOverlap(startsOn: string, endsOn: string | undefined, rangeStartsOn: string, rangeEndsOn: string): boolean {
  return startsOn < rangeEndsOn && (!endsOn || endsOn >= rangeStartsOn);
}
