import { asc, inArray } from "drizzle-orm";
import { parseBillText, scoreOcrHealth } from "@cumsevoteaza/parliament-model";
import * as schema from "@cumsevoteaza/db";
import { confidenceForDocument, type SourceConfidence } from "./source-confidence";
import { createWebDbSession } from "./server-db";

export async function getDocumentConfidenceMap(documentIds: string[]): Promise<Map<string, SourceConfidence>> {
  const uniqueIds = [...new Set(documentIds.filter(Boolean))];
  if (uniqueIds.length === 0 || !process.env.DATABASE_URL) return new Map();

  const session = createWebDbSession();
  try {
    const documents = await session.db
      .select({
        id: schema.documents.id,
        textStatus: schema.documents.textStatus
      })
      .from(schema.documents)
      .where(inArray(schema.documents.id, uniqueIds));
    const chunkRows = await session.db
      .select({
        documentId: schema.billDocumentTextChunks.documentId,
        text: schema.billDocumentTextChunks.text
      })
      .from(schema.billDocumentTextChunks)
      .where(inArray(schema.billDocumentTextChunks.documentId, uniqueIds))
      .orderBy(asc(schema.billDocumentTextChunks.documentId), asc(schema.billDocumentTextChunks.chunkIndex));
    const textByDocument = new Map<string, string>();
    for (const row of chunkRows) {
      textByDocument.set(row.documentId, [textByDocument.get(row.documentId), row.text].filter(Boolean).join("\n"));
    }
    const result = new Map<string, SourceConfidence>();

    for (const document of documents) {
      const text = textByDocument.get(document.id) ?? "";
      const hasOpenIssue = document.textStatus === "stored" && hasTextHealthIssue(text);
      result.set(document.id, confidenceForDocument({
        textStatus: document.textStatus,
        hasOpenIssue
      }));
    }
    return result;
  } finally {
    await session.close();
  }
}

function hasTextHealthIssue(text: string): boolean {
  return scoreOcrHealth({ text, chunkCount: text ? 1 : 0 }).reasons.length > 0 || parseBillText(text).warnings.length > 0;
}
