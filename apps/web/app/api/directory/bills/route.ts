import { NextResponse } from "next/server";
import { getBillExplorerData, parseExplorerFilters } from "@/lib/explorer-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const filters = parseExplorerFilters(Object.fromEntries(url.searchParams.entries()));
  const limit = Number(url.searchParams.get("limit") ?? "10");
  const cursor = url.searchParams.get("cursor") ?? undefined;
  try {
    const data = await getBillExplorerData({ limit, cursor, filters });
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "data_unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
