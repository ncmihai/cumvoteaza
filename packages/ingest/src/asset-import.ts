import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { and, eq, gte, isNotNull } from "drizzle-orm";
import sharp from "sharp";
import { createDbSession, storedAssets } from "@cumsevoteaza/db";
import type { ChamberId } from "@cumsevoteaza/parliament-model";

const execFileAsync = promisify(execFile);

export type AssetType = "photo" | "party_logo" | "cv" | "bill_text";
export type AssetEntityType = "member" | "person" | "party" | "formation" | "bill_document" | "source_snapshot" | "pipeline_report";
export type StoredAssetStatus = "pending" | "stored" | "failed" | "missing" | "official_timeout";

export type AssetInventoryItem = {
  id: string;
  assetType: AssetType;
  entityType: AssetEntityType;
  entityId: string;
  legislature?: string;
  legislatureId?: string;
  chamber?: ChamberId;
  officialUrl: string;
  sourceProfileUrl?: string;
  sourceSnapshotContentHash?: string;
};

export type AssetImportOptions = {
  assetsPath: string;
  assetType?: AssetType;
  legislature?: string;
  limit?: number;
  maxUniqueOfficialUrls?: number;
  uniqueOfficialUrlOffset?: number;
  persist?: boolean;
  timeoutMs?: number;
  delayMs?: number;
  insecure?: boolean;
  optimizePhotos?: boolean;
  photoWidth?: number;
  photoHeight?: number;
  force?: boolean;
};

export type AssetImportSummary = {
  source: string;
  persist: boolean;
  selected: number;
  attempted: number;
  stored: number;
  skipped: number;
  missing: number;
  officialTimeout: number;
  failed: number;
  failures: Array<{ id: string; officialUrl: string; status: StoredAssetStatus; error?: string }>;
};

type AssetStorageProviderName = "digi_storage";
type AssetStorageProviderResult = {
  storageProvider: "digi_storage" | "vercel_blob" | "external" | "local";
  storagePath: string;
  publicUrl?: string;
  blobUrl?: string;
};

type AssetStorageProvider = {
  name: AssetStorageProviderName;
  upload(input: { objectPath: string; bytes: Buffer; mimeType: string }): Promise<AssetStorageProviderResult>;
};

export async function uploadDerivedAsset(input: {
  objectPath: string;
  bytes: Buffer;
  mimeType: string;
}): Promise<AssetStorageProviderResult> {
  return createAssetStorageProvider().upload(input);
}

export async function importStoredAssetsFromInventory(options: AssetImportOptions): Promise<AssetImportSummary> {
  const items = selectAssetInventoryItemsForImport(await readAssetInventory(options.assetsPath), options);
  const summary: AssetImportSummary = {
    source: options.assetsPath,
    persist: Boolean(options.persist),
    selected: items.length,
    attempted: 0,
    stored: 0,
    skipped: 0,
    missing: 0,
    officialTimeout: 0,
    failed: 0,
    failures: []
  };

  if (!options.persist) return summary;

  const storage = createAssetStorageProvider();

  const session = createDbSession();
  const resultByOfficialUrl = new Map<string, StoredAssetResult>();
  let processed = 0;
  try {
    for (const item of items) {
      processed += 1;
      const existing = await session.db.query.storedAssets.findFirst({
        where: eq(storedAssets.id, item.id)
      });
      if (!options.force && existing?.fetchStatus === "stored" && (existing.storagePath || existing.blobUrl || existing.publicUrl)) {
        summary.skipped += 1;
        if (processed % 100 === 0 || processed === items.length) {
          logAssetImportProgress(processed, items.length, summary);
        }
        continue;
      }

      summary.attempted += 1;
      let result = resultByOfficialUrl.get(item.officialUrl);
      if (!result) {
        result = await fetchAndStoreAsset(item, storage, {
          timeoutMs: options.timeoutMs ?? 20_000,
          insecure: Boolean(options.insecure),
          optimizePhotos: options.optimizePhotos !== false,
          photoWidth: options.photoWidth ?? 150,
          photoHeight: options.photoHeight ?? 200
        });
        resultByOfficialUrl.set(item.officialUrl, result);
        if (options.delayMs && options.delayMs > 0) {
          await sleep(options.delayMs);
        }
      }
      await upsertAsset(session.db, item, result);
      if (result.status === "stored") summary.stored += 1;
      else if (result.status === "missing") summary.missing += 1;
      else if (result.status === "official_timeout") summary.officialTimeout += 1;
      else summary.failed += 1;
      if (result.status !== "stored") {
        summary.failures.push({
          id: item.id,
          officialUrl: item.officialUrl,
          status: result.status,
          error: result.error
        });
      }
      if (processed % 100 === 0 || processed === items.length) {
        logAssetImportProgress(processed, items.length, summary);
      }
    }
  } finally {
    await session.close();
  }

  return summary;
}

function logAssetImportProgress(processed: number, total: number, summary: AssetImportSummary) {
  console.log(
    `assets:import progress ${processed}/${total} processed, ${summary.attempted} attempted, ` +
      `${summary.stored} stored, ${summary.skipped} skipped, ${summary.failed} failed`
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function readAssetInventory(assetsPath: string): Promise<AssetInventoryItem[]> {
  const raw = await readFile(assetsPath, "utf8");
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as AssetInventoryItem)
    .filter((item) => Boolean(item.id && item.entityId && item.assetType && item.officialUrl));
}

export function selectAssetInventoryItems(items: AssetInventoryItem[], options: Pick<AssetImportOptions, "assetType" | "legislature" | "limit">) {
  const selected = items.filter((item) => {
    if (options.assetType && item.assetType !== options.assetType) return false;
    if (options.legislature) {
      const normalized = options.legislature.startsWith("leg-") ? options.legislature : `leg-${options.legislature}`;
      const itemLegislature = item.legislatureId ?? (item.legislature ? `leg-${item.legislature}` : "");
      if (!itemLegislature.startsWith(normalized)) return false;
    }
    return true;
  });
  return options.limit && options.limit > 0 ? selected.slice(0, options.limit) : selected;
}

export function selectAssetInventoryItemsForImport(
  items: AssetInventoryItem[],
  options: Pick<AssetImportOptions, "assetType" | "legislature" | "limit" | "maxUniqueOfficialUrls" | "uniqueOfficialUrlOffset">
) {
  const selected = selectAssetInventoryItems(items, options);
  if (!options.maxUniqueOfficialUrls || options.maxUniqueOfficialUrls <= 0) return selected;

  const offset = Math.max(0, options.uniqueOfficialUrlOffset ?? 0);
  const uniqueUrls: string[] = [];
  const seen = new Set<string>();
  for (const item of selected) {
    if (seen.has(item.officialUrl)) continue;
    seen.add(item.officialUrl);
    uniqueUrls.push(item.officialUrl);
  }
  const allowed = new Set(uniqueUrls.slice(offset, offset + options.maxUniqueOfficialUrls));
  return selected.filter((item) => allowed.has(item.officialUrl));
}

type StoredAssetResult = {
  status: StoredAssetStatus;
  storageProvider?: "digi_storage" | "vercel_blob" | "external" | "local";
  storagePath?: string;
  publicUrl?: string;
  blobUrl?: string;
  contentHash?: string;
  mimeType?: string;
  byteSize?: number;
  width?: number;
  height?: number;
  variant?: string;
  error?: string;
};

type FetchAndStoreAssetOptions = {
  timeoutMs: number;
  insecure: boolean;
  optimizePhotos: boolean;
  photoWidth: number;
  photoHeight: number;
};

async function fetchAndStoreAsset(item: AssetInventoryItem, storage: AssetStorageProvider, options: FetchAndStoreAssetOptions): Promise<StoredAssetResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  const previousTlsSetting = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  try {
    if (options.insecure) process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    const response = await fetch(normalizeOfficialAssetUrl(item.officialUrl), {
      headers: { "User-Agent": "cumsevoteaza-asset-import/0.1 (+local asset backup)" },
      signal: controller.signal
    });
    if (response.status === 404) {
      return { status: "missing", error: "Official asset returned 404." };
    }
    if (!response.ok) {
      return { status: "failed", error: `Official asset returned HTTP ${response.status}.` };
    }
    const officialBytes = Buffer.from(await response.arrayBuffer());
    const officialMimeType = response.headers.get("content-type")?.split(";")[0]?.trim() || mimeTypeFromUrl(item.officialUrl);
    const asset = await prepareAssetForStorage(item, officialBytes, officialMimeType, options);
    const bytes = asset.bytes;
    const contentHash = createHash("sha256").update(bytes).digest("hex");
    const mimeType = asset.mimeType;
    const object = await storage.upload({
      objectPath: assetPathFor(item, contentHash, mimeType),
      bytes,
      mimeType
    });
    return {
      status: "stored",
      storageProvider: object.storageProvider,
      storagePath: object.storagePath,
      publicUrl: object.publicUrl,
      blobUrl: object.blobUrl,
      contentHash,
      mimeType,
      byteSize: bytes.byteLength,
      width: asset.width,
      height: asset.height,
      variant: asset.variant
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { status: "official_timeout", error: `Timed out after ${options.timeoutMs}ms.` };
    }
    return { status: "failed", error: errorMessageWithCause(error) };
  } finally {
    if (options.insecure) {
      if (previousTlsSetting === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      else process.env.NODE_TLS_REJECT_UNAUTHORIZED = previousTlsSetting;
    }
    clearTimeout(timeout);
  }
}

/** All stored assets live on Digi Storage (the Vercel Blob, FTP and local cockpit routes were removed, 2026-10). */
function createAssetStorageProvider(): AssetStorageProvider {
  return createDigiStorageAssetProvider();
}

/** Digi Storage under a base folder: published assets use DIGI_STORAGE_BASE_PATH, backups their own folder. */
export function createDigiStorageAssetProvider(basePathOverride?: string): AssetStorageProvider & { download(objectPath: string): Promise<Buffer> } {
  const email = firstEnv(["DIGI_STORAGE_EMAIL", "DIGI_EMAIL", "ASSET_FTP_USERNAME"]);
  const password = firstEnv(["DIGI_STORAGE_PASSWORD", "DIGI_PASSWORD", "ASSET_FTP_PASSWORD"]);
  const baseUrl = (process.env.DIGI_STORAGE_BASE_URL || "https://storage.rcs-rds.ro").replace(/\/+$/, "");
  const apiUrl = (process.env.DIGI_STORAGE_API_URL || `${baseUrl}/api/v2.1`).replace(/\/+$/, "");
  const basePath = `/${trimSlashes(basePathOverride ?? (process.env.DIGI_STORAGE_BASE_PATH || "cumvoteaza-assets"))}`;
  const configuredMountId = process.env.DIGI_STORAGE_MOUNT_ID?.trim();
  let auth: Promise<{ token: string; mountId: string }> | undefined;

  return {
    name: "digi_storage",
    async upload(input) {
      const state = (auth ??= resolveDigiStorageAuth({ email, password, baseUrl, apiUrl, mountId: configuredMountId }));
      const { token, mountId } = await state;
      const remotePath = `/${[trimSlashes(basePath), input.objectPath].filter(Boolean).map(trimSlashes).join("/")}`;
      const folderPath = remotePath.slice(0, remotePath.lastIndexOf("/") + 1);
      const fileName = remotePath.slice(remotePath.lastIndexOf("/") + 1);
      await ensureDigiStorageFolders({ apiUrl, token, mountId, folderPath });
      await uploadToDigiStorage({ apiUrl, token, mountId, folderPath, fileName, bytes: input.bytes, mimeType: input.mimeType });
      return {
        storageProvider: "digi_storage",
        storagePath: remotePath
      };
    },
    async download(objectPath) {
      const { token, mountId } = await (auth ??= resolveDigiStorageAuth({ email, password, baseUrl, apiUrl, mountId: configuredMountId }));
      const remotePath = `/${[trimSlashes(basePath), objectPath].filter(Boolean).map(trimSlashes).join("/")}`;
      const link = await getDigiStorageDownloadLink({ apiUrl, token, mountId, remotePath });
      const response = await fetch(link);
      if (!response.ok) throw new Error(`Digi Storage download failed with HTTP ${response.status} for ${remotePath}`);
      return Buffer.from(await response.arrayBuffer());
    }
  };
}

async function resolveDigiStorageAuth(input: {
  email: string;
  password: string;
  baseUrl: string;
  apiUrl: string;
  mountId?: string;
}): Promise<{ token: string; mountId: string }> {
  const authResponse = await fetch(`${input.baseUrl}/token`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json"
    },
    body: JSON.stringify({ email: input.email, password: input.password })
  });
  const authJson = await readJsonResponse<{ token?: string }>(authResponse, "Digi Storage auth failed");
  if (!authJson.token) throw new Error("Digi Storage auth did not return a token.");
  const token = authJson.token;
  const mountId = input.mountId || (await getPrimaryDigiStorageMountId({ apiUrl: input.apiUrl, token }));
  return { token, mountId };
}

async function getPrimaryDigiStorageMountId(input: { apiUrl: string; token: string }): Promise<string> {
  const response = await digiFetch(input.apiUrl, input.token, "/mounts?type=device");
  const json = await readJsonResponse<{ mounts?: Array<{ id?: string; name?: string }> }>(response, "Digi Storage mount lookup failed");
  const mountId = json.mounts?.find((mount) => Boolean(mount.id))?.id;
  if (!mountId) throw new Error("Digi Storage account has no device mount. Set DIGI_STORAGE_MOUNT_ID explicitly.");
  return mountId;
}

async function ensureDigiStorageFolders(input: { apiUrl: string; token: string; mountId: string; folderPath: string }) {
  const parts = trimSlashes(input.folderPath).split("/").filter(Boolean);
  let current = "/";
  for (const part of parts) {
    const parent = current;
    current = `${current}${part}/`;
    const infoResponse = await digiFetch(
      input.apiUrl,
      input.token,
      `/mounts/${encodeURIComponent(input.mountId)}/files/info?path=${encodeURIComponent(current)}`
    );
    if (infoResponse.ok) continue;
    if (infoResponse.status !== 404) {
      await readJsonResponse(infoResponse, `Digi Storage folder check failed for ${current}`);
    }
    const createResponse = await digiFetch(input.apiUrl, input.token, `/mounts/${encodeURIComponent(input.mountId)}/files/folder?path=${encodeURIComponent(parent)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: part })
    });
    if (!createResponse.ok && createResponse.status !== 409) {
      await readJsonResponse(createResponse, `Digi Storage folder create failed for ${current}`);
    }
  }
}

async function uploadToDigiStorage(input: {
  apiUrl: string;
  token: string;
  mountId: string;
  folderPath: string;
  fileName: string;
  bytes: Buffer;
  mimeType: string;
}) {
  const uploadLinkResponse = await digiFetch(
    input.apiUrl,
    input.token,
    `/mounts/${encodeURIComponent(input.mountId)}/files/upload?path=${encodeURIComponent(input.folderPath)}`
  );
  const uploadLink = await readJsonResponse<{ link?: string }>(uploadLinkResponse, `Digi Storage upload-link lookup failed for ${input.folderPath}`);
  if (!uploadLink.link) throw new Error(`Digi Storage did not return an upload link for ${input.folderPath}.`);

  const form = new FormData();
  const arrayBuffer = input.bytes.buffer.slice(input.bytes.byteOffset, input.bytes.byteOffset + input.bytes.byteLength) as ArrayBuffer;
  form.set("file", new Blob([arrayBuffer], { type: input.mimeType }), input.fileName);
  const uploadResponse = await fetch(uploadLink.link, {
    method: "POST",
    body: form
  });
  if (!uploadResponse.ok) {
    throw new Error(`Digi Storage upload failed with HTTP ${uploadResponse.status}: ${(await uploadResponse.text()).slice(0, 500)}`);
  }
}

async function getOrCreateDigiStorageSharedLink(input: {
  apiUrl: string;
  token: string;
  mountId: string;
  remotePath: string;
  removePassword: boolean;
}): Promise<string> {
  const existingResponse = await digiFetch(
    input.apiUrl,
    input.token,
    `/mounts/${encodeURIComponent(input.mountId)}/links?path=${encodeURIComponent(input.remotePath)}`
  );
  if (existingResponse.ok) {
    const existing = await readJsonResponse<{ links?: DigiStorageLink[] }>(existingResponse, `Digi Storage shared-link lookup failed for ${input.remotePath}`);
    const link = existing.links?.find((candidate) => candidate.path === input.remotePath && Boolean(candidate.url));
    if (link?.url) {
      await maybeRemoveDigiStorageLinkPassword({ ...input, link });
      return link.url;
    }
  }

  const createResponse = await digiFetch(input.apiUrl, input.token, `/mounts/${encodeURIComponent(input.mountId)}/links`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: input.remotePath })
  });
  const created = await readJsonResponse<DigiStorageLink>(createResponse, `Digi Storage shared-link create failed for ${input.remotePath}`);
  if (!created.url) throw new Error(`Digi Storage did not return a shared link for ${input.remotePath}.`);
  await maybeRemoveDigiStorageLinkPassword({ ...input, link: created });
  return created.url;
}

type DigiStorageLink = {
  id?: string;
  path?: string;
  url?: string;
  shortUrl?: string;
  hasPassword?: boolean;
};

async function maybeRemoveDigiStorageLinkPassword(input: {
  apiUrl: string;
  token: string;
  mountId: string;
  link: DigiStorageLink;
  removePassword: boolean;
}) {
  if (!input.removePassword || !input.link.hasPassword || !input.link.id) return;
  const response = await digiFetch(input.apiUrl, input.token, `/mounts/${encodeURIComponent(input.mountId)}/links/${encodeURIComponent(input.link.id)}/password`, {
    method: "DELETE"
  });
  if (!response.ok && response.status !== 404) {
    await readJsonResponse(response, `Digi Storage shared-link password removal failed for ${input.link.id}`);
  }
}

async function getDigiStorageDownloadLink(input: { apiUrl: string; token: string; mountId: string; remotePath: string }): Promise<string> {
  const response = await digiFetch(
    input.apiUrl,
    input.token,
    `/mounts/${encodeURIComponent(input.mountId)}/files/download?path=${encodeURIComponent(input.remotePath)}`
  );
  const json = await readJsonResponse<{ link?: string }>(response, `Digi Storage download-link lookup failed for ${input.remotePath}`);
  if (!json.link) throw new Error(`Digi Storage did not return a download link for ${input.remotePath}.`);
  return json.link;
}

function digiFetch(apiUrl: string, token: string, pathAndQuery: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set("accept", "application/json");
  headers.set("authorization", `Token token="${token}"`);
  return fetch(`${apiUrl}${pathAndQuery}`, {
    ...init,
    headers
  });
}

async function readJsonResponse<T>(response: Response, message: string): Promise<T> {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${message} with HTTP ${response.status}: ${text.slice(0, 500)}`);
  }
  if (!text.trim()) return {} as T;
  return JSON.parse(text) as T;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required when ASSET_STORAGE_PROVIDER=ftp.`);
  return value;
}

function firstEnv(names: string[]): string {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  throw new Error(`${names.join(" or ")} is required for this asset storage provider.`);
}

function numberFromEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${name} must be a positive number.`);
  return parsed;
}

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, "");
}

async function prepareAssetForStorage(
  item: AssetInventoryItem,
  bytes: Buffer,
  mimeType: string,
  options: FetchAndStoreAssetOptions
): Promise<{ bytes: Buffer; mimeType: string; width?: number; height?: number; variant?: string }> {
  if (item.assetType !== "photo" || !options.optimizePhotos || !mimeType.startsWith("image/")) {
    return { bytes, mimeType, variant: item.assetType === "cv" ? "original_pdf" : "original" };
  }

  const optimized = await sharp(bytes)
    .rotate()
    .resize(options.photoWidth, options.photoHeight, {
      fit: "cover",
      position: "attention"
    })
    .webp({ quality: 78 })
    .toBuffer();

  return {
    bytes: optimized,
    mimeType: "image/webp",
    width: options.photoWidth,
    height: options.photoHeight,
    variant: `profile_${options.photoWidth}x${options.photoHeight}`
  };
}

function normalizeOfficialAssetUrl(url: string): string {
  const parsed = new URL(url);
  if (parsed.hostname === "cdep.ro") parsed.hostname = "www.cdep.ro";
  return parsed.toString();
}

function errorMessageWithCause(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause instanceof Error ? `: ${error.cause.message}` : "";
  return `${error.message}${cause}`;
}

async function upsertAsset(
  db: ReturnType<typeof createDbSession>["db"],
  item: AssetInventoryItem,
  result: StoredAssetResult
) {
  const now = new Date();
  await db
    .insert(storedAssets)
    .values({
      id: item.id,
      entityType: item.entityType,
      entityId: item.entityId,
      assetType: item.assetType,
      legislatureId: item.legislatureId || null,
      chamber: item.chamber || null,
      officialUrl: item.officialUrl,
      blobUrl: result.blobUrl ?? null,
      storageProvider: result.storageProvider ?? null,
      storagePath: result.storagePath ?? null,
      publicUrl: result.publicUrl ?? null,
      width: result.width ?? null,
      height: result.height ?? null,
      variant: result.variant ?? null,
      contentHash: result.contentHash ?? null,
      mimeType: result.mimeType ?? null,
      byteSize: result.byteSize ?? null,
      fetchStatus: result.status,
      lastAttemptAt: now,
      updatedAt: now
    })
    .onConflictDoUpdate({
      target: storedAssets.id,
      set: {
        blobUrl: result.blobUrl ?? null,
        storageProvider: result.storageProvider ?? null,
        storagePath: result.storagePath ?? null,
        publicUrl: result.publicUrl ?? null,
        width: result.width ?? null,
        height: result.height ?? null,
        variant: result.variant ?? null,
        contentHash: result.contentHash ?? null,
        mimeType: result.mimeType ?? null,
        byteSize: result.byteSize ?? null,
        fetchStatus: result.status,
        lastAttemptAt: now,
        updatedAt: now
      }
    });
}

function assetPathFor(item: AssetInventoryItem, contentHash: string, mimeType: string): string {
  const legislature = safeLegislaturePathSegment(item.legislatureId || item.legislature || "unknown");
  const chamber = safePathSegment(item.chamber || "unknown");
  const entity = safePathSegment(item.entityId);
  const extension = extensionFor(item.officialUrl, mimeType);
  if (item.assetType === "photo") {
    return `parliament-assets/photos/legislature-${legislature}/${chamber}/${entity}-${contentHash.slice(0, 16)}${extension}`;
  }
  if (item.assetType === "bill_text") {
    return `parliament-assets/bill-text/${entity}/${contentHash.slice(0, 16)}${extension}`;
  }
  const section = item.assetType === "party_logo" ? "party-logos" : "cvs";
  return `parliament-assets/${section}/${entity}/${legislature}-${chamber}-${contentHash.slice(0, 16)}${extension}`;
}

function extensionFor(url: string, mimeType: string): string {
  const fromUrl = path.extname(new URL(url).pathname).toLowerCase();
  if (mimeType === "image/webp") return ".webp";
  if (fromUrl && fromUrl.length <= 8) return fromUrl;
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/gif") return ".gif";
  if (mimeType === "application/pdf") return ".pdf";
  return ".bin";
}

function mimeTypeFromUrl(url: string): string {
  const extension = path.extname(new URL(url).pathname).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".png") return "image/png";
  if (extension === ".gif") return "image/gif";
  if (extension === ".pdf") return "application/pdf";
  return "application/octet-stream";
}

function safePathSegment(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
}

function safeLegislaturePathSegment(value: string): string {
  const normalized = value.replace(/^leg-/i, "");
  return safePathSegment(normalized);
}
