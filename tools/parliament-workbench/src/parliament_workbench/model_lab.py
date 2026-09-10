from __future__ import annotations

from datetime import datetime, timezone
import json
from pathlib import Path
import secrets
from typing import Any

from .config import WorkbenchConfig
from .db import ReadOnlyDb
from .document_intelligence import bill_document_diff, document_text_intelligence
from .jobs import JobStore
from .model_audit import call_ollama, load_suggestions, parse_model_json
from .proposals import create_proposal
from .state import WorkbenchState, create_schema
from .storage import read_jsonl, write_json


PROMPT_VERSION = "model-lab-prompts-v1"
SCHEMA_VERSION = "model-lab-json-v1"

PROMPT_PRESETS: dict[str, dict[str, Any]] = {
    "bill_dossier_audit": {
        "label": "Bill dossier audit",
        "taskType": "bill_dossier_audit",
        "description": "Find missing document kinds, procedure gaps, duplicate lifecycle risk, and weak links.",
    },
    "ocr_quality_review": {
        "label": "OCR quality review",
        "taskType": "ocr_quality_review",
        "description": "Review extracted text for suspicious OCR and required manual checks.",
    },
    "citation_review": {
        "label": "Citation extraction review",
        "taskType": "citation_review",
        "description": "Check legal citations and amended-act signals.",
    },
    "taxonomy_labeling": {
        "label": "Taxonomy labeling",
        "taskType": "taxonomy_labeling",
        "description": "Suggest topic and stance labels with exact evidence.",
    },
    "procedure_gap_review": {
        "label": "Procedure gap review",
        "taskType": "procedure_gap_review",
        "description": "Look for missing reexamination, CCR, promulgation, committee, and publication events.",
    },
}


def model_presets() -> dict[str, Any]:
    return {"promptVersion": PROMPT_VERSION, "schemaVersion": SCHEMA_VERSION, "presets": [{"id": key, **value} for key, value in PROMPT_PRESETS.items()]}


def run_model_lab(config: WorkbenchConfig, payload: dict[str, Any]) -> dict[str, Any]:
    preset_id = str(payload.get("presetId") or "bill_dossier_audit")
    if preset_id not in PROMPT_PRESETS:
        raise ValueError(f"Unsupported presetId: {preset_id}")
    entity_type = str(payload.get("entityType") or ("bill" if payload.get("billIdOrSlug") else "unknown"))
    entity_id = str(payload.get("entityId") or payload.get("billIdOrSlug") or "").strip()
    if not entity_id:
        raise ValueError("entityId or billIdOrSlug is required.")
    model = str(payload.get("model") or config.model)
    temperature = float(payload.get("temperature") if payload.get("temperature") is not None else 0.1)
    context_mode = str(payload.get("contextMode") or "compact")
    execute = bool(payload.get("execute", True))
    context = build_context(config, entity_type, entity_id, preset_id, context_mode)
    prompt = build_prompt(preset_id, context)
    run_id = f"model-run-{secrets.token_hex(6)}"
    store = JobStore(config)
    job = store.create(
        "model.lab",
        {
            "presetId": preset_id,
            "entityType": entity_type,
            "entityId": entity_id,
            "model": model,
            "contextMode": context_mode,
            "execute": execute,
        },
    )
    store.start(job)
    input_json = {
        "presetId": preset_id,
        "entityType": entity_type,
        "entityId": entity_id,
        "temperature": temperature,
        "contextMode": context_mode,
        "context": context,
        "prompt": prompt,
    }
    insert_model_run(
        config,
        {
            "id": run_id,
            "taskType": PROMPT_PRESETS[preset_id]["taskType"],
            "entityType": entity_type,
            "entityId": entity_id,
            "jobId": job.id,
            "model": model,
            "promptVersion": str(payload.get("promptVersion") or PROMPT_VERSION),
            "schemaVersion": str(payload.get("schemaVersion") or SCHEMA_VERSION),
            "status": "running" if execute else "preview",
            "input": input_json,
            "output": None,
            "validation": {"executed": False, "valid": False, "errors": []},
        },
    )
    if not execute:
        validation = {"executed": False, "valid": True, "errors": [], "message": "Preview stored. Ollama was not called."}
        update_model_run(config, run_id, status="preview", output={"suggestions": []}, validation=validation)
        store.succeed(job, {"runId": run_id, "executed": False})
        return {"run": get_model_run(config, run_id), "job": store.get(job.id).to_dict()}
    try:
        response = call_ollama_with_schema(config, prompt, model, temperature)
        output = parse_model_json(response)
        validation = validate_model_lab_output(output, json.dumps(context, ensure_ascii=False))
        update_model_run(config, run_id, status="succeeded" if validation["valid"] else "failed", output=output, validation=validation)
        if validation["valid"]:
            store.succeed(job, {"runId": run_id, "valid": True, "suggestionCount": len(output.get("suggestions") or [])})
        else:
            store.fail(job, "Model output did not pass validation.", {"runId": run_id, "validation": validation})
        return {"run": get_model_run(config, run_id), "job": store.get(job.id).to_dict()}
    except Exception as error:
        validation = {"executed": True, "valid": False, "errors": [str(error)]}
        update_model_run(config, run_id, status="failed", output={"error": str(error)}, validation=validation)
        store.fail(job, str(error), {"runId": run_id})
        return {"run": get_model_run(config, run_id), "job": store.get(job.id).to_dict()}


def list_model_runs(config: WorkbenchConfig, entity_type: str | None = None, entity_id: str | None = None, limit: int = 50) -> list[dict[str, Any]]:
    clauses = []
    params: list[Any] = []
    if entity_type:
        clauses.append("entity_type = ?")
        params.append(entity_type)
    if entity_id:
        clauses.append("entity_id = ?")
        params.append(entity_id)
    where = f"where {' and '.join(clauses)}" if clauses else ""
    with WorkbenchState(config).connect() as conn:
        create_schema(conn)
        rows = conn.execute(f"select * from model_runs {where} order by updated_at desc limit ?", (*params, max(1, min(limit, 200)))).fetchall()
    return [model_run_payload(row) for row in rows]


def get_model_run(config: WorkbenchConfig, run_id: str) -> dict[str, Any]:
    with WorkbenchState(config).connect() as conn:
        create_schema(conn)
        row = conn.execute("select * from model_runs where id = ?", (run_id,)).fetchone()
    if not row:
        raise KeyError(run_id)
    return model_run_payload(row)


def evaluate_gold_set(config: WorkbenchConfig, payload: dict[str, Any]) -> dict[str, Any]:
    gold_set_id = str(payload.get("goldSetId") or "local-gold-v1")
    run_id = payload.get("modelRunId")
    examples = load_gold_examples(config, gold_set_id)
    runs = [get_model_run(config, str(run_id))] if run_id else list_model_runs(config, limit=100)
    schema_validity = [run_schema_valid(run) for run in runs]
    evidence_present = [run_evidence_present(run) for run in runs]
    evidence_found = [run_evidence_found(run) for run in runs]
    comparisons = compare_runs_to_gold(runs, examples)
    matched_example_ids = {str(row.get("exampleId")) for row in comparisons if row.get("exampleId")}
    evaluation_status = evaluation_status_for(runs, examples, comparisons)
    metrics = {
        "goldSetId": gold_set_id,
        "exampleCount": len(examples),
        "runCount": len(runs),
        "matchedExampleCount": len(matched_example_ids),
        "matchedComparisonCount": len(comparisons),
        "evaluationStatus": evaluation_status,
        "jsonValidity": ratio([bool(run.get("validation", {}).get("valid")) for run in runs]),
        "schemaValidity": ratio(schema_validity),
        "requiredEvidencePresent": ratio(evidence_present),
        "evidenceQuoteFound": ratio(evidence_found),
        "expectedSuggestionsFound": ratio([row["expectedFound"] for row in comparisons]),
        "forbiddenSuggestionAvoided": ratio([row["forbiddenAvoided"] for row in comparisons]),
        "reviewerAcceptanceRate": model_reviewer_acceptance_rate(runs),
        "falsePositiveCount": sum(row["falsePositiveCount"] for row in comparisons),
        "falseNegativeCount": sum(row["falseNegativeCount"] for row in comparisons),
        "failedRuns": sum(1 for run in runs if run.get("status") == "failed"),
        "notes": "Local deterministic evaluation. Metrics compare model-run suggestions with tracked/local gold examples when task/entity IDs match. Treat quality metrics as meaningful only when matchedExampleCount is greater than zero.",
    }
    evaluation_id = f"model-eval-{secrets.token_hex(6)}"
    with WorkbenchState(config).connect() as conn:
        create_schema(conn)
        conn.execute(
            "insert into model_evaluations (id, run_id, gold_set_id, metrics_json, notes, created_at) values (?, ?, ?, ?, ?, ?)",
            (evaluation_id, run_id, gold_set_id, json.dumps(metrics, ensure_ascii=False, sort_keys=True), metrics["notes"], utc_now()),
        )
        conn.commit()
    return {"id": evaluation_id, "metrics": metrics, "examples": examples[:10], "comparisons": comparisons[:50]}


def create_agent_task_pack(config: WorkbenchConfig, payload: dict[str, Any]) -> dict[str, Any]:
    entity_type = str(payload.get("entityType") or "").strip()
    entity_id = str(payload.get("entityId") or "").strip()
    task_type = str(payload.get("taskType") or "entity_review").strip()
    if not entity_type or not entity_id:
        raise ValueError("entityType and entityId are required.")
    context = build_context(config, entity_type, entity_id, task_type, "compact")
    criteria = payload.get("acceptanceCriteria") or [
        "Use official-source evidence only.",
        "Return structured findings with entity IDs and exact evidence quotes.",
        "Do not infer unknown facts as truth.",
    ]
    pack = {
        "id": f"agent-pack-{secrets.token_hex(6)}",
        "entityType": entity_type,
        "entityId": entity_id,
        "taskType": task_type,
        "title": str(payload.get("title") or f"{entity_type}:{entity_id} review pack"),
        "issue": payload.get("issue"),
        "context": context,
        "expectedSchema": agent_task_pack_schema(),
        "acceptanceCriteria": criteria,
        "createdAt": utc_now(),
    }
    path = config.reports_dir / "agent-task-packs" / f"{pack['id']}.json"
    write_json(path, pack)
    with WorkbenchState(config).connect() as conn:
        create_schema(conn)
        conn.execute(
            """
            insert into agent_task_packs (
              id, entity_type, entity_id, task_type, title, context_json,
              acceptance_criteria_json, file_path, created_at
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                pack["id"],
                entity_type,
                entity_id,
                task_type,
                pack["title"],
                json.dumps(context, ensure_ascii=False, sort_keys=True),
                json.dumps(criteria, ensure_ascii=False, sort_keys=True),
                str(path),
                pack["createdAt"],
            ),
        )
        conn.commit()
    pack["filePath"] = str(path)
    return pack


def suggestion_to_proposal(config: WorkbenchConfig, suggestion_id: str) -> dict[str, Any]:
    suggestions = load_suggestions(config, limit=1000)
    suggestion = next((row for row in suggestions if row.get("id") == suggestion_id), None)
    if not suggestion:
        raise KeyError(suggestion_id)
    if suggestion.get("status") == "failed":
        raise ValueError("Failed model suggestions cannot become proposals.")
    if not suggestion.get("evidenceQuote"):
        raise ValueError("Suggestion evidenceQuote is required.")
    return create_proposal(
        config,
        {
            "proposalType": proposal_type_for_suggestion(str(suggestion.get("suggestionType") or "")),
            "entityType": suggestion.get("entityType") or "bill",
            "entityId": suggestion.get("entityId") or suggestion.get("billId"),
            "field": suggestion.get("suggestionType"),
            "proposedValue": suggestion.get("suggestedValue"),
            "evidenceQuote": suggestion.get("evidenceQuote"),
            "sourceDocumentId": suggestion.get("sourceDocumentId"),
            "officialUrl": suggestion.get("officialUrl"),
            "explanation": f"Converted from model suggestion {suggestion_id}: {suggestion.get('explanation') or ''}".strip(),
            "createdBy": f"model:{suggestion.get('model') or 'unknown'}",
        },
    )


def build_context(config: WorkbenchConfig, entity_type: str, entity_id: str, preset_id: str, context_mode: str) -> dict[str, Any]:
    compact = context_mode != "expanded"
    if entity_type == "bill":
        context = ReadOnlyDb(config).bill_audit_context(entity_id) if ReadOnlyDb(config).configured else None
        if context:
            context = {
                "bill": context.get("bill"),
                "documents": context.get("documents", [])[:12 if compact else 40],
                "procedureSteps": context.get("procedureSteps", [])[:40 if compact else 140],
                "votes": context.get("votes", [])[:20 if compact else 80],
                "sponsors": context.get("sponsors", [])[:25 if compact else 80],
                "healthReviews": context.get("healthReviews", [])[:25 if compact else 100],
                "documentDiff": bill_document_diff(config, entity_id) if preset_id in {"bill_dossier_audit", "procedure_gap_review"} else None,
            }
            return context
    if entity_type == "document":
        return document_text_intelligence(config, entity_id)
    return {"entityType": entity_type, "entityId": entity_id, "status": "context_unavailable"}


def build_prompt(preset_id: str, context: dict[str, Any]) -> str:
    preset = PROMPT_PRESETS[preset_id]
    return (
        "You are a local Romanian Parliament data-review assistant.\n"
        "Return only JSON. The output is a suggestion queue, not truth.\n"
        "Every factual suggestion must include an exact evidenceQuote copied from context and a sourceDocumentId or officialUrl when available.\n"
        "Use unknown when evidence is insufficient. Do not invent dates, people, ministries, procedure stages, or legal effects.\n\n"
        f"Preset: {preset['label']} ({preset_id})\n"
        f"Task: {preset['description']}\n"
        f"Context:\n{json.dumps(context, ensure_ascii=False)}"
    )


def call_ollama_with_schema(config: WorkbenchConfig, prompt: str, model: str, temperature: float) -> str:
    # Reuse the existing Ollama helper for transport. The schema is intentionally
    # generic so the lab can compare prompt versions before stricter schemas land.
    if temperature == 0.1:
        return call_ollama(config, prompt, model)
    import httpx

    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "format": generic_schema(),
        "options": {"temperature": temperature},
    }
    with httpx.Client(timeout=120) as client:
        response = client.post(f"{config.ollama_base_url}/api/generate", json=payload)
        response.raise_for_status()
        data = response.json()
    return str(data.get("response") or "")


def validate_model_lab_output(output: dict[str, Any], evidence_text: str) -> dict[str, Any]:
    errors: list[str] = []
    suggestions = output.get("suggestions")
    if not isinstance(suggestions, list):
        errors.append("missing suggestions array")
        suggestions = []
    for index, suggestion in enumerate(suggestions):
        if not isinstance(suggestion, dict):
            errors.append(f"suggestion {index} is not an object")
            continue
        quote = str(suggestion.get("evidenceQuote") or "").strip()
        if len(quote) < 8:
            errors.append(f"suggestion {index} missing evidenceQuote")
        elif normalize(quote) not in normalize(evidence_text):
            errors.append(f"suggestion {index} evidenceQuote not found in context")
        if not suggestion.get("sourceDocumentId") and not suggestion.get("officialUrl"):
            errors.append(f"suggestion {index} missing sourceDocumentId or officialUrl")
    return {
        "executed": True,
        "valid": len(errors) == 0,
        "errors": errors,
        "suggestionCount": len(suggestions),
    }


def insert_model_run(config: WorkbenchConfig, payload: dict[str, Any]) -> None:
    now = utc_now()
    with WorkbenchState(config).connect() as conn:
        create_schema(conn)
        conn.execute(
            """
            insert into model_runs (
              id, task_type, entity_type, entity_id, job_id, model, prompt_version,
              schema_version, status, input_json, output_json, validation_json,
              created_at, updated_at
            ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payload["id"],
                payload["taskType"],
                payload.get("entityType"),
                payload.get("entityId"),
                payload.get("jobId"),
                payload["model"],
                payload["promptVersion"],
                payload["schemaVersion"],
                payload["status"],
                json.dumps(payload["input"], ensure_ascii=False, sort_keys=True),
                json.dumps(payload.get("output"), ensure_ascii=False, sort_keys=True) if payload.get("output") is not None else None,
                json.dumps(payload.get("validation"), ensure_ascii=False, sort_keys=True) if payload.get("validation") is not None else None,
                now,
                now,
            ),
        )
        conn.commit()


def update_model_run(config: WorkbenchConfig, run_id: str, *, status: str, output: dict[str, Any], validation: dict[str, Any]) -> None:
    with WorkbenchState(config).connect() as conn:
        create_schema(conn)
        conn.execute(
            "update model_runs set status = ?, output_json = ?, validation_json = ?, updated_at = ? where id = ?",
            (
                status,
                json.dumps(output, ensure_ascii=False, sort_keys=True),
                json.dumps(validation, ensure_ascii=False, sort_keys=True),
                utc_now(),
                run_id,
            ),
        )
        conn.commit()


def model_run_payload(row: Any) -> dict[str, Any]:
    return {
        "id": row["id"],
        "taskType": row["task_type"],
        "entityType": row["entity_type"],
        "entityId": row["entity_id"],
        "jobId": row["job_id"],
        "model": row["model"],
        "promptVersion": row["prompt_version"],
        "schemaVersion": row["schema_version"],
        "status": row["status"],
        "input": json.loads(row["input_json"] or "{}"),
        "output": json.loads(row["output_json"]) if row["output_json"] else None,
        "validation": json.loads(row["validation_json"]) if row["validation_json"] else None,
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def load_gold_examples(config: WorkbenchConfig, gold_set_id: str) -> list[dict[str, Any]]:
    path = config.data_dir / "gold-sets" / f"{gold_set_id}.jsonl"
    rows = read_jsonl(path)
    if rows:
        return rows
    seed_paths = gold_seed_paths(gold_set_id)
    seed_rows: list[dict[str, Any]] = []
    for seed_path in seed_paths:
        seed_rows.extend(read_jsonl(seed_path))
    return seed_rows


def run_evidence_present(run: dict[str, Any]) -> bool:
    suggestions = ((run.get("output") or {}).get("suggestions") or []) if isinstance(run.get("output"), dict) else []
    if not suggestions:
        return False
    return all(bool(item.get("evidenceQuote")) for item in suggestions if isinstance(item, dict))


def run_evidence_found(run: dict[str, Any]) -> bool:
    suggestions = ((run.get("output") or {}).get("suggestions") or []) if isinstance(run.get("output"), dict) else []
    if not suggestions:
        return False
    context_text = json.dumps((run.get("input") or {}).get("context") or run.get("input") or {}, ensure_ascii=False)
    return all(normalize(str(item.get("evidenceQuote") or "")) in normalize(context_text) for item in suggestions if isinstance(item, dict) and item.get("evidenceQuote"))


def run_schema_valid(run: dict[str, Any]) -> bool:
    output = run.get("output")
    if not isinstance(output, dict):
        return False
    suggestions = output.get("suggestions")
    if not isinstance(suggestions, list):
        return False
    required = {"suggestionType", "entityType", "entityId", "confidence", "suggestedValue", "evidenceQuote", "explanation"}
    return all(isinstance(item, dict) and required.issubset(item.keys()) for item in suggestions)


def compare_runs_to_gold(runs: list[dict[str, Any]], examples: list[dict[str, Any]]) -> list[dict[str, Any]]:
    comparisons: list[dict[str, Any]] = []
    for run in runs:
        matching = [example for example in examples if example_matches_run(example, run)]
        if not matching:
            continue
        suggestions = suggestions_for_run(run)
        for example in matching:
            expected = example.get("expected") if isinstance(example.get("expected"), dict) else {}
            must_find = expected.get("mustFind") if isinstance(expected, dict) else []
            must_not_find = expected.get("mustNotFind") if isinstance(expected, dict) else []
            required_quote = str(expected.get("requiredEvidenceQuote") or "").strip() if isinstance(expected, dict) else ""
            found_missing = [item for item in must_find if not expected_item_present(item, suggestions)]
            forbidden_found = [item for item in must_not_find if expected_item_present(item, suggestions)]
            quote_found = True if not required_quote else any(normalize(required_quote) in normalize(str(item.get("evidenceQuote") or "")) for item in suggestions)
            comparisons.append(
                {
                    "runId": run["id"],
                    "exampleId": example.get("id"),
                    "expectedFound": not found_missing and quote_found,
                    "forbiddenAvoided": not forbidden_found,
                    "falsePositiveCount": len(forbidden_found),
                    "falseNegativeCount": len(found_missing) + (0 if quote_found else 1),
                }
            )
    return comparisons


def suggestions_for_run(run: dict[str, Any]) -> list[dict[str, Any]]:
    output = run.get("output")
    suggestions = output.get("suggestions") if isinstance(output, dict) else []
    return [item for item in suggestions if isinstance(item, dict)]


def example_matches_run(example: dict[str, Any], run: dict[str, Any]) -> bool:
    if example.get("taskType") and example.get("taskType") != run.get("taskType"):
        return False
    if example.get("entityType") and example.get("entityType") != run.get("entityType"):
        return False
    if example.get("entityId") and example.get("entityId") != run.get("entityId"):
        return False
    return True


def evaluation_status_for(runs: list[dict[str, Any]], examples: list[dict[str, Any]], comparisons: list[dict[str, Any]]) -> str:
    if not examples:
        return "no_examples"
    if not runs:
        return "no_runs"
    if not comparisons:
        return "no_matched_examples"
    return "evaluated"


def expected_item_present(expected: Any, suggestions: list[dict[str, Any]]) -> bool:
    if not isinstance(expected, dict):
        return False
    expected_type = normalize(str(expected.get("suggestionType") or expected.get("type") or expected.get("citationType") or ""))
    expected_target = normalize(str(expected.get("normalizedTarget") or expected.get("normalizedTargetString") or expected.get("suggestedValue") or expected.get("value") or ""))
    for suggestion in suggestions:
        suggestion_type = normalize(str(suggestion.get("suggestionType") or suggestion.get("type") or suggestion.get("citationType") or ""))
        text = normalize(json.dumps(suggestion, ensure_ascii=False))
        type_matches = not expected_type or expected_type in suggestion_type or expected_type in text
        target_matches = not expected_target or expected_target in text
        if type_matches and target_matches:
            return True
    return False


def model_reviewer_acceptance_rate(runs: list[dict[str, Any]]) -> float:
    reviewed = []
    for run in runs:
        suggestions = suggestions_for_run(run)
        reviewed.extend(str(item.get("status") or "") for item in suggestions if item.get("status") in {"accepted", "rejected", "ignored"})
    if not reviewed:
        return 0.0
    return sum(1 for status in reviewed if status == "accepted") / len(reviewed)


def gold_seed_paths(gold_set_id: str) -> list[Path]:
    root = Path(__file__).resolve().parents[2] / "gold-sets" / "seeds"
    names = ["ocr-quality", "citation-review", "taxonomy-labeling", "procedure-gap", "bill-diff"] if gold_set_id == "local-gold-v1" else [gold_set_id.replace("_", "-")]
    return [root / f"{name}.jsonl" for name in names]


def ratio(values: list[bool]) -> float:
    if not values:
        return 0.0
    return sum(1 for value in values if value) / len(values)


def proposal_type_for_suggestion(suggestion_type: str) -> str:
    if "procedure" in suggestion_type or suggestion_type in {"reexamination_signal", "ccr_signal", "promulgation_signal"}:
        return "procedure_event"
    if suggestion_type in {"weak_ocr"}:
        return "text_annotation"
    if suggestion_type in {"duplicate_lifecycle_risk"}:
        return "duplicate_merge"
    return "field_correction"


def generic_schema() -> dict[str, Any]:
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


def agent_task_pack_schema() -> dict[str, Any]:
    return {
        "findings": [
            {
                "severity": "critical|high|medium|low",
                "entityType": "bill|vote|document|member|party|government|group",
                "entityId": "string",
                "issue": "string",
                "evidenceQuote": "exact quote from supplied context",
                "sourceDocumentId": "optional",
                "officialUrl": "optional",
                "recommendedAction": "string",
            }
        ]
    }


def normalize(value: str) -> str:
    return " ".join(value.split()).lower()


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()
