from __future__ import annotations

from datetime import datetime, timezone
import json
import secrets
from typing import Any

from .config import WorkbenchConfig
from .db import ReadOnlyDb
from .proposals import list_proposals
from .state import WorkbenchState, create_schema


STRICT_BLOCKER_KEYS = ["openReviews", "unlinkedVotes", "missingProcedures"]


def list_publish_batches(config: WorkbenchConfig) -> list[dict[str, Any]]:
    WorkbenchState(config).initialize()
    with WorkbenchState(config).connect() as conn:
        rows = conn.execute("select * from publish_batches order by updated_at desc limit 100").fetchall()
    return [batch_payload(row) for row in rows]


def preview_publish_batch(
    config: WorkbenchConfig,
    *,
    title: str = "Manual publish batch",
    proposal_ids: list[str] | None = None,
    create: bool = False,
) -> dict[str, Any]:
    state = WorkbenchState(config)
    state.initialize()
    all_proposals = list_proposals(config)
    selected = [proposal for proposal in all_proposals if not proposal_ids or proposal.get("id") in proposal_ids]
    accepted = [proposal for proposal in selected if proposal.get("status") == "accepted"]
    health = ReadOnlyDb(config).data_health_summary()
    blockers = strict_blockers(health)
    warnings = []
    if not accepted:
        warnings.append("No accepted proposals were selected for this batch.")
    if not config.database_url:
        warnings.append("DATABASE_URL is not configured; preview cannot validate canonical target state.")

    gate = {
        "strict": True,
        "canPublish": not blockers and bool(accepted),
        "blockers": blockers,
        "warnings": warnings,
        "health": health,
        "acceptedProposalCount": len(accepted),
    }
    payload = {
        "id": None,
        "status": "preview",
        "title": title,
        "description": "Manual reviewed batch preview. No canonical writes are executed by preview.",
        "strictGate": gate,
        "items": [proposal_to_item(proposal) for proposal in accepted],
        "createdAt": utc_now(),
        "updatedAt": utc_now(),
    }
    if create:
        payload["id"] = f"publish-batch-{secrets.token_hex(6)}"
        with state.connect() as conn:
            create_schema(conn)
            conn.execute(
                """
                insert into publish_batches (id, status, title, description, strict_gate_json, created_at, updated_at)
                values (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    payload["id"],
                    "blocked" if blockers else "draft",
                    title,
                    payload["description"],
                    json.dumps(gate, ensure_ascii=False, sort_keys=True),
                    payload["createdAt"],
                    payload["updatedAt"],
                ),
            )
            for item in payload["items"]:
                conn.execute(
                    """
                    insert into publish_batch_items (id, batch_id, item_type, entity_type, entity_id, payload_json, status, created_at)
                    values (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        item["id"],
                        payload["id"],
                        item["itemType"],
                        item["entityType"],
                        item["entityId"],
                        json.dumps(item["payload"], ensure_ascii=False, sort_keys=True),
                        "pending",
                        payload["createdAt"],
                    ),
                )
            conn.commit()
        payload["status"] = "blocked" if blockers else "draft"
    return payload


def strict_blockers(health: dict[str, int]) -> list[dict[str, Any]]:
    blockers = []
    labels = {
        "openReviews": "Open data-health reviews",
        "unlinkedVotes": "Votes without linked bills",
        "missingProcedures": "Bills missing procedure timelines",
    }
    for key in STRICT_BLOCKER_KEYS:
        count = int(health.get(key) or 0)
        if count > 0:
            blockers.append({"key": key, "label": labels[key], "count": count})
    return blockers


def proposal_to_item(proposal: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": f"publish-item-{proposal['id']}",
        "itemType": "proposal",
        "entityType": proposal.get("entityType"),
        "entityId": proposal.get("entityId"),
        "payload": proposal,
    }


def batch_payload(row: Any) -> dict[str, Any]:
    return {
        "id": row["id"],
        "status": row["status"],
        "title": row["title"],
        "description": row["description"],
        "strictGate": json.loads(row["strict_gate_json"] or "{}"),
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()
