import { asc, desc, eq } from "drizzle-orm";
import * as schema from "@cumsevoteaza/db";
import { createWebDbSession } from "./server-db";

export type MotionListItem = {
  id: string;
  kind: "censure" | "simple";
  chamber: "senate" | "deputies" | "joint";
  number: number;
  filedOn: string;
  title: string;
  outcome: "adopted" | "rejected" | "unknown";
  votesFor?: number;
  votesAgainst?: number;
  signatories: number;
};

export async function getMotionList(): Promise<MotionListItem[]> {
  if (!process.env.DATABASE_URL) return [];
  const session = createWebDbSession();
  try {
    const [motions, counts] = await Promise.all([
      session.db.select().from(schema.parliamentaryMotions).orderBy(desc(schema.parliamentaryMotions.filedOn)),
      session.db.select({ motionId: schema.motionSignatories.motionId }).from(schema.motionSignatories)
    ]);
    const signed = new Map<string, number>();
    for (const row of counts) signed.set(row.motionId, (signed.get(row.motionId) ?? 0) + 1);
    return motions.map((motion) => ({
      id: motion.id, kind: motion.kind, chamber: motion.chamber, number: motion.number, filedOn: motion.filedOn, title: motion.title,
      outcome: motion.outcome, votesFor: motion.votesFor ?? undefined, votesAgainst: motion.votesAgainst ?? undefined,
      signatories: signed.get(motion.id) ?? 0
    }));
  } catch {
    return [];
  } finally {
    await session.close();
  }
}

export async function getMotionPage(id: string) {
  if (!process.env.DATABASE_URL) return undefined;
  const session = createWebDbSession();
  try {
    const [motion] = await session.db.select().from(schema.parliamentaryMotions).where(eq(schema.parliamentaryMotions.id, id)).limit(1);
    if (!motion) return undefined;
    const [signatories, government] = await Promise.all([
      session.db.select({ memberId: schema.motionSignatories.memberId, groupLabel: schema.motionSignatories.groupLabel, displayName: schema.members.displayName, slug: schema.members.slug })
        .from(schema.motionSignatories).innerJoin(schema.members, eq(schema.members.id, schema.motionSignatories.memberId))
        .where(eq(schema.motionSignatories.motionId, id)).orderBy(asc(schema.members.displayName)),
      motionGovernment(session, motion.targetGovernmentId)
    ]);
    const byGroup = new Map<string, typeof signatories>();
    for (const row of signatories) byGroup.set(row.groupLabel ?? "—", [...(byGroup.get(row.groupLabel ?? "—") ?? []), row]);
    return { motion, government, groups: [...byGroup].map(([label, members]) => ({ label, members })).sort((a, b) => b.members.length - a.members.length) };
  } finally {
    await session.close();
  }
}

async function motionGovernment(session: ReturnType<typeof createWebDbSession>, id: string | null) {
  if (!id) return undefined;
  const [government] = await session.db.select({ slug: schema.governments.slug, name: schema.governments.name }).from(schema.governments).where(eq(schema.governments.id, id)).limit(1);
  return government;
}
