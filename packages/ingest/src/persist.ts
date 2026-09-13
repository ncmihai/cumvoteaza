import { eq, inArray, sql } from "drizzle-orm";
import { createDbSession, type DbSession } from "@cumsevoteaza/db";
import * as schema from "@cumsevoteaza/db";
import type {
  Bill,
  BillDocumentTextChunk,
  BillEvent,
  BillProcedureStep,
  BillSponsor,
  CompositionEvent,
  DocumentSource,
  Government,
  GovernmentPartyAlignment,
  GovernmentRole,
  GroupVoteTotal,
  IndividualVote,
  Member,
  MemberCommitteeMembership,
  MemberGroupMembership,
  MemberMandate,
  MemberMandateRelation,
  MemberPartyAffiliation,
  MemberRole,
  ParliamentaryGroup,
  Party,
  Person,
  SourceSnapshot,
  Vote
} from "@cumsevoteaza/parliament-model";
import type { ParsedSenateBill } from "./parsers/senate-bill";
import type { ParsedSenateVote } from "./parsers/senate-vote";
import { legislatureCatalog, type ParsedRoster } from "./parsers/roster";
import type { ParsedDeputiesBill } from "./parsers/deputies-bill";
import type { ParsedChamberVote } from "./parsers/chamber-vote";
import { classifyVote } from "./vote-classification";

const defaultLegislature = {
  id: "leg-2024-2028",
  label: "2024-2028",
  startsOn: "2024-12-01",
  endsOn: "2028-12-01"
};

type Db = Omit<ReturnType<typeof createDbSession>["db"], "$client">;

export async function persistSenateBill(parsed: ParsedSenateBill, suppliedSession?: DbSession) {
  const session = suppliedSession ?? createDbSession();
  try {
    return await session.db.transaction(async (db) => {
    await upsertSourceSnapshot(db, parsed.sourceSnapshot);
    await upsertBill(db, parsed.bill);
    await Promise.all(parsed.events.map((event) => upsertBillEvent(db, event)));
    await Promise.all(parsed.sponsors.map((sponsor) => upsertBillSponsor(db, sponsor)));
    await Promise.all(parsed.documents.map((document) => upsertDocument(db, document)));

    return {
      billId: parsed.bill.id,
      sourceSnapshotId: parsed.sourceSnapshot.id,
      events: parsed.events.length,
      documents: parsed.documents.length
    };
    });
  } finally {
    if (!suppliedSession) await session.close();
  }
}

export async function persistSenateVote(parsed: ParsedSenateVote, suppliedSession?: DbSession) {
  const session = suppliedSession ?? createDbSession();
  try {
    return await session.db.transaction(async (db) => {
    await db.insert(schema.legislatures).values(legislatureForDate(parsed.vote.heldOn)).onConflictDoNothing();
    await upsertSourceSnapshot(db, parsed.sourceSnapshot);

    if (parsed.vote.billId) {
      await ensurePlaceholderBill(db, {
        id: parsed.vote.billId,
        slug: parsed.vote.billId.replace(/^bill-/, ""),
        title: parsed.vote.title,
        identifiers: { senate: parsed.vote.title.split(" ")[0] ?? parsed.vote.billId },
        chamberOfOrigin: "senate",
        status: "unknown",
        sourceSnapshotIds: [parsed.sourceSnapshot.id]
      });
    }

    await Promise.all(parsed.groups.map((group) => upsertGroup(db, group)));
    await Promise.all(parsed.members.map((member) => upsertMember(db, member)));
    await Promise.all(parsed.individualVotes.map((vote) => upsertDerivedMandateAndMembership(db, vote, parsed)));
    await upsertVote(db, parsed.vote);
    await Promise.all(parsed.groupVoteTotals.map((total) => upsertGroupVoteTotal(db, total)));
    await Promise.all(parsed.individualVotes.map((vote) => upsertIndividualVote(db, vote)));

    return {
      voteId: parsed.vote.id,
      sourceSnapshotId: parsed.sourceSnapshot.id,
      members: parsed.members.length,
      groups: parsed.groups.length,
      individualVotes: parsed.individualVotes.length
    };
    });
  } finally {
    if (!suppliedSession) await session.close();
  }
}

export async function persistDeputiesBill(parsed: ParsedDeputiesBill, suppliedSession?: DbSession) {
  const session = suppliedSession ?? createDbSession();
  try {
    return await session.db.transaction(async (db) => {
    await upsertSourceSnapshot(db, parsed.sourceSnapshot);
    await upsertBill(db, parsed.bill);
    await Promise.all(parsed.events.map((event) => upsertBillEvent(db, event)));
    await Promise.all(parsed.sponsors.map((sponsor) => upsertBillSponsor(db, sponsor)));
    await Promise.all(parsed.documents.map((document) => upsertDocument(db, document)));
    await upsertBillProcedureSteps(db, parsed.procedureSteps);

    return {
      billId: parsed.bill.id,
      sourceSnapshotId: parsed.sourceSnapshot.id,
      events: parsed.events.length,
      procedureSteps: parsed.procedureSteps.length,
      documents: parsed.documents.length
    };
    });
  } finally {
    if (!suppliedSession) await session.close();
  }
}

export async function persistChamberVote(parsed: ParsedChamberVote, suppliedSession?: DbSession) {
  const session = suppliedSession ?? createDbSession();
  try {
    return await session.db.transaction(async (db) => {
    await db.insert(schema.legislatures).values(legislatureForDate(parsed.vote.heldOn)).onConflictDoNothing();
    await upsertSourceSnapshot(db, parsed.sourceSnapshot);
    if (parsed.bill) {
      await ensurePlaceholderBill(db, {
        ...parsed.bill,
        sourceSnapshotIds: [parsed.sourceSnapshot.id]
      });
    }
    await insertMissingMembers(db, parsed.members);
    await upsertDerivedDeputiesMandates(db, parsed.members.map((member) => member.id), parsed.vote.heldOn);
    await upsertVote(db, parsed.vote);
    await upsertIndividualVotes(db, parsed.individualVotes);

    return {
      voteId: parsed.vote.id,
      sourceSnapshotId: parsed.sourceSnapshot.id,
      members: parsed.members.length,
      individualVotes: parsed.individualVotes.length,
      warnings: parsed.warnings
    };
    });
  } finally {
    if (!suppliedSession) await session.close();
  }
}

export async function persistRoster(parsed: ParsedRoster, suppliedSession?: DbSession) {
  const failures = parsed.sourceSnapshots.filter((source) => source.status === "failed");
  if (failures.length) throw new Error(`Roster contains ${failures.length} failed sources; refusing to replace existing member histories`);
  const session = suppliedSession ?? createDbSession();
  try {
    return await session.db.transaction(async (db) => {
    await upsertLegislature(db, parsed.legislature);
    await upsertSourceSnapshots(db, parsed.sourceSnapshots);
    await upsertParties(db, parsed.parties);
    await upsertGroups(db, parsed.groups);
    await upsertMembers(db, parsed.members);
    await upsertMemberMandates(db, parsed.mandates);
    const staleMandatesClosed = await closeStaleCurrentMandates(db, parsed);
    await deleteRosterMandateRelations(
      db,
      parsed.mandates.map((mandate) => mandate.id)
    );
    await upsertMemberMandateRelations(db, parsed.mandateRelations ?? []);
    await applyReplacementEndDates(db, parsed);
    await deleteRosterMemberDetails(
      db,
      parsed.members.map((member) => member.id)
    );
    await upsertMemberGroupMemberships(db, parsed.groupMemberships);
    await upsertMemberPartyAffiliations(db, parsed.partyAffiliations);
    await upsertMemberCommitteeMemberships(db, parsed.committeeMemberships);
    await upsertMemberRoles(db, parsed.roles);

    return {
      chamber: parsed.chamber,
      sources: parsed.sourceSnapshots.length,
      parties: parsed.parties.length,
      groups: parsed.groups.length,
      members: parsed.members.length,
      mandates: parsed.mandates.length,
      staleMandatesClosed,
      mandateRelations: parsed.mandateRelations?.length ?? 0,
      groupMemberships: parsed.groupMemberships.length,
      partyAffiliations: parsed.partyAffiliations.length,
      committeeMemberships: parsed.committeeMemberships.length,
      roles: parsed.roles.length,
      groupCounts: parsed.groupCounts
    };
    });
  } finally {
    if (!suppliedSession) await session.close();
  }
}

async function persistEach<T>(items: T[], task: (item: T) => Promise<void>) {
  for (const item of items) {
    await task(item);
  }
}

function chunks<T>(items: T[], size = 250): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

async function deleteRosterMemberDetails(db: Db, memberIds: string[]) {
  if (memberIds.length === 0) return;
  await db.delete(schema.memberGroupMemberships).where(inArray(schema.memberGroupMemberships.memberId, memberIds));
  await db.delete(schema.memberPartyAffiliations).where(inArray(schema.memberPartyAffiliations.memberId, memberIds));
  await db.delete(schema.memberCommitteeMemberships).where(inArray(schema.memberCommitteeMemberships.memberId, memberIds));
  await db.delete(schema.memberRoles).where(inArray(schema.memberRoles.memberId, memberIds));
}

async function deleteRosterMandateRelations(db: Db, mandateIds: string[]) {
  if (mandateIds.length === 0) return;
  await db.delete(schema.memberMandateRelations).where(inArray(schema.memberMandateRelations.mandateId, mandateIds));
}

async function closeStaleCurrentMandates(db: Db, parsed: ParsedRoster): Promise<number> {
  const completeRoster =
    parsed.groupCounts.length > 0 &&
    parsed.groupCounts.every((group) => group.expected > 0 && group.expected === group.parsed) &&
    parsed.groupCounts.reduce((total, group) => total + group.parsed, 0) === parsed.members.length;
  const snapshotOn = parsed.groupMemberships
    .flatMap((membership) => membership.currentSnapshotOn ? [membership.currentSnapshotOn] : [])
    .sort()
    .at(-1);
  if (!completeRoster || !snapshotOn || parsed.members.length === 0) return 0;

  const activeMemberIds = parsed.members.map((member) => member.id);
  const closed = await db
    .update(schema.memberMandates)
    .set({ endsOn: previousDay(snapshotOn), status: "ended" })
    .where(sql`
      ${schema.memberMandates.legislatureId} = ${parsed.legislature.id}
      and ${schema.memberMandates.chamber} = ${parsed.chamber}
      and ${schema.memberMandates.startsOn} <= ${snapshotOn}
      and (${schema.memberMandates.endsOn} is null or ${schema.memberMandates.endsOn} >= ${snapshotOn})
      and ${schema.memberMandates.memberId} not in (${sql.join(activeMemberIds.map((id) => sql`${id}`), sql`, `)})
    `)
    .returning({ id: schema.memberMandates.id });
  return closed.length;
}

function legislatureForDate(date: string) {
  const match = Object.values(legislatureCatalog).find((term) => date >= term.startsOn && (!term.endsOn || date < term.endsOn));
  if (!match) throw new Error(`No legislature covers vote date ${date}; import its context before persisting.`);
  return { ...match, endsOn: match.endsOn ?? "9999-12-31" };
}

async function upsertLegislature(db: Db, legislature: typeof defaultLegislature) {
  await db
    .insert(schema.legislatures)
    .values(legislature)
    .onConflictDoUpdate({
      target: schema.legislatures.id,
      set: legislature
    });
}

async function upsertSourceSnapshot(db: Db, source: SourceSnapshot) {
  await db
    .insert(schema.sourceSnapshots)
    .values({
      id: source.id,
      sourceUrl: source.sourceUrl,
      fetchedAt: new Date(source.fetchedAt),
      contentHash: source.contentHash,
      parser: source.parser,
      parserVersion: source.parserVersion,
      status: source.status,
      notes: source.notes
    })
    .onConflictDoUpdate({
      target: schema.sourceSnapshots.id,
      set: {
        sourceUrl: source.sourceUrl,
        fetchedAt: new Date(source.fetchedAt),
        contentHash: source.contentHash,
        parser: source.parser,
        parserVersion: source.parserVersion,
        status: source.status,
        notes: source.notes
      }
    });
}

async function upsertSourceSnapshots(db: Db, sources: SourceSnapshot[]) {
  if (sources.length === 0) return;
  for (const batch of chunks(sources)) {
    await db
      .insert(schema.sourceSnapshots)
      .values(
        batch.map((source) => ({
          id: source.id,
          sourceUrl: source.sourceUrl,
          fetchedAt: new Date(source.fetchedAt),
          contentHash: source.contentHash,
          parser: source.parser,
          parserVersion: source.parserVersion,
          status: source.status,
          notes: source.notes
        }))
      )
      .onConflictDoUpdate({
        target: schema.sourceSnapshots.id,
        set: {
          sourceUrl: sql`excluded.source_url`,
          fetchedAt: sql`excluded.fetched_at`,
          contentHash: sql`excluded.content_hash`,
          parser: sql`excluded.parser`,
          parserVersion: sql`excluded.parser_version`,
          status: sql`excluded.status`,
          notes: sql`excluded.notes`
        }
      });
  }
}

async function upsertGroup(db: Db, group: ParliamentaryGroup) {
  await db
    .insert(schema.parliamentaryGroups)
    .values(group)
    .onConflictDoUpdate({
      target: schema.parliamentaryGroups.id,
      set: {
        partyId: group.partyId,
        chamber: group.chamber,
        shortName: group.shortName,
        name: group.name,
        color: group.color
      }
    });
}

async function upsertGroups(db: Db, groups: ParliamentaryGroup[]) {
  if (groups.length === 0) return;
  for (const batch of chunks(groups)) {
    await db
      .insert(schema.parliamentaryGroups)
      .values(batch)
      .onConflictDoUpdate({
        target: schema.parliamentaryGroups.id,
        set: {
          partyId: sql`excluded.party_id`,
          chamber: sql`excluded.chamber`,
          shortName: sql`excluded.short_name`,
          name: sql`excluded.name`,
          color: sql`excluded.color`
        }
      });
  }
}

async function upsertParty(db: Db, party: Party) {
  await db
    .insert(schema.parties)
    .values(party)
    .onConflictDoUpdate({
      target: schema.parties.id,
      set: {
        slug: party.slug,
        shortName: party.shortName,
        name: party.name,
        color: party.color
      }
    });
}

async function upsertParties(db: Db, parties: Party[]) {
  if (parties.length === 0) return;
  for (const batch of chunks(parties)) {
    await db
      .insert(schema.parties)
      .values(batch)
      .onConflictDoUpdate({
        target: schema.parties.id,
        set: {
          slug: sql`excluded.slug`,
          shortName: sql`excluded.short_name`,
          name: sql`excluded.name`,
          color: sql`excluded.color`
        }
      });
  }
}

async function upsertMember(db: Db, member: Member) {
  const slugOwner = await db.select({ id: schema.members.id }).from(schema.members).where(eq(schema.members.slug, member.slug)).limit(1);
  const slug = slugOwner[0] && slugOwner[0].id !== member.id ? `${member.slug}-${member.id.replace(/^member-/, "")}` : member.slug;
  try {
    await upsertMemberWithSlug(db, member, slug);
  } catch (error) {
    if (!isMemberSlugUniqueViolation(error) || slug !== member.slug) {
      throw error;
    }
    await upsertMemberWithSlug(db, member, `${member.slug}-${member.id.replace(/^member-/, "")}`);
  }
}

async function upsertMemberWithSlug(db: Db, member: Member, slug: string) {
  await db
    .insert(schema.members)
    .values({ ...member, slug })
    .onConflictDoUpdate({
      target: schema.members.id,
      set: {
        personId: member.personId,
        slug,
        firstName: member.firstName,
        lastName: member.lastName,
        displayName: member.displayName,
        sourceIds: member.sourceIds
      }
    });
}

function isMemberSlugUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "constraint_name" in error &&
    error.code === "23505" &&
    error.constraint_name === "members_slug_idx"
  );
}

async function upsertMembers(db: Db, members: Member[]) {
  if (members.length === 0) return;
  // A roster refresh is not an identity migration. Preserve enriched identity,
  // stable public slugs and source keys for existing members.
  const known = await db.select().from(schema.members).where(inArray(schema.members.id, members.map((member) => member.id)));
  const byId = new Map(known.map((member) => [member.id, member]));
  members = members.map((member) => {
    const previous = byId.get(member.id);
    return previous ? { ...member, personId: previous.personId ?? member.personId,
      slug: previous.slug, firstName: previous.firstName, lastName: previous.lastName,
      displayName: previous.displayName, sourceIds: { ...member.sourceIds, ...previous.sourceIds } } : member;
  });
  const slugs = uniqueStrings(members.map((member) => member.slug));
  const existingRows =
    slugs.length > 0
      ? await db.select({ id: schema.members.id, slug: schema.members.slug }).from(schema.members).where(inArray(schema.members.slug, slugs))
      : [];
  const slugOwner = new Map(existingRows.map((row) => [row.slug, row.id]));
  const seenSlugs = new Set<string>();
  const values = members.map((member) => {
    let slug = member.slug;
    if ((slugOwner.has(slug) && slugOwner.get(slug) !== member.id) || seenSlugs.has(slug)) {
      slug = `${member.slug}-${member.id.replace(/^member-/, "")}`;
    }
    seenSlugs.add(slug);
    return { ...member, slug };
  });

  for (const batch of chunks(values)) {
    await db
      .insert(schema.members)
      .values(batch)
      .onConflictDoUpdate({
        target: schema.members.id,
        set: {
          personId: sql`excluded.person_id`,
          slug: sql`excluded.slug`,
          firstName: sql`excluded.first_name`,
          lastName: sql`excluded.last_name`,
          displayName: sql`excluded.display_name`,
          sourceIds: sql`excluded.source_ids`
        }
      });
  }
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

async function insertMissingMembers(db: Db, members: Member[]) {
  if (members.length === 0) return;
  for (const member of members) {
    await insertMissingMember(db, member);
  }
}

async function insertMissingMember(db: Db, member: Member) {
  const slugOwner = await db.select({ id: schema.members.id }).from(schema.members).where(eq(schema.members.slug, member.slug)).limit(1);
  const slug = slugOwner[0] && slugOwner[0].id !== member.id ? `${member.slug}-${member.id.replace(/^member-/, "")}` : member.slug;
  await db
    .insert(schema.members)
    .values({ ...member, slug })
    .onConflictDoNothing({
      target: schema.members.id
    });
}

export async function backfillPeopleFromMembers() {
  const session = createDbSession();
  try {
    const memberRows = await session.db.select().from(schema.members);
    const peopleById = new Map<
      string,
      {
        id: string;
        slug: string;
        displayName: string;
        normalizedName: string;
        sourceIds: Record<string, string>;
      }
    >();

    for (const member of memberRows) {
      const normalizedName = normalizePersonName(member.displayName);
      if (!normalizedName) continue;
      const id = `person-${normalizedName}`;
      const existing = peopleById.get(id);
      peopleById.set(id, {
        id,
        slug: id.replace(/^person-/, ""),
        displayName: existing?.displayName ?? member.displayName,
        normalizedName,
        sourceIds: {
          ...(existing?.sourceIds ?? {}),
          ...personSourceIds(member.id, member.sourceIds)
        }
      });
    }

    const people = [...peopleById.values()];
    for (const batch of chunks(people)) {
      await session.db
        .insert(schema.people)
        .values(batch)
        .onConflictDoUpdate({
          target: schema.people.id,
          set: {
            slug: sql`excluded.slug`,
            displayName: sql`excluded.display_name`,
            normalizedName: sql`excluded.normalized_name`,
            sourceIds: sql`excluded.source_ids`
          }
        });
    }

    let linkedMembers = 0;
    const memberLinks = memberRows.flatMap((member) => {
      const normalizedName = normalizePersonName(member.displayName);
      return normalizedName ? [{ id: member.id, personId: `person-${normalizedName}` }] : [];
    });
    for (const batch of chunks(memberLinks)) {
      const values = sql.join(batch.map((member) => sql`(${member.id}, ${member.personId})`), sql`,`);
      await session.db.execute(sql`
        update ${schema.members} as m
        set person_id = v.person_id
        from (values ${values}) as v(id, person_id)
        where m.id = v.id
      `);
      linkedMembers += batch.length;
    }

    return {
      membersRead: memberRows.length,
      peopleUpserted: people.length,
      membersLinked: linkedMembers
    };
  } finally {
    await session.close();
  }
}

export async function persistGovernmentSkeleton(input: {
  sourceSnapshots?: SourceSnapshot[];
  people: Person[];
  governments: Government[];
  roles: GovernmentRole[];
  events: CompositionEvent[];
  partyAlignments?: GovernmentPartyAlignment[];
  obsoleteGovernmentIds?: string[];
  obsoleteEventIds?: string[];
}) {
  const session = createDbSession();
  try {
    await deleteObsoleteGovernments(session.db, input.obsoleteGovernmentIds ?? []);
    if (input.obsoleteEventIds?.length) {
      await session.db.delete(schema.compositionEvents).where(inArray(schema.compositionEvents.id, input.obsoleteEventIds));
    }
    await upsertSourceSnapshots(session.db, input.sourceSnapshots ?? []);
    await Promise.all(input.people.map((person) => upsertPerson(session.db, person)));
    await Promise.all(input.governments.map((government) => upsertGovernment(session.db, government)));
    await Promise.all(input.roles.map((role) => upsertGovernmentRole(session.db, role)));
    await Promise.all(input.events.map((event) => upsertCompositionEvent(session.db, event)));
    const partyAlignments = await filterExistingPartyAlignments(session.db, input.partyAlignments ?? []);
    await Promise.all(partyAlignments.map((alignment) => upsertGovernmentPartyAlignment(session.db, alignment)));
    return {
      sourceSnapshots: input.sourceSnapshots?.length ?? 0,
      people: input.people.length,
      governments: input.governments.length,
      roles: input.roles.length,
      events: input.events.length,
      partyAlignments: partyAlignments.length,
      skippedPartyAlignments: (input.partyAlignments ?? []).length - partyAlignments.length,
      obsoleteGovernmentsDeleted: input.obsoleteGovernmentIds?.length ?? 0,
      obsoleteEventsDeleted: input.obsoleteEventIds?.length ?? 0
    };
  } finally {
    await session.close();
  }
}

async function upsertPerson(db: Db, person: Person) {
  await db
    .insert(schema.people)
    .values({
      id: person.id,
      slug: person.slug,
      displayName: person.displayName,
      normalizedName: person.normalizedName,
      birthDate: person.birthDate,
      sourceIds: person.sourceIds
    })
    .onConflictDoUpdate({
      target: schema.people.id,
      set: {
        slug: person.slug,
        displayName: person.displayName,
        normalizedName: person.normalizedName,
        birthDate: person.birthDate,
        sourceIds: person.sourceIds
      }
    });
}

async function upsertGovernment(db: Db, government: Government) {
  await db
    .insert(schema.governments)
    .values({
      id: government.id,
      slug: government.slug,
      name: government.name,
      legislatureId: government.legislatureId,
      primeMinisterPersonId: government.primeMinisterPersonId,
      startsOn: government.startsOn,
      endsOn: government.endsOn ?? null,
      basis: government.basis,
      investitureVoteId: government.investitureVoteId,
      sourceSnapshotId: government.sourceSnapshotId
    })
    .onConflictDoUpdate({
      target: schema.governments.id,
      set: {
        slug: government.slug,
        name: government.name,
        legislatureId: government.legislatureId,
        primeMinisterPersonId: government.primeMinisterPersonId,
        startsOn: government.startsOn,
        endsOn: government.endsOn ?? null,
        basis: government.basis,
        investitureVoteId: government.investitureVoteId,
        sourceSnapshotId: government.sourceSnapshotId
      }
    });
}

async function upsertGovernmentRole(db: Db, role: GovernmentRole) {
  await db
    .insert(schema.governmentRoles)
    .values({
      id: role.id,
      governmentId: role.governmentId,
      personId: role.personId,
      title: role.title,
      ministry: role.ministry,
      startsOn: role.startsOn,
      endsOn: role.endsOn ?? null,
      sourceSnapshotId: role.sourceSnapshotId
    })
    .onConflictDoUpdate({
      target: schema.governmentRoles.id,
      set: {
        governmentId: role.governmentId,
        personId: role.personId,
        title: role.title,
        ministry: role.ministry,
        startsOn: role.startsOn,
        endsOn: role.endsOn ?? null,
        sourceSnapshotId: role.sourceSnapshotId
      }
    });
}

async function upsertCompositionEvent(db: Db, event: CompositionEvent) {
  await db
    .insert(schema.compositionEvents)
    .values({
      id: event.id,
      eventType: event.eventType,
      title: event.title,
      description: event.description,
      occurredOn: event.occurredOn,
      endsOn: event.endsOn ?? null,
      legislatureId: event.legislatureId,
      governmentId: event.governmentId,
      chamber: event.chamber,
      memberId: event.memberId,
      personId: event.personId,
      partyId: event.partyId,
      groupId: event.groupId,
      sourceSnapshotId: event.sourceSnapshotId
    })
    .onConflictDoUpdate({
      target: schema.compositionEvents.id,
      set: {
        eventType: event.eventType,
        title: event.title,
        description: event.description,
        occurredOn: event.occurredOn,
        endsOn: event.endsOn ?? null,
        legislatureId: event.legislatureId,
        governmentId: event.governmentId,
        chamber: event.chamber,
        memberId: event.memberId,
        personId: event.personId,
        partyId: event.partyId,
        groupId: event.groupId,
        sourceSnapshotId: event.sourceSnapshotId
      }
    });
}

async function filterExistingPartyAlignments(db: Db, alignments: GovernmentPartyAlignment[]): Promise<GovernmentPartyAlignment[]> {
  const partyIds = [...new Set(alignments.map((alignment) => alignment.partyId))];
  if (partyIds.length === 0) return [];
  const rows = await db.select({ id: schema.parties.id }).from(schema.parties).where(inArray(schema.parties.id, partyIds));
  const existingPartyIds = new Set(rows.map((row) => row.id));
  return alignments.filter((alignment) => existingPartyIds.has(alignment.partyId));
}

async function deleteObsoleteGovernments(db: Db, governmentIds: string[]) {
  if (governmentIds.length === 0) return;
  await db.delete(schema.governmentPartyAlignments).where(inArray(schema.governmentPartyAlignments.governmentId, governmentIds));
  await db.delete(schema.governmentGroupAlignments).where(inArray(schema.governmentGroupAlignments.governmentId, governmentIds));
  await db.delete(schema.memberGovernanceAlignments).where(inArray(schema.memberGovernanceAlignments.governmentId, governmentIds));
  await db.delete(schema.compositionEvents).where(inArray(schema.compositionEvents.governmentId, governmentIds));
  await db.delete(schema.governmentRoles).where(inArray(schema.governmentRoles.governmentId, governmentIds));
  await db.delete(schema.governments).where(inArray(schema.governments.id, governmentIds));
}

async function upsertGovernmentPartyAlignment(db: Db, alignment: GovernmentPartyAlignment) {
  await db
    .insert(schema.governmentPartyAlignments)
    .values({
      id: alignment.id,
      governmentId: alignment.governmentId,
      partyId: alignment.partyId,
      alignment: alignment.alignment,
      basis: alignment.basis,
      startsOn: alignment.startsOn,
      endsOn: alignment.endsOn ?? null,
      sourceSnapshotId: alignment.sourceSnapshotId
    })
    .onConflictDoUpdate({
      target: schema.governmentPartyAlignments.id,
      set: {
        governmentId: alignment.governmentId,
        partyId: alignment.partyId,
        alignment: alignment.alignment,
        basis: alignment.basis,
        startsOn: alignment.startsOn,
        endsOn: alignment.endsOn ?? null,
        sourceSnapshotId: alignment.sourceSnapshotId
      }
    });
}

function normalizePersonName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function personSourceIds(memberId: string, sourceIds: Record<string, string>): Record<string, string> {
  const ids: Record<string, string> = { [`member:${memberId}`]: memberId };
  for (const [key, value] of Object.entries(sourceIds)) {
    ids[`member:${memberId}:${key}`] = value;
  }
  return ids;
}

async function upsertMemberMandate(db: Db, mandate: MemberMandate) {
  await db
    .insert(schema.memberMandates)
    .values(mandate)
    .onConflictDoUpdate({
      target: schema.memberMandates.id,
      set: {
        memberId: mandate.memberId,
        legislatureId: mandate.legislatureId,
        chamber: mandate.chamber,
        startsOn: mandate.startsOn,
        endsOn: mandate.endsOn,
        constituency: mandate.constituency,
        status: mandate.status,
        sourceSnapshotId: mandate.sourceSnapshotId
      }
    });
}

async function upsertMemberMandates(db: Db, mandates: MemberMandate[]) {
  if (mandates.length === 0) return;
  for (const batch of chunks(mandates)) {
    await db
      .insert(schema.memberMandates)
      .values(batch)
      .onConflictDoUpdate({
        target: schema.memberMandates.id,
        set: {
          memberId: sql`excluded.member_id`,
          legislatureId: sql`excluded.legislature_id`,
          chamber: sql`excluded.chamber`,
          startsOn: sql`excluded.starts_on`,
          endsOn: sql`excluded.ends_on`,
          constituency: sql`excluded.constituency`,
          status: sql`excluded.status`,
          sourceSnapshotId: sql`excluded.source_snapshot_id`
        }
      });
  }
}

async function upsertMemberMandateRelation(db: Db, relation: MemberMandateRelation) {
  const relatedMemberId = relation.relatedMemberId && (await memberExists(db, relation.relatedMemberId)) ? relation.relatedMemberId : undefined;
  await db
    .insert(schema.memberMandateRelations)
    .values({ ...relation, relatedMemberId })
    .onConflictDoUpdate({
      target: schema.memberMandateRelations.id,
      set: {
        mandateId: relation.mandateId,
        relation: relation.relation,
        relatedMemberId,
        relatedName: relation.relatedName,
        relatedOfficialUrl: relation.relatedOfficialUrl,
        sourceSnapshotId: relation.sourceSnapshotId
      }
    });
}

async function upsertMemberMandateRelations(db: Db, relations: MemberMandateRelation[]) {
  if (relations.length === 0) return;
  for (const batch of chunks(relations)) {
    await db
      .insert(schema.memberMandateRelations)
      .values(batch)
      .onConflictDoUpdate({
        target: schema.memberMandateRelations.id,
        set: {
          mandateId: sql`excluded.mandate_id`,
          relation: sql`excluded.relation`,
          relatedMemberId: sql`excluded.related_member_id`,
          relatedName: sql`excluded.related_name`,
          relatedOfficialUrl: sql`excluded.related_official_url`,
          sourceSnapshotId: sql`excluded.source_snapshot_id`
        }
      });
  }
}

async function memberExists(db: Db, memberId: string): Promise<boolean> {
  const rows = await db.select({ id: schema.members.id }).from(schema.members).where(eq(schema.members.id, memberId)).limit(1);
  return rows.length > 0;
}

async function applyReplacementEndDates(db: Db, parsed: ParsedRoster) {
  const mandateById = new Map(parsed.mandates.map((mandate) => [mandate.id, mandate]));
  for (const relation of parsed.mandateRelations ?? []) {
    if (relation.relation !== "replaces" || !relation.relatedMemberId) continue;
    const mandate = mandateById.get(relation.mandateId);
    if (!mandate) continue;
    const inferredEnd = previousDay(mandate.startsOn);
    await db
      .update(schema.memberMandates)
      .set({ endsOn: inferredEnd, status: "ended" })
      .where(sql`
        ${schema.memberMandates.memberId} = ${relation.relatedMemberId}
        and ${schema.memberMandates.legislatureId} = ${mandate.legislatureId}
        and ${schema.memberMandates.chamber} = ${mandate.chamber}
        and ${schema.memberMandates.startsOn} < ${mandate.startsOn}
        and (${schema.memberMandates.endsOn} is null or ${schema.memberMandates.endsOn} > ${inferredEnd})
      `);
  }
}

function previousDay(date: string): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

async function upsertMemberGroupMembership(db: Db, membership: MemberGroupMembership) {
  await db
    .insert(schema.memberGroupMemberships)
    .values(membership)
    .onConflictDoUpdate({
      target: schema.memberGroupMemberships.id,
      set: {
        memberId: membership.memberId,
        groupId: membership.groupId,
        startsOn: membership.startsOn,
        endsOn: membership.endsOn,
        currentSnapshotOn: membership.currentSnapshotOn,
        logoUrl: membership.logoUrl,
        sourceSnapshotId: membership.sourceSnapshotId
      }
    });
}

async function upsertMemberGroupMemberships(db: Db, memberships: MemberGroupMembership[]) {
  if (memberships.length === 0) return;
  for (const batch of chunks(memberships)) {
    await db
      .insert(schema.memberGroupMemberships)
      .values(batch)
      .onConflictDoUpdate({
        target: schema.memberGroupMemberships.id,
        set: {
          memberId: sql`excluded.member_id`,
          groupId: sql`excluded.group_id`,
          startsOn: sql`excluded.starts_on`,
          endsOn: sql`excluded.ends_on`,
          currentSnapshotOn: sql`excluded.current_snapshot_on`,
          logoUrl: sql`excluded.logo_url`,
          sourceSnapshotId: sql`excluded.source_snapshot_id`
        }
      });
  }
}

async function upsertMemberPartyAffiliation(db: Db, affiliation: MemberPartyAffiliation) {
  await db
    .insert(schema.memberPartyAffiliations)
    .values(affiliation)
    .onConflictDoUpdate({
      target: schema.memberPartyAffiliations.id,
      set: {
        memberId: affiliation.memberId,
        partyId: affiliation.partyId,
        startsOn: affiliation.startsOn,
        endsOn: affiliation.endsOn,
        logoUrl: affiliation.logoUrl,
        sourceSnapshotId: affiliation.sourceSnapshotId
      }
    });
}

async function upsertMemberPartyAffiliations(db: Db, affiliations: MemberPartyAffiliation[]) {
  if (affiliations.length === 0) return;
  for (const batch of chunks(affiliations)) {
    await db
      .insert(schema.memberPartyAffiliations)
      .values(batch)
      .onConflictDoUpdate({
        target: schema.memberPartyAffiliations.id,
        set: {
          memberId: sql`excluded.member_id`,
          partyId: sql`excluded.party_id`,
          startsOn: sql`excluded.starts_on`,
          endsOn: sql`excluded.ends_on`,
          logoUrl: sql`excluded.logo_url`,
          sourceSnapshotId: sql`excluded.source_snapshot_id`
        }
      });
  }
}

async function upsertMemberCommitteeMembership(db: Db, membership: MemberCommitteeMembership) {
  await db
    .insert(schema.memberCommitteeMemberships)
    .values(membership)
    .onConflictDoUpdate({
      target: schema.memberCommitteeMemberships.id,
      set: {
        memberId: membership.memberId,
        committeeName: membership.committeeName,
        chamber: membership.chamber,
        role: membership.role,
        startsOn: membership.startsOn,
        endsOn: membership.endsOn,
        sourceSnapshotId: membership.sourceSnapshotId
      }
    });
}

async function upsertMemberCommitteeMemberships(db: Db, memberships: MemberCommitteeMembership[]) {
  if (memberships.length === 0) return;
  for (const batch of chunks(memberships)) {
    await db
      .insert(schema.memberCommitteeMemberships)
      .values(batch)
      .onConflictDoUpdate({
        target: schema.memberCommitteeMemberships.id,
        set: {
          memberId: sql`excluded.member_id`,
          committeeName: sql`excluded.committee_name`,
          chamber: sql`excluded.chamber`,
          role: sql`excluded.role`,
          startsOn: sql`excluded.starts_on`,
          endsOn: sql`excluded.ends_on`,
          sourceSnapshotId: sql`excluded.source_snapshot_id`
        }
      });
  }
}

async function upsertMemberRole(db: Db, role: MemberRole) {
  await db
    .insert(schema.memberRoles)
    .values(role)
    .onConflictDoUpdate({
      target: schema.memberRoles.id,
      set: {
        memberId: role.memberId,
        title: role.title,
        chamber: role.chamber,
        startsOn: role.startsOn,
        endsOn: role.endsOn,
        sourceSnapshotId: role.sourceSnapshotId
      }
    });
}

async function upsertMemberRoles(db: Db, roles: MemberRole[]) {
  if (roles.length === 0) return;
  for (const batch of chunks(roles)) {
    await db
      .insert(schema.memberRoles)
      .values(batch)
      .onConflictDoUpdate({
        target: schema.memberRoles.id,
        set: {
          memberId: sql`excluded.member_id`,
          title: sql`excluded.title`,
          chamber: sql`excluded.chamber`,
          startsOn: sql`excluded.starts_on`,
          endsOn: sql`excluded.ends_on`,
          sourceSnapshotId: sql`excluded.source_snapshot_id`
        }
      });
  }
}

async function upsertBill(db: Db, bill: Bill) {
  await db
    .insert(schema.bills)
    .values({
      id: bill.id,
      slug: bill.slug,
      title: bill.title,
      identifiers: bill.identifiers,
      chamberOfOrigin: bill.chamberOfOrigin,
      decisionChamber: bill.decisionChamber,
      status: bill.status,
      sourceSnapshotIds: bill.sourceSnapshotIds
    })
    .onConflictDoUpdate({
      target: schema.bills.id,
      set: {
        slug: bill.slug,
        title: bill.title,
        identifiers: bill.identifiers,
        chamberOfOrigin: bill.chamberOfOrigin,
        decisionChamber: bill.decisionChamber,
        status: bill.status,
        sourceSnapshotIds: bill.sourceSnapshotIds
      }
    });
}

async function ensurePlaceholderBill(db: Db, bill: Bill) {
  await db
    .insert(schema.bills)
    .values({
      id: bill.id,
      slug: bill.slug,
      title: bill.title,
      identifiers: bill.identifiers,
      chamberOfOrigin: bill.chamberOfOrigin,
      decisionChamber: bill.decisionChamber,
      status: bill.status,
      sourceSnapshotIds: bill.sourceSnapshotIds
    })
    .onConflictDoNothing({
      target: schema.bills.id
    });
}

async function upsertBillEvent(db: Db, event: BillEvent) {
  await db
    .insert(schema.billEvents)
    .values(event)
    .onConflictDoUpdate({
      target: schema.billEvents.id,
      set: {
        billId: event.billId,
        occurredOn: event.occurredOn,
        chamber: event.chamber,
        label: event.label,
        sourceUrl: event.sourceUrl
      }
    });
}

async function upsertBillProcedureSteps(db: Db, steps: BillProcedureStep[]) {
  if (steps.length === 0) return;
  for (const batch of chunks(steps)) {
    await db
      .insert(schema.billProcedureSteps)
      .values(
        batch.map((step) => ({
          id: step.id,
          billId: step.billId,
          occurredOn: step.occurredOn,
          chamber: step.chamber,
          stepType: step.stepType,
          title: step.title,
          description: step.description,
          committeeName: step.committeeName,
          documentId: step.documentId,
          sourceUrl: step.sourceUrl,
          displayOrder: step.displayOrder
        }))
      )
      .onConflictDoUpdate({
        target: schema.billProcedureSteps.id,
        set: {
          billId: sql`excluded.bill_id`,
          occurredOn: sql`excluded.occurred_on`,
          chamber: sql`excluded.chamber`,
          stepType: sql`excluded.step_type`,
          title: sql`excluded.title`,
          description: sql`excluded.description`,
          committeeName: sql`excluded.committee_name`,
          documentId: sql`excluded.document_id`,
          sourceUrl: sql`excluded.source_url`,
          displayOrder: sql`excluded.display_order`
        }
      });
  }
}

async function upsertBillSponsor(db: Db, sponsor: BillSponsor) {
  await db
    .insert(schema.billSponsors)
    .values(sponsor)
    .onConflictDoUpdate({
      target: schema.billSponsors.id,
      set: {
        billId: sponsor.billId,
        sponsorType: sponsor.sponsorType,
        memberId: sponsor.memberId,
        name: sponsor.name
      }
    });
}

async function upsertDocument(db: Db, document: DocumentSource) {
  await db
    .insert(schema.documents)
    .values({
      id: document.id,
      billId: document.billId,
      label: document.label,
      url: document.url,
      documentKind: document.documentKind,
      sourceChamber: document.sourceChamber,
      officialUrlHash: document.officialUrlHash,
      textAssetId: document.textAssetId,
      textStatus: document.textStatus,
      textPreview: document.textPreview,
      lastTextAttemptAt: document.lastTextAttemptAt ? new Date(document.lastTextAttemptAt) : undefined
    })
    .onConflictDoUpdate({
      target: schema.documents.id,
      set: {
        billId: document.billId,
        label: document.label,
        url: document.url,
        documentKind: document.documentKind,
        sourceChamber: document.sourceChamber,
        officialUrlHash: document.officialUrlHash
      }
    });
}

export async function replaceBillDocumentTextChunks(documentId: string, billId: string, chunks: BillDocumentTextChunk[]) {
  const session = createDbSession();
  try {
    await session.db.delete(schema.billDocumentTextChunks).where(eq(schema.billDocumentTextChunks.documentId, documentId));
    if (chunks.length > 0) {
      await session.db.insert(schema.billDocumentTextChunks).values(
        chunks.map((chunk) => ({
          id: chunk.id,
          documentId,
          billId,
          chunkIndex: chunk.chunkIndex,
          text: chunk.text
        }))
      );
    }
  } finally {
    await session.close();
  }
}

async function upsertVote(db: Db, vote: Vote) {
  const classification = classifyVote({
    title: vote.title,
    voteType: vote.voteType,
    billId: vote.billId,
    chamber: vote.chamber
  });
  const classifiedAt = new Date();
  await db
    .insert(schema.votes)
    .values({
      id: vote.id,
      billId: vote.billId,
      chamber: vote.chamber,
      title: vote.title,
      heldOn: vote.heldOn,
      voteType: vote.voteType,
      motionKind: classification.motionKind,
      prominence: classification.prominence,
      yesMeaning: classification.yesMeaning,
      classificationConfidence: classification.confidence,
      classificationBasis: classification.basis,
      classificationVersion: classification.version,
      classificationReason: classification.reason,
      classifiedAt,
      present: vote.totals.present,
      forCount: vote.totals.for,
      against: vote.totals.against,
      abstention: vote.totals.abstention,
      presentNotVoting: vote.totals.presentNotVoting,
      absent: vote.totals.absent,
      sourceSnapshotId: vote.sourceSnapshotId
    })
    .onConflictDoUpdate({
      target: schema.votes.id,
      set: {
        billId: vote.billId,
        chamber: vote.chamber,
        title: vote.title,
        heldOn: vote.heldOn,
        voteType: vote.voteType,
        motionKind: sql`case when ${schema.votes.classificationBasis} = 'manual_review' then ${schema.votes.motionKind} else excluded.motion_kind end`,
        prominence: sql`case when ${schema.votes.classificationBasis} = 'manual_review' then ${schema.votes.prominence} else excluded.prominence end`,
        yesMeaning: sql`case when ${schema.votes.classificationBasis} = 'manual_review' then ${schema.votes.yesMeaning} else excluded.yes_meaning end`,
        classificationConfidence: sql`case when ${schema.votes.classificationBasis} = 'manual_review' then ${schema.votes.classificationConfidence} else excluded.classification_confidence end`,
        classificationBasis: sql`case when ${schema.votes.classificationBasis} = 'manual_review' then ${schema.votes.classificationBasis} else excluded.classification_basis end`,
        classificationVersion: sql`case when ${schema.votes.classificationBasis} = 'manual_review' then ${schema.votes.classificationVersion} else excluded.classification_version end`,
        classificationReason: sql`case when ${schema.votes.classificationBasis} = 'manual_review' then ${schema.votes.classificationReason} else excluded.classification_reason end`,
        classifiedAt: sql`case when ${schema.votes.classificationBasis} = 'manual_review' then ${schema.votes.classifiedAt} else excluded.classified_at end`,
        present: vote.totals.present,
        forCount: vote.totals.for,
        against: vote.totals.against,
        abstention: vote.totals.abstention,
        presentNotVoting: vote.totals.presentNotVoting,
        absent: vote.totals.absent,
        sourceSnapshotId: vote.sourceSnapshotId
      }
    });
}

async function upsertGroupVoteTotal(db: Db, total: GroupVoteTotal) {
  await db
    .insert(schema.groupVoteTotals)
    .values({
      id: total.id,
      voteId: total.voteId,
      groupId: total.groupId,
      forCount: total.for,
      against: total.against,
      abstention: total.abstention,
      presentNotVoting: total.presentNotVoting
    })
    .onConflictDoUpdate({
      target: schema.groupVoteTotals.id,
      set: {
        voteId: total.voteId,
        groupId: total.groupId,
        forCount: total.for,
        against: total.against,
        abstention: total.abstention,
        presentNotVoting: total.presentNotVoting
      }
    });
}

async function upsertIndividualVote(db: Db, vote: IndividualVote) {
  await db
    .insert(schema.individualVotes)
    .values(vote)
    .onConflictDoUpdate({
      target: schema.individualVotes.id,
      set: {
        voteId: vote.voteId,
        memberId: vote.memberId,
        groupId: vote.groupId,
        choice: vote.choice,
        voteMethod: vote.voteMethod
      }
    });
}

async function upsertIndividualVotes(db: Db, votes: IndividualVote[]) {
  if (votes.length === 0) return;
  await db
    .insert(schema.individualVotes)
    .values(votes)
    .onConflictDoUpdate({
      target: schema.individualVotes.id,
      set: {
        voteId: sql`excluded.vote_id`,
        memberId: sql`excluded.member_id`,
        groupId: sql`excluded.group_id`,
        choice: sql`excluded.choice`,
        voteMethod: sql`excluded.vote_method`
      }
    });
}

async function upsertDerivedMandateAndMembership(db: Db, vote: IndividualVote, parsed: ParsedSenateVote) {
  if (!vote.groupId) return;
  const startsOn = parsed.vote.heldOn;
  const legislature = legislatureForDate(startsOn);
  await db
    .insert(schema.memberMandates)
    .values({
      id: `mandate-${vote.memberId}-${legislature.label}-senate`,
      memberId: vote.memberId,
      legislatureId: legislature.id,
      chamber: "senate",
      startsOn: legislature.startsOn,
      status: "active"
    })
    .onConflictDoNothing();

  const membershipId = `group-membership-${vote.memberId}-${vote.groupId}`;
  const existing = await db
    .select({ id: schema.memberGroupMemberships.id })
    .from(schema.memberGroupMemberships)
    .where(eq(schema.memberGroupMemberships.id, membershipId))
    .limit(1);
  if (existing.length > 0) return;

  await db.insert(schema.memberGroupMemberships).values({
    id: membershipId,
    memberId: vote.memberId,
    groupId: vote.groupId,
    startsOn,
    sourceSnapshotId: parsed.sourceSnapshot.id
  });
}

async function upsertDerivedDeputiesMandates(db: Db, memberIds: string[], heldOn: string) {
  const legislature = legislatureForDate(heldOn);
  const uniqueMemberIds = [...new Set(memberIds)];
  if (uniqueMemberIds.length === 0) return;
  await db
    .insert(schema.memberMandates)
    .values(
      uniqueMemberIds.map((memberId) => ({
        id: `mandate-${memberId}-${legislature.label}-deputies`,
        memberId,
        legislatureId: legislature.id,
        chamber: "deputies" as const,
        startsOn: legislature.startsOn,
        status: "active" as const
      }))
    )
    .onConflictDoNothing();
}
