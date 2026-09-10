import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  if (process.env.COCKPIT_DATABASE_ROLE !== "release") return new NextResponse(null, { status: 404 });
  return NextResponse.json({ releaseId: process.env.COCKPIT_PREVIEW_RELEASE_ID, readOnly: true }, {
    headers: { "Cache-Control": "no-store" }
  });
}
