import { NextRequest, NextResponse } from "next/server";
import { explainVote } from "@/lib/vote-explanations";
export const maxDuration = 40;
export const dynamic = "force-dynamic";
async function handle(request: NextRequest, params: Promise<{id:string}>, generate: boolean) {
  if (generate && request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ status: "forbidden" }, { status: 403 });
  const { id } = await params;
  if (id.length > 250) return NextResponse.json({ status: "unavailable" }, { status: 400 });
  try { return NextResponse.json(await explainVote(id, generate), { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json({ status: "unavailable" }, { headers: { "Cache-Control": "no-store" } }); }
}
export async function GET(request: NextRequest, {params}: {params:Promise<{id:string}>}) { return handle(request,params,false); }
export async function POST(request: NextRequest, {params}: {params:Promise<{id:string}>}) { return handle(request,params,true); }
