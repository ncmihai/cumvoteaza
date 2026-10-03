import { NextRequest, NextResponse } from "next/server";
import * as schema from "@cumsevoteaza/db";
import {
  analyticsEnabled,
  anonymousMarker,
  clearLegacyVisitorCookie,
  hashValue,
  isEngagementEntityType,
  isLocaleValue,
  normalizeTrackedQuery
} from "@/lib/engagement";
import { createWebDbSession } from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!analyticsEnabled()) {
    return NextResponse.json({ ok: false, disabled: true }, { status: 202 });
  }

  const body = await request.json().catch(() => undefined) as { entityType?: unknown; query?: unknown; locale?: unknown } | undefined;
  const query = normalizeTrackedQuery(body?.query);
  if (!body || !isEngagementEntityType(body.entityType) || body.entityType === "search" || !query) {
    return NextResponse.json({ error: "Invalid search event" }, { status: 400 });
  }


  const session = createWebDbSession();
  try {
    await session.db.insert(schema.engagementEvents).values({
      id: crypto.randomUUID(),
      eventType: "search",
      entityType: body.entityType,
      queryHash: hashValue(query),
      queryText: query,
      locale: isLocaleValue(body.locale) ? body.locale : "ro",
      visitorHash: anonymousMarker(),
      occurredAt: new Date()
    });
  } finally {
    await session.close();
  }

  const response = NextResponse.json({ ok: true });
  clearLegacyVisitorCookie(request, response);
  return response;
}
