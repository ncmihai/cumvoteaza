from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import json
import re
import sqlite3
from typing import Any

from .config import WorkbenchConfig
from .db import ReadOnlyDb
from .storage import read_jsonl, write_jsonl


@dataclass(frozen=True)
class WikiRecord:
    id: str
    entity_type: str
    entity_id: str
    title: str
    subtitle: str
    summary: str
    body: str
    source_urls: list[str]
    tags: list[str]
    related_ids: dict[str, list[str]]

    def to_dict(self) -> dict[str, Any]:
        payload = {
            "id": self.id,
            "entityType": self.entity_type,
            "entityId": self.entity_id,
            "title": self.title,
            "subtitle": self.subtitle,
            "summary": self.summary,
            "body": self.body,
            "sourceUrls": self.source_urls,
            "tags": self.tags,
            "relatedIds": self.related_ids,
        }
        payload["searchText"] = searchable_text(payload)
        return payload


def build_wiki(config: WorkbenchConfig, limit: int = 5000) -> dict[str, Any]:
    rows = ReadOnlyDb(config).wiki_rows(limit=limit)
    records = wiki_records_from_rows(rows)
    all_path = config.wiki_dir / "wiki.jsonl"
    payloads = [record.to_dict() for record in records]
    count = write_jsonl(all_path, payloads)

    by_type: dict[str, list[WikiRecord]] = {}
    for record in records:
        by_type.setdefault(record.entity_type, []).append(record)
    for entity_type, typed_records in by_type.items():
        write_jsonl(config.wiki_dir / f"{entity_type}.jsonl", [record.to_dict() for record in typed_records])

    markdown = render_markdown_index(records)
    config.wiki_dir.mkdir(parents=True, exist_ok=True)
    (config.wiki_dir / "index.md").write_text(markdown, encoding="utf-8")
    sqlite_path = build_wiki_search_index(config, payloads)

    return {
        "status": "built",
        "recordCount": count,
        "entityCounts": {entity_type: len(typed_records) for entity_type, typed_records in sorted(by_type.items())},
        "wikiPath": str(all_path),
        "sqlitePath": str(sqlite_path),
        "builtAt": datetime.now(timezone.utc).isoformat(),
    }


def wiki_records_from_rows(rows: dict[str, list[dict[str, Any]]]) -> list[WikiRecord]:
    records: list[WikiRecord] = []
    records.extend(bill_record(row) for row in rows.get("bills", []))
    records.extend(document_record(row) for row in rows.get("documents", []))
    records.extend(vote_record(row) for row in rows.get("votes", []))
    records.extend(member_record(row) for row in rows.get("members", []))
    records.extend(party_record(row) for row in rows.get("parties", []))
    records.extend(group_record(row) for row in rows.get("groups", []))
    records.extend(government_record(row) for row in rows.get("governments", []))
    records.extend(health_record(row) for row in rows.get("health", []))
    attach_related_ids(records, rows)
    return records


def search_wiki(config: WorkbenchConfig, query: str, limit: int = 25, entity_type: str | None = None) -> list[dict[str, Any]]:
    normalized_query = normalize(query)
    if len(normalized_query) < 2:
        return []
    sqlite_results = search_wiki_sqlite(config, normalized_query, limit=limit, entity_type=entity_type)
    if sqlite_results is not None:
        return sqlite_results
    return search_wiki_jsonl(config, normalized_query, limit=limit, entity_type=entity_type)


def search_wiki_jsonl(config: WorkbenchConfig, normalized_query: str, limit: int = 25, entity_type: str | None = None) -> list[dict[str, Any]]:
    records = read_jsonl(config.wiki_dir / "wiki.jsonl")
    terms = normalized_query.split()
    scored: list[tuple[int, dict[str, Any]]] = []
    for record in records:
        if entity_type and record.get("entityType") != entity_type:
            continue
        score = score_wiki_record(record, normalized_query, terms)
        if score:
            scored.append((score, public_search_record(record)))
    scored.sort(key=lambda item: (-item[0], entity_sort_rank(str(item[1].get("entityType") or "")), str(item[1].get("title") or "")))
    return [record for _, record in scored[:limit]]


def search_wiki_sqlite(config: WorkbenchConfig, normalized_query: str, limit: int = 25, entity_type: str | None = None) -> list[dict[str, Any]] | None:
    db_path = wiki_sqlite_path(config)
    if not db_path.exists():
        return None
    terms = normalized_query.split()
    fts_query = fts_query_for_terms(terms)
    if not fts_query:
        return []
    try:
        with sqlite3.connect(db_path) as conn:
            conn.row_factory = sqlite3.Row
            params: list[Any] = [fts_query]
            where = "records_fts match ?"
            if entity_type:
                where += " and r.entity_type = ?"
                params.append(entity_type)
            params.append(max(200, limit * 30))
            rows = conn.execute(
                f"""
                select r.json_payload
                from records_fts f
                join records r on r.id = f.record_id
                where {where}
                limit ?
                """,
                params,
            ).fetchall()
    except sqlite3.Error:
        return None

    scored: list[tuple[int, dict[str, Any]]] = []
    for row in rows:
        record = json.loads(str(row["json_payload"]))
        score = score_wiki_record(record, normalized_query, terms)
        if score:
            scored.append((score, public_search_record(record)))
    scored.sort(key=lambda item: (-item[0], entity_sort_rank(str(item[1].get("entityType") or "")), str(item[1].get("title") or "")))
    return [record for _, record in scored[:limit]]


def build_wiki_search_index(config: WorkbenchConfig, records: list[dict[str, Any]]):
    db_path = wiki_sqlite_path(config)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(db_path) as conn:
        conn.execute("drop table if exists records_fts")
        for table in ["records", "entities", "aliases", "relations", "sources", "assets", "health_issues", "proposals"]:
            conn.execute(f"drop table if exists {table}")
        conn.execute(
            """
            create table records (
              id text primary key,
              entity_type text not null,
              entity_id text not null,
              title text not null,
              subtitle text not null,
              summary text not null,
              body text not null,
              tags text not null,
              json_payload text not null
            )
            """
        )
        conn.execute(
            """
            create table entities (
              id text primary key,
              entity_type text not null,
              entity_id text not null,
              title text not null,
              subtitle text not null,
              summary text not null,
              json_payload text not null
            )
            """
        )
        conn.execute(
            """
            create table aliases (
              id text primary key,
              entity_type text not null,
              entity_id text not null,
              alias text not null,
              alias_kind text not null
            )
            """
        )
        conn.execute(
            """
            create table relations (
              id text primary key,
              source_type text not null,
              source_id text not null,
              relation_type text not null,
              target_type text not null,
              target_id text not null
            )
            """
        )
        conn.execute(
            """
            create table sources (
              id text primary key,
              entity_type text not null,
              entity_id text not null,
              source_url text not null
            )
            """
        )
        conn.execute(
            """
            create table assets (
              id text primary key,
              entity_type text not null,
              entity_id text not null,
              asset_id text not null,
              asset_type text
            )
            """
        )
        conn.execute(
            """
            create table health_issues (
              id text primary key,
              entity_type text not null,
              entity_id text not null,
              issue_type text,
              status text
            )
            """
        )
        conn.execute(
            """
            create table proposals (
              id text primary key,
              entity_type text not null,
              entity_id text not null,
              proposal_type text,
              status text
            )
            """
        )
        conn.execute(
            """
            create virtual table records_fts using fts5(
              title,
              subtitle,
              summary,
              body,
              tags,
              record_id unindexed,
              tokenize='unicode61 remove_diacritics 2'
            )
            """
        )
        for record in records:
            row = (
                str(record.get("id") or ""),
                str(record.get("entityType") or ""),
                str(record.get("entityId") or ""),
                str(record.get("title") or ""),
                str(record.get("subtitle") or ""),
                str(record.get("summary") or ""),
                str(record.get("body") or ""),
                " ".join(str(tag) for tag in record.get("tags") or []),
                json.dumps(record, ensure_ascii=False, sort_keys=True),
            )
            conn.execute("insert into records values (?, ?, ?, ?, ?, ?, ?, ?, ?)", row)
            conn.execute(
                "insert into entities values (?, ?, ?, ?, ?, ?, ?)",
                (row[0], row[1], row[2], row[3], row[4], row[5], row[8]),
            )
            conn.execute(
                "insert into records_fts(title, subtitle, summary, body, tags, record_id) values (?, ?, ?, ?, ?, ?)",
                (row[3], row[4], row[5], row[6], row[7], row[0]),
            )
            insert_aliases(conn, record)
            insert_relations(conn, record)
            insert_sources(conn, record)
            insert_health_issue(conn, record)
        conn.execute("create index records_entity_type_idx on records(entity_type)")
        conn.execute("create index entities_type_idx on entities(entity_type, entity_id)")
        conn.execute("create index aliases_lookup_idx on aliases(alias)")
        conn.execute("create index relations_source_idx on relations(source_type, source_id)")
        conn.execute("create index relations_target_idx on relations(target_type, target_id)")
        conn.execute("create index sources_entity_idx on sources(entity_type, entity_id)")
        conn.commit()
    return db_path


def insert_aliases(conn: sqlite3.Connection, record: dict[str, Any]) -> None:
    entity_type = str(record.get("entityType") or "")
    entity_id = str(record.get("entityId") or "")
    aliases = [
        ("title", str(record.get("title") or "")),
        ("subtitle", str(record.get("subtitle") or "")),
        *[("tag", str(tag)) for tag in record.get("tags") or []],
    ]
    seen = set()
    for kind, alias in aliases:
        alias = alias.strip()
        if not alias or alias in seen:
            continue
        seen.add(alias)
        alias_id = f"{entity_type}:{entity_id}:{kind}:{normalize(alias)}"
        conn.execute("insert or ignore into aliases values (?, ?, ?, ?, ?)", (alias_id, entity_type, entity_id, alias, kind))


def insert_relations(conn: sqlite3.Connection, record: dict[str, Any]) -> None:
    source_type = str(record.get("entityType") or "")
    source_id = str(record.get("entityId") or "")
    for target_type, target_ids in (record.get("relatedIds") or {}).items():
        target_type = singular_entity_type(str(target_type))
        relation_type = relation_name(source_type, target_type)
        for target_id in target_ids:
            relation_id = f"{source_type}:{source_id}:{relation_type}:{target_type}:{target_id}"
            conn.execute(
                "insert or ignore into relations values (?, ?, ?, ?, ?, ?)",
                (relation_id, source_type, source_id, relation_type, target_type, str(target_id)),
            )


def insert_sources(conn: sqlite3.Connection, record: dict[str, Any]) -> None:
    entity_type = str(record.get("entityType") or "")
    entity_id = str(record.get("entityId") or "")
    for index, source_url in enumerate(record.get("sourceUrls") or []):
        if not source_url:
            continue
        conn.execute(
            "insert or ignore into sources values (?, ?, ?, ?)",
            (f"{entity_type}:{entity_id}:source:{index}", entity_type, entity_id, str(source_url)),
        )


def insert_health_issue(conn: sqlite3.Connection, record: dict[str, Any]) -> None:
    if record.get("entityType") != "data_health_review":
        return
    related = record.get("relatedIds") or {}
    entity_type = next(iter(related.keys()), "unknown")
    entity_ids = related.get(entity_type) or [record.get("entityId")]
    for entity_id in entity_ids:
        conn.execute(
            "insert or ignore into health_issues values (?, ?, ?, ?, ?)",
            (str(record.get("entityId")), singular_entity_type(str(entity_type)), str(entity_id), first_tag(record, 1), first_tag(record, 2)),
        )


def relation_name(source_type: str, target_type: str) -> str:
    explicit = {
        ("bill", "document"): "bill_has_document",
        ("bill", "vote"): "bill_has_vote",
        ("document", "bill"): "document_belongs_to_bill",
        ("vote", "bill"): "vote_links_bill",
        ("party", "group"): "party_has_group",
        ("group", "party"): "group_belongs_to_party",
        ("member", "party"): "member_affiliated_party",
        ("member", "group"): "member_in_group",
        ("party", "government"): "party_in_government",
    }
    return explicit.get((source_type, target_type), f"{source_type}_references_{target_type}")


def singular_entity_type(value: str) -> str:
    return {"documents": "document", "votes": "vote", "groups": "group", "parties": "party", "members": "member", "bills": "bill"}.get(value, value.rstrip("s"))


def first_tag(record: dict[str, Any], index: int) -> str | None:
    tags = record.get("tags") or []
    return str(tags[index]) if len(tags) > index else None


def wiki_sqlite_path(config: WorkbenchConfig):
    return config.wiki_dir / "wiki.sqlite"


def fts_query_for_terms(terms: list[str]) -> str:
    sanitized = [re.sub(r"[^a-z0-9]", "", term) for term in terms]
    sanitized = [term for term in sanitized if term]
    return " ".join(f"{term}*" for term in sanitized)


def score_wiki_record(record: dict[str, Any], normalized_query: str, terms: list[str]) -> int:
    title = normalize(str(record.get("title") or ""))
    subtitle = normalize(str(record.get("subtitle") or ""))
    summary = normalize(str(record.get("summary") or ""))
    body = normalize(str(record.get("body") or ""))
    tags = normalize(" ".join(str(tag) for tag in record.get("tags") or []))
    all_text = " ".join([title, subtitle, summary, body, tags]).strip()
    if not all_text or not all(term in all_text for term in terms):
        return 0

    entity_type = str(record.get("entityType") or "")
    score = 0
    if title == normalized_query:
        score += 1000
    if subtitle == normalized_query:
        score += 950
    if normalized_query in title:
        score += 420
    if normalized_query in subtitle:
        score += 380
    if normalized_query in tags:
        score += 260
    if normalized_query in summary:
        score += 140
    if normalized_query in body:
        score += 25

    for term in terms:
        score += 90 * title.count(term)
        score += 95 * subtitle.count(term)
        score += 70 * tags.count(term)
        score += 24 * summary.count(term)
        score += min(body.count(term), 3) * 3

    if all(term in title for term in terms):
        score += 240
    if all(term in subtitle for term in terms):
        score += 220
    if all(term in summary for term in terms):
        score += 90

    if len(normalized_query) <= 5:
        score += {"party": 260, "group": 200, "member": 60, "government": 40, "bill": 20, "vote": 10, "document": -40}.get(entity_type, 0)
    else:
        score += {"party": 120, "group": 90, "member": 90, "government": 80, "bill": 50, "vote": 30, "document": 0}.get(entity_type, 0)
    return max(score, 0)


def public_search_record(record: dict[str, Any]) -> dict[str, Any]:
    payload = dict(record)
    payload.pop("searchText", None)
    return payload


def entity_sort_rank(entity_type: str) -> int:
    return {
        "party": 0,
        "group": 1,
        "member": 2,
        "government": 3,
        "bill": 4,
        "vote": 5,
        "document": 6,
        "data_health_review": 7,
    }.get(entity_type, 99)


def get_wiki_entity(config: WorkbenchConfig, entity_type: str, entity_id: str) -> dict[str, Any] | None:
    db_path = wiki_sqlite_path(config)
    if db_path.exists():
        try:
            with sqlite3.connect(db_path) as conn:
                conn.row_factory = sqlite3.Row
                row = conn.execute(
                    "select json_payload from records where entity_type = ? and entity_id = ? limit 1",
                    (entity_type, entity_id),
                ).fetchone()
                if row:
                    return public_search_record(json.loads(str(row["json_payload"])))
        except sqlite3.Error:
            pass
    for record in read_jsonl(config.wiki_dir / f"{entity_type}.jsonl"):
        if record.get("entityId") == entity_id:
            return public_search_record(record)
    return None


def wiki_status(config: WorkbenchConfig) -> dict[str, Any]:
    path = config.wiki_dir / "wiki.jsonl"
    if not path.exists():
        return {"built": False, "recordCount": 0}
    return {
        "built": True,
        "recordCount": len(read_jsonl(path)),
        "path": str(path),
        "sqlitePath": str(wiki_sqlite_path(config)) if wiki_sqlite_path(config).exists() else None,
        "updatedAt": datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).isoformat(),
    }


def attach_related_ids(records: list[WikiRecord], rows: dict[str, list[dict[str, Any]]]) -> None:
    by_key = {(record.entity_type, record.entity_id): record for record in records}
    for row in rows.get("documents", []):
        bill_id = row.get("bill_id")
        document_id = row.get("id")
        if bill_id and document_id and ("bill", bill_id) in by_key:
            append_related(by_key[("bill", bill_id)], "document", document_id)
    for row in rows.get("votes", []):
        bill_id = row.get("bill_id")
        vote_id = row.get("id")
        if bill_id and vote_id and ("bill", bill_id) in by_key:
            append_related(by_key[("bill", bill_id)], "vote", vote_id)
    for row in rows.get("groups", []):
        party_id = row.get("party_id")
        group_id = row.get("id")
        if party_id and party_id != "unknown" and group_id:
            if ("party", party_id) in by_key:
                append_related(by_key[("party", party_id)], "group", group_id)
            if ("group", group_id) in by_key:
                append_related(by_key[("group", group_id)], "party", party_id)


def append_related(record: WikiRecord, entity_type: str, entity_id: str) -> None:
    values = record.related_ids.setdefault(entity_type, [])
    if entity_id not in values:
        values.append(entity_id)


def bill_record(row: dict[str, Any]) -> WikiRecord:
    identifiers = row.get("identifiers") or parse_json_dict(row.get("identifiers_json")) or {}
    identifier_text = ", ".join(f"{key}: {value}" for key, value in identifiers.items()) or "unknown"
    source_urls = split_urls(row.get("source_urls", ""))
    body = "\n".join(
        [
            f"Identifiers: {identifier_text}",
            f"Status: {row.get('status') or 'unknown'}",
            f"Chamber of origin: {row.get('chamber_of_origin') or 'unknown'}",
            f"Decision chamber: {row.get('decision_chamber') or 'unknown'}",
            f"Submitted on: {row.get('submitted_on') or 'unknown'}",
            f"Latest event on: {row.get('latest_event_on') or 'unknown'}",
            f"Votes: {row.get('vote_count') or 0}",
            f"Documents: {row.get('document_count') or 0}",
            f"Procedure steps: {row.get('procedure_step_count') or 0}",
        ]
    )
    return WikiRecord(
        id=f"bill:{row['id']}",
        entity_type="bill",
        entity_id=row["id"],
        title=row.get("title") or row["id"],
        subtitle=identifier_text,
        summary=f"{row.get('title') or row['id']} | {identifier_text} | status: {row.get('status') or 'unknown'}",
        body=body,
        source_urls=source_urls,
        tags=["bill", row.get("decision_chamber") or "unknown", row.get("status") or "unknown"],
        related_ids={"document": [], "vote": []},
    )


def document_record(row: dict[str, Any]) -> WikiRecord:
    body = "\n".join(
        [
            f"Bill: {row.get('bill_id')} ({row.get('bill_title') or 'unknown'})",
            f"Kind: {row.get('document_kind') or 'unknown'}",
            f"Source chamber: {row.get('source_chamber') or 'unknown'}",
            f"Text status: {row.get('text_status') or 'unknown'}",
            f"Chunks: {row.get('chunk_count') or 0}",
            "Text excerpt:",
            row.get("text_excerpt") or row.get("text_preview") or "unknown",
        ]
    )
    return WikiRecord(
        id=f"document:{row['id']}",
        entity_type="document",
        entity_id=row["id"],
        title=row.get("title") or row["id"],
        subtitle=f"{row.get('document_kind') or 'unknown'} | {row.get('bill_title') or row.get('bill_id')}",
        summary=f"{row.get('title') or row['id']} for {row.get('bill_title') or row.get('bill_id')}",
        body=body,
        source_urls=[row["source_url"]] if row.get("source_url") else [],
        tags=["document", row.get("document_kind") or "unknown", row.get("text_status") or "unknown"],
        related_ids={"bill": [row.get("bill_id")] if row.get("bill_id") else []},
    )


def vote_record(row: dict[str, Any]) -> WikiRecord:
    source_urls = [row["source_url"]] if row.get("source_url") else []
    body = "\n".join(
        [
            f"Held on: {row.get('held_on') or 'unknown'}",
            f"Chamber: {row.get('chamber') or 'unknown'}",
            f"Vote type: {row.get('vote_type') or 'unknown'}",
            f"Bill: {row.get('bill_id') or 'unknown'} ({row.get('bill_title') or 'unknown'})",
            f"Totals: for={row.get('for_count')}, against={row.get('against')}, abstention={row.get('abstention')}, present_not_voting={row.get('present_not_voting')}",
        ]
    )
    return WikiRecord(
        id=f"vote:{row['id']}",
        entity_type="vote",
        entity_id=row["id"],
        title=row.get("title") or row["id"],
        subtitle=f"{row.get('held_on') or 'unknown'} | {row.get('chamber') or 'unknown'}",
        summary=f"{row.get('title') or row['id']} on {row.get('held_on') or 'unknown'}",
        body=body,
        source_urls=source_urls,
        tags=["vote", row.get("chamber") or "unknown", row.get("vote_type") or "unknown"],
        related_ids={"bill": [row.get("bill_id")] if row.get("bill_id") else []},
    )


def member_record(row: dict[str, Any]) -> WikiRecord:
    body = "\n".join(
        [
            f"Person ID: {row.get('person_id') or 'unknown'}",
            f"Legislatures: {row.get('legislatures') or 'unknown'}",
            f"Chambers: {row.get('chambers') or 'unknown'}",
            f"Groups: {row.get('groups') or 'unknown'}",
        ]
    )
    return WikiRecord(
        id=f"member:{row['id']}",
        entity_type="member",
        entity_id=row["id"],
        title=row.get("title") or row["id"],
        subtitle=row.get("chambers") or "unknown",
        summary=f"{row.get('title') or row['id']} | {row.get('legislatures') or 'unknown'}",
        body=body,
        source_urls=[],
        tags=["member", row.get("chambers") or "unknown"],
        related_ids={"person": [row.get("person_id")] if row.get("person_id") and row.get("person_id") != "unknown" else []},
    )


def party_record(row: dict[str, Any]) -> WikiRecord:
    body = "\n".join(
        [
            f"Short name: {row.get('short_name') or 'unknown'}",
            f"Color: {row.get('color') or 'unknown'}",
            f"Parliamentary groups: {row.get('group_count') or 0}",
            f"Known member affiliation rows: {row.get('member_count') or 0}",
        ]
    )
    return WikiRecord(
        id=f"party:{row['id']}",
        entity_type="party",
        entity_id=row["id"],
        title=row.get("title") or row["id"],
        subtitle=row.get("short_name") or "unknown",
        summary=f"{row.get('short_name') or row['id']} | {row.get('title') or 'unknown'}",
        body=body,
        source_urls=[],
        tags=["party", row.get("short_name") or "unknown"],
        related_ids={"group": []},
    )


def group_record(row: dict[str, Any]) -> WikiRecord:
    body = "\n".join(
        [
            f"Chamber: {row.get('chamber') or 'unknown'}",
            f"Party: {row.get('party_short_name') or 'unknown'} ({row.get('party_name') or 'unknown'})",
            f"Color: {row.get('color') or 'unknown'}",
        ]
    )
    return WikiRecord(
        id=f"group:{row['id']}",
        entity_type="group",
        entity_id=row["id"],
        title=row.get("title") or row["id"],
        subtitle=f"{row.get('short_name') or 'unknown'} | {row.get('chamber') or 'unknown'}",
        summary=f"{row.get('title') or row['id']} in {row.get('chamber') or 'unknown'}",
        body=body,
        source_urls=[],
        tags=["group", row.get("chamber") or "unknown", row.get("party_short_name") or "unknown"],
        related_ids={"party": [row.get("party_id")] if row.get("party_id") and row.get("party_id") != "unknown" else []},
    )


def government_record(row: dict[str, Any]) -> WikiRecord:
    body = "\n".join(
        [
            f"Legislature: {row.get('legislature_id') or 'unknown'}",
            f"Prime minister: {row.get('prime_minister') or 'unknown'}",
            f"Period: {row.get('starts_on') or 'unknown'} - {row.get('ends_on') or 'unknown'}",
            f"Basis: {row.get('basis') or 'unknown'}",
        ]
    )
    return WikiRecord(
        id=f"government:{row['id']}",
        entity_type="government",
        entity_id=row["id"],
        title=row.get("title") or row["id"],
        subtitle=f"{row.get('starts_on') or 'unknown'} - {row.get('ends_on') or 'unknown'}",
        summary=f"{row.get('title') or row['id']} | PM: {row.get('prime_minister') or 'unknown'}",
        body=body,
        source_urls=[],
        tags=["government", row.get("legislature_id") or "unknown"],
        related_ids={"legislature": [row.get("legislature_id")] if row.get("legislature_id") and row.get("legislature_id") != "unknown" else []},
    )


def health_record(row: dict[str, Any]) -> WikiRecord:
    body = "\n".join(
        [
            f"Issue key: {row.get('issue_key') or 'unknown'}",
            f"Issue type: {row.get('issue_type') or 'unknown'}",
            f"Entity: {row.get('reviewed_entity_type') or 'unknown'} {row.get('reviewed_entity_id') or 'unknown'}",
            f"Status: {row.get('status') or 'unknown'}",
            f"Note: {row.get('note') or 'unknown'}",
        ]
    )
    return WikiRecord(
        id=f"data_health_review:{row['id']}",
        entity_type="data_health_review",
        entity_id=row["id"],
        title=row.get("issue_key") or row["id"],
        subtitle=f"{row.get('issue_type') or 'unknown'} | {row.get('status') or 'unknown'}",
        summary=f"{row.get('issue_key') or row['id']} is {row.get('status') or 'unknown'}",
        body=body,
        source_urls=[],
        tags=["data_health", row.get("issue_type") or "unknown", row.get("status") or "unknown"],
        related_ids={row.get("reviewed_entity_type") or "entity": [row.get("reviewed_entity_id")] if row.get("reviewed_entity_id") else []},
    )


def render_markdown_index(records: list[WikiRecord]) -> str:
    counts: dict[str, int] = {}
    for record in records:
        counts[record.entity_type] = counts.get(record.entity_type, 0) + 1
    lines = ["# Parliament Workbench Wiki", "", "Generated local wiki index.", ""]
    for entity_type, count in sorted(counts.items()):
        lines.append(f"- {entity_type}: {count}")
    lines.extend(["", "## Recent Records", ""])
    for record in records[:100]:
        lines.append(f"- **{record.entity_type}** `{record.entity_id}` — {record.title}")
    return "\n".join(lines) + "\n"


def searchable_text(payload: dict[str, Any]) -> str:
    return " ".join(
        [
            str(payload.get("title") or ""),
            str(payload.get("subtitle") or ""),
            str(payload.get("summary") or ""),
            str(payload.get("body") or ""),
            " ".join(str(tag) for tag in payload.get("tags") or []),
        ]
    )


def normalize(value: str) -> str:
    replacements = str.maketrans("ăâîșşțţĂÂÎȘŞȚŢ", "aaiss ttAAISS TT".replace(" ", ""))
    return re.sub(r"[^a-z0-9]+", " ", value.translate(replacements).lower()).strip()


def split_urls(value: str) -> list[str]:
    return [item.strip() for item in str(value or "").splitlines() if item.strip()]


def parse_json_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if not isinstance(value, str) or not value.strip():
        return {}
    try:
        payload = json.loads(value)
        return payload if isinstance(payload, dict) else {}
    except json.JSONDecodeError:
        return {}
