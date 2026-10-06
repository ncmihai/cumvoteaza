import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { CACHE_TAGS, selectCacheTags } from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");

  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (requestParam(request, "revalidateOnly") === "1") {
    const selected = selectCacheTags(requestParam(request, "tags"));
    if (selected.unknown.length) return NextResponse.json({ error: `Unknown cache tags: ${selected.unknown.join(", ")}`, known: Object.values(CACHE_TAGS) }, { status: 400 });
    for (const tag of selected.tags) revalidateTag(tag, "max");
    return NextResponse.json({
      ok: true,
      mode: "revalidate-only",
      tags: selected.tags
    });
  }

  return NextResponse.json({ error: "Direct production imports are retired. Imports run through the worker and the integrity checks." }, { status: 410 });
}

function requestParam(request: Request, name: string): string | null {
  return new URL(request.url).searchParams.get(name);
}
