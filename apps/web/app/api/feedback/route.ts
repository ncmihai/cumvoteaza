import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import * as schema from "@cumsevoteaza/db";
import { FEEDBACK_FLOOD, parseFeedback } from "@/lib/feedback";
import { createWebDbSession } from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The feedback form (D-031). It stores what the visitor typed and the path of the page, nothing else: no IP, no cookie, no browser details (D-015).
 * Because nobody is identified, the flood guard counts everyone together.
 */
export async function POST(request: NextRequest) {
  // A form on another site must not be able to post here.
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== request.headers.get("host")) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "unavailable" }, { status: 503 });

  const body = await request.json().catch(() => undefined);
  const parsed = parseFeedback(body);
  // A robot gets the same answer as a person, so it learns nothing.
  if (!parsed.ok && parsed.reason === "spam") return NextResponse.json({ ok: true });
  if (!parsed.ok) return NextResponse.json({ error: parsed.reason }, { status: 400 });

  const session = createWebDbSession();
  try {
    const recent = await session.db.execute<{ ten_minutes: number; day: number }>(sql`
      select count(*) filter (where created_at > now() - interval '10 minutes')::int as ten_minutes, count(*)::int as day
      from feedback_reports where created_at > now() - interval '1 day'`);
    if ((recent[0]?.ten_minutes ?? 0) >= FEEDBACK_FLOOD.perTenMinutes || (recent[0]?.day ?? 0) >= FEEDBACK_FLOOD.perDay) {
      return NextResponse.json({ error: "busy" }, { status: 429 });
    }
    await session.db.insert(schema.feedbackReports).values({
      id: `fb-${randomUUID()}`,
      kind: parsed.value.kind,
      message: parsed.value.message,
      pagePath: parsed.value.pagePath ?? null,
      locale: parsed.value.locale ?? null,
      contact: parsed.value.contact ?? null,
      status: "new",
      createdAt: new Date()
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  } finally {
    await session.close();
  }
}
