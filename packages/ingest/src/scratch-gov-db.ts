import { sql } from "drizzle-orm";
import { createDbSession } from "@cumsevoteaza/db";
async function main() {
  const session = createDbSession();
  try {
    const k = [...(await session.db.execute<any>(sql`select issued_on::text d, number||'/'||year ref, kind, portal_id, subject from presidential_decrees where subject ilike '%Statului Major%' or subject ilike '%șef al Statului%' or subject ilike '%şef al Statului%' or subject ilike '%şefului Statului%' order by issued_on`))];
    console.log(k.length);
    for (const r of k.slice(0, 60)) console.log(r.d, r.ref, r.kind, r.portal_id, "|", r.subject.slice(0, 200));
  } finally { await (session as any).close?.(); }
}
main().catch((e) => { console.error(e); process.exit(1); });
