import { sql } from "drizzle-orm";
import { createWebDbSession } from "@/lib/server-db";

type Section = { type: string; enabled: boolean; ro?: string; en?: string };
type Topic = { label: string; relevance: string; evidence: Array<{ quote: string; officialUrl?: string }> };
const sectionNames: Record<string, [string, string]> = {
  introduction: ["Despre această pagină", "About this page"], methodology: ["Metodologie", "Methodology"],
  editorial_note: ["Notă editorială", "Editorial note"], reviewed_topics: ["Teme revizuite", "Reviewed topics"]
};
function safeUrl(value?: string) {
  try { const url = new URL(value ?? ""); return ["https:", "http:"].includes(url.protocol) ? url.href : undefined; } catch { return undefined; }
}
export async function EditorialSections({ page, locale, entityId, billId }: { page: string; locale: string; entityId?: string; billId?: string }) {
  const session = createWebDbSession();
  try {
    const rows = await session.db.execute(sql`select content from cockpit_editorial where page=${page}
      and (entity_id is null or entity_id=${entityId ?? ""}) order by entity_id nulls last limit 1`);
    const content = rows[0]?.content as {sections?: Section[]} | undefined;
    if (!content?.sections?.length) return null;
    const topics = billId ? await session.db.execute(sql`select label,relevance,evidence from cockpit_topic_labels where bill_id=${billId} order by label`) as unknown as Topic[] : [];
    return <div className="mb-8 space-y-4" data-editorial-page={page}>{content.sections.filter(s=>s.enabled && sectionNames[s.type]).map(section=> {
      const fallback = locale === "en" && !section.en?.trim();
      const text = locale === "en" && section.en?.trim() ? section.en : section.ro;
      if (section.type === "reviewed_topics" && !topics.length) return null;
      return <section key={section.type} className="border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold text-slate-900">{sectionNames[section.type]?.[locale === "en" ? 1 : 0]}</h2>
        {section.type === "reviewed_topics" ? <div className="mt-3 space-y-4">{topics.map(topic=><article key={topic.label}>
          <h3 className="font-medium text-teal-800">{topic.label} · {topic.relevance}</h3>
          {topic.evidence.map((e,index)=><blockquote key={index} className="mt-2 border-l-2 border-teal-200 pl-3 text-sm text-slate-600">
            <p>{e.quote}</p>{safeUrl(e.officialUrl)&&<a className="text-teal-800 underline" href={safeUrl(e.officialUrl)} target="_blank" rel="noreferrer">{locale === "en" ? "Official source" : "Sursa oficială"}</a>}
          </blockquote>)}
        </article>)}</div> : <>{fallback&&<p className="mt-2 text-xs text-amber-800">Romanian original · English translation pending</p>}<p lang={fallback ? "ro" : locale} className="mt-3 whitespace-pre-wrap text-sm leading-7 text-slate-700">{text}</p></>}
      </section>;
    })}</div>;
  } catch (error) {
    // Allow rolling out the app before applying the reviewed content migration.
    const code = (error as {code?:string;cause?:{code?:string}}).code ?? (error as {cause?:{code?:string}}).cause?.code;
    if (code === "42P01" || code === "ECONNREFUSED") return null;
    throw error;
  } finally { await session.close(); }
}
