import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { eq, sql } from "drizzle-orm";
import { createDbSession } from "@cumsevoteaza/db";
import * as schema from "@cumsevoteaza/db";
import type { BillDocumentTextChunk, DocumentTextStatus } from "@cumsevoteaza/parliament-model";
import { uploadDerivedAsset } from "./asset-import";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export type BillTextImportOptions = {
  billId?: string;
  documentId?: string;
  documentKind?: string;
  persist?: boolean;
  timeoutMs?: number;
  insecure?: boolean;
};

export type BillTextBatchOptions = {
  year?: number;
  limit?: number;
  documentKind?: string;
  includeFailed?: boolean;
  includeUnsupported?: boolean;
  persist?: boolean;
  timeoutMs?: number;
  insecure?: boolean;
};

interface BillTextCandidate extends Record<string, unknown> {
  document_id: string;
  bill_id: string;
  title: string;
  document_kind: string;
  text_status: DocumentTextStatus;
  url: string;
  event_on: string | null;
}

export async function importBillText(options: BillTextImportOptions) {
  if (!options.billId && !options.documentId) {
    throw new Error("ingest:bill-text requires --bill=<bill-id> or --document=<document-id>.");
  }

  const session = createDbSession();
  try {
    const document = await selectDocument(session.db, options);
    if (!document) {
      return { status: "missing" as const, documentId: options.documentId, billId: options.billId, reason: "No matching document found." };
    }

    if (!options.persist) {
      return {
        status: "dry_run" as const,
        documentId: document.id,
        billId: document.billId,
        documentKind: document.documentKind,
        officialUrl: document.url
      };
    }

    const now = new Date();
    const extraction = await fetchAndExtractPdfText(document.url, {
      timeoutMs: options.timeoutMs ?? 30_000,
      insecure: Boolean(options.insecure)
    });
    if (extraction.status !== "stored") {
      await updateDocumentTextStatus(session.db, document.id, extraction.status, undefined, undefined, now);
      return {
        status: extraction.status,
        documentId: document.id,
        billId: document.billId,
        error: extraction.error
      };
    }

    const text = cleanExtractedText(extraction.text);
    const chunks = chunkText(text).map((chunk, index): BillDocumentTextChunk => ({
      id: `bill-text-chunk-${document.id}-${index}`,
      documentId: document.id,
      billId: document.billId,
      chunkIndex: index,
      text: chunk
    }));
    const bytes = Buffer.from(text, "utf8");
    const contentHash = createHash("sha256").update(bytes).digest("hex");
    const object = await uploadDerivedAsset({
      objectPath: `parliament-assets/bill-text/${document.billId}/${document.id}-${contentHash.slice(0, 16)}.txt`,
      bytes,
      mimeType: "text/plain; charset=utf-8"
    });
    const assetId = `asset-bill-text-${document.id}`;

    await session.db.transaction(async (db) => {
    await db
      .insert(schema.storedAssets)
      .values({
        id: assetId,
        entityType: "bill_document",
        entityId: document.id,
        assetType: "bill_text",
        officialUrl: document.url,
        storageProvider: object.storageProvider,
        storagePath: object.storagePath,
        publicUrl: object.publicUrl ?? null,
        blobUrl: object.blobUrl ?? null,
        contentHash,
        mimeType: "text/plain; charset=utf-8",
        byteSize: bytes.byteLength,
        fetchStatus: "stored",
        lastAttemptAt: now,
        updatedAt: now
      })
      .onConflictDoUpdate({
        target: schema.storedAssets.id,
        set: {
          storageProvider: object.storageProvider,
          storagePath: object.storagePath,
          publicUrl: object.publicUrl ?? null,
          blobUrl: object.blobUrl ?? null,
          contentHash,
          mimeType: "text/plain; charset=utf-8",
          byteSize: bytes.byteLength,
          fetchStatus: "stored",
          lastAttemptAt: now,
          updatedAt: now
        }
      });

    await db.delete(schema.billDocumentTextChunks).where(eq(schema.billDocumentTextChunks.documentId, document.id));
    if (chunks.length > 0) {
      await db.insert(schema.billDocumentTextChunks).values(chunks);
    }
    await updateDocumentTextStatus(db, document.id, "stored", assetId, text.slice(0, 800), now);
    });

    return {
      status: "stored" as const,
      documentId: document.id,
      billId: document.billId,
      assetId,
      chunks: chunks.length,
      byteSize: bytes.byteLength
    };
  } finally {
    await session.close();
  }
}

export async function importBillTextBatch(options: BillTextBatchOptions) {
  const candidates = await selectBatchCandidates(options);
  const rows = [];
  for (const candidate of candidates) {
    const result = await importBillText({
      documentId: candidate.document_id,
      documentKind: options.documentKind,
      timeoutMs: options.timeoutMs,
      insecure: options.insecure,
      persist: options.persist
    });
    rows.push({
      documentId: candidate.document_id,
      billId: candidate.bill_id,
      billTitle: candidate.title,
      documentKind: candidate.document_kind,
      previousTextStatus: candidate.text_status,
      officialUrl: candidate.url,
      result
    });
    if (options.persist) await sleep(500);
  }

  return {
    filters: {
      year: options.year,
      limit: options.limit ?? 10,
      documentKind: options.documentKind ?? "proposal",
      includeFailed: Boolean(options.includeFailed),
      includeUnsupported: Boolean(options.includeUnsupported),
      persist: Boolean(options.persist)
    },
    candidates: candidates.length,
    stored: rows.filter((row) => row.result.status === "stored").length,
    unsupported: rows.filter((row) => row.result.status === "unsupported").length,
    failed: rows.filter((row) => row.result.status === "failed").length,
    missing: rows.filter((row) => row.result.status === "missing").length,
    dryRun: rows.filter((row) => row.result.status === "dry_run").length,
    rows
  };
}

async function selectDocument(db: Omit<ReturnType<typeof createDbSession>["db"], "$client">, options: BillTextImportOptions) {
  if (options.documentId) {
    return db.query.documents.findFirst({ where: eq(schema.documents.id, options.documentId) });
  }
  const rows = await db.select().from(schema.documents).where(eq(schema.documents.billId, options.billId!));
  const wantedKind = options.documentKind ?? "proposal";
  // Never silently extract the first arbitrary document. Senate dossiers
  // commonly list an explanatory memorandum before the operative proposal;
  // using that fallback makes analysis appear complete while feeding it the
  // wrong legal text. A missing requested kind is an explicit missing result.
  return rows.find((row) => row.documentKind === wantedKind);
}

async function selectBatchCandidates(options: BillTextBatchOptions): Promise<BillTextCandidate[]> {
  const session = createDbSession();
  const documentKind = options.documentKind ?? "proposal";
  const limit = options.limit ?? 10;
  const statusFilter = options.includeUnsupported
    ? sql`and d.text_status in ('pending', 'failed', 'missing', 'unsupported')`
    : options.includeFailed
    ? sql`and d.text_status in ('pending', 'failed', 'missing')`
    : sql`and d.text_status = 'pending'`;
  try {
    return await session.db.execute<BillTextCandidate>(sql`
      select
        d.id as document_id,
        d.bill_id,
        b.title,
        d.document_kind,
        d.text_status,
        d.url,
        coalesce(bvs.latest_event_on, bvs.submitted_on) as event_on
      from documents d
      join bills b on b.id = d.bill_id
      left join bill_vote_summaries bvs on bvs.bill_id = b.id
      where d.document_kind = ${documentKind}
        ${statusFilter}
        ${options.year ? sql`and coalesce(bvs.latest_event_on, bvs.submitted_on) >= ${`${options.year}-01-01`}::date and coalesce(bvs.latest_event_on, bvs.submitted_on) < ${`${options.year + 1}-01-01`}::date` : sql``}
      order by coalesce(bvs.latest_event_on, bvs.submitted_on) desc nulls last, d.bill_id, d.id
      limit ${limit}
    `);
  } finally {
    await session.close();
  }
}

async function fetchAndExtractPdfText(url: string, options: { timeoutMs: number; insecure: boolean }): Promise<
  | { status: "stored"; text: string }
  | { status: Exclude<DocumentTextStatus, "pending" | "stored">; error: string }
> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  const previousTlsSetting = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  try {
    if (options.insecure) process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    const response = await fetch(url, {
      headers: { "User-Agent": "cumsevoteaza-bill-text/0.1 (+temporary PDF text extraction)" },
      signal: controller.signal
    });
    if (response.status === 404) return { status: "missing", error: "Official PDF returned 404." };
    if (!response.ok) return { status: "failed", error: `Official PDF returned HTTP ${response.status}.` };
    const bytes = Buffer.from(await response.arrayBuffer());
    const text = await extractPdfText(bytes);
    if (text.length < 40) return { status: "unsupported", error: "No useful text could be extracted from this PDF." };
    return { status: "stored", text };
  } catch (error) {
    return { status: "failed", error: error instanceof Error ? error.message : String(error) };
  } finally {
    if (options.insecure) {
      if (previousTlsSetting === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
      else process.env.NODE_TLS_REJECT_UNAUTHORIZED = previousTlsSetting;
    }
    clearTimeout(timeout);
  }
}

export function cleanExtractedText(text: string): string {
  return text
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function chunkText(text: string, size = 1800): string[] {
  const chunks: string[] = [];
  const normalized = cleanExtractedText(text);
  for (let index = 0; index < normalized.length; index += size) {
    chunks.push(normalized.slice(index, index + size).trim());
  }
  return chunks.filter(Boolean);
}

async function extractPdfText(bytes: Buffer): Promise<string> {
  const pythonText = await extractPdfTextWithPython(bytes);
  if (pythonText && pythonText.length > 40) return pythonText;
  const ocrText = await extractPdfTextWithMacVision(bytes);
  if (ocrText && ocrText.length > 40) return ocrText;
  const raw = bytes.toString("latin1");
  const literalStrings = [...raw.matchAll(/\(([^()]{3,1000})\)\s*Tj/g)].map((match) => decodePdfLiteral(match[1] ?? ""));
  const arrayStrings = [...raw.matchAll(/\[((?:\s*\([^()]{1,1000}\)\s*-?\d*\.?\d*)+)\]\s*TJ/g)].flatMap((match) =>
    [...(match[1] ?? "").matchAll(/\(([^()]{1,1000})\)/g)].map((part) => decodePdfLiteral(part[1] ?? ""))
  );
  return cleanExtractedText([...literalStrings, ...arrayStrings].join(" "));
}

async function extractPdfTextWithMacVision(bytes: Buffer): Promise<string | undefined> {
  const scriptPath = path.join(repoRoot, "tools/pdf-ocr/extract_pdf_text.swift");
  if (!existsSync(scriptPath)) return undefined;
  const tempDir = await mkdtemp(path.join(tmpdir(), "cumvoteaza-bill-ocr-"));
  const pdfPath = path.join(tempDir, "document.pdf");
  try {
    await writeFile(pdfPath, bytes);
    const { stdout } = await execFileAsync("swift", [scriptPath, pdfPath], {
      maxBuffer: 20 * 1024 * 1024,
      timeout: 120_000
    });
    const text = cleanExtractedText(stdout);
    return text.length > 40 ? text : undefined;
  } catch {
    return undefined;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function extractPdfTextWithPython(bytes: Buffer): Promise<string | undefined> {
  const candidates = [
    process.env.PYTHON_BIN,
    process.env.HOME ? path.join(process.env.HOME, "miniconda3/bin/python") : undefined,
    "python3"
  ].filter(Boolean) as string[];
  const tempDir = await mkdtemp(path.join(tmpdir(), "cumvoteaza-bill-pdf-"));
  const pdfPath = path.join(tempDir, "document.pdf");
  try {
    await writeFile(pdfPath, bytes);
    for (const python of candidates) {
      if (python.includes("/") && !existsSync(python)) continue;
      try {
        const { stdout } = await execFileAsync(
          python,
          [
            "-c",
            [
              "from pypdf import PdfReader",
              "import sys",
              "reader = PdfReader(sys.argv[1])",
              "print('\\n\\n'.join((page.extract_text() or '') for page in reader.pages))"
            ].join("; "),
            pdfPath
          ],
          { maxBuffer: 20 * 1024 * 1024 }
        );
        const text = cleanExtractedText(stdout);
        if (text.length > 40) return text;
      } catch {
        continue;
      }
    }
    return undefined;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function decodePdfLiteral(value: string): string {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\\t/g, " ")
    .replace(/\\([()\\])/g, "$1");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function updateDocumentTextStatus(
  db: Omit<ReturnType<typeof createDbSession>["db"], "$client">,
  documentId: string,
  status: DocumentTextStatus,
  textAssetId: string | undefined,
  textPreview: string | undefined,
  now: Date
) {
  await db
    .update(schema.documents)
    .set({
      textStatus: status,
      textAssetId,
      textPreview,
      lastTextAttemptAt: now
    })
    .where(eq(schema.documents.id, documentId));
}
