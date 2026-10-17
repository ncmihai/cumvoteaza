import { unstable_cache } from "next/cache";
import { sql } from "drizzle-orm";
import { CACHE_TAGS, createWebDbSession, timed } from "./server-db";

/**
 * The disciplinary sanctions the Chamber lists against a deputy ("Sancțiuni aplicate deputaților", D-052), as the Chamber words them. Shown on the member's own page only: there is no list
 * of members by sanctions and no count (D-029). A sanction whose contestation the plenary upheld is shown as annulled.
 */
export interface SanctionPartView { kind: string; percent?: number; months?: number; seconds?: number }
export interface SanctionView {
  id: string;
  legislature: string;
  heldOn?: string;
  headline: string;
  kind: string;
  parts: SanctionPartView[];
  article?: string;
  decision?: { label: string; url: string };
  contestationFiledUrl?: string;
  contestation?: { outcome: "rejected" | "upheld"; label: string; url?: string };
  stenogramUrl?: string;
}

type Row = {
  id: string; legislature: string; held_on: string | null; headline: string; kind: string; parts: SanctionPartView[]; article: string | null; decision_label: string | null; decision_url: string | null;
  contestation_filed_url: string | null; contestation_outcome: "rejected" | "upheld" | null; contestation_label: string | null; contestation_url: string | null; stenogram_url: string | null;
};

async function getMemberSanctionsUncached(personId: string): Promise<SanctionView[]> {
  if (!process.env.DATABASE_URL) return [];
  const session = createWebDbSession();
  try {
    const rows = [...(await session.db.execute<Row>(sql`
      select id, legislature, held_on::text as held_on, headline, kind, parts, article, decision_label, decision_url, contestation_filed_url, contestation_outcome, contestation_label, contestation_url, stenogram_url
      from member_sanctions where person_id = ${personId} order by held_on desc nulls last, id`))];
    return rows.map((row) => ({
      id: row.id, legislature: row.legislature, headline: row.headline, kind: row.kind, parts: row.parts ?? [],
      ...(row.held_on ? { heldOn: row.held_on } : {}),
      ...(row.article ? { article: row.article } : {}),
      ...(row.decision_url ? { decision: { label: row.decision_label ?? "", url: row.decision_url } } : {}),
      ...(row.contestation_filed_url ? { contestationFiledUrl: row.contestation_filed_url } : {}),
      ...(row.contestation_outcome ? { contestation: { outcome: row.contestation_outcome, label: row.contestation_label ?? "", ...(row.contestation_url ? { url: row.contestation_url } : {}) } } : {}),
      ...(row.stenogram_url ? { stenogramUrl: row.stenogram_url } : {})
    }));
  } catch {
    // The table does not exist yet (the migration has not run here): the page shows nothing.
    return [];
  } finally {
    await session.close();
  }
}

const getCachedMemberSanctions = unstable_cache((personId: string) => timed(`data.member-sanctions.${personId}`, () => getMemberSanctionsUncached(personId)), ["member-sanctions-v1"], { revalidate: 900, tags: [CACHE_TAGS.members] });

export async function getMemberSanctions(personId: string | undefined): Promise<SanctionView[]> {
  return personId ? getCachedMemberSanctions(personId) : [];
}
