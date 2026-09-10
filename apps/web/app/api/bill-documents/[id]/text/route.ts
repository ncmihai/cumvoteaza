import { and, eq } from "drizzle-orm";
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
    const [document] = await session.db
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.id, id))
      .limit(1);
    if (!document || document.textStatus !== "stored" || !document.textAssetId) {
      return new NextResponse("Not found", { status: 404 });
    }

    const [asset] = await session.db
      .select()
      .from(schema.storedAssets)
      .where(and(eq(schema.storedAssets.id, document.textAssetId), eq(schema.storedAssets.assetType, "bill_text")))
      .limit(1);
    if (!asset || asset.fetchStatus !== "stored") return new NextResponse("Not found", { status: 404 });

    if (request.headers.get("if-none-match") && asset.contentHash && request.headers.get("if-none-match") === `"${asset.contentHash}"`) {
      return new NextResponse(null, { status: 304, headers: headersForText(asset) });
    }

    if (asset.storageProvider === "digi_storage") {
      if (!asset.storagePath) return new NextResponse("Not found", { status: 404 });
      const downloadLink = await getDigiStorageDownloadLink(asset.storagePath);
      const download = await fetch(downloadLink);
      if (!download.ok || !download.body) {
        console.error("Bill text gateway Digi download failed", { documentId: document.id, assetId: asset.id, status: download.status });
        return new NextResponse("Not found", { status: 404 });
      }
      return new Response(download.body, { status: 200, headers: headersForText(asset, download.headers) });
    }

    const legacyUrl = asset.publicUrl || asset.blobUrl;
    if (legacyUrl) return NextResponse.redirect(legacyUrl, { status: 302, headers: headersForText(asset) });
    return new NextResponse("Not found", { status: 404 });
  } catch (error) {
    console.error("Bill text gateway failed", { documentId: id, error: error instanceof Error ? error.message : String(error) });
    return new NextResponse("Not found", { status: 404 });
  } finally {
    await session.close();
  }
}

function headersForText(asset: typeof schema.storedAssets.$inferSelect, upstream?: Headers): Headers {
  const headers = new Headers();
  headers.set("Cache-Control", "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Content-Type", asset.mimeType || upstream?.get("content-type") || "text/plain; charset=utf-8");
  const contentLength = asset.byteSize ? String(asset.byteSize) : upstream?.get("content-length");
  if (contentLength) headers.set("Content-Length", contentLength);
  if (asset.contentHash) headers.set("ETag", `"${asset.contentHash}"`);
  return headers;
}
