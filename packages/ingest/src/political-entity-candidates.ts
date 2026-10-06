import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { createDbSession } from "@cumsevoteaza/db";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const defaultJsonPath = path.join(repoRoot, "data/curated/political-entity-candidates.json");
const defaultMarkdownPath = path.join(repoRoot, "data/curated/political-entity-candidates.md");

type CandidateRow = {
  entity_id: string;
  entity_kind: "party" | "historical_formation" | "parliamentary_group";
  label: string;
  name: string;
  party_id: string | null;
  member_count: number | string | null;
  row_count: number | string | null;
  legislatures: string[] | null;
  chambers: string[] | null;
};

export interface PoliticalEntityCandidate {
  label: string;
  normalizedLabel: string;
  likelyKind: PoliticalEntityCandidateKind;
  ids: string[];
  names: string[];
  partyIds: string[];
  memberCount: number;
  rowCount: number;
  legislatures: string[];
  chambers: string[];
  reviewStatus: "needs_source_review";
}

type PoliticalEntityCandidateKind = "party" | "historical_formation" | "parliamentary_group" | "mixed";

export async function writePoliticalEntityCandidates(options: {
  jsonPath?: string;
  markdownPath?: string;
} = {}) {
  const session = createDbSession();
  try {
    const rows = await session.db.execute<CandidateRow>(sql`
      with party_rows as (
        select
          p.id as entity_id,
          case
            when (p.id like 'party-formation-%' or p.id like 'party-org-%') then 'historical_formation'
            else 'party'
          end as entity_kind,
          p.short_name as label,
          p.name as name,
          p.id as party_id,
          count(distinct mpa.member_id) as member_count,
          count(mpa.id) as row_count,
          array_remove(array_agg(distinct l.label order by l.label), null) as legislatures,
          array_remove(array_agg(distinct mm.chamber order by mm.chamber), null) as chambers
        from parties p
        left join member_party_affiliations mpa on mpa.party_id = p.id
        left join member_mandates mm
          on mm.member_id = mpa.member_id
          and mpa.starts_on <= coalesce(mm.ends_on, date '9999-12-31')
          and coalesce(mpa.ends_on, date '9999-12-31') >= mm.starts_on
        left join legislatures l on l.id = mm.legislature_id
        group by p.id, p.short_name, p.name
      ),
      group_rows as (
        select
          pg.id as entity_id,
          case
            when pg.party_id is null or pg.party_id like 'party-formation-%' or pg.party_id like 'party-org-%' then 'historical_formation'
            else 'parliamentary_group'
          end as entity_kind,
          pg.short_name as label,
          pg.name as name,
          pg.party_id as party_id,
          count(distinct mgm.member_id) as member_count,
          count(mgm.id) as row_count,
          array_remove(array_agg(distinct l.label order by l.label), null) as legislatures,
          array_remove(array_agg(distinct pg.chamber order by pg.chamber), null) as chambers
        from parliamentary_groups pg
        left join member_group_memberships mgm on mgm.group_id = pg.id
        left join member_mandates mm
          on mm.member_id = mgm.member_id
          and mm.chamber = pg.chamber
          and mgm.starts_on <= coalesce(mm.ends_on, date '9999-12-31')
          and coalesce(mgm.ends_on, date '9999-12-31') >= mm.starts_on
        left join legislatures l on l.id = mm.legislature_id
        group by pg.id, pg.short_name, pg.name, pg.party_id
      )
      select * from party_rows
      union all
      select * from group_rows
    `);

    const candidates = groupRows(rows);
    const jsonPath = options.jsonPath ?? defaultJsonPath;
    const markdownPath = options.markdownPath ?? defaultMarkdownPath;
    await mkdir(path.dirname(jsonPath), { recursive: true });
    await writeFile(jsonPath, `${JSON.stringify(candidates, null, 2)}\n`);
    await writeFile(markdownPath, markdownForCandidates(candidates));
    return {
      candidates: candidates.length,
      jsonPath,
      markdownPath
    };
  } finally {
    await session.close();
  }
}

function groupRows(rows: CandidateRow[]): PoliticalEntityCandidate[] {
  const byLabel = new Map<string, CandidateRow[]>();
  for (const row of rows.filter((item) => item.label?.trim())) {
    const key = normalizeLabel(row.label);
    byLabel.set(key, [...(byLabel.get(key) ?? []), row]);
  }
  return [...byLabel.entries()]
    .map(([normalizedLabel, items]) => {
      const kinds = unique(items.map((item) => item.entity_kind));
      const likelyKind: PoliticalEntityCandidateKind = kinds.length === 1 ? (kinds[0] ?? "mixed") : "mixed";
      const label = mostUsedLabel(items);
      return {
        label,
        normalizedLabel,
        likelyKind: likelyKind ?? "mixed",
        ids: unique(items.map((item) => item.entity_id)).sort(),
        names: unique(items.map((item) => item.name).filter(Boolean)).sort((a, b) => a.localeCompare(b, "ro")),
        partyIds: unique(items.map((item) => item.party_id).filter((item): item is string => Boolean(item))).sort(),
        memberCount: sumMaxById(items, "member_count"),
        rowCount: sumMaxById(items, "row_count"),
        legislatures: unique(items.flatMap((item) => item.legislatures ?? [])).sort().reverse(),
        chambers: unique(items.flatMap((item) => item.chambers ?? [])).sort(),
        reviewStatus: "needs_source_review" as const
      };
    })
    .sort((a, b) => b.memberCount - a.memberCount || a.label.localeCompare(b.label, "ro"));
}

function markdownForCandidates(candidates: PoliticalEntityCandidate[]): string {
  const lines = [
    "# Political Entity Candidates",
    "",
    "Generated from imported `parties`, `parliamentary_groups`, member party affiliations, and group memberships.",
    "Use this as a review backlog for Wikipedia/Google/official-source research before adding more `political_formation_events`.",
    "",
    "| Label | Kind | Legislatures | Chambers | Members | IDs / names |",
    "| --- | --- | --- | --- | ---: | --- |"
  ];
  for (const candidate of candidates) {
    lines.push(
      `| ${escapeCell(candidate.label)} | ${candidate.likelyKind} | ${escapeCell(candidate.legislatures.join(", ") || "-")} | ${escapeCell(candidate.chambers.join(", ") || "-")} | ${candidate.memberCount} | ${escapeCell([...candidate.ids, ...candidate.names].join("; "))} |`
    );
  }
  lines.push("");
  return lines.join("\n");
}

function mostUsedLabel(items: CandidateRow[]): string {
  return [...items].sort((a, b) => Number(b.member_count ?? 0) - Number(a.member_count ?? 0))[0]?.label ?? "";
}

function sumMaxById(items: CandidateRow[], field: "member_count" | "row_count"): number {
  const byId = new Map<string, number>();
  for (const item of items) {
    byId.set(item.entity_id, Math.max(byId.get(item.entity_id) ?? 0, Number(item[field] ?? 0)));
  }
  return [...byId.values()].reduce((sum, value) => sum + value, 0);
}

function normalizeLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
