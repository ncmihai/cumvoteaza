from __future__ import annotations

from datetime import datetime, timezone
import json
import secrets
from typing import Any

from .config import WorkbenchConfig
from .db import ReadOnlyDb
from .state import WorkbenchState, create_schema


TAXONOMY_VERSION = "cap-ro-v1"

TOPICS = [
    {"code": "macroeconomy", "label": "Macroeconomie si buget", "capCode": "1"},
    {"code": "civil_rights", "label": "Drepturi, libertati si egalitate", "capCode": "2"},
    {"code": "health", "label": "Sanatate", "capCode": "3"},
    {"code": "agriculture", "label": "Agricultura si alimentatie", "capCode": "4"},
    {"code": "labor_pensions", "label": "Munca, pensii si protectie sociala", "capCode": "5"},
    {"code": "education", "label": "Educatie, cercetare si cultura", "capCode": "6"},
    {"code": "environment", "label": "Mediu si clima", "capCode": "7"},
    {"code": "energy", "label": "Energie", "capCode": "8"},
    {"code": "migration", "label": "Migratie si cetatenie", "capCode": "9"},
    {"code": "transport", "label": "Transport si infrastructura", "capCode": "10"},
    {"code": "justice", "label": "Justitie si institutii", "capCode": "12"},
    {"code": "local_administration", "label": "Administratie locala", "capCode": "13"},
    {"code": "housing", "label": "Locuire si dezvoltare urbana", "capCode": "14"},
    {"code": "banking_finance", "label": "Banci, finante si piata de capital", "capCode": "15"},
    {"code": "defense", "label": "Aparare", "capCode": "16"},
    {"code": "foreign_affairs", "label": "Politica externa si UE", "capCode": "19"},
    {"code": "government_operations", "label": "Functionarea statului", "capCode": "20"},
    {"code": "public_order", "label": "Ordine publica si siguranta", "capCode": "21"},
    {"code": "private_sector", "label": "Sector privat, firme si competitie", "capCode": "RO-1"},
    {"code": "public_services", "label": "Servicii publice si universalitate", "capCode": "RO-2"},
    {"code": "anti_corruption", "label": "Anticoruptie si integritate", "capCode": "RO-3"},
    {"code": "digital_governance", "label": "Digitalizare si date publice", "capCode": "RO-4"},
]

STANCES = [
    {"code": "expand_public", "label": "Extinde rolul public"},
    {"code": "limit_public", "label": "Limiteaza rolul public"},
    {"code": "redistributive", "label": "Redistributiv"},
    {"code": "market_liberal", "label": "Pro-piata"},
    {"code": "rights_expanding", "label": "Extinde drepturi"},
    {"code": "rights_restricting", "label": "Restrange drepturi"},
    {"code": "centralizing", "label": "Centralizator"},
    {"code": "decentralizing", "label": "Descentralizator"},
    {"code": "technical_admin", "label": "Tehnic administrativ"},
    {"code": "unknown", "label": "Necunoscut / insuficient"},
]


def taxonomy_payload(config: WorkbenchConfig) -> dict[str, Any]:
    labels = list_taxonomy_labels(config, limit=250)
    return {
        "version": TAXONOMY_VERSION,
        "topics": TOPICS,
        "stances": STANCES,
        "reviewedLabelCount": sum(1 for label in labels if label.get("status") in {"reviewed", "accepted"}),
        "labels": labels[:100],
    }


def create_taxonomy_label(config: WorkbenchConfig, payload: dict[str, Any]) -> dict[str, Any]:
    entity_type = clean(payload.get("entityType"))
    entity_id = clean(payload.get("entityId"))
    topic_code = clean(payload.get("topicCode"))
    stance_code = clean(payload.get("stanceCode")) or "unknown"
    evidence_quote = clean(payload.get("evidenceQuote"))
    source_id = clean(payload.get("sourceId"))
    status = clean(payload.get("status")) or "draft"
    if not entity_type or not entity_id:
        raise ValueError("entityType and entityId are required.")
    topic = topic_by_code(topic_code)
    if not topic:
        raise ValueError(f"Unsupported topicCode: {topic_code}")
    stance = stance_by_code(stance_code)
    if not stance:
        raise ValueError(f"Unsupported stanceCode: {stance_code}")
    if status in {"reviewed", "accepted"} and not evidence_quote:
        raise ValueError("Reviewed or accepted labels require an evidence quote.")
    if status in {"reviewed", "accepted"} and not source_id:
        raise ValueError("Reviewed or accepted labels require a source ID.")
    now = utc_now()
    row_id = f"taxonomy-label-{secrets.token_hex(6)}"
    with WorkbenchState(config).connect() as conn:
        create_schema(conn)
        conn.execute(
            """
            insert into taxonomy_labels (
              id, entity_type, entity_id, taxonomy_version, topic_code, topic_label,
              stance_code, stance_label, confidence, status, evidence_quote, source_id,
              created_at, updated_at
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                row_id,
                entity_type,
                entity_id,
                TAXONOMY_VERSION,
                topic["code"],
                topic["label"],
                stance["code"],
                stance["label"],
                float(payload.get("confidence") or 0.5),
                status,
                evidence_quote,
                source_id,
                now,
                now,
            ),
        )
        conn.commit()
    return get_taxonomy_label(config, row_id)


def list_taxonomy_labels(
    config: WorkbenchConfig,
    *,
    entity_type: str | None = None,
    entity_id: str | None = None,
    status: str | None = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    clauses = ["entity_type <> 'system'"]
    params: list[Any] = []
    if entity_type:
        clauses.append("entity_type = ?")
        params.append(entity_type)
    if entity_id:
        clauses.append("entity_id = ?")
        params.append(entity_id)
    if status:
        clauses.append("status = ?")
        params.append(status)
    with WorkbenchState(config).connect() as conn:
        create_schema(conn)
        rows = conn.execute(
            f"select * from taxonomy_labels where {' and '.join(clauses)} order by updated_at desc limit ?",
            (*params, max(1, min(limit, 500))),
        ).fetchall()
    return [taxonomy_label_payload(row) for row in rows]


def get_taxonomy_label(config: WorkbenchConfig, label_id: str) -> dict[str, Any]:
    with WorkbenchState(config).connect() as conn:
        create_schema(conn)
        row = conn.execute("select * from taxonomy_labels where id = ?", (label_id,)).fetchone()
    if not row:
        raise KeyError(label_id)
    return taxonomy_label_payload(row)


def evidence_profile(config: WorkbenchConfig, entity_type: str, entity_id: str, start_date: str | None = None, end_date: str | None = None) -> dict[str, Any]:
    labels = [
        label
        for label in list_taxonomy_labels(config, entity_type=entity_type, entity_id=entity_id, limit=500)
        if label["status"] in {"reviewed", "accepted"}
    ]
    topic_counts: dict[str, int] = {}
    stance_counts: dict[str, int] = {}
    for label in labels:
        topic_counts[label["topicCode"]] = topic_counts.get(label["topicCode"], 0) + 1
        stance = label.get("stanceCode") or "unknown"
        stance_counts[stance] = stance_counts.get(stance, 0) + 1
    vote_context = vote_context_counts(config, entity_type, entity_id, start_date, end_date)
    coverage = len(labels)
    payload = {
        "entityType": entity_type,
        "entityId": entity_id,
        "taxonomyVersion": TAXONOMY_VERSION,
        "coverage": {
            "reviewedLabelCount": coverage,
            "voteCount": vote_context.get("voteCount", 0),
            "confidence": "usable" if coverage >= 10 else "insufficient_reviewed_data",
        },
        "topicCounts": topic_counts,
        "stanceCounts": stance_counts,
        "voteSimilarity": vote_context.get("similarity", []),
        "partyDiscipline": vote_context.get("discipline", []),
        "governmentAlignment": vote_context.get("governmentAlignment", {"status": "unknown"}),
        "labels": labels[:100],
    }
    store_analytics_snapshot(config, "evidence_profile", entity_type, entity_id, payload)
    return payload


def vote_context_counts(config: WorkbenchConfig, entity_type: str, entity_id: str, start_date: str | None, end_date: str | None) -> dict[str, Any]:
    if not ReadOnlyDb(config).configured:
        return {"voteCount": 0, "similarity": [], "discipline": [], "governmentAlignment": {"status": "database_unconfigured"}}
    try:
        if entity_type == "party":
            rows = ReadOnlyDb(config).execute(PARTY_VOTE_CONTEXT_QUERY, (entity_id, start_date, start_date, end_date, end_date))
        elif entity_type == "member":
            rows = ReadOnlyDb(config).execute(MEMBER_VOTE_CONTEXT_QUERY, (entity_id, start_date, start_date, end_date, end_date))
        else:
            rows = []
    except Exception as error:
        return {"voteCount": 0, "similarity": [], "discipline": [], "governmentAlignment": {"status": "unavailable", "reason": str(error)}}
    total = sum(int(row.get("vote_count") or 0) for row in rows)
    discipline = [
        {
            "bucket": row.get("bucket") or "unknown",
            "voteCount": int(row.get("vote_count") or 0),
            "share": round(int(row.get("vote_count") or 0) / total, 3) if total else 0,
        }
        for row in rows
    ]
    return {
        "voteCount": total,
        "similarity": [],
        "discipline": discipline,
        "governmentAlignment": {"status": "context_pending", "message": "Government/opposition alignment needs reviewed labels and vote-date government context."},
    }


def store_analytics_snapshot(config: WorkbenchConfig, snapshot_type: str, entity_type: str, entity_id: str, payload: dict[str, Any]) -> None:
    with WorkbenchState(config).connect() as conn:
        create_schema(conn)
        conn.execute(
            "insert into analytics_snapshots (id, snapshot_type, entity_type, entity_id, payload_json, created_at) values (?, ?, ?, ?, ?, ?)",
            (
                f"analytics-{secrets.token_hex(6)}",
                snapshot_type,
                entity_type,
                entity_id,
                json.dumps(payload, ensure_ascii=False, sort_keys=True),
                utc_now(),
            ),
        )
        conn.commit()


def taxonomy_label_payload(row: Any) -> dict[str, Any]:
    return {
        "id": row["id"],
        "entityType": row["entity_type"],
        "entityId": row["entity_id"],
        "taxonomyVersion": row["taxonomy_version"],
        "topicCode": row["topic_code"],
        "topicLabel": row["topic_label"],
        "stanceCode": row["stance_code"],
        "stanceLabel": row["stance_label"],
        "confidence": row["confidence"],
        "status": row["status"],
        "evidenceQuote": row["evidence_quote"],
        "sourceId": row["source_id"],
        "reviewer": row["reviewer"],
        "reviewerNote": row["reviewer_note"],
        "reviewedAt": row["reviewed_at"],
        "decisionReason": row["decision_reason"],
        "proposalId": row["proposal_id"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def topic_by_code(code: str | None) -> dict[str, str] | None:
    return next((topic for topic in TOPICS if topic["code"] == code), None)


def stance_by_code(code: str | None) -> dict[str, str] | None:
    return next((stance for stance in STANCES if stance["code"] == code), None)


def clean(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


PARTY_VOTE_CONTEXT_QUERY = """
select choice::text as bucket, count(*)::int as vote_count
from group_vote_totals gvt
join parliamentary_groups pg on pg.id = gvt.group_id
join votes v on v.id = gvt.vote_id
where pg.party_id = %s
  and (%s is null or v.held_on >= %s::date)
  and (%s is null or v.held_on <= %s::date)
group by choice
order by vote_count desc
"""

MEMBER_VOTE_CONTEXT_QUERY = """
select choice::text as bucket, count(*)::int as vote_count
from individual_votes iv
join votes v on v.id = iv.vote_id
where iv.member_id = %s
  and (%s is null or v.held_on >= %s::date)
  and (%s is null or v.held_on <= %s::date)
group by choice
order by vote_count desc
"""
