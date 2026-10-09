import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export type RawCacheKind = "cdep-sitting-days" | "cdep-day" | "senate-month" | "senate-day" | "cdep-bills-year" | "senate-bills-year" | "vote-page" | "bureau-page" | "senate-card" | "legislatie-ordinance" | "senate-bulletin" | "committee-report" | "cdep-bill" | "senate-bill" | "cdep-roster";

export interface RawCacheEntry {
  kind: RawCacheKind;
  key: string;
  url: string;
  status: number;
  bytes: number;
  sha256: string;
  fetchedAt: string;
}

const EXTENSIONS: Record<RawCacheKind, string> = {
  "cdep-sitting-days": "txt",
  "cdep-day": "xml",
  "senate-month": "html",
  "senate-day": "html",
  "cdep-bills-year": "html",
  "senate-bills-year": "html",
  "vote-page": "html",
  "bureau-page": "html",
  "senate-card": "html",
  "cdep-bill": "html",
  "senate-bill": "html",
  "cdep-roster": "html",
  "legislatie-ordinance": "xml",
  "senate-bulletin": "pdf",
  "committee-report": "pdf"
};

/**
 * Raw official responses, stored byte for byte before any parsing (D-021: raw pages are evidence).
 * One file per request under `<dir>/<kind>/<key>.<ext>` plus an append-only `manifest.jsonl`.
 */
export class RawCache {
  constructor(readonly dir: string) {}

  filePath(kind: RawCacheKind, key: string): string {
    if (!/^[A-Za-z0-9._-]+$/.test(key)) throw new Error(`Unsafe cache key: ${key}`);
    return path.join(this.dir, kind, `${key}.${EXTENSIONS[kind]}`);
  }

  async has(kind: RawCacheKind, key: string): Promise<boolean> {
    try {
      return (await stat(this.filePath(kind, key))).isFile();
    } catch {
      return false;
    }
  }

  async read(kind: RawCacheKind, key: string): Promise<Buffer | undefined> {
    try {
      return await readFile(this.filePath(kind, key));
    } catch {
      return undefined;
    }
  }

  async write(kind: RawCacheKind, key: string, body: Buffer, meta: { url: string; status: number; now?: Date }): Promise<RawCacheEntry> {
    const file = this.filePath(kind, key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
    const entry: RawCacheEntry = {
      kind,
      key,
      url: meta.url,
      status: meta.status,
      bytes: body.byteLength,
      sha256: createHash("sha256").update(body).digest("hex"),
      fetchedAt: (meta.now ?? new Date()).toISOString()
    };
    await appendFile(path.join(this.dir, "manifest.jsonl"), `${JSON.stringify(entry)}\n`);
    return entry;
  }

  /** The latest manifest line of a saved file: when and from where it was fetched. */
  async lastEntry(kind: RawCacheKind, key: string): Promise<RawCacheEntry | undefined> {
    try {
      const lines = (await readFile(path.join(this.dir, "manifest.jsonl"), "utf8")).split("\n").filter(Boolean);
      for (let index = lines.length - 1; index >= 0; index -= 1) {
        const entry = JSON.parse(lines[index]!) as RawCacheEntry;
        if (entry.kind === kind && entry.key === key) return entry;
      }
    } catch {
      return undefined;
    }
    return undefined;
  }

  /** The latest manifest line of every saved file of a kind, read once (use this instead of `lastEntry` in a loop). */
  async entries(kind: RawCacheKind): Promise<Map<string, RawCacheEntry>> {
    const latest = new Map<string, RawCacheEntry>();
    try {
      for (const line of (await readFile(path.join(this.dir, "manifest.jsonl"), "utf8")).split("\n")) {
        if (!line) continue;
        const entry = JSON.parse(line) as RawCacheEntry;
        if (entry.kind === kind) latest.set(entry.key, entry);
      }
    } catch {
      return latest;
    }
    return latest;
  }

  async keys(kind: RawCacheKind): Promise<string[]> {
    try {
      const extension = `.${EXTENSIONS[kind]}`;
      return (await readdir(path.join(this.dir, kind))).filter((name) => name.endsWith(extension)).map((name) => name.slice(0, -extension.length)).sort();
    } catch {
      return [];
    }
  }
}

const ENCODING_LABELS = /encoding\s*=\s*["']([A-Za-z0-9._-]+)["']/i;

/** Decodes a raw response using the XML declaration when present (CDEP serves ISO-8859-2), UTF-8 otherwise. */
export function decodeOfficialBytes(bytes: Buffer, contentType?: string): string {
  // Some CDEP files declare ISO-8859-2 but are UTF-8 (observed from 2025-02-28); bytes that form valid UTF-8 with
  // multibyte letters are almost never valid Latin-2 text, so UTF-8 wins when it decodes cleanly.
  if (bytes.some((byte) => byte >= 0x80)) {
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      // not UTF-8: fall through to the declared encoding
    }
  }
  const head = bytes.subarray(0, 200).toString("latin1");
  const label = head.match(ENCODING_LABELS)?.[1] ?? contentType?.match(/charset\s*=\s*([A-Za-z0-9._-]+)/i)?.[1] ?? "utf-8";
  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}
