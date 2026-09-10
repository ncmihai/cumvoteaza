from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from .config import WorkbenchConfig
from .model_audit import load_suggestions
from .model_lab import proposal_type_for_suggestion
from .proposals import accept_proposal, command_preview, create_proposal, get_proposal, reject_proposal, review_proposal
from .source_ledger import list_source_claims, list_source_conflicts, update_source_claim
from .state import WorkbenchState, create_schema
from .storage import read_jsonl, write_jsonl


REVIEW_QUEUES = {"citations", "text_corrections", "taxonomy_labels", "source_claims", "model_suggestions", "export_blockers"}
FINAL_REVIEW_STATUSES = {"accepted", "rejected", "ignored"}
REVIEW_STATUSES = {"candidate", "draft", "open", "reviewed", "failed", *FINAL_REVIEW_STATUSES}
BLOCKING_CITATION_STATUSES = {"candidate"}
BLOCKING_CORRECTION_STATUSES = {"draft"}
BLOCKING_SOURCE_CLAIM_STATUSES = {"open", "reviewed"}


class ReviewQueueError(ValueError):
    pass


def review_queue_summary(config: WorkbenchConfig) -> dict[str, Any]:
    items = collect_review_items(config)
    by_queue: dict[str, int] = {}
    by_status: dict[str, int] = {}
    blockers = 0
    for item in items:
        by_queue[item["queue"]] = by_queue.get(item["queue"], 0) + 1
        by_status[item["status"]] = by_status.get(item["status"], 0) + 1
        if item.get("blocksExport"):
            blockers += 1
    return {
        "total": len(items),
        "blockers": blockers,
        "byQueue": [{"key": key, "count": by_queue[key]} for key in sorted(by_queue)],
        "byStatus": [{"key": key, "count": by_status[key]} for key in sorted(by_status)],
    }


def list_review_queue_items(
    config: WorkbenchConfig,
    *,
    queue: str | None = None,
    status: str | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    q: str | None = None,
    source: str | None = None,
    blocks_export: bool | None = None,
    limit: int = 100,
    offset: int = 0,
) -> dict[str, Any]:
    if queue and queue not in REVIEW_QUEUES:
        raise ReviewQueueError(f"Unsupported queue: {queue}")
    items = collect_review_items(config, queue=queue)
    items = [item for item in items if item_matches(item, status=status, entity_type=entity_type, entity_id=entity_id, q=q, source=source, blocks_export=blocks_export)]
    items.sort(key=lambda item: str(item.get("updatedAt") or item.get("createdAt") or ""), reverse=True)
    safe_limit = max(1, min(limit, 500))
    safe_offset = max(0, offset)
    return {"items": items[safe_offset : safe_offset + safe_limit], "total": len(items), "limit": safe_limit, "offset": safe_offset}


def collect_review_items(config: WorkbenchConfig, queue: str | None = None) -> list[dict[str, Any]]:
    queues = [queue] if queue else ["citations", "text_corrections", "taxonomy_labels", "source_claims", "model_suggestions", "export_blockers"]
    items: list[dict[str, Any]] = []
    for queue_name in queues:
        if queue_name == "citations":
            items.extend(citation_items(config))
        elif queue_name == "text_corrections":
            items.extend(text_correction_items(config))
        elif queue_name == "taxonomy_labels":
            items.extend(taxonomy_label_items(config))
        elif queue_name == "source_claims":
            items.extend(source_claim_items(config))
        elif queue_name == "model_suggestions":
            items.extend(model_suggestion_items(config))
        elif queue_name == "export_blockers":
            items.extend(export_blocker_items(config))
    return items


def transition_review_item(config: WorkbenchConfig, queue: str, item_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    status = clean(payload.get("status"))
    if queue not in REVIEW_QUEUES - {"export_blockers"}:
        raise ReviewQueueError(f"Unsupported transition queue: {queue}")
    if status not in {"reviewed", "accepted", "rejected", "ignored"}:
        raise ReviewQueueError(f"Unsupported review status: {status}")
    reviewer = clean(payload.get("reviewer")) or "local"
    reviewer_note = clean(payload.get("reviewerNote"))
    decision_reason = clean(payload.get("decisionReason")) or reviewer_note
    if status in {"rejected", "ignored"} and not decision_reason:
        raise ReviewQueueError("Rejected or ignored review items require a note.")
    item = get_review_item(config, queue, item_id)
    if status in {"reviewed", "accepted"}:
        require_evidence_and_source(item)
    if status == "accepted" and queue != "source_claims":
        ensure_no_unresolved_conflicts(config, item)
    if queue == "citations":
        update_sqlite_review_row(config, "extracted_citations", item_id, status, reviewer, reviewer_note, decision_reason)
    elif queue == "text_corrections":
        update_sqlite_review_row(config, "text_corrections", item_id, status, reviewer, reviewer_note, decision_reason)
        sync_linked_proposal(config, item, status, decision_reason)
    elif queue == "taxonomy_labels":
        update_sqlite_review_row(config, "taxonomy_labels", item_id, status, reviewer, reviewer_note, decision_reason)
        sync_linked_proposal(config, item, status, decision_reason)
    elif queue == "source_claims":
        update_source_claim(
            config,
            item_id,
            {
                "status": status,
                "reviewer": reviewer,
                "reviewerNote": reviewer_note,
                "decisionReason": decision_reason,
            },
        )
        sync_linked_proposal(config, item, status, decision_reason)
    elif queue == "model_suggestions":
        update_model_suggestion(config, item_id, {"status": status, "reviewer": reviewer, "reviewerNote": reviewer_note, "reviewedAt": utc_now(), "decisionReason": decision_reason})
        sync_linked_proposal(config, item, status, decision_reason)
    return get_review_item(config, queue, item_id)


def review_item_proposal_preview(config: WorkbenchConfig, queue: str, item_id: str) -> dict[str, Any]:
    item = get_review_item(config, queue, item_id)
    proposal_id = item.get("proposalId")
    if proposal_id:
        return {"queue": queue, "itemId": item_id, "proposalId": proposal_id, "proposal": get_proposal(config, proposal_id), "commandPreview": command_preview(config, proposal_id), "canConvert": False}
    return {"queue": queue, "itemId": item_id, "proposalPayload": proposal_payload_for_item(item), "commandPreview": None, "canConvert": True}


def convert_review_item_to_proposal(config: WorkbenchConfig, queue: str, item_id: str) -> dict[str, Any]:
    item = get_review_item(config, queue, item_id)
    proposal_id = item.get("proposalId")
    if proposal_id:
        return get_proposal(config, proposal_id)
    proposal = create_proposal(config, proposal_payload_for_item(item))
    if queue == "citations":
        set_sqlite_proposal_id(config, "extracted_citations", item_id, proposal["id"])
    elif queue == "text_corrections":
        set_sqlite_proposal_id(config, "text_corrections", item_id, proposal["id"])
    elif queue == "taxonomy_labels":
        set_sqlite_proposal_id(config, "taxonomy_labels", item_id, proposal["id"])
    elif queue == "source_claims":
        update_source_claim(config, item_id, {"proposalId": proposal["id"]})
    elif queue == "model_suggestions":
        update_model_suggestion(config, item_id, {"proposalId": proposal["id"]})
    return proposal


def citation_items(config: WorkbenchConfig) -> list[dict[str, Any]]:
    with WorkbenchState(config).connect() as conn:
        create_schema(conn)
        rows = conn.execute("select * from extracted_citations order by updated_at desc limit 5000").fetchall()
    return [
        review_item(
            queue="citations",
            id=row["id"],
            status=row["status"],
            entity_type="document",
            entity_id=row["document_id"],
            title=row["raw_text"],
            subtitle=f"{row['citation_type']} -> {row['normalized_target']}",
            evidence_quote=row["raw_text"],
            source_id=row["document_id"],
            snippet=row["snippet"],
            confidence=row["confidence"],
            proposal_id=row["proposal_id"],
            reviewer=row["reviewer"],
            reviewer_note=row["reviewer_note"],
            reviewed_at=row["reviewed_at"],
            decision_reason=row["decision_reason"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            blocks_export=row["status"] in BLOCKING_CITATION_STATUSES,
            raw={
                "documentId": row["document_id"],
                "parseId": row["parse_id"],
                "citationType": row["citation_type"],
                "rawText": row["raw_text"],
                "normalizedTarget": row["normalized_target"],
                "startOffset": row["start_offset"],
                "endOffset": row["end_offset"],
            },
        )
        for row in rows
    ]


def text_correction_items(config: WorkbenchConfig) -> list[dict[str, Any]]:
    with WorkbenchState(config).connect() as conn:
        create_schema(conn)
        rows = conn.execute("select * from text_corrections order by updated_at desc limit 5000").fetchall()
    return [
        review_item(
            queue="text_corrections",
            id=row["id"],
            status=row["status"],
            entity_type="document",
            entity_id=row["document_id"],
            title=row["correction_note"] or "Text correction",
            subtitle=f"document {row['document_id']}",
            evidence_quote=row["evidence_quote"],
            source_id=row["source_document_id"],
            official_url=row["official_url"],
            snippet=row["corrected_text"] or row["correction_note"],
            proposal_id=row["proposal_id"],
            reviewer=row["reviewer"],
            reviewer_note=row["reviewer_note"],
            reviewed_at=row["reviewed_at"],
            decision_reason=row["decision_reason"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            blocks_export=row["status"] in BLOCKING_CORRECTION_STATUSES,
            raw={
                "documentId": row["document_id"],
                "baseTextHash": row["base_text_hash"],
                "correctedText": row["corrected_text"],
                "correctionNote": row["correction_note"],
                "createdBy": row["created_by"],
            },
        )
        for row in rows
    ]


def taxonomy_label_items(config: WorkbenchConfig) -> list[dict[str, Any]]:
    with WorkbenchState(config).connect() as conn:
        create_schema(conn)
        rows = conn.execute("select * from taxonomy_labels where entity_type <> 'system' order by updated_at desc limit 5000").fetchall()
    return [
        review_item(
            queue="taxonomy_labels",
            id=row["id"],
            status=row["status"],
            entity_type=row["entity_type"],
            entity_id=row["entity_id"],
            title=row["topic_label"],
            subtitle=row["stance_label"] or "unknown stance",
            evidence_quote=row["evidence_quote"],
            source_id=row["source_id"],
            snippet=row["evidence_quote"],
            confidence=row["confidence"],
            proposal_id=row["proposal_id"],
            reviewer=row["reviewer"],
            reviewer_note=row["reviewer_note"],
            reviewed_at=row["reviewed_at"],
            decision_reason=row["decision_reason"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            blocks_export=False,
            raw={
                "taxonomyVersion": row["taxonomy_version"],
                "topicCode": row["topic_code"],
                "stanceCode": row["stance_code"],
            },
        )
        for row in rows
    ]


def source_claim_items(config: WorkbenchConfig) -> list[dict[str, Any]]:
    rows = list_source_claims(config, limit=5000)
    return [
        review_item(
            queue="source_claims",
            id=row["id"],
            status=row["status"],
            entity_type=row["entityType"],
            entity_id=row["entityId"],
            title=row["fieldPath"],
            subtitle=row.get("sourceTitle") or row.get("sourceUrl") or "source claim",
            evidence_quote=row.get("evidenceQuote"),
            source_id=row.get("sourceUrl"),
            official_url=row.get("sourceUrl"),
            snippet=source_claim_snippet(row),
            confidence=row.get("confidence"),
            proposal_id=row.get("proposalId"),
            reviewer=row.get("reviewer"),
            reviewer_note=row.get("reviewerNote"),
            reviewed_at=row.get("reviewedAt"),
            decision_reason=row.get("decisionReason"),
            created_at=row.get("observedAt"),
            updated_at=row.get("updatedAt"),
            blocks_export=row["status"] in BLOCKING_SOURCE_CLAIM_STATUSES,
            raw={
                "fieldPath": row["fieldPath"],
                "value": row.get("value"),
                "sourceType": row.get("sourceType"),
                "sourceUrl": row.get("sourceUrl"),
                "sourceTitle": row.get("sourceTitle"),
            },
        )
        for row in rows
    ]


def model_suggestion_items(config: WorkbenchConfig) -> list[dict[str, Any]]:
    return [
        review_item(
            queue="model_suggestions",
            id=str(row.get("id")),
            status=str(row.get("status") or "open"),
            entity_type=str(row.get("entityType") or "bill"),
            entity_id=str(row.get("entityId") or row.get("billId") or "unknown"),
            title=str(row.get("suggestionType") or "model suggestion"),
            subtitle=str(row.get("suggestedValue") or row.get("error") or ""),
            evidence_quote=clean(row.get("evidenceQuote")),
            source_id=clean(row.get("sourceDocumentId")) or clean(row.get("officialUrl")),
            source_document_id=clean(row.get("sourceDocumentId")),
            official_url=clean(row.get("officialUrl")),
            snippet=clean(row.get("explanation")) or clean(row.get("error")),
            confidence=row.get("confidence"),
            proposal_id=clean(row.get("proposalId")),
            reviewer=clean(row.get("reviewer")),
            reviewer_note=clean(row.get("reviewerNote")),
            reviewed_at=clean(row.get("reviewedAt")),
            decision_reason=clean(row.get("decisionReason")),
            created_at=clean(row.get("createdAt")),
            updated_at=clean(row.get("reviewedAt")) or clean(row.get("createdAt")),
            blocks_export=False,
            raw=row,
        )
        for row in load_suggestions(config, limit=5000)
    ]


def export_blocker_items(config: WorkbenchConfig) -> list[dict[str, Any]]:
    from .migrate_export import migration_preview

    preview = migration_preview(config)
    now = utc_now()
    return [
        review_item(
            queue="export_blockers",
            id=str(blocker["key"]),
            status="open",
            entity_type="export",
            entity_id=str(blocker["key"]),
            title=str(blocker["key"]).replace("_", " "),
            subtitle=f"{blocker.get('count', 0)} blocking records",
            evidence_quote=None,
            source_id=None,
            snippet=", ".join(str(value) for value in (blocker.get("entityIds") or [])[:10]),
            created_at=now,
            updated_at=now,
            blocks_export=True,
            raw=blocker,
        )
        for blocker in preview.get("blockers", [])
    ]


def get_review_item(config: WorkbenchConfig, queue: str, item_id: str) -> dict[str, Any]:
    items = list_review_queue_items(config, queue=queue, limit=5000)["items"]
    item = next((row for row in items if row["id"] == item_id), None)
    if not item:
        raise KeyError(item_id)
    return item


def review_item(
    *,
    queue: str,
    id: str,
    status: str,
    entity_type: str,
    entity_id: str,
    title: str,
    subtitle: str | None = None,
    evidence_quote: str | None = None,
    source_id: str | None = None,
    source_document_id: str | None = None,
    official_url: str | None = None,
    snippet: str | None = None,
    confidence: Any | None = None,
    proposal_id: str | None = None,
    reviewer: str | None = None,
    reviewer_note: str | None = None,
    reviewed_at: str | None = None,
    decision_reason: str | None = None,
    created_at: str | None = None,
    updated_at: str | None = None,
    blocks_export: bool = False,
    raw: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "id": id,
        "queue": queue,
        "status": status,
        "entityType": entity_type,
        "entityId": entity_id,
        "title": title,
        "subtitle": subtitle,
        "evidenceQuote": evidence_quote,
        "sourceId": source_id,
        "sourceDocumentId": source_document_id or source_id,
        "officialUrl": official_url,
        "snippet": snippet,
        "confidence": confidence,
        "proposalId": proposal_id,
        "reviewer": reviewer,
        "reviewerNote": reviewer_note,
        "reviewedAt": reviewed_at,
        "decisionReason": decision_reason,
        "createdAt": created_at,
        "updatedAt": updated_at,
        "blocksExport": blocks_export,
        "raw": raw or {},
    }


def item_matches(
    item: dict[str, Any],
    *,
    status: str | None,
    entity_type: str | None,
    entity_id: str | None,
    q: str | None,
    source: str | None,
    blocks_export: bool | None,
) -> bool:
    if status and item.get("status") != status:
        return False
    if entity_type and item.get("entityType") != entity_type:
        return False
    if entity_id and item.get("entityId") != entity_id:
        return False
    if blocks_export is not None and bool(item.get("blocksExport")) is not blocks_export:
        return False
    if source:
        haystack = " ".join(str(item.get(key) or "") for key in ("sourceId", "sourceDocumentId", "officialUrl"))
        if normalize(source) not in normalize(haystack):
            return False
    if q:
        haystack = " ".join(str(item.get(key) or "") for key in ("id", "queue", "status", "entityType", "entityId", "title", "subtitle", "evidenceQuote", "snippet", "sourceId", "officialUrl"))
        if normalize(q) not in normalize(haystack):
            return False
    return True


def update_sqlite_review_row(config: WorkbenchConfig, table: str, row_id: str, status: str, reviewer: str, reviewer_note: str | None, decision_reason: str | None) -> None:
    with WorkbenchState(config).connect() as conn:
        create_schema(conn)
        result = conn.execute(
            f"""
            update {table}
            set status = ?, reviewer = ?, reviewer_note = ?, reviewed_at = ?, decision_reason = ?, updated_at = ?
            where id = ?
            """,
            (status, reviewer, reviewer_note, utc_now(), decision_reason, utc_now(), row_id),
        )
        if result.rowcount == 0:
            raise KeyError(row_id)
        conn.commit()


def set_sqlite_proposal_id(config: WorkbenchConfig, table: str, row_id: str, proposal_id: str) -> None:
    with WorkbenchState(config).connect() as conn:
        create_schema(conn)
        result = conn.execute(f"update {table} set proposal_id = ?, updated_at = ? where id = ?", (proposal_id, utc_now(), row_id))
        if result.rowcount == 0:
            raise KeyError(row_id)
        conn.commit()


def update_model_suggestion(config: WorkbenchConfig, suggestion_id: str, patch: dict[str, Any]) -> None:
    path = config.suggestions_dir / "model-suggestions.jsonl"
    rows = read_jsonl(path)
    updated = False
    for index, row in enumerate(rows):
        if row.get("id") == suggestion_id:
            rows[index] = {**row, **patch}
            updated = True
            break
    if not updated:
        raise KeyError(suggestion_id)
    write_jsonl(path, rows)


def require_evidence_and_source(item: dict[str, Any]) -> None:
    if not clean(item.get("evidenceQuote")):
        raise ReviewQueueError("Reviewed or accepted items require an evidence quote.")
    if not clean(item.get("sourceId")) and not clean(item.get("sourceDocumentId")) and not clean(item.get("officialUrl")):
        raise ReviewQueueError("Reviewed or accepted items require a source ID, source document ID, or official URL.")


def ensure_no_unresolved_conflicts(config: WorkbenchConfig, item: dict[str, Any]) -> None:
    conflicts = list_source_conflicts(config, entity_type=str(item.get("entityType") or ""), entity_id=str(item.get("entityId") or ""), limit=100)
    unresolved = [row for row in conflicts if row.get("status") in {"open", "reviewed"}]
    if unresolved:
        raise ReviewQueueError(f"Cannot accept while unresolved source conflicts exist: {', '.join(row['id'] for row in unresolved[:5])}")


def sync_linked_proposal(config: WorkbenchConfig, item: dict[str, Any], status: str, decision_reason: str | None) -> None:
    proposal_id = item.get("proposalId")
    if not proposal_id:
        return
    if status == "reviewed":
        review_proposal(config, proposal_id)
    elif status == "accepted":
        accept_proposal(config, proposal_id)
    elif status in {"rejected", "ignored"}:
        reject_proposal(config, proposal_id, decision_reason)


def proposal_payload_for_item(item: dict[str, Any]) -> dict[str, Any]:
    queue = item["queue"]
    if queue == "citations":
        raw = item.get("raw") or {}
        return {
            "proposalType": "field_correction",
            "entityType": "document",
            "entityId": item["entityId"],
            "field": f"documents.{item['entityId']}.citations",
            "proposedValue": {
                "citationType": raw.get("citationType"),
                "rawText": raw.get("rawText"),
                "normalizedTarget": raw.get("normalizedTarget"),
                "snippet": item.get("snippet"),
            },
            "evidenceQuote": item.get("evidenceQuote"),
            "sourceDocumentId": item.get("sourceDocumentId") or item.get("entityId"),
            "officialUrl": item.get("officialUrl"),
            "explanation": "Accepted extracted legal citation from the local review queue.",
        }
    if queue == "taxonomy_labels":
        raw = item.get("raw") or {}
        return {
            "proposalType": "field_correction",
            "entityType": item["entityType"],
            "entityId": item["entityId"],
            "field": "taxonomy.labels",
            "proposedValue": {
                "taxonomyVersion": raw.get("taxonomyVersion"),
                "topicCode": raw.get("topicCode"),
                "stanceCode": raw.get("stanceCode"),
                "confidence": item.get("confidence"),
            },
            "evidenceQuote": item.get("evidenceQuote"),
            "sourceDocumentId": item.get("sourceDocumentId") or item.get("sourceId"),
            "officialUrl": item.get("officialUrl"),
            "explanation": "Reviewed local taxonomy label from the review queue.",
        }
    if queue == "text_corrections":
        raw = item.get("raw") or {}
        return {
            "proposalType": "text_annotation",
            "entityType": "document",
            "entityId": item["entityId"],
            "field": f"documents.{item['entityId']}.text",
            "currentValue": {"baseTextHash": raw.get("baseTextHash")},
            "proposedValue": {"correctedText": raw.get("correctedText"), "correctionNote": raw.get("correctionNote")},
            "evidenceQuote": item.get("evidenceQuote"),
            "sourceDocumentId": item.get("sourceDocumentId") or item.get("sourceId"),
            "officialUrl": item.get("officialUrl"),
            "explanation": "Reviewed local document/OCR text correction from the review queue.",
        }
    if queue == "source_claims":
        raw = item.get("raw") or {}
        return {
            "proposalType": "field_correction",
            "entityType": item["entityType"],
            "entityId": item["entityId"],
            "field": raw.get("fieldPath") or item.get("title"),
            "proposedValue": raw.get("value"),
            "evidenceQuote": item.get("evidenceQuote"),
            "officialUrl": item.get("officialUrl") or raw.get("sourceUrl"),
            "explanation": "Reviewed source claim from the local Review Center.",
        }
    if queue == "model_suggestions":
        raw = item.get("raw") or {}
        return {
            "proposalType": proposal_type_for_suggestion(str(raw.get("suggestionType") or "")),
            "entityType": item["entityType"],
            "entityId": item["entityId"],
            "field": raw.get("suggestionType"),
            "proposedValue": raw.get("suggestedValue"),
            "evidenceQuote": item.get("evidenceQuote"),
            "sourceDocumentId": item.get("sourceDocumentId"),
            "officialUrl": item.get("officialUrl"),
            "explanation": f"Converted from local model suggestion {item['id']}: {raw.get('explanation') or ''}".strip(),
            "createdBy": f"model:{raw.get('model') or 'unknown'}",
        }
    raise ReviewQueueError(f"Queue items cannot be converted to proposals: {queue}")


def normalize(value: str) -> str:
    return " ".join(value.split()).lower()


def clean(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def source_claim_snippet(row: dict[str, Any]) -> str:
    value = row.get("value")
    if isinstance(value, (dict, list)):
        text = str(value)
    else:
        text = "" if value is None else str(value)
    return text[:500]


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()
