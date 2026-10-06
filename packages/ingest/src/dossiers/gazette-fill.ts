import { sql } from "drizzle-orm";
import type { DbClient } from "@cumsevoteaza/db";
import { lawGazette, legislatieToken, searchActs } from "./gazette-lookup";

export interface GazetteFillResult {
  withoutGazette: number;
  found: Array<{ bill: string; law: string; gazetteNumber: string; gazetteOn: string }>;
  notFound: Array<{ bill: string; law: string; reason: string }>;
}

/**
 * The Official Gazette number of promulgated laws whose dossier pages do not print it (a Chamber-only page, or a law published after the page was
 * saved), from legislatie.just.ro's search by law number and year. The law's own date must equal the promulgation date or nothing is written.
 * One request per law, `delayMs` apart.
 */
export async function fillGazetteNumbers(db: DbClient, options: { persist: boolean; delayMs: number }): Promise<GazetteFillResult> {
  const rows = [...(await db.execute<{ bill_id: string; law_number: string; law_year: number; decree_on: string | null }>(sql`
    select d.bill_id, d.law_number, d.law_year, d.decree_on::text as decree_on from bill_dossiers d
    where d.outcome = 'promulgated' and d.gazette_number is null and d.law_number is not null and d.law_year is not null
    order by d.law_year, d.law_number::int`))];
  const token = rows.length ? await legislatieToken() : "";
  const found: GazetteFillResult["found"] = [];
  const notFound: GazetteFillResult["notFound"] = [];
  for (const row of rows) {
    const law = `${row.law_number}/${row.law_year}`;
    await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    const gazette = lawGazette(await searchActs(token, row.law_year, row.law_number), row.law_number);
    if (!gazette) notFound.push({ bill: row.bill_id, law, reason: "no published law with that number and year yet" });
    else if (row.decree_on && gazette.lawOn !== row.decree_on.slice(0, 10)) notFound.push({ bill: row.bill_id, law, reason: `the law is dated ${gazette.lawOn}, the promulgation decree ${row.decree_on.slice(0, 10)}` });
    else found.push({ bill: row.bill_id, law, gazetteNumber: gazette.gazetteNumber, gazetteOn: gazette.gazetteOn });
  }
  if (options.persist) {
    for (const item of found) await db.execute(sql`update bill_dossiers set gazette_number = ${item.gazetteNumber}, gazette_on = ${item.gazetteOn}::date where bill_id = ${item.bill} and gazette_number is null`);
  }
  return { withoutGazette: rows.length, found, notFound };
}
