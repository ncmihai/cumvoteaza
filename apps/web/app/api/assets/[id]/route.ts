import { readFile } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import * as schema from "@cumsevoteaza/db";
import { getDigiStorageDownloadLink } from "@/lib/digi-storage";
import { createWebDbSession } from "@/lib/server-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const session = createWebDbSession();
  try {
    const [asset] = await session.db
      .select()
      .from(schema.storedAssets)
      .where(eq(schema.storedAssets.id, id))
      .limit(1);

    if (!asset || asset.fetchStatus !== "stored") {
      return new NextResponse("Not found", { status: 404 });
    }

    if (request.headers.get("if-none-match") && asset.contentHash && request.headers.get("if-none-match") === etagFor(asset.contentHash)) {
      return new NextResponse(null, {
        status: 304,
        headers: responseHeadersForAsset(asset)
      });
    }

    if (asset.storageProvider === "local") {
      const root = process.env.COCKPIT_ASSET_DIR;
      if (process.env.COCKPIT_DATABASE_ROLE !== "release" || !root || !asset.storagePath) return new NextResponse("Not found", {status:404});
      const file = path.resolve(root, asset.storagePath);
      if (!file.startsWith(path.resolve(root)+path.sep)) return new NextResponse("Not found", {status:404});
      return new Response(new Uint8Array(await readFile(file)), {headers: responseHeadersForAsset(asset)});
    }

    if (asset.storageProvider === "digi_storage") {
      if (!asset.storagePath) return new NextResponse("Not found", { status: 404 });
      const downloadLink = await getDigiStorageDownloadLink(asset.storagePath);
      const download = await fetch(downloadLink);
      if (!download.ok || !download.body) {
        console.error("Asset gateway Digi download failed", { assetId: asset.id, status: download.status });
        return new NextResponse("Not found", { status: 404 });
      }
      const headers = responseHeadersForAsset(asset, download.headers);
      return new Response(download.body, {
        status: 200,
        headers
      });
    }

    const legacyUrl = asset.publicUrl || asset.blobUrl;
    if (legacyUrl) {
      return NextResponse.redirect(legacyUrl, {
        status: 302,
        headers: responseHeadersForAsset(asset)
      });
    }

    return new NextResponse("Not found", { status: 404 });
  } catch (error) {
    console.error("Asset gateway failed", { assetId: id, error: error instanceof Error ? error.message : String(error) });
    return new NextResponse("Not found", { status: 404 });
  } finally {
    await session.close();
  }
}

function responseHeadersForAsset(asset: typeof schema.storedAssets.$inferSelect, upstream?: Headers): Headers {
  const headers = new Headers();
  headers.set("Cache-Control", cacheControlFor(asset.assetType));
  headers.set("X-Content-Type-Options", "nosniff");
  const contentType = asset.mimeType || upstream?.get("content-type");
  if (contentType) headers.set("Content-Type", contentType);
  const contentLength = asset.byteSize ? String(asset.byteSize) : upstream?.get("content-length");
  if (contentLength) headers.set("Content-Length", contentLength);
  if (asset.contentHash) headers.set("ETag", etagFor(asset.contentHash));
  if (asset.assetType === "cv") {
    headers.set("Content-Disposition", `inline; filename="${safeFilename(asset.id)}.pdf"`);
  }
  return headers;
}

function cacheControlFor(assetType: string): string {
  if (assetType === "cv") return "public, max-age=3600, s-maxage=86400";
  return "public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800";
}

function etagFor(contentHash: string): string {
  return `"${contentHash}"`;
}

function safeFilename(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "asset";
}
