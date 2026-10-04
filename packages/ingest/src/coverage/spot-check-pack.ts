import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { sql } from "drizzle-orm";
import { createDbSession } from "@cumsevoteaza/db";

export interface SpotCheckItem {
  kind: "vote" | "member" | "minister" | "bill";
  label: string;
  /** Page on our site. */
  ourUrl: string;
  /** Where the official record lives. */
  officialUrl: string | undefined;
  /** What to compare, in the order the official page shows it. */
  compare: string[];
  /** What we store for each of those fields. */
  ours: Record<string, string | number | null | undefined>;
}

const SITE = "https://cumvoteaza.vercel.app/ro";
type Row = Record<string, string | number | null>;

/**
 * About twenty records picked by a fixed hash of their id and the seed (so the same seed gives the same
 * pack), spread over chambers and periods, for a person to check against the official pages.
 */
export async function buildSpotCheckPack(seed: string): Promise<SpotCheckItem[]> {
  const session = createDbSession();
  try {
    const run = async (query: ReturnType<typeof sql>) => [...(await session.db.execute<Row>(query))];
    const items: SpotCheckItem[] = [];

    const voteQuery = (chamber: string, where: ReturnType<typeof sql>, take: number) => sql`
      select v.id, v.chamber::text as chamber, to_char(v.held_on, 'YYYY-MM-DD') as held_on, v.title, v.present, v.for_count, v.against, v.abstention, v.present_not_voting, s.source_url
      from votes v left join source_snapshots s on s.id = v.source_snapshot_id
      where v.chamber::text = ${chamber} and ${where}
      order by md5(v.id || ${seed}) limit ${take}`;
    const votes = [
      ...(await run(voteQuery("deputies", sql`v.held_on >= '2025-01-01'`, 3))),
      ...(await run(voteQuery("senate", sql`v.held_on >= '2025-01-01'`, 3))),
      ...(await run(voteQuery("joint", sql`true`, 1))),
      ...(await run(voteQuery("deputies", sql`v.held_on < '2025-01-01'`, 1)))
    ];
    for (const vote of votes) {
      items.push({
        kind: "vote",
        label: `${vote.chamber} vote of ${vote.held_on}`,
        ourUrl: `${SITE}/votes/${vote.id}`,
        officialUrl: (vote.source_url as string | null) ?? undefined,
        compare: ["Title", "Date", "Present", "For", "Against", "Abstentions", "Present, did not vote"],
        ours: { Title: vote.title, Date: vote.held_on, Present: vote.present, For: vote.for_count, Against: vote.against, Abstentions: vote.abstention, "Present, did not vote": vote.present_not_voting }
      });
    }

    const members = [
      ...(await run(memberQuery(seed, sql`mm.legislature_id = 'leg-2024-2028' and mm.ends_on is null`, 4))),
      ...(await run(memberQuery(seed, sql`mm.legislature_id <> 'leg-2024-2028'`, 2)))
    ];
    for (const member of members) {
      items.push({
        kind: "member",
        label: String(member.display_name),
        ourUrl: `${SITE}/members/${member.slug}`,
        officialUrl: (member.cdep_profile as string | null) ?? undefined,
        compare: ["Name", "Chamber and constituency", "Mandate start", "Parliamentary group (current or last)", "Group start"],
        ours: { Name: member.display_name, "Chamber and constituency": `${member.chamber} · ${member.constituency ?? "unknown"}`, "Mandate start": member.starts_on, "Parliamentary group (current or last)": member.group_name, "Group start": member.group_starts_on }
      });
    }

    const roles = await run(sql`
      select p.display_name, p.slug as person_slug, g.slug as government_slug, g.name as government, r.title, r.ministry, to_char(r.starts_on, 'YYYY-MM-DD') as starts_on, to_char(r.ends_on, 'YYYY-MM-DD') as ends_on, s.source_url
      from government_roles r join people p on p.id = r.person_id join governments g on g.id = r.government_id left join source_snapshots s on s.id = r.source_snapshot_id
      order by md5(r.id || ${seed}) limit 3`);
    for (const role of roles) {
      items.push({
        kind: "minister",
        label: `${role.display_name}, ${role.title}`,
        ourUrl: `${SITE}/governments/${role.government_slug}`,
        officialUrl: (role.source_url as string | null) ?? undefined,
        compare: ["Name", "Title and ministry", "Government", "Start", "End (empty means still in office)"],
        ours: { Name: role.display_name, "Title and ministry": [role.title, role.ministry].filter(Boolean).join(" · "), Government: role.government, Start: role.starts_on, "End (empty means still in office)": role.ends_on }
      });
    }

    const bills = await run(sql`
      select b.id, b.title, b.identifiers::text as identifiers, coalesce(sm.vote_count, 0) as vote_count,
             (select s.source_url from source_snapshots s where s.id in (select jsonb_array_elements_text(b.source_snapshot_ids)) order by s.source_url limit 1) as source_url
      from bills b left join bill_vote_summaries sm on sm.bill_id = b.id
      order by md5(b.id || ${seed}) limit 3`);
    for (const bill of bills) {
      items.push({
        kind: "bill",
        label: String(bill.id),
        ourUrl: `${SITE}/bills/${bill.id}`,
        officialUrl: (bill.source_url as string | null) ?? undefined,
        compare: ["Title", "Official numbers", "Votes held on the bill"],
        ours: { Title: bill.title, "Official numbers": bill.identifiers, "Votes held on the bill": bill.vote_count }
      });
    }
    return items;
  } finally {
    await session.close();
  }
}

function memberQuery(seed: string, where: ReturnType<typeof sql>, take: number) {
  return sql`
    select m.slug, m.display_name, m.source_ids->>'cdepProfile' as cdep_profile, mm.chamber::text as chamber, mm.constituency, to_char(mm.starts_on, 'YYYY-MM-DD') as starts_on,
           (select pg.name from member_group_memberships gm join parliamentary_groups pg on pg.id = gm.group_id where gm.member_id = m.id order by gm.starts_on desc limit 1) as group_name,
           (select to_char(gm.starts_on, 'YYYY-MM-DD') from member_group_memberships gm where gm.member_id = m.id order by gm.starts_on desc limit 1) as group_starts_on
    from members m join member_mandates mm on mm.member_id = m.id
    where ${where}
    order by md5(m.id || ${seed}) limit ${take}`;
}

export function renderSpotCheckMarkdown(items: SpotCheckItem[], generatedAt: string, seed: string): string {
  const lines = [
    "# Spot-check pack",
    "",
    `Generated ${generatedAt} (seed \`${seed}\`; the same seed on the same data gives the same pack). Open both pages, compare each field, and write down every difference.`,
    "",
    "Tick one box per record: **match** or **differs** (note what).",
    ""
  ];
  items.forEach((item, index) => {
    lines.push(`## ${index + 1}. ${item.label} (${item.kind})`, "");
    lines.push(`- Our page: ${item.ourUrl}`);
    lines.push(`- Official page: ${item.officialUrl ?? "**no source page stored: that is itself a finding**"}`);
    lines.push("", "| Field | We store |", "| --- | --- |");
    for (const field of item.compare) lines.push(`| ${field} | ${String(item.ours[field] ?? "(empty)").replace(/\|/g, "\\|")} |`);
    lines.push("", "- [ ] match   - [ ] differs: ", "");
  });
  return `${lines.join("\n")}\n`;
}

export async function writeSpotCheckPack(repoRoot: string, today: string, seed = today): Promise<{ file: string; items: SpotCheckItem[] }> {
  const items = await buildSpotCheckPack(seed);
  const dir = path.join(repoRoot, "data", "coverage", "reports");
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `spot-check-pack-${today}.md`);
  await writeFile(file, renderSpotCheckMarkdown(items, today, seed));
  return { file, items };
}
