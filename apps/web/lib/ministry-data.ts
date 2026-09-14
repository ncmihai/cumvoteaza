import { unstable_cache } from "next/cache";
import { eq } from "drizzle-orm";
import * as schema from "@cumsevoteaza/db";
import { createWebDbSession } from "./server-db";

export interface MinistryTermView {
  id: string;
  person: { id: string; displayName: string };
  member?: { slug: string };
  government: { id: string; name: string };
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
}

const getCachedMinistries = unstable_cache(loadMinistries, ["ministry-directory-v1"], { revalidate: 3600 });

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
  const [roleRows, people, governments, members, aliases, sources] = await Promise.all([
    session.db.select().from(schema.governmentRoles),
    session.db.select().from(schema.people),
    session.db.select().from(schema.governments),
    session.db.select().from(schema.members),
    session.db.select().from(schema.ministryAliases),
    session.db.select().from(schema.sourceSnapshots)
  ]);
  const peopleById = new Map(people.map((item) => [item.id, item]));
  const governmentById = new Map(governments.map((item) => [item.id, item]));
  const memberByPersonId = new Map(members.filter((item) => item.personId).map((item) => [item.personId!, item]));
  const sourceById = new Map(sources.map((item) => [item.id, item.sourceUrl]));
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
        government: { id: government.id, name: government.name },
        title: role.title,
        startsOn: role.startsOn,
        endsOn: role.endsOn ?? undefined,
        interim: /interimar/i.test(role.title),
        sourceUrl: role.sourceSnapshotId ? sourceById.get(role.sourceSnapshotId) : undefined
      }];
    }).sort((a, b) => b.startsOn.localeCompare(a.startsOn));
    return {
      id: ministry.id,
      slug: ministry.slug,
      name: ministry.name,
      shortName: ministry.shortName,
      descriptionRo: ministry.descriptionRo,
      descriptionEn: ministry.descriptionEn,
      aliases: aliases.filter((alias) => alias.ministryId === ministry.id).map((alias) => alias.name),
      terms,
      current: terms.find((term) => term.startsOn <= today && (!term.endsOn || term.endsOn >= today))
    };
  });
}
