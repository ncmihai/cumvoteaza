import { inArray } from "drizzle-orm";
import { createDbSession } from "@cumsevoteaza/db";
import * as schema from "@cumsevoteaza/db";

export async function classifyBillMinistryRelations() {
  const session = createDbSession();
  try {
    const [ministries, aliases, sponsors, chunks, documents] = await Promise.all([
      session.db.select().from(schema.ministries),
      session.db.select().from(schema.ministryAliases),
      session.db.select().from(schema.billSponsors),
      session.db.select().from(schema.billDocumentTextChunks),
      session.db.select().from(schema.documents)
    ]);
    const documentById = new Map(documents.map((item) => [item.id, item]));
    const ministryById = new Map(ministries.map((item) => [item.id, item]));
    const namesByMinistry = new Map<string, string[]>();
    for (const ministry of ministries) namesByMinistry.set(ministry.id, [ministry.name]);
    for (const alias of aliases) namesByMinistry.set(alias.ministryId, [...(namesByMinistry.get(alias.ministryId) ?? []), alias.name]);

    await session.db.delete(schema.billMinistryRelations).where(inArray(schema.billMinistryRelations.relation, ["initiator", "official_document_mention"]));
    const relations = new Map<string, typeof schema.billMinistryRelations.$inferInsert>();

    for (const sponsor of sponsors) {
      const normalized = normalizeMinistryText(sponsor.name);
      for (const [ministryId, names] of namesByMinistry) {
        if (!names.some((name) => normalizeMinistryText(name) === normalized)) continue;
        const ministry = ministryById.get(ministryId)!;
        relations.set(`${sponsor.billId}:${ministryId}:initiator`, {
          id: `bill-ministry-${sponsor.billId}-${ministry.slug}-initiator`, billId: sponsor.billId, ministryId,
          relation: "initiator", confidence: "official", reason: "Ministerul este numit explicit ca inițiator în dosarul parlamentar."
        });
      }
    }

    for (const chunk of chunks) {
      const document = documentById.get(chunk.documentId);
      if (!document) continue;
      const haystack = normalizeMinistryText(chunk.text);
      for (const [ministryId, names] of namesByMinistry) {
        const matched = names.find((name) => haystack.includes(normalizeMinistryText(name)));
        if (!matched) continue;
        const ministry = ministryById.get(ministryId)!;
        const key = `${chunk.billId}:${ministryId}:official_document_mention`;
        if (relations.has(key)) continue;
        relations.set(key, {
          id: `bill-ministry-${chunk.billId}-${ministry.slug}-document-mention`, billId: chunk.billId, ministryId,
          relation: "official_document_mention", confidence: "suggested",
          reason: "Ministerul este menționat explicit într-un document oficial al dosarului; legătura tematică necesită confirmare editorială.",
          documentId: document.id, sourceUrl: document.url, evidenceExcerpt: ministryEvidenceExcerpt(chunk.text, matched)
        });
      }
    }

    for (const relation of relations.values()) {
      await session.db.insert(schema.billMinistryRelations).values(relation).onConflictDoUpdate({
        target: schema.billMinistryRelations.id,
        set: { confidence: relation.confidence, reason: relation.reason, documentId: relation.documentId, sourceUrl: relation.sourceUrl, evidenceExcerpt: relation.evidenceExcerpt }
      });
    }
    return {
      total: relations.size,
      official: [...relations.values()].filter((item) => item.confidence === "official").length,
      suggested: [...relations.values()].filter((item) => item.confidence === "suggested").length
    };
  } finally {
    await session.close();
  }
}

export function normalizeMinistryText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("ro").replace(/\s+/g, " ").trim();
}

export function ministryEvidenceExcerpt(text: string, match: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  const index = normalizeMinistryText(compact).indexOf(normalizeMinistryText(match));
  const start = Math.max(0, index - 90);
  return compact.slice(start, start + 260).trim();
}
