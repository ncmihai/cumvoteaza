import { NextResponse } from "next/server";
import { getElectionMapData } from "@/lib/election-map-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The commune results of one election and chamber for the map (Sprint 17): the lists and, per commune, the lists' votes. The same for everyone, so the edge keeps it for an hour. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    const data = await getElectionMapData(url.searchParams.get("election") ?? undefined, url.searchParams.get("chamber") ?? undefined);
    if (!data) return NextResponse.json({ error: "not_available" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({ election: data.election.id, chamber: data.chamber, lists: data.lists, areas: data.areas }, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
  } catch {
    return NextResponse.json({ error: "data_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
