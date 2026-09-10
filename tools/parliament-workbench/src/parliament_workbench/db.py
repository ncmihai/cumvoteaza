from __future__ import annotations

import json
from typing import Any

from .config import WorkbenchConfig


class DatabaseUnavailable(RuntimeError):
    pass


class ReadOnlyDb:
    def __init__(self, config: WorkbenchConfig):
        self.config = config

    @property
    def configured(self) -> bool:
        return bool(self.config.database_url)

    def _connect(self):
        if not self.config.database_url:
            raise DatabaseUnavailable("DATABASE_URL is not configured.")
        try:
            import psycopg
            from psycopg.rows import dict_row
        except Exception as error:
            raise DatabaseUnavailable("Install workbench Python dependencies to use database-backed features.") from error
        conn = psycopg.connect(self.config.database_url, row_factory=dict_row)
        conn.execute("set default_transaction_read_only = on")
        return conn

    def execute(self, query: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        with self._connect() as conn:
            with conn.cursor() as cursor:
                cursor.execute(query, params)
                return [dict(row) for row in cursor.fetchall()]

    def scalar(self, query: str, params: tuple[Any, ...] = ()) -> Any:
        rows = self.execute(query, params)
        if not rows:
            return None
        return next(iter(rows[0].values()))

    def status(self) -> dict[str, Any]:
        if not self.config.database_url:
            return {"configured": False, "ok": False, "reason": "DATABASE_URL is not configured."}
        try:
            counts = self.table_counts()
            return {"configured": True, "ok": True, "counts": counts}
        except Exception as error:
            return {"configured": True, "ok": False, "reason": str(error)}

    def table_counts(self) -> dict[str, int]:
        rows = self.execute(
            """
            select 'bills' as table_name, count(*)::int as count from bills
            union all select 'votes', count(*)::int from votes
            union all select 'members', count(*)::int from members
            union all select 'parties', count(*)::int from parties
            union all select 'documents', count(*)::int from documents
            union all select 'text_chunks', count(*)::int from bill_document_text_chunks
            union all select 'data_health_reviews', count(*)::int from data_health_reviews
            """
        )
        return {str(row["table_name"]): int(row["count"]) for row in rows}

    def wiki_rows(self, limit: int = 5000) -> dict[str, list[dict[str, Any]]]:
        if not self.config.database_url:
            return empty_wiki_rows()
        return {
            "bills": self.execute(BILLS_QUERY, (limit,)),
            "documents": self.execute(DOCUMENTS_QUERY, (limit,)),
            "votes": self.execute(VOTES_QUERY, (limit,)),
            "members": self.execute(MEMBERS_QUERY, (limit,)),
            "parties": self.execute(PARTIES_QUERY, (limit,)),
            "groups": self.execute(GROUPS_QUERY, (limit,)),
            "governments": self.execute(GOVERNMENTS_QUERY, (limit,)),
            "health": self.execute(HEALTH_QUERY, (limit,)),
        }

    def bill_audit_context(self, bill_id_or_slug: str) -> dict[str, Any] | None:
        bills = self.execute(BILL_CONTEXT_QUERY, (bill_id_or_slug, bill_id_or_slug))
        if not bills:
            return None
        bill_id = bills[0]["id"]
        return {
            "bill": normalize_json_values(bills[0]),
            "documents": [normalize_json_values(row) for row in self.execute(BILL_DOCUMENTS_CONTEXT_QUERY, (bill_id,))],
            "procedureSteps": [normalize_json_values(row) for row in self.execute(BILL_STEPS_CONTEXT_QUERY, (bill_id,))],
            "votes": [normalize_json_values(row) for row in self.execute(BILL_VOTES_CONTEXT_QUERY, (bill_id,))],
            "sponsors": [normalize_json_values(row) for row in self.execute(BILL_SPONSORS_CONTEXT_QUERY, (bill_id,))],
            "healthReviews": [normalize_json_values(row) for row in self.execute(BILL_HEALTH_CONTEXT_QUERY, (bill_id, bill_id))],
        }

    def data_health_summary(self) -> dict[str, int]:
        if not self.config.database_url:
            return {"reviews": 0, "openReviews": 0, "storedDocuments": 0, "unlinkedVotes": 0, "missingProcedures": 0}
        rows = self.execute(
            """
            select
              (select count(*)::int from data_health_reviews) as reviews,
              (select count(*)::int from data_health_reviews where status = 'open') as open_reviews,
              (select count(*)::int from documents where text_status = 'stored') as stored_documents,
              (select count(*)::int from votes where bill_id is null) as unlinked_votes,
              (
                select count(*)::int
                from bills b
                left join bill_procedure_steps bps on bps.bill_id = b.id
                where bps.id is null
              ) as missing_procedures
            """
        )
        row = rows[0] if rows else {}
        return {
            "reviews": int(row.get("reviews") or 0),
            "openReviews": int(row.get("open_reviews") or 0),
            "storedDocuments": int(row.get("stored_documents") or 0),
            "unlinkedVotes": int(row.get("unlinked_votes") or 0),
            "missingProcedures": int(row.get("missing_procedures") or 0),
        }


def normalize_json_values(row: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(row)
    for key, value in list(normalized.items()):
        if isinstance(value, str) and key.endswith("_json"):
            try:
                normalized[key[:-5]] = json.loads(value)
            except json.JSONDecodeError:
                normalized[key[:-5]] = value
            del normalized[key]
    return normalized


def empty_wiki_rows() -> dict[str, list[dict[str, Any]]]:
    return {key: [] for key in ["bills", "documents", "votes", "members", "parties", "groups", "governments", "health"]}


BILLS_QUERY = """
select
  b.id,
  'bill' as entity_type,
  b.slug,
  b.title,
  b.identifiers::text as identifiers_json,
  b.chamber_of_origin,
  coalesce(b.decision_chamber::text, 'unknown') as decision_chamber,
  b.status,
  coalesce(bvs.submitted_on::text, 'unknown') as submitted_on,
  coalesce(bvs.latest_event_on::text, 'unknown') as latest_event_on,
  coalesce(bvs.vote_count, 0)::int as vote_count,
  coalesce(count(distinct d.id), 0)::int as document_count,
  coalesce(count(distinct bps.id), 0)::int as procedure_step_count,
  coalesce(string_agg(distinct d.url, E'\n'), '') as source_urls
from bills b
left join bill_vote_summaries bvs on bvs.bill_id = b.id
left join documents d on d.bill_id = b.id
left join bill_procedure_steps bps on bps.bill_id = b.id
group by b.id, b.slug, b.title, b.identifiers, b.chamber_of_origin, b.decision_chamber, b.status, bvs.submitted_on, bvs.latest_event_on, bvs.vote_count
order by coalesce(bvs.latest_event_on, bvs.submitted_on) desc nulls last, b.id
limit %s
"""

DOCUMENTS_QUERY = """
select
  d.id,
  'document' as entity_type,
  d.bill_id,
  b.slug as bill_slug,
  b.title as bill_title,
  d.label as title,
  d.document_kind,
  coalesce(d.source_chamber::text, 'unknown') as source_chamber,
  d.url as source_url,
  d.text_status,
  coalesce(d.text_preview, '') as text_preview,
  count(c.id)::int as chunk_count,
  md5(coalesce(string_agg(c.text, E'\n' order by c.chunk_index), '')) as text_hash,
  left(coalesce(string_agg(c.text, E'\n' order by c.chunk_index), ''), 4000) as text_excerpt
from documents d
join bills b on b.id = d.bill_id
left join bill_document_text_chunks c on c.document_id = d.id
group by d.id, d.bill_id, b.slug, b.title, d.label, d.document_kind, d.source_chamber, d.url, d.text_status, d.text_preview
order by d.bill_id, d.document_kind, d.id
limit %s
"""

VOTES_QUERY = """
select
  v.id,
  'vote' as entity_type,
  v.title,
  v.chamber::text as chamber,
  v.held_on::text as held_on,
  v.vote_type,
  v.bill_id,
  coalesce(b.slug, 'unknown') as bill_slug,
  coalesce(b.title, 'unknown') as bill_title,
  v.present,
  v.for_count,
  v.against,
  v.abstention,
  v.present_not_voting,
  ss.source_url
from votes v
left join bills b on b.id = v.bill_id
left join source_snapshots ss on ss.id = v.source_snapshot_id
order by v.held_on desc, v.id
limit %s
"""

MEMBERS_QUERY = """
select
  m.id,
  'member' as entity_type,
  m.slug,
  m.display_name as title,
  coalesce(m.person_id, 'unknown') as person_id,
  coalesce(string_agg(distinct mm.legislature_id, ', '), 'unknown') as legislatures,
  coalesce(string_agg(distinct mm.chamber::text, ', '), 'unknown') as chambers,
  coalesce(string_agg(distinct pg.short_name, ', '), 'unknown') as groups
from members m
left join member_mandates mm on mm.member_id = m.id
left join member_group_memberships mgm on mgm.member_id = m.id
left join parliamentary_groups pg on pg.id = mgm.group_id
group by m.id, m.slug, m.display_name, m.person_id
order by m.display_name
limit %s
"""

PARTIES_QUERY = """
select
  p.id,
  'party' as entity_type,
  p.slug,
  p.short_name,
  p.name as title,
  p.color,
  count(distinct pg.id)::int as group_count,
  count(distinct mpa.member_id)::int as member_count
from parties p
left join parliamentary_groups pg on pg.party_id = p.id
left join member_party_affiliations mpa on mpa.party_id = p.id
group by p.id, p.slug, p.short_name, p.name, p.color
order by p.name
limit %s
"""

GROUPS_QUERY = """
select
  pg.id,
  'group' as entity_type,
  pg.short_name,
  pg.name as title,
  pg.chamber::text as chamber,
  pg.color,
  coalesce(p.id, 'unknown') as party_id,
  coalesce(p.short_name, 'unknown') as party_short_name,
  coalesce(p.name, 'unknown') as party_name
from parliamentary_groups pg
left join parties p on p.id = pg.party_id
order by pg.chamber, pg.short_name
limit %s
"""

GOVERNMENTS_QUERY = """
select
  g.id,
  'government' as entity_type,
  g.slug,
  g.name as title,
  coalesce(g.legislature_id, 'unknown') as legislature_id,
  g.starts_on::text as starts_on,
  coalesce(g.ends_on::text, 'unknown') as ends_on,
  g.basis::text as basis,
  coalesce(p.display_name, 'unknown') as prime_minister
from governments g
left join people p on p.id = g.prime_minister_person_id
order by g.starts_on desc
limit %s
"""

HEALTH_QUERY = """
select
  dhr.id,
  'data_health_review' as entity_type,
  dhr.issue_key,
  dhr.issue_type,
  dhr.entity_type as reviewed_entity_type,
  dhr.entity_id as reviewed_entity_id,
  dhr.status,
  coalesce(dhr.note, '') as note,
  dhr.updated_at::text as updated_at
from data_health_reviews dhr
order by dhr.updated_at desc
limit %s
"""

BILL_CONTEXT_QUERY = """
select b.id, b.slug, b.title, b.identifiers::text as identifiers_json, b.chamber_of_origin, coalesce(b.decision_chamber::text, 'unknown') as decision_chamber, b.status
from bills b
where b.id = %s or b.slug = %s
limit 1
"""

BILL_DOCUMENTS_CONTEXT_QUERY = """
select
  d.id,
  d.bill_id,
  d.label,
  d.document_kind,
  coalesce(d.source_chamber::text, 'unknown') as source_chamber,
  d.url,
  d.text_status,
  coalesce(d.text_preview, '') as text_preview,
  count(c.id)::int as chunk_count,
  md5(coalesce(string_agg(c.text, E'\n' order by c.chunk_index), '')) as text_hash,
  left(coalesce(string_agg(c.text, E'\n' order by c.chunk_index), ''), 10000) as text_excerpt
from documents d
left join bill_document_text_chunks c on c.document_id = d.id
where d.bill_id = %s
group by d.id, d.bill_id, d.label, d.document_kind, d.source_chamber, d.url, d.text_status, d.text_preview
order by d.document_kind, d.id
"""

BILL_STEPS_CONTEXT_QUERY = """
select id, bill_id, occurred_on::text as occurred_on, chamber, step_type::text as step_type, title, coalesce(description, '') as description, coalesce(committee_name, '') as committee_name, coalesce(source_url, '') as source_url
from bill_procedure_steps
where bill_id = %s
order by occurred_on, display_order
"""

BILL_VOTES_CONTEXT_QUERY = """
select id, title, chamber::text as chamber, held_on::text as held_on, vote_type, present, for_count, against, abstention, present_not_voting
from votes
where bill_id = %s
order by held_on desc, id
"""

BILL_SPONSORS_CONTEXT_QUERY = """
select id, sponsor_type, coalesce(member_id, 'unknown') as member_id, name
from bill_sponsors
where bill_id = %s
order by id
"""

BILL_HEALTH_CONTEXT_QUERY = """
select id, issue_key, issue_type, entity_type, entity_id, status, coalesce(note, '') as note
from data_health_reviews
where entity_id = %s or entity_id in (select id from documents where bill_id = %s)
order by updated_at desc
"""
