from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import json
from typing import Any

from .config import WorkbenchConfig
from .db import ReadOnlyDb
from .jobs import JobStore
from .storage import append_jsonl
from .storage import read_jsonl


ALLOWED_SUGGESTION_TYPES = {
    "document_kind",
    "procedure_event",
    "weak_ocr",
    "reexamination_signal",
    "ccr_signal",
    "promulgation_signal",
    "sponsor_parsing",
    "duplicate_lifecycle_risk",
}


@dataclass(frozen=True)
class AuditResult:
    status: str
    bill_id: str
    suggestion_count: int
    failed_count: int
    suggestions_path: str
    error: str | None = None


def audit_bill(config: WorkbenchConfig, bill_id_or_slug: str, model: str | None = None) -> AuditResult:
    store = JobStore(config)
    job = store.create("model.audit_bill", {"billIdOrSlug": bill_id_or_slug, "model": model or config.model})
    store.start(job)
    suggestions_path = config.suggestions_dir / "model-suggestions.jsonl"
    try:
        context = ReadOnlyDb(config).bill_audit_context(bill_id_or_slug)
        if not context:
            error = f"Bill not found: {bill_id_or_slug}"
            append_failed_suggestion(suggestions_path, bill_id_or_slug, error, model or config.model)
            store.fail(job, error)
            return AuditResult("failed", bill_id_or_slug, 0, 1, str(suggestions_path), error)
        response = call_ollama(config, build_prompt(context), model=model or config.model)
        raw_payload = parse_model_json(response)
        evidence_text = json.dumps(context, ensure_ascii=False)
        valid, invalid = validate_suggestion_payload(raw_payload, context["bill"]["id"], model or config.model, evidence_text=evidence_text)
        for suggestion in valid:
            append_jsonl(suggestions_path, suggestion)
        for failure in invalid:
            append_jsonl(suggestions_path, failure)
        output = {"validSuggestions": len(valid), "failedSuggestions": len(invalid), "suggestionsPath": str(suggestions_path)}
        store.succeed(job, output)
        return AuditResult("succeeded", context["bill"]["id"], len(valid), len(invalid), str(suggestions_path))
    except Exception as error:
        append_failed_suggestion(suggestions_path, bill_id_or_slug, str(error), model or config.model)
        store.fail(job, str(error))
        return AuditResult("failed", bill_id_or_slug, 0, 1, str(suggestions_path), str(error))


def build_prompt(context: dict[str, Any]) -> str:
    compact = {
        "bill": context.get("bill"),
        "documents": context.get("documents", [])[:20],
        "procedureSteps": context.get("procedureSteps", [])[:80],
        "votes": context.get("votes", [])[:30],
        "sponsors": context.get("sponsors", [])[:40],
        "healthReviews": context.get("healthReviews", [])[:40],
    }
    return (
        "You are auditing Romanian Parliament bill data for a civic transparency tool.\n"
        "Return only JSON matching the schema. Do not invent facts. If evidence is insufficient, omit the suggestion.\n"
        "Every suggestion must include an exact evidenceQuote copied from the provided context.\n"
        "Focus on document kind, procedure events, weak OCR, reexamination, CCR, promulgation, sponsor parsing, and duplicate lifecycle risk.\n\n"
        f"Context:\n{json.dumps(compact, ensure_ascii=False)}"
    )


def ollama_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "suggestions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "suggestionType": {"type": "string"},
                        "entityType": {"type": "string"},
                        "entityId": {"type": "string"},
                        "confidence": {"type": "number"},
                        "suggestedValue": {"type": "string"},
                        "evidenceQuote": {"type": "string"},
                        "sourceDocumentId": {"type": "string"},
                        "officialUrl": {"type": "string"},
                        "explanation": {"type": "string"},
                    },
                    "required": ["suggestionType", "entityType", "entityId", "confidence", "suggestedValue", "evidenceQuote", "explanation"],
                },
            }
        },
        "required": ["suggestions"],
    }


def call_ollama(config: WorkbenchConfig, prompt: str, model: str) -> str:
    try:
        import httpx
    except Exception as error:
        raise RuntimeError("Install workbench Python dependencies to call Ollama.") from error
    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "format": ollama_schema(),
        "options": {"temperature": 0.1},
    }
    with httpx.Client(timeout=120) as client:
        response = client.post(f"{config.ollama_base_url}/api/generate", json=payload)
        response.raise_for_status()
        data = response.json()
    return str(data.get("response") or "")


def parse_model_json(response: str) -> dict[str, Any]:
    try:
        payload = json.loads(response)
    except json.JSONDecodeError as error:
        raise ValueError(f"Model returned invalid JSON: {error}") from error
    if not isinstance(payload, dict):
        raise ValueError("Model JSON must be an object.")
    return payload


def validate_suggestion_payload(payload: dict[str, Any], bill_id: str, model: str, evidence_text: str | None = None) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    suggestions = payload.get("suggestions")
    if not isinstance(suggestions, list):
        return [], [failed_suggestion_record(bill_id, "missing suggestions array", model, raw=payload)]
    valid: list[dict[str, Any]] = []
    invalid: list[dict[str, Any]] = []
    for item in suggestions:
        if not isinstance(item, dict):
            invalid.append(failed_suggestion_record(bill_id, "suggestion is not an object", model, raw=item))
            continue
        error = validate_suggestion(item, evidence_text=evidence_text)
        if error:
            invalid.append(failed_suggestion_record(bill_id, error, model, raw=item))
        else:
            valid.append(suggestion_record(item, bill_id, model))
    return valid, invalid


def validate_suggestion(item: dict[str, Any], evidence_text: str | None = None) -> str | None:
    required = ["suggestionType", "entityType", "entityId", "confidence", "suggestedValue", "evidenceQuote", "explanation"]
    missing = [key for key in required if item.get(key) in (None, "")]
    if missing:
        return f"missing required fields: {', '.join(missing)}"
    if item["suggestionType"] not in ALLOWED_SUGGESTION_TYPES:
        return f"unsupported suggestionType: {item['suggestionType']}"
    try:
        confidence = float(item["confidence"])
    except (TypeError, ValueError):
        return "confidence must be numeric"
    if confidence < 0 or confidence > 1:
        return "confidence must be between 0 and 1"
    if len(str(item["evidenceQuote"]).strip()) < 8:
        return "evidenceQuote is too short"
    if evidence_text and normalize_evidence(str(item["evidenceQuote"])) not in normalize_evidence(evidence_text):
        return "evidenceQuote was not found in the bill context"
    if not item.get("sourceDocumentId") and not item.get("officialUrl"):
        return "sourceDocumentId or officialUrl is required"
    return None


def normalize_evidence(value: str) -> str:
    return " ".join(value.split()).lower()


def suggestion_record(item: dict[str, Any], bill_id: str, model: str) -> dict[str, Any]:
    return {
        "id": f"suggestion-{bill_id}-{datetime.now(timezone.utc).timestamp()}",
        "status": "open",
        "billId": bill_id,
        "model": model,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "suggestionType": item["suggestionType"],
        "entityType": item["entityType"],
        "entityId": item["entityId"],
        "confidence": float(item["confidence"]),
        "suggestedValue": str(item["suggestedValue"]),
        "evidenceQuote": str(item["evidenceQuote"]),
        "sourceDocumentId": item.get("sourceDocumentId"),
        "officialUrl": item.get("officialUrl"),
        "explanation": str(item["explanation"]),
    }


def failed_suggestion_record(bill_id: str, error: str, model: str, raw: Any | None = None) -> dict[str, Any]:
    return {
        "id": f"suggestion-failed-{bill_id}-{datetime.now(timezone.utc).timestamp()}",
        "status": "failed",
        "billId": bill_id,
        "model": model,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "suggestionType": "model_audit_error",
        "entityType": "bill",
        "entityId": bill_id,
        "error": error,
        "raw": raw,
    }


def append_failed_suggestion(path, bill_id: str, error: str, model: str) -> None:
    append_jsonl(path, failed_suggestion_record(bill_id, error, model))


def load_suggestions(config: WorkbenchConfig, bill_id: str | None = None, limit: int = 100) -> list[dict[str, Any]]:
    rows = read_jsonl(config.suggestions_dir / "model-suggestions.jsonl")
    if bill_id:
        rows = [row for row in rows if row.get("billId") == bill_id or row.get("entityId") == bill_id]
    rows = sorted(rows, key=lambda row: str(row.get("createdAt") or ""), reverse=True)
    return rows[:limit]
