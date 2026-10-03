import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { CACHE_TAGS } from "@/lib/server-db";

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
    revalidatePublicReadTags();
    return NextResponse.json({
      ok: true,
      mode: "revalidate-only",
      tags: Object.values(CACHE_TAGS)
    });
  }

  return NextResponse.json({ error: "Direct production imports are retired. Imports run through the worker and the integrity checks." }, { status: 410 });
}

function revalidatePublicReadTags() {
  for (const tag of Object.values(CACHE_TAGS)) {
    revalidateTag(tag, "max");
  }
}

function requestParam(request: Request, name: string): string | null {
  return new URL(request.url).searchParams.get(name);
}
