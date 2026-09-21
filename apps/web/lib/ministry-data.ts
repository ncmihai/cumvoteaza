import { unstable_cache } from "next/cache";
import { eq } from "drizzle-orm";
import * as schema from "@cumsevoteaza/db";
import { createWebDbSession } from "./server-db";

export interface MinistryTermView {
  id: string;
  person: { id: string; displayName: string };
  member?: { slug: string };
  government: { id: string; slug: string; name: string };
  title: string;
  startsOn: string;
  endsOn?: string;
  interim: boolean;
  sourceUrl?: string;
}

export interface MinistryView {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  descriptionRo: string;
  descriptionEn: string;
  aliases: string[];
  terms: MinistryTermView[];
  current?: MinistryTermView;
  legislation: Array<{
    bill: { id: string; slug: string; title: string; identifier: string; status: string };
    relation: string;
    confidence: string;
    reason: string;
    sourceUrl?: string;
    evidenceExcerpt?: string;
    votes: Array<{ id: string; title: string; heldOn: string; prominence: string }>;
  }>;
}

const getCachedMinistries = unstable_cache(loadMinistries, ["ministry-directory-v2"], { revalidate: 3600 });

export async function getMinistries(): Promise<MinistryView[]> {
  return getCachedMinistries();
}

export async function getMinistry(slug: string): Promise<MinistryView | undefined> {
  const session = createWebDbSession();
  try {
    const ministry = await session.db.select().from(schema.ministries).where(eq(schema.ministries.slug, slug)).limit(1);
    if (!ministry[0]) return undefined;
    return (await assembleMinistries(session, ministry))[0];
  } finally {
    await session.close();
  }
}

export async function getGovernmentRolesForPerson(personId?: string): Promise<Array<MinistryTermView & { ministry?: { slug: string; name: string } }>> {
  if (!personId || !process.env.DATABASE_URL) return [];
  const session = createWebDbSession();
  try {
    const [roles, people, governments, ministries, members, sources] = await Promise.all([
      session.db.select().from(schema.governmentRoles).where(eq(schema.governmentRoles.personId, personId)),
      session.db.select().from(schema.people).where(eq(schema.people.id, personId)).limit(1),
      session.db.select().from(schema.governments), session.db.select().from(schema.ministries),
      session.db.select().from(schema.members).where(eq(schema.members.personId, personId)).limit(1),
      session.db.select().from(schema.sourceSnapshots)
    ]);
    const person = people[0];
    if (!person) return [];
    const governmentById = new Map(governments.map((item) => [item.id, item]));
    const ministryById = new Map(ministries.map((item) => [item.id, item]));
    const sourceById = new Map(sources.map((item) => [item.id, item.sourceUrl]));
    return roles.flatMap((role) => {
      const government = governmentById.get(role.governmentId);
      if (!government) return [];
      const ministry = role.ministryId ? ministryById.get(role.ministryId) : undefined;
      return [{ id: role.id, person: { id: person.id, displayName: person.displayName }, member: members[0] ? { slug: members[0].slug } : undefined, government: { id: government.id, slug: government.slug, name: government.name }, title: role.title, startsOn: role.startsOn, endsOn: role.endsOn ?? undefined, interim: /interimar/i.test(role.title), sourceUrl: role.sourceSnapshotId ? sourceById.get(role.sourceSnapshotId) : undefined, ministry: ministry ? { slug: ministry.slug, name: ministry.name } : undefined }];
    }).sort((a, b) => b.startsOn.localeCompare(a.startsOn));
  } finally {
    await session.close();
  }
}

export async function getGovernmentView(slug: string) {
  if (!process.env.DATABASE_URL) return undefined;
  const session = createWebDbSession();
  try {
    const rows = await session.db.select().from(schema.governments).where(eq(schema.governments.slug, slug)).limit(1);
    const government = rows[0];
    if (!government) return undefined;
    const [roles, people, ministries, members, sources, events] = await Promise.all([
      session.db.select().from(schema.governmentRoles).where(eq(schema.governmentRoles.governmentId, government.id)),
      session.db.select().from(schema.people), session.db.select().from(schema.ministries),
      session.db.select().from(schema.members),
      session.db.select().from(schema.sourceSnapshots),
      session.db.select().from(schema.compositionEvents).where(eq(schema.compositionEvents.governmentId, government.id))
    ]);
    const peopleById = new Map(people.map((item) => [item.id, item]));
    const memberByPersonId = new Map(members.filter((item) => item.personId).map((item) => [item.personId!, item]));
    const ministryById = new Map(ministries.map((item) => [item.id, item]));
    const sourceById = new Map(sources.map((item) => [item.id, item.sourceUrl]));
    return {
      id: government.id, slug: government.slug, name: government.name, startsOn: government.startsOn,
      endsOn: government.endsOn ?? undefined,
      caretakerSince: events.find((event) => event.eventType === "no_confidence_motion")?.occurredOn,
      roles: roles.flatMap((role) => {
        const person = peopleById.get(role.personId);
        if (!person) return [];
        const ministry = role.ministryId ? ministryById.get(role.ministryId) : undefined;
        const member = memberByPersonId.get(person.id);
        return [{ id: role.id, person: { id: person.id, displayName: person.displayName }, member: member ? { slug: member.slug } : undefined, title: role.title, startsOn: role.startsOn, endsOn: role.endsOn ?? undefined, interim: /interimar/i.test(role.title), ministry: ministry ? { slug: ministry.slug, name: ministry.name } : undefined, sourceUrl: role.sourceSnapshotId ? sourceById.get(role.sourceSnapshotId) : undefined }];
      }).sort((a, b) => b.startsOn.localeCompare(a.startsOn)),
      events: events.sort((a, b) => b.occurredOn.localeCompare(a.occurredOn))
    };
  } finally {
    await session.close();
  }
}

async function loadMinistries(): Promise<MinistryView[]> {
  if (!process.env.DATABASE_URL) return [];
  const session = createWebDbSession();
  try {
    const ministries = await session.db.select().from(schema.ministries);
    return (await assembleMinistries(session, ministries)).sort((a, b) => a.shortName.localeCompare(b.shortName, "ro"));
  } catch {
    return [];
  } finally {
    await session.close();
  }
}

async function assembleMinistries(session: ReturnType<typeof createWebDbSession>, ministryRows: Array<typeof schema.ministries.$inferSelect>): Promise<MinistryView[]> {
  const [roleRows, people, governments, members, aliases, sources, relationRows, bills, votes] = await Promise.all([
    session.db.select().from(schema.governmentRoles),
    session.db.select().from(schema.people),
    session.db.select().from(schema.governments),
    session.db.select().from(schema.members),
    session.db.select().from(schema.ministryAliases),
    session.db.select().from(schema.sourceSnapshots),
    session.db.select().from(schema.billMinistryRelations),
    session.db.select().from(schema.bills),
    session.db.select().from(schema.votes)
  ]);
  const peopleById = new Map(people.map((item) => [item.id, item]));
  const governmentById = new Map(governments.map((item) => [item.id, item]));
  const memberByPersonId = new Map(members.filter((item) => item.personId).map((item) => [item.personId!, item]));
  const sourceById = new Map(sources.map((item) => [item.id, item.sourceUrl]));
  const billById = new Map(bills.map((item) => [item.id, item]));
  const today = new Date().toISOString().slice(0, 10);

  return ministryRows.map((ministry) => {
    const terms = roleRows.filter((role) => role.ministryId === ministry.id).flatMap((role) => {
      const person = peopleById.get(role.personId);
      const government = governmentById.get(role.governmentId);
      if (!person || !government) return [];
      const member = memberByPersonId.get(person.id);
      return [{
        id: role.id,
        person: { id: person.id, displayName: person.displayName },
        member: member ? { slug: member.slug } : undefined,
        government: { id: government.id, slug: government.slug, name: government.name },
        title: role.title,
        startsOn: role.startsOn,
        endsOn: role.endsOn ?? undefined,
        interim: /interimar/i.test(role.title),
        sourceUrl: role.sourceSnapshotId ? sourceById.get(role.sourceSnapshotId) : undefined
      }];
    }).sort((a, b) => b.startsOn.localeCompare(a.startsOn));
    const legislation = relationRows.filter((item) => item.ministryId === ministry.id).flatMap((relation) => {
      const bill = billById.get(relation.billId);
      if (!bill) return [];
      return [{
        bill: { id: bill.id, slug: bill.slug, title: bill.title, identifier: bill.identifiers.deputies ?? bill.identifiers.senate ?? bill.id, status: bill.status },
        relation: relation.relation,
        confidence: relation.confidence,
        reason: relation.reason,
        sourceUrl: relation.sourceUrl ?? undefined,
        evidenceExcerpt: relation.evidenceExcerpt ?? undefined,
        votes: votes.filter((vote) => vote.billId === bill.id).sort((a, b) => b.heldOn.localeCompare(a.heldOn)).map((vote) => ({ id: vote.id, title: vote.title, heldOn: vote.heldOn, prominence: vote.prominence }))
      }];
    }).sort((a, b) => (a.confidence === "official" ? -1 : 1) - (b.confidence === "official" ? -1 : 1) || (b.votes[0]?.heldOn ?? "").localeCompare(a.votes[0]?.heldOn ?? ""));
    return {
      id: ministry.id,
      slug: ministry.slug,
      name: ministry.name,
      shortName: ministry.shortName,
      descriptionRo: ministry.descriptionRo,
      descriptionEn: ministry.descriptionEn,
      aliases: aliases.filter((alias) => alias.ministryId === ministry.id).map((alias) => alias.name),
      terms,
      current: terms.find((term) => term.startsOn <= today && (!term.endsOn || term.endsOn >= today)),
      legislation
    };
  });
}
