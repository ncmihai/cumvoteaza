from __future__ import annotations

from datetime import datetime, timezone
import json
import secrets
from typing import Any

from .config import WorkbenchConfig
from .proposals import list_proposals
from .source_ledger import list_source_claims, list_source_conflicts
from .state import WorkbenchState, create_schema
from .storage import write_json, write_jsonl
from .taxonomy_analytics import list_taxonomy_labels


def migration_preview(config: WorkbenchConfig) -> dict[str, Any]:
    proposals = [row for row in list_proposals(config) if row.get("status") in {"accepted", "reviewed"}]
    accepted_proposals = [row for row in proposals if row.get("status") == "accepted"]
    source_claims = [row for row in list_source_claims(config, status="accepted", limit=1000)]
    text_corrections = list_text_corrections(config)
    citations = list_extracted_citations(config)
    labels = [row for row in list_taxonomy_labels(config, status="accepted", limit=1000)]
    model_runs = list_model_run_statuses(config)
    conflicts = list_source_conflicts(config, status="open", limit=1000)
    blockers = preview_blockers(accepted_proposals, source_claims, text_corrections, labels, model_runs, conflicts, citations)
    return {
        "status": "blocked" if blockers else "ready_for_manual_export",
        "counts": {
            "acceptedProposals": len(accepted_proposals),
            "reviewedProposals": len([row for row in proposals if row.get("status") == "reviewed"]),
            "acceptedSourceClaims": len(source_claims),
            "textCorrections": len(text_corrections),
            "draftTextCorrections": len([row for row in text_corrections if row.get("status") == "draft"]),
            "acceptedTaxonomyLabels": len(labels),
            "acceptedCitations": len([row for row in citations if row.get("status") == "accepted"]),
            "candidateCitations": len([row for row in citations if row.get("status") == "candidate"]),
            "openConflicts": len(conflicts),
            "failedModelRuns": len([row for row in model_runs if row.get("status") == "failed"]),
        },
        "blockers": blockers,
        "items": {
            "proposals": accepted_proposals[:100],
            "sourceClaims": source_claims[:100],
            "textCorrections": text_corrections[:100],
            "taxonomyLabels": labels[:100],
            "citations": citations[:100],
        },
        "writeMode": "preview_only",
    }


def export_migration_preview(config: WorkbenchConfig, title: str | None = None) -> dict[str, Any]:
    preview = migration_preview(config)
    batch_id = f"export-{secrets.token_hex(6)}"
    safe_title = title or "Local workbench export preview"
    export_dir = config.data_dir / "exports" / batch_id
    payload_path = export_dir / "payload.json"
    proposals_path = export_dir / "accepted-proposals.jsonl"
    labels_path = export_dir / "accepted-taxonomy-labels.jsonl"
    citations_path = export_dir / "citations.jsonl"
    sql_path = export_dir / "preview.sql"
    report_path = config.reports_dir / f"migrate-preview-{batch_id}.md"
    write_json(payload_path, preview)
    write_jsonl(proposals_path, preview["items"]["proposals"])
    write_jsonl(labels_path, preview["items"]["taxonomyLabels"])
    write_jsonl(citations_path, preview["items"]["citations"])
    sql_path.parent.mkdir(parents=True, exist_ok=True)
    sql_path.write_text(render_sql_preview(preview), encoding="utf-8")
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(render_report(safe_title, preview), encoding="utf-8")
    files = [
        str(payload_path),
        str(proposals_path),
        str(labels_path),
        str(citations_path),
        str(sql_path),
        str(report_path),
    ]
    now = utc_now()
    with WorkbenchState(config).connect() as conn:
        create_schema(conn)
        conn.execute(
            """
            insert into export_batches (id, status, title, payload_json, blockers_json, files_json, created_at, updated_at)
            values (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                batch_id,
                preview["status"],
                safe_title,
                json.dumps(preview, ensure_ascii=False, sort_keys=True),
                json.dumps(preview["blockers"], ensure_ascii=False, sort_keys=True),
                json.dumps(files, ensure_ascii=False, sort_keys=True),
                now,
                now,
            ),
        )
        conn.commit()
    return {"id": batch_id, "status": preview["status"], "files": files, "preview": preview}


def list_text_corrections(config: WorkbenchConfig) -> list[dict[str, Any]]:
    with WorkbenchState(config).connect() as conn:
        create_schema(conn)
        rows = conn.execute("select * from text_corrections order by updated_at desc limit 1000").fetchall()
    return [
        {
            "id": row["id"],
            "documentId": row["document_id"],
            "status": row["status"],
            "baseTextHash": row["base_text_hash"],
            "evidenceQuote": row["evidence_quote"],
            "sourceDocumentId": row["source_document_id"],
            "officialUrl": row["official_url"],
            "proposalId": row["proposal_id"],
            "reviewer": row["reviewer"],
            "reviewerNote": row["reviewer_note"],
            "reviewedAt": row["reviewed_at"],
            "decisionReason": row["decision_reason"],
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
        }
        for row in rows
    ]


def list_extracted_citations(config: WorkbenchConfig) -> list[dict[str, Any]]:
    with WorkbenchState(config).connect() as conn:
        create_schema(conn)
        rows = conn.execute("select * from extracted_citations order by updated_at desc limit 1000").fetchall()
    return [
        {
            "id": row["id"],
            "documentId": row["document_id"],
            "parseId": row["parse_id"],
            "citationType": row["citation_type"],
            "rawText": row["raw_text"],
            "normalizedTarget": row["normalized_target"],
            "snippet": row["snippet"],
            "confidence": row["confidence"],
            "status": row["status"],
            "proposalId": row["proposal_id"],
            "reviewer": row["reviewer"],
            "reviewerNote": row["reviewer_note"],
            "reviewedAt": row["reviewed_at"],
            "decisionReason": row["decision_reason"],
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
        }
        for row in rows
    ]


def list_model_run_statuses(config: WorkbenchConfig) -> list[dict[str, Any]]:
    with WorkbenchState(config).connect() as conn:
        create_schema(conn)
        rows = conn.execute("select id, task_type, entity_type, entity_id, status, validation_json, updated_at from model_runs order by updated_at desc limit 1000").fetchall()
    return [
        {
            "id": row["id"],
            "taskType": row["task_type"],
            "entityType": row["entity_type"],
            "entityId": row["entity_id"],
            "status": row["status"],
            "validation": json.loads(row["validation_json"]) if row["validation_json"] else None,
            "updatedAt": row["updated_at"],
        }
        for row in rows
    ]


def preview_blockers(
    proposals: list[dict[str, Any]],
    source_claims: list[dict[str, Any]],
    corrections: list[dict[str, Any]],
    labels: list[dict[str, Any]],
    model_runs: list[dict[str, Any]],
    conflicts: list[dict[str, Any]],
    citations: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    blockers: list[dict[str, Any]] = []
    accepted_proposals_missing_evidence = [row.get("id") for row in proposals if factual_proposal(row) and not row.get("evidenceQuote")]
    if accepted_proposals_missing_evidence:
        blockers.append(
            {
                "key": "accepted_proposals_missing_evidence",
                "count": len(accepted_proposals_missing_evidence),
                "entityIds": accepted_proposals_missing_evidence[:50],
            }
        )
    accepted_proposals_missing_source = [row.get("id") for row in proposals if factual_proposal(row) and not proposal_has_source(row)]
    if accepted_proposals_missing_source:
        blockers.append(
            {
                "key": "accepted_proposals_missing_source",
                "count": len(accepted_proposals_missing_source),
                "entityIds": accepted_proposals_missing_source[:50],
            }
        )
    accepted_source_claims_missing_evidence = [row.get("id") for row in source_claims if not row.get("evidenceQuote")]
    if accepted_source_claims_missing_evidence:
        blockers.append(
            {
                "key": "accepted_source_claims_missing_evidence",
                "count": len(accepted_source_claims_missing_evidence),
                "entityIds": accepted_source_claims_missing_evidence[:50],
            }
        )
    accepted_source_claims_missing_source = [row.get("id") for row in source_claims if not row.get("sourceUrl")]
    if accepted_source_claims_missing_source:
        blockers.append(
            {
                "key": "accepted_source_claims_missing_source",
                "count": len(accepted_source_claims_missing_source),
                "entityIds": accepted_source_claims_missing_source[:50],
            }
        )
    accepted_labels_missing_evidence = [row.get("id") for row in labels if not row.get("evidenceQuote")]
    if accepted_labels_missing_evidence:
        blockers.append({"key": "accepted_taxonomy_labels_missing_evidence", "count": len(accepted_labels_missing_evidence), "entityIds": accepted_labels_missing_evidence[:50]})
    accepted_citations_missing_evidence = [row.get("id") for row in citations if row.get("status") == "accepted" and not row.get("rawText")]
    if accepted_citations_missing_evidence:
        blockers.append({"key": "accepted_citations_missing_evidence", "count": len(accepted_citations_missing_evidence), "entityIds": accepted_citations_missing_evidence[:50]})
    accepted_corrections_missing_evidence = [row.get("id") for row in corrections if row.get("status") in {"reviewed", "accepted"} and not row.get("evidenceQuote")]
    if accepted_corrections_missing_evidence:
        blockers.append({"key": "accepted_text_corrections_missing_evidence", "count": len(accepted_corrections_missing_evidence), "entityIds": accepted_corrections_missing_evidence[:50]})
    accepted_corrections_missing_source = [
        row.get("id")
        for row in corrections
        if row.get("status") in {"reviewed", "accepted"} and not (row.get("sourceDocumentId") or row.get("officialUrl"))
    ]
    if accepted_corrections_missing_source:
        blockers.append({"key": "accepted_text_corrections_missing_source", "count": len(accepted_corrections_missing_source), "entityIds": accepted_corrections_missing_source[:50]})
    if conflicts:
        blockers.append({"key": "unresolved_source_conflicts", "count": len(conflicts), "entityIds": [row.get("id") for row in conflicts[:50]]})
    failed_runs = [row for row in model_runs if row.get("status") == "failed"]
    if failed_runs:
        blockers.append({"key": "failed_model_runs", "count": len(failed_runs), "entityIds": [row.get("id") for row in failed_runs[:50]]})
    candidate_citations = [row for row in citations if row.get("status") == "candidate"]
    if candidate_citations:
        blockers.append({"key": "review_queue_citations_candidate", "count": len(candidate_citations), "entityIds": [row.get("id") for row in candidate_citations[:50]]})
    draft_corrections = [row for row in corrections if row.get("status") == "draft"]
    if draft_corrections:
        blockers.append({"key": "review_queue_text_corrections_draft", "count": len(draft_corrections), "entityIds": [row.get("id") for row in draft_corrections[:50]]})
    accepted_labels_missing_source = [row for row in labels if not row.get("sourceId")]
    if accepted_labels_missing_source:
        blockers.append({"key": "accepted_taxonomy_labels_missing_source", "count": len(accepted_labels_missing_source), "entityIds": [row.get("id") for row in accepted_labels_missing_source[:50]]})
    return blockers


def factual_proposal(row: dict[str, Any]) -> bool:
    return row.get("proposalType") in {"field_correction", "relation_link", "text_annotation", "procedure_event", "duplicate_merge"}


def proposal_has_source(row: dict[str, Any]) -> bool:
    return bool(row.get("sourceDocumentId") or row.get("officialUrl"))


def render_sql_preview(preview: dict[str, Any]) -> str:
    return (
        "-- Preview only. Do not execute directly.\n"
        "-- This file documents the shape of accepted local workbench outputs.\n"
        f"-- accepted proposals: {preview['counts']['acceptedProposals']}\n"
        f"-- accepted taxonomy labels: {preview['counts']['acceptedTaxonomyLabels']}\n"
        f"-- accepted citations: {preview['counts']['acceptedCitations']}\n"
        f"-- candidate citations awaiting review: {preview['counts']['candidateCitations']}\n"
        "-- Real writes must go through guarded import/repair commands.\n"
    )


def render_report(title: str, preview: dict[str, Any]) -> str:
    lines = [f"# {title}", "", f"Status: `{preview['status']}`", "", "## Counts"]
    for key, value in preview["counts"].items():
        lines.append(f"- {key}: {value}")
    lines.extend(["", "## Blockers"])
    if preview["blockers"]:
        for blocker in preview["blockers"]:
            lines.append(f"- {blocker['key']}: {blocker['count']}")
    else:
        lines.append("- none")
    lines.extend(["", "No Neon writes were executed by this export."])
    return "\n".join(lines) + "\n"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()
