import { and, eq, inArray, sql } from "drizzle-orm";
import {
  compareDocumentSequence,
  scoreOcrHealth,
  type DocumentComparison,
  type DocumentKindText
} from "@cumsevoteaza/parliament-model";
import * as schema from "@cumsevoteaza/db";
import { createWebDbSession } from "./server-db";

export interface BillTextSearchResult {
  documentId: string;
  label: string;
  documentKind: string;
  snippets: string[];
}

interface DocumentTextRow extends Record<string, unknown> {
  document_id: string;
  label: string;
  document_kind: string;
  text: string;
}

const documentKindOrder = ["proposal", "senate_adopted_form", "committee_report", "adopted_form", "promulgation_form"];

export async function searchBillText(billIdOrSlug: string, query: string): Promise<BillTextSearchResult[]> {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length < 2 || !process.env.DATABASE_URL) return [];
  const rows = await loadSearchableDocumentTexts(billIdOrSlug);
  const lower = normalizedQuery.toLowerCase();
  return rows
    .map((row) => ({
      documentId: row.document_id,
      label: row.label,
      documentKind: row.document_kind,
      snippets: snippetsFor(row.text, lower)
    }))
    .filter((row) => row.snippets.length > 0);
}

export async function getBillTextComparisons(billId: string): Promise<DocumentComparison[]> {
  if (!process.env.DATABASE_URL) return [];
  const rows = await loadSearchableDocumentTexts(billId);
  const documents = documentKindOrder
    .flatMap((kind): DocumentKindText[] => {
      const row = rows.find((item) => item.document_kind === kind);
      return row
        ? [{
            documentId: row.document_id,
            label: row.label,
            documentKind: row.document_kind,
            text: row.text
          }]
        : [];
    });
  return compareDocumentSequence(documents).filter((comparison) => comparison.added + comparison.removed + comparison.changed > 0);
}

async function loadSearchableDocumentTexts(billIdOrSlug: string): Promise<DocumentTextRow[]> {
  const session = createWebDbSession();
  try {
    const billRows = await session.db
      .select({ id: schema.bills.id })
      .from(schema.bills)
      .where(sql`${schema.bills.id} = ${billIdOrSlug} or ${schema.bills.slug} = ${billIdOrSlug}`)
      .limit(1);
    const billId = billRows[0]?.id;
    if (!billId) return [];

    const documentRows = await session.db
      .select()
      .from(schema.documents)
      .where(and(eq(schema.documents.billId, billId), eq(schema.documents.textStatus, "stored")));
    if (documentRows.length === 0) return [];

    const excludedDocumentIds = new Set<string>();

    const rows = await session.db.execute<DocumentTextRow>(sql`
      select
        d.id as document_id,
        d.label,
        d.document_kind,
        string_agg(c.text, E'\n' order by c.chunk_index) as text
      from documents d
      join bill_document_text_chunks c on c.document_id = d.id
      where d.bill_id = ${billId}
        and d.text_status = 'stored'
      group by d.id, d.label, d.document_kind
      order by d.document_kind, d.id
    `);

    for (const row of rows) {
      if (scoreOcrHealth({ text: row.text, chunkCount: 1 }).reasons.length > 0) excludedDocumentIds.add(row.document_id);
    }
    return rows.filter((row) => !excludedDocumentIds.has(row.document_id));
  } finally {
    await session.close();
  }
}

function snippetsFor(text: string, lowerQuery: string): string[] {
  const lowerText = text.toLowerCase();
  const snippets: string[] = [];
  let index = lowerText.indexOf(lowerQuery);
  while (index >= 0 && snippets.length < 5) {
    const start = Math.max(0, index - 120);
    const end = Math.min(text.length, index + lowerQuery.length + 160);
    snippets.push(`${start > 0 ? "..." : ""}${text.slice(start, end).trim()}${end < text.length ? "..." : ""}`);
    index = lowerText.indexOf(lowerQuery, index + lowerQuery.length);
  }
  return snippets;
}
