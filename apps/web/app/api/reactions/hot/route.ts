import { sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import * as schema from "@cumsevoteaza/db";
import { analyticsEnabled, anonymousMarker, clearLegacyVisitorCookie, isReactionEntityType } from "@/lib/engagement";
import { createWebDbSession } from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!analyticsEnabled()) {
    return NextResponse.json({ ok: false, disabled: true }, { status: 202 });
  }

  const body = await request.json().catch(() => undefined) as { entityType?: unknown; entityId?: unknown } | undefined;
  if (!body || !isReactionEntityType(body.entityType) || typeof body.entityId !== "string") {
    return NextResponse.json({ error: "Invalid reaction" }, { status: 400 });
  }


  const reactionId = `hot-${crypto.randomUUID()}`;
  const session = createWebDbSession();
  let count = 0;
  try {
    await session.db
      .insert(schema.contentReactions)
      .values({
        id: reactionId,
        entityType: body.entityType,
        entityId: body.entityId,
        reaction: "hot",
        visitorHash: anonymousMarker(),
        createdAt: new Date()
      })
      .onConflictDoNothing({
        target: [
          schema.contentReactions.entityType,
          schema.contentReactions.entityId,
          schema.contentReactions.reaction,
          schema.contentReactions.visitorHash
        ]
      });

    const rows = await session.db.execute<{ count: number }>(sql`
      select count(*)::int as count
      from content_reactions
      where entity_type = ${body.entityType} and entity_id = ${body.entityId} and reaction = 'hot'
    `);
    count = rows[0]?.count ?? 0;
  } finally {
    await session.close();
  }

  const response = NextResponse.json({ ok: true, hot: true, count });
  clearLegacyVisitorCookie(request, response);
  return response;
}
