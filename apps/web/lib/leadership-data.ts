import { sql } from "drizzle-orm";
import { createWebDbSession } from "./server-db";

export type LeadershipChamber = "deputies" | "senate";

export interface LeadershipPerson {
  title: string;
  name: string;
  slug: string;
  startsOn: string;
  startsOnPrecision: "day" | "month";
}

export interface LeadershipData {
  bureau: Record<LeadershipChamber, LeadershipPerson[]>;
  groups: Array<{ chamber: LeadershipChamber; group: string; people: LeadershipPerson[] }>;
  committees: Array<{ chamber: LeadershipChamber; committee: string; people: LeadershipPerson[] }>;
}

/** Leader and president first, then deputies, secretaries, questors. Both ş and ș occur in the sources. */
export const positionRank = (title: string): number =>
  /^(?:vice(?:pre[sşș]edinte|lider))/i.test(title) ? 1 : /^(?:pre[sşș]edinte|lider)/i.test(title) ? 0 : /^secretar/i.test(title) ? 2 : 3;

type Row = { chamber: LeadershipChamber; scope: string | null; title: string; name: string; slug: string; starts_on: string; precision: string };

/** Who holds each leadership role today: the Permanent Bureaus, the groups' leaders and the committees' chairs. */
export async function getLeadership(): Promise<LeadershipData | undefined> {
  if (!process.env.DATABASE_URL) return undefined;
  const session = createWebDbSession();
  try {
    const rows = [...(await session.db.execute<Row>(sql`
      select r.chamber::text as chamber, case when r.kind = 'group' then g.short_name else null end as scope, r.title, m.display_name as name, m.slug,
             to_char(r.starts_on, 'YYYY-MM-DD') as starts_on, r.starts_on_precision as precision, r.kind
      from member_roles r join members m on m.id = r.member_id left join parliamentary_groups g on g.id = r.group_id
      where r.kind in ('bureau', 'group') and r.ends_on is null
        and r.starts_on >= (select starts_on from legislatures order by starts_on desc limit 1) - interval '1 day'
      order by r.chamber, r.kind, g.short_name, r.starts_on`))] as Array<Row & { kind: string }>;
    const committeeRows = [...(await session.db.execute<Row>(sql`
      select c.chamber::text as chamber, c.committee_name as scope, c.role as title, m.display_name as name, m.slug,
             to_char(c.starts_on, 'YYYY-MM-DD') as starts_on, c.starts_on_precision as precision
      from member_committee_memberships c join members m on m.id = c.member_id
      where c.ends_on is null and c.role ~* '^(pre[sş]edint|vicepre[sş]edint)' and c.chamber in ('deputies', 'senate')
        and c.starts_on >= (select starts_on from legislatures order by starts_on desc limit 1) - interval '1 day'
        and exists (select 1 from member_mandates mm where mm.member_id = c.member_id and mm.ends_on is null and mm.legislature_id = (select id from legislatures order by starts_on desc limit 1))
      order by c.chamber, c.committee_name, c.role`))];
    const person = (row: Row): LeadershipPerson => ({ title: row.title, name: row.name, slug: row.slug, startsOn: row.starts_on, startsOnPrecision: row.precision === "month" ? "month" : "day" });
    const bureau: LeadershipData["bureau"] = { deputies: [], senate: [] };
    const groups = new Map<string, LeadershipData["groups"][number]>();
    for (const row of rows) {
      if (row.kind === "bureau") bureau[row.chamber].push(person(row));
      else {
        const key = `${row.chamber}|${row.scope}`;
        const entry = groups.get(key) ?? { chamber: row.chamber, group: row.scope ?? "", people: [] };
        entry.people.push(person(row));
        groups.set(key, entry);
      }
    }
    for (const chamber of ["deputies", "senate"] as const) bureau[chamber].sort((a, b) => positionRank(a.title) - positionRank(b.title) || a.name.localeCompare(b.name));
    const committees = new Map<string, LeadershipData["committees"][number]>();
    for (const row of committeeRows) {
      const key = `${row.chamber}|${row.scope}`;
      const entry = committees.get(key) ?? { chamber: row.chamber, committee: row.scope ?? "", people: [] };
      entry.people.push(person(row));
      committees.set(key, entry);
    }
    const ordered = <T extends { people: LeadershipPerson[] }>(items: T[]) => items.map((item) => ({ ...item, people: [...item.people].sort((a, b) => positionRank(a.title) - positionRank(b.title)) }));
    return { bureau, groups: ordered([...groups.values()]), committees: ordered([...committees.values()]) };
  } catch {
    return undefined;
  } finally {
    await session.close();
  }
}
