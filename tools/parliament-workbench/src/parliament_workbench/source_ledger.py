from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
from typing import Any

from .config import WorkbenchConfig
from .state import WorkbenchState, create_schema

CLAIM_STATUSES = {"open", "reviewed", "accepted", "ignored", "rejected"}
CONFLICT_STATUSES = {"open", "reviewed", "resolved", "ignored"}


def list_source_claims(
    config: WorkbenchConfig,
    *,
    entity_type: str | None = None,
    entity_id: str | None = None,
    status: str | None = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    WorkbenchState(config).initialize()
    where = []
    params: list[Any] = []
    if entity_type:
        where.append("entity_type = ?")
        params.append(entity_type)
    if entity_id:
        where.append("entity_id = ?")
        params.append(entity_id)
    if status:
        where.append("status = ?")
        params.append(status)
    sql = "select * from source_claims"
    if where:
        sql += " where " + " and ".join(where)
    sql += " order by updated_at desc limit ?"
    params.append(max(1, min(limit, 5000)))
    with WorkbenchState(config).connect() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [claim_payload(row) for row in rows]


def upsert_source_claim(config: WorkbenchConfig, payload: dict[str, Any]) -> dict[str, Any]:
    now = utc_now()
    entity_type = required_text(payload, "entityType")
    entity_id = required_text(payload, "entityId")
    field_path = required_text(payload, "fieldPath")
    value = payload.get("value")
    source_url = nullable_text(payload.get("sourceUrl"))
    source_title = nullable_text(payload.get("sourceTitle"))
    evidence_quote = nullable_text(payload.get("evidenceQuote"))
    source_type = nullable_text(payload.get("sourceType")) or "official"
    confidence = nullable_text(payload.get("confidence")) or "unknown"
    status = nullable_text(payload.get("status")) or "open"
    if status not in CLAIM_STATUSES:
        raise ValueError(f"Unsupported source claim status: {status}")
    reviewer = nullable_text(payload.get("reviewer"))
    reviewer_note = nullable_text(payload.get("reviewerNote"))
    decision_reason = nullable_text(payload.get("decisionReason"))
    reviewed_at = nullable_text(payload.get("reviewedAt"))
    proposal_id = nullable_text(payload.get("proposalId"))
    if status in {"reviewed", "accepted"}:
        if not evidence_quote:
            raise ValueError("Reviewed or accepted source claims require an evidence quote.")
        if not source_url:
            raise ValueError("Reviewed or accepted source claims require a source URL.")
    if status in {"rejected", "ignored"} and not (decision_reason or reviewer_note):
        raise ValueError("Rejected or ignored source claims require a reviewer note.")
    claim_id = payload.get("id") or claim_key(entity_type, entity_id, field_path, value, source_url)

    state = WorkbenchState(config)
    state.initialize()
    with state.connect() as conn:
        create_schema(conn)
        conn.execute(
            """
            insert into source_claims (
              id, entity_type, entity_id, field_path, value_json, source_url, source_title, evidence_quote,
              source_type, confidence, status, observed_at, updated_at, reviewer, reviewer_note, reviewed_at,
              decision_reason, proposal_id
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            on conflict(id) do update set
              value_json=excluded.value_json,
              source_url=excluded.source_url,
              source_title=excluded.source_title,
              evidence_quote=excluded.evidence_quote,
              source_type=excluded.source_type,
              confidence=excluded.confidence,
              status=excluded.status,
              reviewer=coalesce(excluded.reviewer, source_claims.reviewer),
              reviewer_note=coalesce(excluded.reviewer_note, source_claims.reviewer_note),
              reviewed_at=coalesce(excluded.reviewed_at, source_claims.reviewed_at),
              decision_reason=coalesce(excluded.decision_reason, source_claims.decision_reason),
              proposal_id=coalesce(excluded.proposal_id, source_claims.proposal_id),
              updated_at=excluded.updated_at
            """,
            (
                claim_id,
                entity_type,
                entity_id,
                field_path,
                json.dumps(value, ensure_ascii=False, sort_keys=True),
                source_url,
                source_title,
                evidence_quote,
                source_type,
                confidence,
                status,
                payload.get("observedAt") or now,
                now,
                reviewer,
                reviewer_note,
                reviewed_at,
                decision_reason,
                proposal_id,
            ),
        )
        conn.commit()
    detect_conflicts(config, entity_type, entity_id, field_path)
    claim = next((row for row in list_source_claims(config, entity_type=entity_type, entity_id=entity_id, limit=500) if row["id"] == claim_id), None)
    return claim or {"id": claim_id}


def update_source_claim(config: WorkbenchConfig, claim_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    status = nullable_text(payload.get("status"))
    if status and status not in CLAIM_STATUSES:
        raise ValueError(f"Unsupported source claim status: {status}")
    evidence_quote = nullable_text(payload.get("evidenceQuote"))
    source_url = nullable_text(payload.get("sourceUrl"))
    source_title = nullable_text(payload.get("sourceTitle"))
    reviewer = nullable_text(payload.get("reviewer"))
    reviewer_note = nullable_text(payload.get("reviewerNote"))
    decision_reason = nullable_text(payload.get("decisionReason")) or reviewer_note
    proposal_id = nullable_text(payload.get("proposalId"))
    assignments = []
    params: list[Any] = []
    state = WorkbenchState(config)
    state.initialize()
    with state.connect() as conn:
        existing = conn.execute("select * from source_claims where id = ?", (claim_id,)).fetchone()
    if existing is None:
        raise KeyError("Source claim not found.")
    effective_status = status or existing["status"]
    effective_evidence = evidence_quote if "evidenceQuote" in payload else nullable_text(existing["evidence_quote"])
    effective_source_url = source_url if "sourceUrl" in payload else nullable_text(existing["source_url"])
    if effective_status in {"reviewed", "accepted"}:
        if not effective_evidence:
            raise ValueError("Reviewed or accepted source claims require an evidence quote.")
        if not effective_source_url:
            raise ValueError("Reviewed or accepted source claims require a source URL.")
    if effective_status in {"rejected", "ignored"} and not decision_reason:
        raise ValueError("Rejected or ignored source claims require a reviewer note.")
    if effective_status == "accepted":
        conflicts = list_source_conflicts(
            config,
            entity_type=existing["entity_type"],
            entity_id=existing["entity_id"],
            limit=5000,
        )
        unresolved = [
            conflict
            for conflict in conflicts
            if conflict.get("fieldPath") == existing["field_path"] and conflict.get("status") in {"open", "reviewed"}
        ]
        if unresolved:
            raise ValueError(f"Cannot accept source claim while unresolved source conflicts exist: {', '.join(row['id'] for row in unresolved[:5])}")
    if status:
        assignments.append("status = ?")
        params.append(status)
        if status in {"reviewed", "accepted", "rejected", "ignored"}:
            assignments.append("reviewer = ?")
            params.append(reviewer or "local")
            assignments.append("reviewed_at = ?")
            params.append(utc_now())
            assignments.append("decision_reason = ?")
            params.append(decision_reason)
    if "reviewer" in payload and not status:
        assignments.append("reviewer = ?")
        params.append(reviewer)
    if "reviewerNote" in payload:
        assignments.append("reviewer_note = ?")
        params.append(reviewer_note)
    if "decisionReason" in payload and not status:
        assignments.append("decision_reason = ?")
        params.append(decision_reason)
    if "proposalId" in payload:
        assignments.append("proposal_id = ?")
        params.append(proposal_id)
    if "evidenceQuote" in payload:
        assignments.append("evidence_quote = ?")
        params.append(evidence_quote)
    if "sourceUrl" in payload:
        assignments.append("source_url = ?")
        params.append(source_url)
    if "sourceTitle" in payload:
        assignments.append("source_title = ?")
        params.append(source_title)
    if not assignments:
        raise ValueError("No source claim fields were provided.")
    assignments.append("updated_at = ?")
    params.append(utc_now())
    params.append(claim_id)
    with state.connect() as conn:
        conn.execute(f"update source_claims set {', '.join(assignments)} where id = ?", params)
        conn.commit()
    detect_conflicts(config, existing["entity_type"], existing["entity_id"], existing["field_path"])
    claim = next((item for item in list_source_claims(config, entity_type=existing["entity_type"], entity_id=existing["entity_id"], limit=5000) if item["id"] == claim_id), None)
    if claim is None:
        raise KeyError("Source claim not found.")
    return claim


def list_source_conflicts(
    config: WorkbenchConfig,
    *,
    entity_type: str | None = None,
    entity_id: str | None = None,
    status: str | None = None,
    limit: int = 100,
) -> list[dict[str, Any]]:
    WorkbenchState(config).initialize()
    where = []
    params: list[Any] = []
    if entity_type:
        where.append("entity_type = ?")
        params.append(entity_type)
    if entity_id:
        where.append("entity_id = ?")
        params.append(entity_id)
    if status:
        where.append("status = ?")
        params.append(status)
    sql = "select * from source_conflicts"
    if where:
        sql += " where " + " and ".join(where)
    sql += " order by updated_at desc limit ?"
    params.append(max(1, min(limit, 500)))
    with WorkbenchState(config).connect() as conn:
        rows = conn.execute(sql, params).fetchall()
    return [conflict_payload(row) for row in rows]


def update_source_conflict(config: WorkbenchConfig, conflict_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    status = nullable_text(payload.get("status"))
    if status and status not in CONFLICT_STATUSES:
        raise ValueError(f"Unsupported source conflict status: {status}")
    reviewer_note = nullable_text(payload.get("reviewerNote"))
    assignments = []
    params: list[Any] = []
    if status:
        assignments.append("status = ?")
        params.append(status)
    if "reviewerNote" in payload:
        assignments.append("reviewer_note = ?")
        params.append(reviewer_note)
    if not assignments:
        raise ValueError("No source conflict fields were provided.")
    assignments.append("updated_at = ?")
    params.append(utc_now())
    params.append(conflict_id)
    state = WorkbenchState(config)
    state.initialize()
    with state.connect() as conn:
        row = conn.execute("select entity_type, entity_id from source_conflicts where id = ?", (conflict_id,)).fetchone()
        if row is None:
            raise KeyError("Source conflict not found.")
        conn.execute(f"update source_conflicts set {', '.join(assignments)} where id = ?", params)
        conn.commit()
    conflict = next((item for item in list_source_conflicts(config, entity_type=row["entity_type"], entity_id=row["entity_id"], limit=500) if item["id"] == conflict_id), None)
    if conflict is None:
        raise KeyError("Source conflict not found.")
    return conflict


def detect_conflicts(config: WorkbenchConfig, entity_type: str, entity_id: str, field_path: str) -> dict[str, Any] | None:
    state = WorkbenchState(config)
    with state.connect() as conn:
        rows = conn.execute(
            """
            select * from source_claims
            where entity_type = ? and entity_id = ? and field_path = ? and status not in ('ignored', 'rejected')
            order by updated_at desc
            """,
            (entity_type, entity_id, field_path),
        ).fetchall()
        values: dict[str, list[dict[str, Any]]] = {}
        for row in rows:
            values.setdefault(row["value_json"], []).append(claim_payload(row))
        conflict_id = f"source-conflict-{hash_text(entity_type, entity_id, field_path)}"
        if len(values) <= 1:
            conn.execute(
                """
                update source_conflicts
                set status = case when status = 'open' then 'resolved' else status end,
                    updated_at = ?
                where id = ?
                """,
                (utc_now(), conflict_id),
            )
            conn.commit()
            return None
        now = utc_now()
        conflict = {
            "fieldPath": field_path,
            "claimsByValue": values,
        }
        conn.execute(
            """
            insert into source_conflicts (
              id, entity_type, entity_id, field_path, conflict_json, status, created_at, updated_at
            ) values (?, ?, ?, ?, ?, 'open', ?, ?)
            on conflict(id) do update set
              conflict_json=excluded.conflict_json,
              status='open',
              updated_at=excluded.updated_at
            """,
            (conflict_id, entity_type, entity_id, field_path, json.dumps(conflict, ensure_ascii=False, sort_keys=True), now, now),
        )
        conn.commit()
    return next((row for row in list_source_conflicts(config, entity_type=entity_type, entity_id=entity_id) if row["id"] == conflict_id), None)


def claim_payload(row: Any) -> dict[str, Any]:
    return {
        "id": row["id"],
        "entityType": row["entity_type"],
        "entityId": row["entity_id"],
        "fieldPath": row["field_path"],
        "value": json.loads(row["value_json"]),
        "sourceUrl": row["source_url"],
        "sourceTitle": row["source_title"],
        "evidenceQuote": row["evidence_quote"],
        "sourceType": row["source_type"],
        "confidence": row["confidence"],
        "status": row["status"],
        "observedAt": row["observed_at"],
        "reviewer": row["reviewer"],
        "reviewerNote": row["reviewer_note"],
        "reviewedAt": row["reviewed_at"],
        "decisionReason": row["decision_reason"],
        "proposalId": row["proposal_id"],
        "updatedAt": row["updated_at"],
    }


def conflict_payload(row: Any) -> dict[str, Any]:
    return {
        "id": row["id"],
        "entityType": row["entity_type"],
        "entityId": row["entity_id"],
        "fieldPath": row["field_path"],
        "conflict": json.loads(row["conflict_json"]),
        "status": row["status"],
        "reviewerNote": row["reviewer_note"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def claim_key(entity_type: str, entity_id: str, field_path: str, value: Any, source_url: str | None) -> str:
    return f"source-claim-{hash_text(entity_type, entity_id, field_path, json.dumps(value, ensure_ascii=False, sort_keys=True), source_url or '')}"


def hash_text(*parts: str) -> str:
    return hashlib.sha1("\x1f".join(parts).encode("utf-8")).hexdigest()[:16]


def required_text(payload: dict[str, Any], key: str) -> str:
    value = nullable_text(payload.get(key))
    if not value:
        raise ValueError(f"{key} is required.")
    return value


def nullable_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()
