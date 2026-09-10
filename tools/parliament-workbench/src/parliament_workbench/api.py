from typing import Any

from .assets import asset_summary, audit_assets, get_asset, list_assets, verify_asset
from .config import load_config
from .datasets import list_datasets
from .db import ReadOnlyDb
from .digi_storage import DigiStorageUnavailable, digi_config_status, digi_status, fetch_digi_preview, ftp_status, verify_digi_path
from .doctor import doctor_report
from .document_intelligence import (
    bill_document_diff,
    create_text_correction,
    document_text_intelligence,
    list_text_corrections,
    parse_document_text,
)
from .entities import entity_assets, entity_health, entity_references, entity_suggestions, get_entity_detail
from .historical_runner import historical_year_run
from .import_cockpit import current_import_plan, historical_year_plan, run_current_import
from .institution_atlas import ask_institution_atlas, atlas_status, get_institution, list_institutions, procedure_graph, seed_institution_atlas
from .jobs import JobStore
from .migrate_export import export_migration_preview, migration_preview
from .model_audit import audit_bill, load_suggestions
from .model_lab import (
    create_agent_task_pack,
    evaluate_gold_set,
    list_model_runs,
    model_presets,
    run_model_lab,
    suggestion_to_proposal,
)
from .publish_gate import list_publish_batches, preview_publish_batch
from .proposals import (
    ProposalValidationError,
    command_preview,
    create_proposal,
    list_proposals,
    reject_proposal,
    review_proposal,
    update_proposal,
)
from .review_queues import (
    ReviewQueueError,
    convert_review_item_to_proposal,
    list_review_queue_items,
    review_item_proposal_preview,
    review_queue_summary,
    transition_review_item,
)
from .source_ledger import list_source_claims, list_source_conflicts, update_source_claim, update_source_conflict, upsert_source_claim
from .state import WorkbenchState
from .taxonomy_analytics import create_taxonomy_label, evidence_profile, list_taxonomy_labels, taxonomy_payload
from .wiki import build_wiki, get_wiki_entity, search_wiki, wiki_status


def create_app():
    try:
        from fastapi import Body, FastAPI, HTTPException, Query, Request, Response
        from fastapi.responses import FileResponse, HTMLResponse
        from fastapi.middleware.cors import CORSMiddleware
        from pydantic import BaseModel, Field
    except Exception as error:
        raise RuntimeError("Install workbench Python dependencies with `npm run workbench:install`.") from error

    class BuildWikiRequest(BaseModel):
        limit: int = Field(default=5000, ge=1, le=50000)

    class AuditBillRequest(BaseModel):
        billIdOrSlug: str = Field(min_length=2)
        model: str | None = None

    class DigiPathRequest(BaseModel):
        storagePath: str = Field(min_length=1)

    class AssetAuditRequest(BaseModel):
        limit: int = Field(default=500, ge=1, le=5000)
        verifyRemote: bool = False

    class ProposalRejectRequest(BaseModel):
        reason: str | None = None

    class InstitutionQuestionRequest(BaseModel):
        question: str = Field(min_length=3, max_length=1200)

    class CurrentImportRunRequest(BaseModel):
        year: int | None = Field(default=None, ge=1990, le=2100)
        limit: int = Field(default=25, ge=1, le=100)
        includeText: bool = True
        mode: str = Field(default="dry_run", pattern="^(dry_run|persist)$")
        execute: bool = False

    class HistoricalYearRunRequest(BaseModel):
        year: int = Field(ge=1990, le=2100)
        chamber: str = Field(default="both", pattern="^(both|deputies|senate)$")
        sourceType: str = "official"
        limit: int = Field(default=10, ge=1, le=25)
        includeText: bool = False
        includeOcr: bool = False
        execute: bool = False

    class PublishPreviewRequest(BaseModel):
        title: str = Field(default="Manual publish batch", min_length=3, max_length=160)
        proposalIds: list[str] = Field(default_factory=list)
        create: bool = False

    class SourceClaimRequest(BaseModel):
        entityType: str = Field(min_length=1)
        entityId: str = Field(min_length=1)
        fieldPath: str = Field(min_length=1)
        value: Any
        sourceUrl: str | None = None
        sourceTitle: str | None = None
        evidenceQuote: str | None = None
        sourceType: str = "official"
        confidence: str = "unknown"
        status: str = "open"

    class SourceClaimUpdateRequest(BaseModel):
        status: str | None = None
        sourceUrl: str | None = None
        sourceTitle: str | None = None
        evidenceQuote: str | None = None
        reviewer: str | None = None
        reviewerNote: str | None = None
        decisionReason: str | None = None
        proposalId: str | None = None

    class SourceConflictUpdateRequest(BaseModel):
        status: str | None = None
        reviewerNote: str | None = None

    class TextCorrectionRequest(BaseModel):
        correctedText: str | None = None
        correctionNote: str | None = None
        evidenceQuote: str = Field(min_length=3)
        sourceDocumentId: str | None = None
        officialUrl: str | None = None

    class DocumentParseRequest(BaseModel):
        correctionId: str | None = None

    class ModelRunRequest(BaseModel):
        presetId: str = "bill_dossier_audit"
        entityType: str | None = None
        entityId: str | None = None
        billIdOrSlug: str | None = None
        model: str | None = None
        temperature: float = Field(default=0.1, ge=0, le=1)
        contextMode: str = Field(default="compact", pattern="^(compact|expanded)$")
        promptVersion: str | None = None
        schemaVersion: str | None = None
        execute: bool = False

    class GoldSetEvaluationRequest(BaseModel):
        goldSetId: str | None = None
        modelRunId: str | None = None

    class AgentTaskPackRequest(BaseModel):
        entityType: str = Field(min_length=1)
        entityId: str = Field(min_length=1)
        taskType: str = "entity_review"
        title: str | None = None
        issue: str | None = None
        acceptanceCriteria: list[str] | None = None

    class TaxonomyLabelRequest(BaseModel):
        entityType: str = Field(min_length=1)
        entityId: str = Field(min_length=1)
        topicCode: str = Field(min_length=1)
        stanceCode: str | None = None
        confidence: float = Field(default=0.5, ge=0, le=1)
        evidenceQuote: str | None = None
        sourceId: str | None = None
        status: str = "draft"

    class ReviewTransitionRequest(BaseModel):
        status: str = Field(min_length=3)
        reviewer: str | None = None
        reviewerNote: str | None = None
        decisionReason: str | None = None

    class MigrateExportRequest(BaseModel):
        title: str | None = None

    from .cockpit_workspace import local_config
    from .cockpit_api import attach_cockpit
    canonical_config = load_config()
    config = local_config(canonical_config)
    if not canonical_config.database_url:
        # Preserve the legacy offline/wiki-only mode; cockpit routes still expose setup.
        from dataclasses import replace
        config = replace(config, database_url=None)
    app = FastAPI(title="CumVoteaza Local Parliament Workbench", version="0.1.0")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/status")
    def status() -> dict[str, Any]:
        return {
            "api": {"ok": True, "host": config.api_host, "port": config.api_port},
            "database": ReadOnlyDb(config).status(),
            "workbenchState": WorkbenchState(config).initialize(),
            "wiki": wiki_status(config),
            "institutionAtlas": atlas_status(config),
            "ollama": ollama_status(config),
            "digiStorage": digi_config_only(config),
            "dataDir": str(config.data_dir),
            "model": config.model,
            "writeMode": {"enabled": config.enable_writes, "tokenConfigured": bool(config.write_token)},
        }

    @app.get("/api/doctor")
    def api_doctor() -> dict[str, Any]:
        return doctor_report(config)

    @app.get("/api/workbench/state")
    def api_workbench_state() -> dict[str, Any]:
        return WorkbenchState(config).initialize()

    @app.post("/api/workbench/state/init")
    def api_workbench_state_init() -> dict[str, Any]:
        return WorkbenchState(config).initialize()

    @app.get("/api/source-claims")
    def api_source_claims(entityType: str | None = None, entityId: str | None = None, status: str | None = None, limit: int = 100) -> dict[str, Any]:
        return {
            "claims": list_source_claims(
                config,
                entity_type=entityType or None,
                entity_id=entityId or None,
                status=status or None,
                limit=limit,
            )
        }

    @app.post("/api/source-claims")
    def api_create_source_claim(request: SourceClaimRequest = Body(...)) -> dict[str, Any]:
        try:
            return upsert_source_claim(config, request.model_dump())
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error

    @app.patch("/api/source-claims/{claim_id}")
    def api_update_source_claim(claim_id: str, request: SourceClaimUpdateRequest = Body(...)) -> dict[str, Any]:
        try:
            return update_source_claim(config, claim_id, request.model_dump(exclude_unset=True))
        except KeyError as error:
            raise HTTPException(status_code=404, detail=str(error)) from error
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error

    @app.get("/api/source-conflicts")
    def api_source_conflicts(entityType: str | None = None, entityId: str | None = None, status: str | None = None, limit: int = 100) -> dict[str, Any]:
        return {
            "conflicts": list_source_conflicts(
                config,
                entity_type=entityType or None,
                entity_id=entityId or None,
                status=status or None,
                limit=limit,
            )
        }

    @app.patch("/api/source-conflicts/{conflict_id}")
    def api_update_source_conflict(conflict_id: str, request: SourceConflictUpdateRequest = Body(...)) -> dict[str, Any]:
        try:
            return update_source_conflict(config, conflict_id, request.model_dump(exclude_unset=True))
        except KeyError as error:
            raise HTTPException(status_code=404, detail=str(error)) from error
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error

    @app.get("/api/connectors/status")
    def connectors_status() -> dict[str, Any]:
        return {
            "database": ReadOnlyDb(config).status(),
            "ollama": ollama_status(config),
            "digiStorage": digi_status(config),
            "ftp": ftp_status(config),
        }

    @app.get("/api/digi/status")
    def api_digi_status() -> dict[str, Any]:
        return digi_status(config)

    @app.post("/api/digi/check-path")
    def api_digi_check_path(request: DigiPathRequest = Body(...)) -> dict[str, Any]:
        return verify_digi_path(config, request.storagePath)

    @app.get("/api/digi/preview")
    def api_digi_preview(storagePath: str = Query(..., min_length=1)) -> Response:
        try:
            preview = fetch_digi_preview(config, storagePath)
            headers = {
                "Cache-Control": "no-store",
                "X-Content-Type-Options": "nosniff",
                "Content-Length": preview["contentLength"],
            }
            return Response(content=preview["content"], media_type=preview["contentType"], headers=headers)
        except DigiStorageUnavailable as error:
            raise HTTPException(status_code=status_code_for_digi_error(error.status), detail=str(error)) from error

    @app.post("/api/wiki/build")
    def api_build_wiki(request: BuildWikiRequest = Body(...)) -> dict[str, Any]:
        job_store = JobStore(config)
        job = job_store.create("wiki.build", {"limit": request.limit})
        job_store.start(job)
        try:
            output = build_wiki(config, limit=request.limit)
            job_store.succeed(job, output)
            return {"job": job_store.get(job.id).to_dict(), "result": output}
        except Exception as error:
            job_store.fail(job, str(error))
            raise HTTPException(status_code=500, detail=str(error)) from error

    @app.get("/api/wiki/search")
    def api_search_wiki(q: str = "", limit: int = 25, entityType: str | None = None) -> dict[str, Any]:
        return {"results": search_wiki(config, q, limit=max(1, min(limit, 100)), entity_type=entityType or None)}

    @app.get("/api/wiki/entities/{entity_type}/{entity_id}")
    def api_get_wiki_entity(entity_type: str, entity_id: str) -> dict[str, Any]:
        record = get_wiki_entity(config, entity_type, entity_id)
        if not record:
            raise HTTPException(status_code=404, detail="Wiki entity not found. Build the wiki first.")
        return record

    @app.get("/api/institutions/status")
    def api_institutions_status() -> dict[str, Any]:
        return atlas_status(config)

    @app.post("/api/institutions/seed")
    def api_seed_institutions() -> dict[str, Any]:
        return seed_institution_atlas(config)

    @app.get("/api/institutions")
    def api_institutions(q: str = "", category: str | None = None) -> dict[str, Any]:
        return {"institutions": list_institutions(config, query=q, category=category or None)}

    @app.get("/api/institutions/procedure-graph")
    def api_institution_procedure_graph() -> dict[str, Any]:
        return procedure_graph(config)

    @app.post("/api/institutions/ask")
    def api_institution_ask(request: InstitutionQuestionRequest = Body(...)) -> dict[str, Any]:
        return ask_institution_atlas(config, request.question)

    @app.get("/api/institutions/{entity_id}")
    def api_institution(entity_id: str) -> dict[str, Any]:
        institution = get_institution(config, entity_id)
        if not institution:
            raise HTTPException(status_code=404, detail="Institution not found.")
        return institution

    @app.get("/api/imports/current/preview")
    def api_current_import_preview(
        year: int | None = None,
        limit: int = 25,
        includeText: bool = True,
        mode: str = "dry_run",
    ) -> dict[str, Any]:
        return current_import_plan(
            year=year,
            limit=max(1, min(limit, 100)),
            include_text=includeText,
            mode="persist" if mode == "persist" else "dry_run",
        )

    @app.post("/api/imports/current/run")
    def api_current_import_run(raw_request: Request, request: CurrentImportRunRequest = Body(...)) -> dict[str, Any]:
        if request.mode == "persist" and request.execute:
            require_write_access(config, raw_request)
        return run_current_import(
            config,
            year=request.year,
            limit=request.limit,
            include_text=request.includeText,
            mode="persist" if request.mode == "persist" else "dry_run",
            execute=request.execute,
        )

    @app.get("/api/imports/historical-year/preview")
    def api_historical_year_preview(year: int, chamber: str = "both", limit: int = 25, sourceType: str = "projects", includeText: bool = False) -> dict[str, Any]:
        if chamber not in {"both", "deputies", "senate"}:
            raise HTTPException(status_code=422, detail="Unsupported chamber.")
        return historical_year_plan(year=year, chamber=chamber, limit=limit, source_type=sourceType, include_text=includeText, mode="dry_run")

    @app.post("/api/imports/historical-year/run")
    def api_historical_year_run(request: HistoricalYearRunRequest = Body(...)) -> dict[str, Any]:
        try:
            return historical_year_run(
                config,
                year=request.year,
                chamber=request.chamber,
                source_type=request.sourceType,
                limit=request.limit,
                include_text=request.includeText,
                include_ocr=request.includeOcr,
                execute=request.execute,
            )
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error

    @app.get("/api/documents/{document_id}/text-intelligence")
    def api_document_text_intelligence(document_id: str) -> dict[str, Any]:
        return document_text_intelligence(config, document_id)

    @app.post("/api/documents/{document_id}/corrections")
    def api_create_text_correction(document_id: str, request: TextCorrectionRequest = Body(...)) -> dict[str, Any]:
        try:
            return create_text_correction(config, document_id, request.model_dump())
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error

    @app.get("/api/documents/{document_id}/corrections")
    def api_list_text_corrections(document_id: str) -> dict[str, Any]:
        return {"corrections": list_text_corrections(config, document_id)}

    @app.post("/api/documents/{document_id}/parse")
    def api_parse_document_text(document_id: str, request: DocumentParseRequest | None = Body(default=None)) -> dict[str, Any]:
        try:
            return parse_document_text(config, document_id, correction_id=request.correctionId if request else None)
        except KeyError as error:
            raise HTTPException(status_code=404, detail="Correction not found.") from error
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error

    @app.get("/api/bills/{bill_id}/document-diff")
    def api_bill_document_diff(bill_id: str) -> dict[str, Any]:
        return bill_document_diff(config, bill_id)

    @app.get("/api/entities/{entity_type}/{entity_id}")
    def api_get_entity(entity_type: str, entity_id: str) -> dict[str, Any]:
        record = get_entity_detail(config, entity_type, entity_id)
        if not record:
            raise HTTPException(status_code=404, detail="Entity not found.")
        return record

    @app.get("/api/entities/{entity_type}/{entity_id}/references")
    def api_entity_references(entity_type: str, entity_id: str) -> dict[str, Any]:
        return {"references": entity_references(config, entity_type, entity_id)}

    @app.get("/api/entities/{entity_type}/{entity_id}/assets")
    def api_entity_assets(entity_type: str, entity_id: str) -> dict[str, Any]:
        detail = get_entity_detail(config, entity_type, entity_id)
        if not detail:
            raise HTTPException(status_code=404, detail="Entity not found.")
        return {"assets": entity_assets(config, entity_type, detail["entityId"], detail.get("sections", {}), detail.get("facts", {}))}

    @app.get("/api/entities/{entity_type}/{entity_id}/health")
    def api_entity_health(entity_type: str, entity_id: str) -> dict[str, Any]:
        detail = get_entity_detail(config, entity_type, entity_id)
        if not detail:
            raise HTTPException(status_code=404, detail="Entity not found.")
        return {"healthIssues": entity_health(config, entity_type, detail["entityId"], detail.get("sections", {}))}

    @app.get("/api/entities/{entity_type}/{entity_id}/suggestions")
    def api_entity_suggestions(entity_type: str, entity_id: str) -> dict[str, Any]:
        return {"suggestions": entity_suggestions(config, entity_type, entity_id)}

    @app.post("/api/model/audit-bill")
    def api_audit_bill(request: AuditBillRequest = Body(...)) -> dict[str, Any]:
        result = audit_bill(config, request.billIdOrSlug, model=request.model)
        status_code = 200 if result.status == "succeeded" else 500
        payload = {
            "status": result.status,
            "billId": result.bill_id,
            "suggestionCount": result.suggestion_count,
            "failedCount": result.failed_count,
            "suggestionsPath": result.suggestions_path,
            "error": result.error,
        }
        if status_code != 200:
            raise HTTPException(status_code=status_code, detail=payload)
        return payload

    @app.get("/api/model/suggestions")
    def api_model_suggestions(billId: str | None = None, limit: int = 100) -> dict[str, Any]:
        return {"suggestions": load_suggestions(config, bill_id=billId, limit=max(1, min(limit, 500)))}

    @app.get("/api/model/presets")
    def api_model_presets() -> dict[str, Any]:
        return model_presets()

    @app.post("/api/model/runs")
    def api_model_runs_create(request: ModelRunRequest = Body(...)) -> dict[str, Any]:
        try:
            return run_model_lab(config, request.model_dump())
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error

    @app.get("/api/model/runs")
    def api_model_runs(entityType: str | None = None, entityId: str | None = None, limit: int = 50) -> dict[str, Any]:
        return {"runs": list_model_runs(config, entity_type=entityType or None, entity_id=entityId or None, limit=limit)}

    @app.post("/api/model/gold-set/evaluate")
    def api_model_gold_set_evaluate(request: GoldSetEvaluationRequest | None = Body(default=None)) -> dict[str, Any]:
        request = request or GoldSetEvaluationRequest()
        return evaluate_gold_set(config, request.model_dump())

    @app.post("/api/model/suggestions/{suggestion_id}/proposal")
    def api_model_suggestion_to_proposal(suggestion_id: str) -> dict[str, Any]:
        try:
            return suggestion_to_proposal(config, suggestion_id)
        except KeyError as error:
            raise HTTPException(status_code=404, detail="Suggestion not found.") from error
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error

    @app.post("/api/agent-task-packs")
    def api_agent_task_pack(request: AgentTaskPackRequest = Body(...)) -> dict[str, Any]:
        try:
            return create_agent_task_pack(config, request.model_dump())
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error

    @app.get("/api/proposals")
    def api_proposals(entityType: str | None = None, entityId: str | None = None, status: str | None = None) -> dict[str, Any]:
        return {"proposals": list_proposals(config, entity_type=entityType, entity_id=entityId, status=status)}

    @app.post("/api/proposals")
    def api_create_proposal(payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
        try:
            return create_proposal(config, payload)
        except ProposalValidationError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error

    @app.patch("/api/proposals/{proposal_id}")
    def api_update_proposal(proposal_id: str, payload: dict[str, Any] = Body(...)) -> dict[str, Any]:
        try:
            return update_proposal(config, proposal_id, payload)
        except KeyError as error:
            raise HTTPException(status_code=404, detail="Proposal not found.") from error
        except ProposalValidationError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error

    @app.post("/api/proposals/{proposal_id}/review")
    def api_review_proposal(proposal_id: str) -> dict[str, Any]:
        try:
            return review_proposal(config, proposal_id)
        except KeyError as error:
            raise HTTPException(status_code=404, detail="Proposal not found.") from error
        except ProposalValidationError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error

    @app.post("/api/proposals/{proposal_id}/reject")
    def api_reject_proposal(proposal_id: str, payload: ProposalRejectRequest | None = Body(default=None)) -> dict[str, Any]:
        try:
            return reject_proposal(config, proposal_id, reason=payload.reason if payload else None)
        except KeyError as error:
            raise HTTPException(status_code=404, detail="Proposal not found.") from error

    @app.post("/api/proposals/{proposal_id}/command-preview")
    def api_proposal_command_preview(proposal_id: str) -> dict[str, Any]:
        try:
            return command_preview(config, proposal_id)
        except KeyError as error:
            raise HTTPException(status_code=404, detail="Proposal not found.") from error

    @app.post("/api/proposals/{proposal_id}/apply")
    def api_apply_proposal(proposal_id: str, request: Request) -> dict[str, Any]:
        require_write_access(config, request)
        raise HTTPException(status_code=410, detail="Use a reviewed cockpit release. A command preview is not a publication.")

    @app.post("/api/proposals/{proposal_id}/fail")
    def api_fail_proposal(proposal_id: str, request: Request, payload: ProposalRejectRequest | None = Body(default=None)) -> dict[str, Any]:
        require_write_access(config, request)
        try:
            proposal = update_proposal(config, proposal_id, {"status": "failed", "explanation": payload.reason if payload else None})
            return {"proposal": proposal}
        except KeyError as error:
            raise HTTPException(status_code=404, detail="Proposal not found.") from error

    @app.get("/api/jobs")
    def api_jobs() -> dict[str, Any]:
        return {"jobs": [job.to_dict() for job in JobStore(config).list()]}

    @app.get("/api/jobs/{job_id}")
    def api_job(job_id: str) -> dict[str, Any]:
        store = JobStore(config)
        job = store.get(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        payload = job.to_dict()
        payload["steps"] = store.list_steps(job_id)
        payload["logs"] = store.list_logs(job_id, limit=500)
        payload["retryJobs"] = [row.to_dict() for row in store.list() if row.parent_job_id == job_id]
        payload["parentJob"] = store.get(job.parent_job_id).to_dict() if job.parent_job_id and store.get(job.parent_job_id) else None
        return payload

    @app.post("/api/jobs/{job_id}/steps/{step_id}/retry-preview")
    def api_job_step_retry_preview(job_id: str, step_id: str) -> dict[str, Any]:
        store = JobStore(config)
        if not store.get(job_id):
            raise HTTPException(status_code=404, detail="Job not found")
        try:
            step = store.get_step(step_id)
        except KeyError as error:
            raise HTTPException(status_code=404, detail="Step not found") from error
        return {
            "jobId": job_id,
            "stepId": step_id,
            "canRetry": bool(step.get("command")),
            "command": step.get("command") or [],
            "commandText": step.get("commandText") or "",
            "message": "Preview only. Use the parent job retry control to queue a local retry job.",
        }

    @app.get("/api/jobs/{job_id}/steps")
    def api_job_steps(job_id: str) -> dict[str, Any]:
        if not JobStore(config).get(job_id):
            raise HTTPException(status_code=404, detail="Job not found")
        return {"steps": JobStore(config).list_steps(job_id)}

    @app.get("/api/jobs/{job_id}/logs")
    def api_job_logs(job_id: str, limit: int = 500) -> dict[str, Any]:
        if not JobStore(config).get(job_id):
            raise HTTPException(status_code=404, detail="Job not found")
        return {"logs": JobStore(config).list_logs(job_id, limit=limit)}

    @app.post("/api/jobs/{job_id}/cancel")
    def api_cancel_job(job_id: str) -> dict[str, Any]:
        try:
            return JobStore(config).cancel(job_id).to_dict()
        except KeyError as error:
            raise HTTPException(status_code=404, detail="Job not found") from error

    @app.post("/api/jobs/{job_id}/retry")
    def api_retry_job(job_id: str) -> dict[str, Any]:
        try:
            return JobStore(config).retry(job_id).to_dict()
        except KeyError as error:
            raise HTTPException(status_code=404, detail="Job not found") from error

    @app.get("/api/data-health/summary")
    def api_health_summary() -> dict[str, Any]:
        return ReadOnlyDb(config).data_health_summary()

    @app.get("/api/review-queues/summary")
    def api_review_queue_summary() -> dict[str, Any]:
        return review_queue_summary(config)

    @app.get("/api/review-queues")
    def api_review_queues(
        queue: str | None = None,
        status: str | None = None,
        entityType: str | None = None,
        entityId: str | None = None,
        q: str | None = None,
        source: str | None = None,
        blocksExport: bool | None = None,
        limit: int = Query(default=100, ge=1, le=500),
        offset: int = Query(default=0, ge=0),
    ) -> dict[str, Any]:
        try:
            return list_review_queue_items(
                config,
                queue=queue or None,
                status=status or None,
                entity_type=entityType or None,
                entity_id=entityId or None,
                q=q or None,
                source=source or None,
                blocks_export=blocksExport,
                limit=limit,
                offset=offset,
            )
        except ReviewQueueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error

    @app.post("/api/review-queues/{queue}/{item_id}/transition")
    def api_review_queue_transition(queue: str, item_id: str, request: ReviewTransitionRequest = Body(...)) -> dict[str, Any]:
        try:
            return transition_review_item(config, queue, item_id, request.model_dump())
        except KeyError as error:
            raise HTTPException(status_code=404, detail="Review item not found.") from error
        except (ReviewQueueError, ProposalValidationError) as error:
            raise HTTPException(status_code=422, detail=str(error)) from error

    @app.post("/api/review-queues/{queue}/{item_id}/proposal-preview")
    def api_review_queue_proposal_preview(queue: str, item_id: str) -> dict[str, Any]:
        try:
            return review_item_proposal_preview(config, queue, item_id)
        except KeyError as error:
            raise HTTPException(status_code=404, detail="Review item not found.") from error
        except (ReviewQueueError, ProposalValidationError) as error:
            raise HTTPException(status_code=422, detail=str(error)) from error

    @app.post("/api/review-queues/{queue}/{item_id}/convert-to-proposal")
    def api_review_queue_convert(queue: str, item_id: str) -> dict[str, Any]:
        try:
            return convert_review_item_to_proposal(config, queue, item_id)
        except KeyError as error:
            raise HTTPException(status_code=404, detail="Review item not found.") from error
        except (ReviewQueueError, ProposalValidationError) as error:
            raise HTTPException(status_code=422, detail=str(error)) from error

    @app.get("/api/taxonomy")
    def api_taxonomy() -> dict[str, Any]:
        return taxonomy_payload(config)

    @app.get("/api/taxonomy/labels")
    def api_taxonomy_labels(entityType: str | None = None, entityId: str | None = None, status: str | None = None, limit: int = 100) -> dict[str, Any]:
        return {
            "labels": list_taxonomy_labels(
                config,
                entity_type=entityType or None,
                entity_id=entityId or None,
                status=status or None,
                limit=limit,
            )
        }

    @app.post("/api/taxonomy/labels")
    def api_create_taxonomy_label(request: TaxonomyLabelRequest = Body(...)) -> dict[str, Any]:
        try:
            return create_taxonomy_label(config, request.model_dump())
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error

    @app.get("/api/analytics/evidence-profile")
    def api_evidence_profile(entityType: str, entityId: str, startDate: str | None = None, endDate: str | None = None) -> dict[str, Any]:
        return evidence_profile(config, entityType, entityId, start_date=startDate, end_date=endDate)

    @app.get("/api/migrate/preview")
    def api_migrate_preview() -> dict[str, Any]:
        return migration_preview(config)

    @app.post("/api/migrate/export")
    def api_migrate_export(request: MigrateExportRequest | None = Body(default=None)) -> dict[str, Any]:
        return export_migration_preview(config, title=request.title if request else None)

    @app.get("/api/publish-batches")
    def api_publish_batches() -> dict[str, Any]:
        return {"batches": list_publish_batches(config)}

    @app.post("/api/publish-batches/preview")
    def api_publish_preview(request: PublishPreviewRequest = Body(...)) -> dict[str, Any]:
        return preview_publish_batch(config, title=request.title, proposal_ids=request.proposalIds, create=request.create)

    @app.get("/api/assets/summary")
    def api_assets_summary() -> dict[str, Any]:
        return asset_summary(config)

    @app.get("/api/assets")
    def api_assets(
        assetType: str | None = None,
        provider: str | None = None,
        status: str | None = None,
        q: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> dict[str, Any]:
        return list_assets(
            config,
            asset_type=assetType or None,
            provider=provider or None,
            status=status or None,
            query=q or None,
            limit=max(1, min(limit, 200)),
            offset=max(0, offset),
        )

    @post_asset_verify(app)
    def _post_asset_verify(asset_id: str) -> dict[str, Any]:
        return verify_asset(config, asset_id)

    @app.get("/api/assets/{asset_id}")
    def api_asset(asset_id: str) -> dict[str, Any]:
        asset = get_asset(config, asset_id)
        if not asset:
            raise HTTPException(status_code=404, detail="Asset not found")
        return asset

    @app.post("/api/assets/audit")
    def api_assets_audit(request: AssetAuditRequest | None = Body(default=None)) -> dict[str, Any]:
        request = request or AssetAuditRequest()
        job_store = JobStore(config)
        job = job_store.create("assets.audit", {"limit": request.limit, "verifyRemote": request.verifyRemote})
        job_store.start(job)
        try:
            output = audit_assets(config, limit=request.limit, verify_remote=request.verifyRemote)
            job_store.succeed(job, output)
            return {"job": job_store.get(job.id).to_dict(), "result": output}
        except Exception as error:
            job_store.fail(job, str(error))
            raise HTTPException(status_code=500, detail=str(error)) from error

    @app.get("/api/datasets")
    def api_datasets() -> dict[str, Any]:
        return {"datasets": list_datasets(config)}

    attach_cockpit(app, config, canonical_config.database_url)
    attach_static_ui(app, config, Request, FileResponse, HTMLResponse, HTTPException)
    return app


def attach_static_ui(app, config, Request, FileResponse, HTMLResponse, HTTPException) -> None:
    if not config.serve_ui:
        return

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa_fallback(full_path: str, request: Request):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="API route not found.")
        dist = config.ui_dist_dir
        requested = (dist / full_path).resolve()
        if requested.is_file() and dist.resolve() in requested.parents:
            return FileResponse(requested)
        index_path = dist / "index.html"
        if index_path.exists():
            return FileResponse(index_path)
        return HTMLResponse(
            "<h1>Workbench UI build missing</h1><p>Run <code>npm run workbench:build-ui</code>, then restart the workbench.</p>",
            status_code=503,
        )


def post_asset_verify(app):
    return app.post("/api/assets/{asset_id}/verify")


def require_write_access(config, request) -> None:
    if not config.enable_writes:
        from fastapi import HTTPException

        raise HTTPException(status_code=403, detail="Workbench write mode is disabled.")
    if not config.write_token:
        from fastapi import HTTPException

        raise HTTPException(status_code=403, detail="WORKBENCH_WRITE_TOKEN is not configured.")
    expected = f"Bearer {config.write_token}"
    if request.headers.get("authorization") != expected:
        from fastapi import HTTPException

        raise HTTPException(status_code=401, detail="Invalid workbench write token.")


def digi_config_only(config) -> dict[str, Any]:
    status = digi_config_status(config)
    return {
        "configured": status.get("configured", False),
        "basePath": status.get("basePath"),
        "mountIdConfigured": status.get("mountIdConfigured", False),
        "missingEnv": status.get("missingEnv", []),
    }


def status_code_for_digi_error(status: str) -> int:
    if status in {"not_configured", "unsupported"}:
        return 400
    if status == "missing":
        return 404
    if status == "too_large":
        return 413
    if status == "auth_failed":
        return 502
    return 500


def ollama_status(config) -> dict[str, Any]:
    try:
        import httpx
    except Exception:
        return {"ok": False, "reason": "httpx is not installed", "baseUrl": config.ollama_base_url}
    try:
        with httpx.Client(timeout=2) as client:
            response = client.get(f"{config.ollama_base_url}/api/tags")
            response.raise_for_status()
            payload = response.json()
        models = [item.get("name") for item in payload.get("models", []) if item.get("name")]
        return {"ok": True, "baseUrl": config.ollama_base_url, "models": models}
    except Exception as error:
        return {"ok": False, "baseUrl": config.ollama_base_url, "reason": str(error)}
