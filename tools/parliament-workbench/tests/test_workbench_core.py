from __future__ import annotations

from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from parliament_workbench.config import WorkbenchConfig
from parliament_workbench.cli import app_status, pid_running
from parliament_workbench.assets import asset_payload, empty_summary, render_asset_report
from parliament_workbench.digi_storage import digi_config_status, ftp_status, verify_digi_path
from parliament_workbench.document_intelligence import create_text_correction, extract_citations, parse_document_text, parse_sections, parse_text_payload
from parliament_workbench.historical_runner import historical_year_run
from parliament_workbench.import_cockpit import current_import_plan, historical_year_plan, validate_dry_run_plan
from parliament_workbench.institution_atlas import ask_institution_atlas, get_institution, procedure_graph, seed_institution_atlas
from parliament_workbench.jobs import JobStore
from parliament_workbench.migrate_export import export_migration_preview, migration_preview
from parliament_workbench.model_audit import validate_suggestion_payload
from parliament_workbench.model_lab import evaluate_gold_set, model_presets, run_model_lab
from parliament_workbench.publish_gate import preview_publish_batch
from parliament_workbench.proposals import ProposalValidationError, accept_proposal, command_preview, create_proposal, list_proposals, review_proposal
from parliament_workbench.review_queues import ReviewQueueError, convert_review_item_to_proposal, list_review_queue_items, review_queue_summary, transition_review_item
from parliament_workbench.source_ledger import list_source_conflicts, upsert_source_claim
from parliament_workbench.state import WorkbenchState
from parliament_workbench.storage import write_json, write_jsonl
from parliament_workbench.taxonomy_analytics import create_taxonomy_label, evidence_profile, taxonomy_payload
from parliament_workbench.wiki import build_wiki_search_index, get_wiki_entity, search_wiki, wiki_records_from_rows


class WorkbenchCoreTest(unittest.TestCase):
    def config(self, path: Path) -> WorkbenchConfig:
        return WorkbenchConfig(
            database_url=None,
            ollama_base_url="http://127.0.0.1:11434",
            model="qwen3:8b",
            data_dir=path,
            api_host="127.0.0.1",
            api_port=8787,
        )

    def test_wiki_record_generation_from_rows(self) -> None:
        records = wiki_records_from_rows(
            {
                "bills": [
                    {
                        "id": "bill-pl-x-1-2026",
                        "slug": "pl-x-1-2026",
                        "title": "Proiect de lege privind testarea",
                        "identifiers": {"deputies": "PL-x 1/2026"},
                        "chamber_of_origin": "senate",
                        "decision_chamber": "deputies",
                        "status": "adoptat",
                        "submitted_on": "2026-01-01",
                        "latest_event_on": "2026-02-01",
                        "vote_count": 1,
                        "document_count": 2,
                        "procedure_step_count": 3,
                        "source_urls": "https://example.test/doc.pdf",
                    }
                ],
                "documents": [],
                "votes": [],
                "members": [],
                "parties": [],
                "groups": [],
                "governments": [],
                "health": [],
            }
        )
        self.assertEqual(len(records), 1)
        payload = records[0].to_dict()
        self.assertEqual(payload["entityType"], "bill")
        self.assertIn("PL-x 1/2026", payload["summary"])
        self.assertEqual(payload["sourceUrls"], ["https://example.test/doc.pdf"])

    def test_search_index_returns_romanian_text(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            config = self.config(Path(tmp))
            config.wiki_dir.mkdir(parents=True)
            write_jsonl(
                config.wiki_dir / "wiki.jsonl",
                [
                    {
                        "id": "party:p1",
                        "entityType": "party",
                        "entityId": "party-test",
                        "title": "Partidul Șansă și Încredere",
                        "summary": "formațiune politică",
                        "body": "istoric legislaturi",
                        "tags": ["party"],
                        "searchText": "Partidul Șansă și Încredere formațiune politică",
                    }
                ],
            )
            results = search_wiki(config, "sansa incredere")
            self.assertEqual(results[0]["entityId"], "party-test")

    def test_search_ranks_canonical_party_above_long_body_matches(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            config = self.config(Path(tmp))
            config.wiki_dir.mkdir(parents=True)
            records = [
                {
                    "id": "document:doc-social",
                    "entityType": "document",
                    "entityId": "doc-social",
                    "title": "Document social media",
                    "subtitle": "proposal",
                    "summary": "Social media social media social media",
                    "body": " ".join(["social democrat"] * 50),
                    "sourceUrls": [],
                    "tags": ["document", "proposal"],
                    "relatedIds": {},
                    "searchText": " ".join(["social democrat"] * 60),
                },
                {
                    "id": "party:party-psd",
                    "entityType": "party",
                    "entityId": "party-psd",
                    "title": "Partidul Social Democrat",
                    "subtitle": "PSD",
                    "summary": "PSD | Partidul Social Democrat",
                    "body": "Short name: PSD",
                    "sourceUrls": [],
                    "tags": ["party", "PSD"],
                    "relatedIds": {},
                    "searchText": "Partidul Social Democrat PSD party",
                },
            ]
            write_jsonl(config.wiki_dir / "wiki.jsonl", records)
            sqlite_path = build_wiki_search_index(config, records)
            self.assertEqual(search_wiki(config, "psd")[0]["entityId"], "party-psd")
            self.assertEqual(search_wiki(config, "partidul social democrat")[0]["entityId"], "party-psd")
            self.assertEqual(search_wiki(config, "media", entity_type="document")[0]["entityId"], "doc-social")
            self.assertEqual(search_wiki(config, "media", entity_type="party"), [])
            self.assertEqual(get_wiki_entity(config, "party", "party-psd")["title"], "Partidul Social Democrat")
            with sqlite3.connect(sqlite_path) as conn:
                entity_count = conn.execute("select count(*) from entities").fetchone()[0]
                relation_count = conn.execute("select count(*) from aliases").fetchone()[0]
            self.assertEqual(entity_count, 2)
            self.assertGreaterEqual(relation_count, 2)

    def test_wiki_records_attach_bill_related_documents_and_votes(self) -> None:
        records = wiki_records_from_rows(
            {
                "bills": [
                    {
                        "id": "bill-a",
                        "slug": "bill-a",
                        "title": "Bill A",
                        "identifiers": {},
                        "chamber_of_origin": "deputies",
                        "decision_chamber": "deputies",
                        "status": "pending",
                        "submitted_on": "2026-01-01",
                        "latest_event_on": "2026-01-01",
                        "vote_count": 1,
                        "document_count": 1,
                        "procedure_step_count": 0,
                        "source_urls": "",
                    }
                ],
                "documents": [
                    {
                        "id": "doc-a",
                        "bill_id": "bill-a",
                        "bill_title": "Bill A",
                        "title": "Proposal",
                        "document_kind": "proposal",
                        "source_chamber": "deputies",
                        "source_url": "https://example.test/doc.pdf",
                        "text_status": "stored",
                        "text_preview": "text",
                        "chunk_count": 1,
                        "text_excerpt": "text",
                    }
                ],
                "votes": [
                    {
                        "id": "vote-a",
                        "title": "Vote A",
                        "chamber": "deputies",
                        "held_on": "2026-01-02",
                        "vote_type": "final",
                        "bill_id": "bill-a",
                        "bill_title": "Bill A",
                        "present": 1,
                        "for_count": 1,
                        "against": 0,
                        "abstention": 0,
                        "present_not_voting": 0,
                    }
                ],
                "members": [],
                "parties": [],
                "groups": [],
                "governments": [],
                "health": [],
            }
        )
        bill = next(record for record in records if record.entity_type == "bill")
        self.assertEqual(bill.related_ids["document"], ["doc-a"])
        self.assertEqual(bill.related_ids["vote"], ["vote-a"])

    def test_model_validation_accepts_evidenced_suggestion(self) -> None:
        valid, invalid = validate_suggestion_payload(
            {
                "suggestions": [
                    {
                        "suggestionType": "procedure_event",
                        "entityType": "bill",
                        "entityId": "bill-a",
                        "confidence": 0.82,
                        "suggestedValue": "promulgation_signal",
                        "evidenceQuote": "trimis spre promulgare Președintelui României",
                        "sourceDocumentId": "doc-a",
                        "explanation": "The official text mentions promulgation.",
                    }
                ]
            },
            "bill-a",
            "qwen3:8b",
        )
        self.assertEqual(len(valid), 1)
        self.assertEqual(invalid, [])

    def test_model_validation_rejects_missing_evidence(self) -> None:
        valid, invalid = validate_suggestion_payload(
            {
                "suggestions": [
                    {
                        "suggestionType": "procedure_event",
                        "entityType": "bill",
                        "entityId": "bill-a",
                        "confidence": 0.82,
                        "suggestedValue": "promulgation_signal",
                        "evidenceQuote": "",
                        "explanation": "No evidence.",
                    }
                ]
            },
            "bill-a",
            "qwen3:8b",
        )
        self.assertEqual(valid, [])
        self.assertEqual(invalid[0]["status"], "failed")

    def test_model_validation_rejects_quote_outside_context(self) -> None:
        valid, invalid = validate_suggestion_payload(
            {
                "suggestions": [
                    {
                        "suggestionType": "procedure_event",
                        "entityType": "bill",
                        "entityId": "bill-a",
                        "confidence": 0.82,
                        "suggestedValue": "promulgation_signal",
                        "evidenceQuote": "trimis spre promulgare Președintelui României",
                        "sourceDocumentId": "doc-a",
                        "explanation": "The official text mentions promulgation.",
                    }
                ]
            },
            "bill-a",
            "qwen3:8b",
            evidence_text="context without that quote",
        )
        self.assertEqual(valid, [])
        self.assertIn("not found", invalid[0]["error"])

    def test_job_lifecycle(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            store = JobStore(self.config(Path(tmp)))
            job = store.create("wiki.build")
            self.assertEqual(job.status, "queued")
            step = store.add_step(job.id, "build-index", "Build search index", ["npm", "run", "workbench:wiki"], "npm run workbench:wiki")
            store.start(job)
            self.assertEqual(store.get(job.id).status, "running")
            store.start_step(step["id"])
            store.succeed_step(step["id"], {"ok": True})
            store.succeed(job, {"ok": True})
            self.assertEqual(store.get(job.id).status, "succeeded")
            self.assertEqual(store.list_steps(job.id)[0]["status"], "succeeded")
            self.assertGreaterEqual(len(store.list_logs(job.id)), 3)
            retry = store.retry(job.id)
            self.assertEqual(retry.parent_job_id, job.id)
            canceled = store.cancel(retry.id)
            self.assertEqual(canceled.status, "canceled")

    def test_workbench_state_initializes_sqlite_tables(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            state = WorkbenchState(self.config(Path(tmp)))
            status = state.initialize()
            self.assertTrue(status["ok"])
            self.assertTrue(Path(status["path"]).exists())
            self.assertGreaterEqual(status["counts"]["taxonomy_labels"], 1)

    def test_workbench_state_migrates_model_runs_job_id_before_index(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            config = self.config(Path(tmp))
            config.data_dir.mkdir(parents=True, exist_ok=True)
            with sqlite3.connect(config.state_db_path) as conn:
                conn.execute("create table schema_meta (key text primary key, value text not null, updated_at text not null)")
                conn.execute(
                    """
                    create table model_runs (
                      id text primary key,
                      task_type text not null,
                      entity_type text,
                      entity_id text,
                      model text not null,
                      prompt_version text not null,
                      schema_version text not null,
                      status text not null,
                      input_json text not null,
                      output_json text,
                      validation_json text,
                      created_at text not null,
                      updated_at text not null
                    )
                    """
                )
                conn.commit()
            status = WorkbenchState(config).initialize()
            self.assertTrue(status["ok"])
            with sqlite3.connect(config.state_db_path) as conn:
                columns = {row[1] for row in conn.execute("pragma table_info(model_runs)").fetchall()}
                indexes = {row[1] for row in conn.execute("pragma index_list(model_runs)").fetchall()}
            self.assertIn("job_id", columns)
            self.assertIn("model_runs_job_idx", indexes)

    def test_institution_atlas_seeds_graph_and_grounded_answer(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            config = self.config(Path(tmp))
            status = seed_institution_atlas(config)
            self.assertTrue(status["built"])
            president = get_institution(config, "institution-president")
            self.assertIsNotNone(president)
            self.assertGreaterEqual(len(president["terms"]), 1)
            self.assertGreaterEqual(len(president["events"]), 1)
            graph = procedure_graph(config)
            self.assertGreaterEqual(len(graph["nodes"]), 5)
            answer = ask_institution_atlas(config, "Ce face Presedintele cu promulgarea?")
            self.assertFalse(answer["needsReview"])
            self.assertGreaterEqual(len(answer["citations"]), 1)

    def test_source_ledger_detects_conflicting_claims(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            config = self.config(Path(tmp))
            first = upsert_source_claim(
                config,
                {
                    "entityType": "bill",
                    "entityId": "bill-a",
                    "fieldPath": "status",
                    "value": "adopted",
                    "sourceUrl": "https://example.test/a",
                    "sourceTitle": "Official A",
                },
            )
            second = upsert_source_claim(
                config,
                {
                    "entityType": "bill",
                    "entityId": "bill-a",
                    "fieldPath": "status",
                    "value": "reexamination",
                    "sourceUrl": "https://example.test/b",
                    "sourceTitle": "Official B",
                },
            )
            self.assertNotEqual(first["id"], second["id"])
            conflicts = list_source_conflicts(config, entity_type="bill", entity_id="bill-a")
            self.assertEqual(len(conflicts), 1)
            self.assertIn("claimsByValue", conflicts[0]["conflict"])
            with self.assertRaises(ReviewQueueError):
                transition_review_item(config, "source_claims", first["id"], {"status": "accepted", "reviewer": "test"})

    def test_current_import_plan_is_capped_and_sequential(self) -> None:
        plan = current_import_plan(year=2026, limit=500, include_text=True, mode="dry_run")
        self.assertEqual(plan["limit"], 100)
        self.assertTrue(all(stage["readOnly"] for stage in plan["stages"]))
        validate_dry_run_plan(plan)
        self.assertIn("ingest:discover:deputies", plan["stages"][0]["commandText"])
        self.assertIn("--years=2026", plan["stages"][0]["commandText"])
        self.assertIn("--discovery-limit=100", plan["stages"][0]["commandText"])
        self.assertIn("--dry-run", plan["stages"][0]["command"])
        self.assertIn("--max-imports=100", " ".join(stage["commandText"] for stage in plan["stages"]))
        self.assertNotIn("ingest:refresh-read-models", " ".join(stage["commandText"] for stage in plan["stages"]))
        historical = historical_year_plan(1992, chamber="deputies", limit=20, source_type="projects")
        validate_dry_run_plan(historical)
        self.assertTrue(all("discover:senate" not in command["commandText"] for command in historical["commands"]))
        self.assertTrue(all("--dry-run" in command["command"] or "bill-text:batch" in command["commandText"] for command in historical["commands"]))

    def test_publish_preview_requires_accepted_items_and_reports_gate(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            config = self.config(Path(tmp))
            preview = preview_publish_batch(config, title="Test batch")
            self.assertFalse(preview["strictGate"]["canPublish"])
            self.assertIn("No accepted proposals", " ".join(preview["strictGate"]["warnings"]))

    def test_app_status_without_pid_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp, patch("parliament_workbench.cli.http_health_ok", return_value=False):
            status = app_status(self.config(Path(tmp)))
            self.assertFalse(status["api"]["running"])
            self.assertFalse(status["ui"]["running"])
            self.assertEqual(status["url"], "http://127.0.0.1:8787")

    def test_app_status_uses_api_health_when_pid_is_missing(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            config = self.config(Path(tmp))
            config.data_dir.mkdir(parents=True, exist_ok=True)
            write_json(config.data_dir / "workbench-app.json", {"mode": "standalone", "api": {"port": 8787}})
            with patch("parliament_workbench.cli.http_health_ok", return_value=True) as health:
                status = app_status(config)
            self.assertTrue(status["api"]["running"])
            self.assertFalse(status["ui"]["running"])
            health.assert_called_once_with("127.0.0.1", 8787, "/api/status")

    def test_pid_running_treats_permission_denied_as_alive(self) -> None:
        with patch("parliament_workbench.cli.os.kill", side_effect=PermissionError):
            self.assertTrue(pid_running(12345))

    def test_proposal_lifecycle_requires_evidence_for_acceptance(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            config = self.config(Path(tmp))
            proposal = create_proposal(
                config,
                {
                    "proposalType": "field_correction",
                    "entityType": "bill",
                    "entityId": "bill-a",
                    "field": "status",
                    "proposedValue": "adopted",
                    "explanation": "needs review",
                },
            )
            with self.assertRaises(ProposalValidationError):
                accept_proposal(config, proposal["id"])
            updated = review_proposal(config, create_proposal(
                config,
                {
                    "proposalType": "review_note",
                    "entityType": "bill",
                    "entityId": "bill-a",
                    "proposedValue": "local note",
                },
            )["id"])
            self.assertEqual(updated["status"], "reviewed")
            self.assertEqual(len(list_proposals(config, entity_type="bill", entity_id="bill-a")), 2)

    def test_command_preview_for_vote_link_does_not_execute(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            config = self.config(Path(tmp))
            proposal = create_proposal(
                config,
                {
                    "proposalType": "relation_link",
                    "entityType": "vote",
                    "entityId": "vote-a",
                    "proposedValue": "bill-a",
                    "evidenceQuote": "PL-x 1/2026",
                    "officialUrl": "https://example.test/vote-a",
                },
            )
            accepted = accept_proposal(config, proposal["id"])
            preview = command_preview(config, accepted["id"])
            self.assertIn("repair:link-vote-bill", preview["commands"][0])
            self.assertFalse(preview["canExecute"])

    def test_digi_status_reports_missing_env_without_secrets(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            config = self.config(Path(tmp))
            status = digi_config_status(config)
            self.assertFalse(status["configured"])
            self.assertIn("DIGI_STORAGE_EMAIL", status["missingEnv"])
            self.assertNotIn("password", "".join(status.keys()).lower())

    def test_verify_digi_path_rejects_empty_path_without_network(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            result = verify_digi_path(self.config(Path(tmp)), "")
            self.assertEqual(result["status"], "unsupported")
            self.assertFalse(result["exists"])

    def test_ftp_status_is_fallback_only(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            status = ftp_status(self.config(Path(tmp)))
            self.assertEqual(status["mode"], "fallback_only")
            self.assertFalse(status["configured"])

    def test_asset_payload_adds_public_gateway_url(self) -> None:
        payload = asset_payload(
            {
                "id": "asset-bill-text-doc-1",
                "entity_type": "bill_document",
                "entity_id": "doc-1",
                "asset_type": "bill_text",
                "storage_provider": "digi_storage",
                "storage_path": "/cumvoteaza-assets/test.txt",
                "fetch_status": "stored",
                "document_id": "doc-1",
                "bill_slug": "pl-x-1-2026",
            }
        )
        self.assertEqual(payload["publicGatewayUrl"], "/api/assets/asset-bill-text-doc-1")
        self.assertEqual(payload["documentTextUrl"], "/api/bill-documents/doc-1/text")
        self.assertEqual(payload["appUrl"], "/ro/bills/pl-x-1-2026")

    def test_empty_asset_summary_shape(self) -> None:
        summary = empty_summary()
        self.assertEqual(summary["total"], 0)
        self.assertEqual(summary["byProvider"], [])

    def test_asset_report_renders_issues(self) -> None:
        report = render_asset_report(
            [
                {
                    "issueType": "digi_storage_path_missing",
                    "assetId": "asset-a",
                    "reason": "missing path",
                    "suggestedAction": "review",
                }
            ],
            __import__("datetime").datetime(2026, 1, 1),
        )
        self.assertIn("asset-a", report)
        self.assertIn("missing path", report)

    def test_document_parser_sections_and_citations(self) -> None:
        text = """
        EXPUNERE DE MOTIVE
        Articol unic
        Legea nr. 1/2020 se modifică.
        Art. 1.
        La articolul 2, alineatul (1) se modifică.
        Decizia CCR nr. 12/2021 se menționează în Monitorul Oficial.
        """
        sections = parse_sections(text)
        self.assertGreaterEqual(len(sections), 3)
        self.assertIn("articol unic", [section.normalizedHeading for section in sections])
        citations = extract_citations(text, "doc-a")
        citation_types = {citation["citationType"] for citation in citations}
        self.assertIn("law", citation_types)
        self.assertIn("ccr_decision", citation_types)
        payload = parse_text_payload("doc-a", text)
        self.assertGreaterEqual(len(payload["sections"]), 3)
        self.assertGreaterEqual(len(payload["citations"]), 2)

    def test_document_correction_creates_local_proposal(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            config = self.config(Path(tmp))
            correction = create_text_correction(
                config,
                "doc-a",
                {
                    "correctedText": "Articol unic. Text corectat.",
                    "evidenceQuote": "Articol unic",
                    "sourceDocumentId": "doc-a",
                },
            )
            self.assertEqual(correction["documentId"], "doc-a")
            proposals = list_proposals(config, entity_type="document", entity_id="doc-a")
            self.assertEqual(proposals[0]["proposalType"], "text_annotation")
            parsed = parse_document_text(config, "doc-a", correction_id=correction["id"])
            self.assertEqual(parsed["correctionId"], correction["id"])

    def test_model_lab_preview_and_gold_evaluation(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            config = self.config(Path(tmp))
            self.assertGreaterEqual(len(model_presets()["presets"]), 3)
            result = run_model_lab(
                config,
                {
                    "presetId": "bill_dossier_audit",
                    "entityType": "bill",
                    "entityId": "bill-a",
                    "execute": False,
                },
            )
            self.assertEqual(result["run"]["status"], "preview")
            evaluation = evaluate_gold_set(config, {})
            self.assertIn("metrics", evaluation)
            self.assertGreaterEqual(evaluation["metrics"]["exampleCount"], 25)
            self.assertGreaterEqual(evaluation["metrics"]["matchedExampleCount"], 1)
            self.assertEqual(evaluation["metrics"]["evaluationStatus"], "evaluated")
            self.assertIn("schemaValidity", evaluation["metrics"])
            self.assertIn("falsePositiveCount", evaluation["metrics"])
            no_match = run_model_lab(
                config,
                {
                    "presetId": "taxonomy_labeling",
                    "entityType": "member",
                    "entityId": "member-a",
                    "execute": False,
                },
            )
            no_match_eval = evaluate_gold_set(config, {"modelRunId": no_match["run"]["id"]})
            self.assertEqual(no_match_eval["metrics"]["matchedExampleCount"], 0)
            self.assertEqual(no_match_eval["metrics"]["evaluationStatus"], "no_matched_examples")

    def test_taxonomy_label_and_profile_are_local(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            config = self.config(Path(tmp))
            taxonomy = taxonomy_payload(config)
            self.assertGreaterEqual(len(taxonomy["topics"]), 10)
            label = create_taxonomy_label(
                config,
                {
                    "entityType": "bill",
                    "entityId": "bill-a",
                    "topicCode": taxonomy["topics"][0]["code"],
                    "stanceCode": "technical_admin",
                    "evidenceQuote": "Text oficial",
                    "sourceId": "doc-a",
                    "status": "accepted",
                },
            )
            self.assertEqual(label["status"], "accepted")
            profile = evidence_profile(config, "bill", "bill-a")
            self.assertEqual(profile["coverage"]["reviewedLabelCount"], 1)
            self.assertEqual(profile["coverage"]["confidence"], "insufficient_reviewed_data")

    def test_review_queue_transitions_and_export_blockers(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            config = self.config(Path(tmp))
            correction = create_text_correction(
                config,
                "doc-a",
                {
                    "correctedText": "Articol unic. Legea nr. 1/2020 se modifică.",
                    "evidenceQuote": "Legea nr. 1/2020",
                    "sourceDocumentId": "doc-a",
                },
            )
            parsed = parse_document_text(config, "doc-a", correction_id=correction["id"])
            citation_id = parsed["citations"][0]["id"]
            preview = migration_preview(config)
            blocker_keys = {blocker["key"] for blocker in preview["blockers"]}
            self.assertIn("review_queue_citations_candidate", blocker_keys)
            self.assertIn("review_queue_text_corrections_draft", blocker_keys)

            with self.assertRaises(ReviewQueueError):
                transition_review_item(config, "citations", citation_id, {"status": "ignored"})

            reviewed_correction = transition_review_item(
                config,
                "text_corrections",
                correction["id"],
                {"status": "reviewed", "reviewer": "test", "reviewerNote": "checked OCR"},
            )
            self.assertEqual(reviewed_correction["status"], "reviewed")
            self.assertEqual(reviewed_correction["reviewer"], "test")

            accepted_citation = transition_review_item(
                config,
                "citations",
                citation_id,
                {"status": "accepted", "reviewer": "test", "reviewerNote": "citation is present"},
            )
            self.assertEqual(accepted_citation["status"], "accepted")
            proposal = convert_review_item_to_proposal(config, "citations", citation_id)
            self.assertEqual(proposal["entityType"], "document")

            taxonomy = taxonomy_payload(config)
            label = create_taxonomy_label(
                config,
                {
                    "entityType": "bill",
                    "entityId": "bill-a",
                    "topicCode": taxonomy["topics"][0]["code"],
                    "stanceCode": "technical_admin",
                    "evidenceQuote": "Text oficial",
                    "sourceId": "doc-a",
                },
            )
            accepted_label = transition_review_item(config, "taxonomy_labels", label["id"], {"status": "accepted", "reviewer": "test"})
            self.assertEqual(accepted_label["status"], "accepted")

            queues = list_review_queue_items(config, status="accepted", limit=20)
            self.assertGreaterEqual(queues["total"], 2)
            summary = review_queue_summary(config)
            self.assertGreaterEqual(summary["total"], 3)
            refreshed = migration_preview(config)
            refreshed_keys = {blocker["key"] for blocker in refreshed["blockers"]}
            self.assertNotIn("review_queue_citations_candidate", refreshed_keys)
            self.assertNotIn("review_queue_text_corrections_draft", refreshed_keys)

    def test_review_queue_summary_counts_beyond_public_page_cap(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            config = self.config(Path(tmp))
            for index in range(510):
                upsert_source_claim(
                    config,
                    {
                        "entityType": "bill",
                        "entityId": f"bill-{index}",
                        "fieldPath": "status",
                        "value": "candidate",
                        "sourceUrl": f"https://example.test/{index}",
                        "sourceTitle": f"Official {index}",
                    },
                )
            listed = list_review_queue_items(config, queue="source_claims", limit=500)
            summary = review_queue_summary(config)
            source_claim_count = next(bucket["count"] for bucket in summary["byQueue"] if bucket["key"] == "source_claims")
            self.assertEqual(listed["total"], 510)
            self.assertEqual(len(listed["items"]), 500)
            self.assertEqual(source_claim_count, 510)

    def test_historical_runner_preview_stores_job_only(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            config = self.config(Path(tmp))
            result = historical_year_run(
                config,
                year=1992,
                chamber="deputies",
                source_type="projects",
                limit=50,
                include_text=True,
                include_ocr=True,
                execute=False,
            )
            self.assertFalse(result["result"]["executed"])
            self.assertEqual(result["result"]["plan"]["limit"], 25)
            self.assertTrue(all("--persist" not in step["commandText"] for step in result["result"]["plan"]["commands"]))

    def test_migration_export_preview_writes_local_files_only(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            config = self.config(Path(tmp))
            weak = create_proposal(
                config,
                {
                    "proposalType": "field_correction",
                    "entityType": "bill",
                    "entityId": "bill-weak",
                    "field": "status",
                    "proposedValue": "adopted",
                    "evidenceQuote": "Status adoptat",
                },
            )
            with self.assertRaises(ProposalValidationError):
                accept_proposal(config, weak["id"])
            proposal = create_proposal(
                config,
                {
                    "proposalType": "field_correction",
                    "entityType": "bill",
                    "entityId": "bill-a",
                    "field": "status",
                    "proposedValue": "adopted",
                    "evidenceQuote": "Status adoptat",
                    "officialUrl": "https://example.test/status",
                },
            )
            accept_proposal(config, proposal["id"])
            accepted_rows = list_proposals(config)
            accepted_rows.append(
                {
                    **proposal,
                    "id": "proposal-old-weak",
                    "entityId": "bill-old-weak",
                    "evidenceQuote": None,
                    "officialUrl": None,
                    "sourceDocumentId": None,
                    "status": "accepted",
                }
            )
            write_jsonl(config.proposals_dir / "proposals.jsonl", accepted_rows)
            # Simulate a pre-migration workspace containing a legacy invalid record.
            with WorkbenchState(config).connect() as conn:
                conn.execute("delete from schema_meta where key='proposals_sqlite_authority'")
            preview = migration_preview(config)
            self.assertEqual(preview["counts"]["acceptedProposals"], 2)
            blocker_keys = {blocker["key"] for blocker in preview["blockers"]}
            self.assertIn("accepted_proposals_missing_evidence", blocker_keys)
            self.assertIn("accepted_proposals_missing_source", blocker_keys)
            exported = export_migration_preview(config, "Test export")
            self.assertTrue(all(Path(path).exists() for path in exported["files"]))


if __name__ == "__main__":
    unittest.main()
