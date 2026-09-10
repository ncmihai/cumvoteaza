from __future__ import annotations

from datetime import datetime, timezone
import json
from pathlib import Path
import secrets
import shutil
import sqlite3
from typing import Any

from .config import WorkbenchConfig
from .state import WorkbenchState, create_schema
from .storage import read_jsonl


PROPOSAL_STATUSES = {"draft", "reviewed", "accepted", "rejected", "applied", "failed"}
PROPOSAL_TYPES = {
    "field_correction",
    "relation_link",
    "text_annotation",
    "asset_issue",
    "procedure_event",
    "duplicate_merge",
    "review_note",
}
ENTITY_TYPES = {"bill", "member", "party", "vote", "document", "group", "government"}
FACTUAL_TYPES = {"field_correction", "relation_link", "text_annotation", "procedure_event", "duplicate_merge"}


class ProposalValidationError(ValueError):
    pass


def proposals_path(config: WorkbenchConfig) -> Path:
    return config.proposals_dir / "proposals.jsonl"


def notes_path(config: WorkbenchConfig) -> Path:
    return config.proposals_dir / "notes.jsonl"


def list_proposals(
    config: WorkbenchConfig,
    *,
    entity_type: str | None = None,
    entity_id: str | None = None,
    status: str | None = None,
) -> list[dict[str, Any]]:
    state = proposal_state(config)
    with state.connect() as conn:
        rows = [decode_patch(row) for row in conn.execute("select * from patches")]
    filtered = []
    for row in rows:
        if entity_type and row.get("entityType") != entity_type:
            continue
        if entity_id and row.get("entityId") != entity_id:
            continue
        if status and row.get("status") != status:
            continue
        filtered.append(row)
    return sorted(filtered, key=lambda item: str(item.get("updatedAt") or ""), reverse=True)


def create_proposal(config: WorkbenchConfig, payload: dict[str, Any]) -> dict[str, Any]:
    now = utc_now()
    row = normalize_proposal(
        {
            **payload,
            "id": payload.get("id") or f"proposal-{secrets.token_hex(6)}",
            "status": payload.get("status") or "draft",
            "createdBy": payload.get("createdBy") or "local",
            "createdAt": payload.get("createdAt") or now,
            "updatedAt": now,
        }
    )
    state = proposal_state(config)
    with state.connect() as conn:
        conn.execute("begin immediate")
        if conn.execute("select 1 from patches where id=?", (row["id"],)).fetchone():
            raise ProposalValidationError(f"Proposal already exists: {row['id']}")
        persist_patch(conn, row, "created")
    return row


def update_proposal(config: WorkbenchConfig, proposal_id: str, patch: dict[str, Any]) -> dict[str, Any]:
    state = proposal_state(config)
    with state.connect() as conn:
        conn.execute("begin immediate")
        existing = conn.execute("select * from patches where id=?", (proposal_id,)).fetchone()
        if not existing:
            raise KeyError(proposal_id)
        row = normalize_proposal({**decode_patch(existing), **patch, "id": proposal_id, "updatedAt": utc_now()}, allow_existing=True)
        persist_patch(conn, row, "updated")
    return row


def review_proposal(config: WorkbenchConfig, proposal_id: str) -> dict[str, Any]:
    proposal = get_proposal(config, proposal_id)
    if proposal.get("proposalType") in FACTUAL_TYPES and not evidence_present(proposal):
        raise ProposalValidationError("Factual proposals require an evidence quote and source before review or acceptance.")
    return update_proposal(config, proposal_id, {"status": "reviewed"})


def reject_proposal(config: WorkbenchConfig, proposal_id: str, reason: str | None = None) -> dict[str, Any]:
    patch: dict[str, Any] = {"status": "rejected"}
    if reason:
        patch["explanation"] = f"{patch_note(get_proposal(config, proposal_id).get('explanation'))}Rejected: {reason}".strip()
    return update_proposal(config, proposal_id, patch)


def accept_proposal(config: WorkbenchConfig, proposal_id: str) -> dict[str, Any]:
    proposal = get_proposal(config, proposal_id)
    if proposal.get("proposalType") in FACTUAL_TYPES and not evidence_present(proposal):
        raise ProposalValidationError("Factual proposals require an evidence quote and source before acceptance.")
    return update_proposal(config, proposal_id, {"status": "accepted"})


def get_proposal(config: WorkbenchConfig, proposal_id: str) -> dict[str, Any]:
    state = proposal_state(config)
    with state.connect() as conn:
        row = conn.execute("select * from patches where id=?", (proposal_id,)).fetchone()
        if row:
            return decode_patch(row)
    raise KeyError(proposal_id)


def command_preview(config: WorkbenchConfig, proposal_id: str) -> dict[str, Any]:
    proposal = get_proposal(config, proposal_id)
    proposal_type = proposal.get("proposalType")
    entity_type = proposal.get("entityType")
    entity_id = proposal.get("entityId")
    commands: list[str] = []
    effects: list[str] = []
    executable = False

    if proposal_type == "relation_link" and entity_type == "vote":
        bill_id = proposed_string(proposal)
        if bill_id:
            commands.append(f"npm run repair:link-vote-bill -- --vote-id={entity_id} --bill-id={bill_id} --persist")
            effects.append("Links one vote to one bill through the guarded repair command.")
            executable = True
    elif proposal_type == "procedure_event" and entity_type == "bill":
        commands.append(f"npm run repair:refresh-missing-procedure -- --bill-id={entity_id} --persist")
        effects.append("Refreshes the official procedure timeline for one bill.")
        executable = True
    elif proposal_type == "duplicate_merge":
        primary = proposed_string(proposal)
        if primary:
            commands.append(f"npm run repair:duplicate-bill-plan -- --primary-bill-id={primary} --duplicate-bill-id={entity_id}")
            effects.append("Generates a duplicate lifecycle merge plan only; it does not merge rows.")
    elif proposal_type == "review_note":
        effects.append("Local note only. No canonical repair command is available.")
    else:
        effects.append("No guarded repair command exists for this proposal type yet.")

    return {
        "proposalId": proposal_id,
        "status": proposal.get("status"),
        "writeModeEnabled": config.enable_writes,
        "requiresWriteToken": bool(config.write_token),
        "canExecute": executable and config.enable_writes and bool(config.write_token) and proposal.get("status") == "accepted",
        "commands": commands,
        "expectedEffects": effects,
    }


def normalize_proposal(payload: dict[str, Any], *, allow_existing: bool = False) -> dict[str, Any]:
    proposal_type = str(payload.get("proposalType") or "").strip()
    entity_type = str(payload.get("entityType") or "").strip()
    entity_id = str(payload.get("entityId") or "").strip()
    status = str(payload.get("status") or "draft").strip()
    if proposal_type not in PROPOSAL_TYPES:
        raise ProposalValidationError(f"Unsupported proposalType: {proposal_type}")
    if entity_type not in ENTITY_TYPES:
        raise ProposalValidationError(f"Unsupported entityType: {entity_type}")
    if not entity_id:
        raise ProposalValidationError("entityId is required.")
    if status not in PROPOSAL_STATUSES:
        raise ProposalValidationError(f"Unsupported status: {status}")
    if status in {"reviewed", "accepted", "applied"} and proposal_type in FACTUAL_TYPES and not evidence_present(payload):
        raise ProposalValidationError("Factual proposals require an evidence quote and source before review, acceptance, or apply.")

    row = {
        "id": str(payload.get("id") or "").strip(),
        "status": status,
        "proposalType": proposal_type,
        "entityType": entity_type,
        "entityId": entity_id,
        "field": nullable_string(payload.get("field")),
        "currentValue": payload.get("currentValue"),
        "proposedValue": payload.get("proposedValue"),
        "evidenceQuote": nullable_string(payload.get("evidenceQuote")),
        "sourceDocumentId": nullable_string(payload.get("sourceDocumentId")),
        "officialUrl": nullable_string(payload.get("officialUrl")),
        "explanation": nullable_string(payload.get("explanation")),
        "createdBy": nullable_string(payload.get("createdBy")) or "local",
        "createdAt": nullable_string(payload.get("createdAt")) or utc_now(),
        "updatedAt": nullable_string(payload.get("updatedAt")) or utc_now(),
    }
    if not row["id"] and not allow_existing:
        row["id"] = f"proposal-{secrets.token_hex(6)}"
    if not row["id"]:
        raise ProposalValidationError("id is required.")
    return row


def decode_patch(row) -> dict[str, Any]:
    fields = {"id": "id", "status": "status", "patch_type": "proposalType", "entity_type": "entityType",
              "entity_id": "entityId", "field_path": "field", "evidence_quote": "evidenceQuote",
              "source_id": "sourceDocumentId", "source_url": "officialUrl", "explanation": "explanation",
              "created_by": "createdBy", "created_at": "createdAt", "updated_at": "updatedAt"}
    result = {target: row[source] for source, target in fields.items()}
    result.update(currentValue=json.loads(row["current_value_json"] or "null"),
                  proposedValue=json.loads(row["proposed_value_json"] or "null"))
    return result


def proposal_state(config: WorkbenchConfig) -> WorkbenchState:
    state = WorkbenchState(config)
    state.initialize()
    with state.connect() as conn:
        conn.execute("begin immediate")
        if not conn.execute("select 1 from schema_meta where key='proposals_sqlite_authority'").fetchone():
            # Original files are immutable migration inputs, never a second write authority.
            backup_dir = config.proposals_dir / "migration-backups"
            for path in (proposals_path(config), notes_path(config)):
                if path.exists():
                    backup_dir.mkdir(parents=True, exist_ok=True)
                    target = backup_dir / path.name
                    if not target.exists():
                        shutil.copy2(path, target)
            for row in read_jsonl(proposals_path(config)):
                existing = conn.execute("select updated_at from patches where id=?", (row["id"],)).fetchone()
                if not existing or str(row.get("updatedAt") or "") > str(existing["updated_at"]):
                    persist_patch(conn, row, "migrated")
            conn.execute("insert into schema_meta(key,value,updated_at) values ('proposals_sqlite_authority','1',?)", (utc_now(),))
    return state


def persist_patch(conn: sqlite3.Connection, proposal: dict[str, Any], event_type: str) -> None:
    now = utc_now()
    conn.execute(
        """
        insert into patches (
          id, status, patch_type, entity_type, entity_id, field_path,
          current_value_json, proposed_value_json, evidence_quote, source_id,
          source_url, explanation, created_by, created_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        on conflict(id) do update set
          status=excluded.status,
          patch_type=excluded.patch_type,
          entity_type=excluded.entity_type,
          entity_id=excluded.entity_id,
          field_path=excluded.field_path,
          current_value_json=excluded.current_value_json,
          proposed_value_json=excluded.proposed_value_json,
          evidence_quote=excluded.evidence_quote,
          source_id=excluded.source_id,
          source_url=excluded.source_url,
          explanation=excluded.explanation,
          updated_at=excluded.updated_at
        """,
        (
            proposal["id"],
            proposal["status"],
            proposal["proposalType"],
            proposal["entityType"],
            proposal["entityId"],
            proposal.get("field"),
            json.dumps(proposal.get("currentValue"), ensure_ascii=False, sort_keys=True),
            json.dumps(proposal.get("proposedValue"), ensure_ascii=False, sort_keys=True),
            proposal.get("evidenceQuote"),
            proposal.get("sourceDocumentId"),
            proposal.get("officialUrl"),
            proposal.get("explanation"),
            proposal.get("createdBy") or "local",
            proposal.get("createdAt") or now,
            proposal.get("updatedAt") or now,
        ),
    )
    conn.execute(
        """
        insert into patch_events (id, patch_id, event_type, payload_json, created_at)
        values (?, ?, ?, ?, ?)
        """,
        (
            f"patch-event-{secrets.token_hex(6)}",
            proposal["id"],
            event_type,
            json.dumps(proposal, ensure_ascii=False, sort_keys=True),
            now,
        ),
    )


def evidence_present(payload: dict[str, Any]) -> bool:
    has_evidence = bool(nullable_string(payload.get("evidenceQuote")))
    has_source = bool(nullable_string(payload.get("sourceDocumentId")) or nullable_string(payload.get("officialUrl")))
    return has_evidence and has_source


def proposed_string(proposal: dict[str, Any]) -> str | None:
    value = proposal.get("proposedValue")
    if isinstance(value, str):
        return value.strip() or None
    if isinstance(value, dict):
        for key in ["billId", "primaryBillId", "value", "id"]:
            item = value.get(key)
            if isinstance(item, str) and item.strip():
                return item.strip()
    return None


def nullable_string(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False, sort_keys=True)
    text = str(value).strip()
    return text or None


def patch_note(value: Any) -> str:
    text = nullable_string(value)
    return f"{text}\n" if text else ""


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()
