import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import type { DbClient } from "@cumsevoteaza/db";

export type GovernmentPersonLink = { governmentPersonId: string; canonicalPersonId: string; reason: string };

export type GovernmentPersonLinkPlan = {
  link: GovernmentPersonLink;
  status: "ready" | "already_linked" | "missing_government_person" | "missing_canonical_person" | "canonical_has_no_mandate";
  /** What would be repointed, per referencing table. */
  references: Record<string, number>;
  governmentService: string;
  mandates: string;
};

export function readGovernmentPersonLinks(path: string): GovernmentPersonLink[] {
  return (JSON.parse(readFileSync(path, "utf8")) as { links: GovernmentPersonLink[] }).links;
}

/** Every column that references people(id), from the catalog, so no table is forgotten. */
async function personReferences(db: DbClient): Promise<Array<{ table: string; column: string }>> {
  const rows = await db.execute<{ table_name: string; column_name: string }>(sql`
    select c.conrelid::regclass::text as table_name, a.attname as column_name
    from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
    where c.contype = 'f' and c.confrelid = 'people'::regclass`);
  return rows.map((row) => ({ table: row.table_name.replace(/^public\./, ""), column: row.column_name }));
}

export async function planGovernmentPersonLinks(db: DbClient, links: GovernmentPersonLink[]): Promise<GovernmentPersonLinkPlan[]> {
  const references = await personReferences(db);
  const plans: GovernmentPersonLinkPlan[] = [];
  for (const link of links) {
    const [government] = await db.execute<{ id: string }>(sql`select id from people where id = ${link.governmentPersonId}`);
    const [canonical] = await db.execute<{ id: string }>(sql`select id from people where id = ${link.canonicalPersonId}`);
    const [alias] = await db.execute<{ canonical_id: string }>(sql`select canonical_id from id_aliases where alias_id = ${link.governmentPersonId} and kind = 'person'`);
    const counts: Record<string, number> = {};
    for (const ref of references) {
      const [row] = await db.execute<{ n: number }>(sql`select count(*)::int as n from ${sql.identifier(ref.table)} where ${sql.identifier(ref.column)} = ${link.governmentPersonId}`);
      if (row && row.n > 0) counts[`${ref.table}.${ref.column}`] = row.n;
    }
    const [service] = await db.execute<{ s: string | null }>(sql`
      select string_agg(distinct left(g.name, 40) || ' ' || to_char(r.starts_on, 'YYYY'), '; ') as s
      from government_roles r join governments g on g.id = r.government_id where r.person_id = ${link.governmentPersonId}`);
    const [mandates] = await db.execute<{ s: string | null; n: number }>(sql`
      select string_agg(distinct left(l.label, 4) || ' ' || mm.chamber, ', ') as s, count(*)::int as n
      from members m join member_mandates mm on mm.member_id = m.id join legislatures l on l.id = mm.legislature_id
      where m.person_id = ${link.canonicalPersonId}`);
    plans.push({
      link,
      status: alias ? "already_linked" : !government ? "missing_government_person" : !canonical ? "missing_canonical_person" : (mandates?.n ?? 0) === 0 ? "canonical_has_no_mandate" : "ready",
      references: counts,
      governmentService: service?.s ?? "-",
      mandates: mandates?.s ?? "-"
    });
  }
  return plans;
}

/** Retires the cabinet person in favour of the MP person: alias recorded, every reference repointed, the empty row removed. */
export async function applyGovernmentPersonLinks(db: DbClient, plans: GovernmentPersonLinkPlan[]): Promise<number> {
  const references = await personReferences(db);
  let applied = 0;
  for (const plan of plans.filter((item) => item.status === "ready")) {
    const { governmentPersonId: from, canonicalPersonId: into, reason } = plan.link;
    await db.execute(sql`insert into id_aliases (alias_id, canonical_id, kind, reason) values (${from}, ${into}, 'person', ${reason}) on conflict (alias_id) do update set canonical_id = excluded.canonical_id`);
    for (const ref of references) {
      await db.execute(sql`update ${sql.identifier(ref.table)} set ${sql.identifier(ref.column)} = ${into} where ${sql.identifier(ref.column)} = ${from}`);
    }
    await db.execute(sql`delete from people where id = ${from}`);
    applied += 1;
  }
  return applied;
}
