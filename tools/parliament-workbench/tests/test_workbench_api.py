from __future__ import annotations

from pathlib import Path
import os
import sys
import tempfile
import unittest
import warnings


ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))


class WorkbenchApiTest(unittest.TestCase):
    def test_status_endpoint_without_database(self) -> None:
        try:
            with warnings.catch_warnings():
                warnings.filterwarnings("ignore", message="Using `httpx` with `starlette.testclient`.*")
                from fastapi.testclient import TestClient
            from parliament_workbench.api import create_app
        except Exception as error:
            self.skipTest(f"FastAPI dependencies not installed: {error}")
        with tempfile.TemporaryDirectory() as tmp:
            old_data_dir = os.environ.get("WORKBENCH_DATA_DIR")
            old_database_url = os.environ.get("DATABASE_URL")
            old_skip_dotenv = os.environ.get("WORKBENCH_SKIP_DOTENV")
            os.environ["WORKBENCH_DATA_DIR"] = tmp
            os.environ["WORKBENCH_SKIP_DOTENV"] = "1"
            os.environ.pop("DATABASE_URL", None)
            try:
                client = TestClient(create_app())
                response = client.get("/api/status")
                self.assertEqual(response.status_code, 200)
                payload = response.json()
                self.assertTrue(payload["api"]["ok"])
                self.assertFalse(payload["database"]["configured"])
            finally:
                if old_data_dir is None:
                    os.environ.pop("WORKBENCH_DATA_DIR", None)
                else:
                    os.environ["WORKBENCH_DATA_DIR"] = old_data_dir
                if old_database_url is None:
                    os.environ.pop("DATABASE_URL", None)
                else:
                    os.environ["DATABASE_URL"] = old_database_url
                if old_skip_dotenv is None:
                    os.environ.pop("WORKBENCH_SKIP_DOTENV", None)
                else:
                    os.environ["WORKBENCH_SKIP_DOTENV"] = old_skip_dotenv

    def test_connector_and_asset_endpoints_without_database(self) -> None:
        try:
            with warnings.catch_warnings():
                warnings.filterwarnings("ignore", message="Using `httpx` with `starlette.testclient`.*")
                from fastapi.testclient import TestClient
            from parliament_workbench.api import create_app
        except Exception as error:
            self.skipTest(f"FastAPI dependencies not installed: {error}")
        with tempfile.TemporaryDirectory() as tmp:
            env_names = [
                "WORKBENCH_DATA_DIR",
                "WORKBENCH_SKIP_DOTENV",
                "DATABASE_URL",
                "DIGI_STORAGE_EMAIL",
                "DIGI_STORAGE_PASSWORD",
                "DIGI_EMAIL",
                "DIGI_PASSWORD",
                "ASSET_FTP_USERNAME",
                "ASSET_FTP_PASSWORD",
                "ASSET_FTP_HOST",
                "ASSET_FTP_PUBLIC_BASE_URL",
            ]
            old_env = {name: os.environ.get(name) for name in env_names}
            os.environ["WORKBENCH_DATA_DIR"] = tmp
            os.environ["WORKBENCH_SKIP_DOTENV"] = "1"
            for name in env_names[2:]:
                os.environ.pop(name, None)
            os.environ["DIGI_STORAGE_PASSWORD"] = "super-secret"
            try:
                client = TestClient(create_app())
                connectors = client.get("/api/connectors/status")
                self.assertEqual(connectors.status_code, 200)
                connectors_payload = connectors.json()
                self.assertFalse(connectors_payload["database"]["configured"])
                self.assertFalse(connectors_payload["digiStorage"]["configured"])
                self.assertNotIn("super-secret", str(connectors_payload).lower())

                summary = client.get("/api/assets/summary")
                self.assertEqual(summary.status_code, 200)
                self.assertEqual(summary.json()["total"], 0)

                assets = client.get("/api/assets")
                self.assertEqual(assets.status_code, 200)
                self.assertEqual(assets.json()["assets"], [])

                audit = client.post("/api/assets/audit", json={"limit": 10, "verifyRemote": False})
                self.assertEqual(audit.status_code, 200)
                audit_payload = audit.json()
                self.assertEqual(audit_payload["result"]["issueCount"], 0)
                self.assertTrue(Path(audit_payload["result"]["reportPath"]).exists())

                path_check = client.post("/api/digi/check-path", json={"storagePath": ""})
                self.assertEqual(path_check.status_code, 422)
            finally:
                for name, value in old_env.items():
                    if value is None:
                        os.environ.pop(name, None)
                    else:
                        os.environ[name] = value

    def test_proposal_api_and_write_gate(self) -> None:
        try:
            with warnings.catch_warnings():
                warnings.filterwarnings("ignore", message="Using `httpx` with `starlette.testclient`.*")
                from fastapi.testclient import TestClient
            from parliament_workbench.api import create_app
        except Exception as error:
            self.skipTest(f"FastAPI dependencies not installed: {error}")
        with tempfile.TemporaryDirectory() as tmp:
            env_names = ["WORKBENCH_DATA_DIR", "WORKBENCH_SKIP_DOTENV", "DATABASE_URL", "WORKBENCH_ENABLE_WRITES", "WORKBENCH_WRITE_TOKEN"]
            old_env = {name: os.environ.get(name) for name in env_names}
            os.environ["WORKBENCH_DATA_DIR"] = tmp
            os.environ["WORKBENCH_SKIP_DOTENV"] = "1"
            os.environ.pop("DATABASE_URL", None)
            os.environ.pop("WORKBENCH_ENABLE_WRITES", None)
            os.environ["WORKBENCH_WRITE_TOKEN"] = "secret"
            try:
                client = TestClient(create_app())
                created = client.post(
                    "/api/proposals",
                    json={
                        "proposalType": "relation_link",
                        "entityType": "vote",
                        "entityId": "vote-a",
                        "proposedValue": "bill-a",
                        "evidenceQuote": "PL-x 1/2026",
                        "officialUrl": "https://example.test/vote-a",
                    },
                )
                self.assertEqual(created.status_code, 200)
                proposal_id = created.json()["id"]
                reviewed = client.post(f"/api/proposals/{proposal_id}/review")
                self.assertEqual(reviewed.status_code, 200)
                self.assertEqual(reviewed.json()["status"], "reviewed")
                preview = client.post(f"/api/proposals/{proposal_id}/command-preview")
                self.assertEqual(preview.status_code, 200)
                self.assertIn("repair:link-vote-bill", preview.json()["commands"][0])
                apply_response = client.post(f"/api/proposals/{proposal_id}/apply", headers={"Authorization": "Bearer secret"})
                self.assertEqual(apply_response.status_code, 403)
            finally:
                for name, value in old_env.items():
                    if value is None:
                        os.environ.pop(name, None)
                    else:
                        os.environ[name] = value

    def test_entity_endpoint_uses_wiki_fallback_without_database(self) -> None:
        try:
            with warnings.catch_warnings():
                warnings.filterwarnings("ignore", message="Using `httpx` with `starlette.testclient`.*")
                from fastapi.testclient import TestClient
            from parliament_workbench.api import create_app
            from parliament_workbench.storage import write_jsonl
        except Exception as error:
            self.skipTest(f"FastAPI dependencies not installed: {error}")
        with tempfile.TemporaryDirectory() as tmp:
            env_names = ["WORKBENCH_DATA_DIR", "WORKBENCH_SKIP_DOTENV", "DATABASE_URL"]
            old_env = {name: os.environ.get(name) for name in env_names}
            os.environ["WORKBENCH_DATA_DIR"] = tmp
            os.environ["WORKBENCH_SKIP_DOTENV"] = "1"
            os.environ.pop("DATABASE_URL", None)
            try:
                wiki_dir = Path(tmp) / "wiki"
                wiki_dir.mkdir(parents=True)
                write_jsonl(
                    wiki_dir / "party.jsonl",
                    [
                        {
                            "id": "party:party-a",
                            "entityType": "party",
                            "entityId": "party-a",
                            "title": "Partid A",
                            "subtitle": "PA",
                            "summary": "PA | Partid A",
                            "body": "Short name: PA",
                            "sourceUrls": [],
                            "tags": ["party"],
                            "relatedIds": {},
                        }
                    ],
                )
                client = TestClient(create_app())
                response = client.get("/api/entities/party/party-a")
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()["title"], "Partid A")
            finally:
                for name, value in old_env.items():
                    if value is None:
                        os.environ.pop(name, None)
                    else:
                        os.environ[name] = value

    def test_backbone_atlas_import_and_publish_endpoints_without_database(self) -> None:
        try:
            with warnings.catch_warnings():
                warnings.filterwarnings("ignore", message="Using `httpx` with `starlette.testclient`.*")
                from fastapi.testclient import TestClient
            from parliament_workbench.api import create_app
        except Exception as error:
            self.skipTest(f"FastAPI dependencies not installed: {error}")
        with tempfile.TemporaryDirectory() as tmp:
            env_names = ["WORKBENCH_DATA_DIR", "WORKBENCH_SKIP_DOTENV", "DATABASE_URL", "WORKBENCH_ENABLE_WRITES", "WORKBENCH_WRITE_TOKEN"]
            old_env = {name: os.environ.get(name) for name in env_names}
            os.environ["WORKBENCH_DATA_DIR"] = tmp
            os.environ["WORKBENCH_SKIP_DOTENV"] = "1"
            os.environ.pop("DATABASE_URL", None)
            os.environ.pop("WORKBENCH_ENABLE_WRITES", None)
            os.environ["WORKBENCH_WRITE_TOKEN"] = "secret"
            try:
                client = TestClient(create_app())
                state = client.get("/api/workbench/state")
                self.assertEqual(state.status_code, 200)
                self.assertTrue(state.json()["initialized"])

                atlas = client.get("/api/institutions/status")
                self.assertEqual(atlas.status_code, 200)
                self.assertTrue(atlas.json()["built"])

                graph = client.get("/api/institutions/procedure-graph")
                self.assertEqual(graph.status_code, 200)
                self.assertGreaterEqual(len(graph.json()["nodes"]), 5)

                answer = client.post("/api/institutions/ask", json={"question": "Ce face CCR?"})
                self.assertEqual(answer.status_code, 200)
                self.assertIn("citations", answer.json())

                plan = client.get("/api/imports/current/preview?year=2026&limit=10&includeText=true")
                self.assertEqual(plan.status_code, 200)
                self.assertEqual(plan.json()["year"], 2026)

                stored = client.post(
                    "/api/imports/current/run",
                    json={"year": 2026, "limit": 10, "includeText": True, "mode": "dry_run", "execute": False},
                )
                self.assertEqual(stored.status_code, 200)
                stored_payload = stored.json()
                self.assertFalse(stored_payload["result"]["executed"])
                self.assertGreaterEqual(len(stored_payload["steps"]), 1)
                self.assertGreaterEqual(len(stored_payload["logs"]), 1)
                job_id = stored_payload["job"]["id"]

                steps = client.get(f"/api/jobs/{job_id}/steps")
                self.assertEqual(steps.status_code, 200)
                self.assertEqual(steps.json()["steps"][0]["status"], "succeeded")

                logs = client.get(f"/api/jobs/{job_id}/logs")
                self.assertEqual(logs.status_code, 200)
                self.assertGreaterEqual(len(logs.json()["logs"]), 1)

                persist_preview = client.post(
                    "/api/imports/current/run",
                    json={"year": 2026, "limit": 10, "includeText": True, "mode": "persist", "execute": False},
                )
                self.assertEqual(persist_preview.status_code, 200)
                self.assertFalse(persist_preview.json()["result"]["executed"])

                blocked_persist = client.post(
                    "/api/imports/current/run",
                    json={"year": 2026, "limit": 10, "includeText": True, "mode": "persist", "execute": True},
                    headers={"Authorization": "Bearer secret"},
                )
                self.assertEqual(blocked_persist.status_code, 403)

                publish = client.post("/api/publish-batches/preview", json={"title": "Test batch", "proposalIds": [], "create": True})
                self.assertEqual(publish.status_code, 200)
                self.assertFalse(publish.json()["strictGate"]["canPublish"])
            finally:
                for name, value in old_env.items():
                    if value is None:
                        os.environ.pop(name, None)
                    else:
                        os.environ[name] = value

    def test_source_ledger_endpoints_detect_conflicts(self) -> None:
        try:
            with warnings.catch_warnings():
                warnings.filterwarnings("ignore", message="Using `httpx` with `starlette.testclient`.*")
                from fastapi.testclient import TestClient
            from parliament_workbench.api import create_app
        except Exception as error:
            self.skipTest(f"FastAPI dependencies not installed: {error}")
        with tempfile.TemporaryDirectory() as tmp:
            env_names = ["WORKBENCH_DATA_DIR", "WORKBENCH_SKIP_DOTENV", "DATABASE_URL"]
            old_env = {name: os.environ.get(name) for name in env_names}
            os.environ["WORKBENCH_DATA_DIR"] = tmp
            os.environ["WORKBENCH_SKIP_DOTENV"] = "1"
            os.environ.pop("DATABASE_URL", None)
            try:
                client = TestClient(create_app())
                first = client.post(
                    "/api/source-claims",
                    json={
                        "entityType": "bill",
                        "entityId": "bill-a",
                        "fieldPath": "status",
                        "value": "adopted",
                        "sourceUrl": "https://example.test/a",
                        "evidenceQuote": "Status adoptat",
                    },
                )
                self.assertEqual(first.status_code, 200)
                self.assertEqual(first.json()["evidenceQuote"], "Status adoptat")
                claim_id = first.json()["id"]
                second = client.post(
                    "/api/source-claims",
                    json={
                        "entityType": "bill",
                        "entityId": "bill-a",
                        "fieldPath": "status",
                        "value": "reexamination",
                        "sourceUrl": "https://example.test/b",
                    },
                )
                self.assertEqual(second.status_code, 200)

                claims = client.get("/api/source-claims?entityType=bill&entityId=bill-a")
                self.assertEqual(claims.status_code, 200)
                self.assertEqual(len(claims.json()["claims"]), 2)

                conflicts = client.get("/api/source-conflicts?entityType=bill&entityId=bill-a")
                self.assertEqual(conflicts.status_code, 200)
                self.assertEqual(len(conflicts.json()["conflicts"]), 1)
                conflict_id = conflicts.json()["conflicts"][0]["id"]

                blocked = client.patch(f"/api/source-claims/{claim_id}", json={"status": "accepted", "reviewerNote": "checked"})
                self.assertEqual(blocked.status_code, 422)

                ignored = client.patch(f"/api/source-claims/{second.json()['id']}", json={"status": "ignored", "reviewerNote": "superseded by official A"})
                self.assertEqual(ignored.status_code, 200)
                self.assertEqual(ignored.json()["status"], "ignored")

                accepted = client.patch(f"/api/source-claims/{claim_id}", json={"status": "accepted", "reviewerNote": "checked after conflict"})
                self.assertEqual(accepted.status_code, 200)
                self.assertEqual(accepted.json()["status"], "accepted")

                resolved = client.get("/api/source-conflicts?entityType=bill&entityId=bill-a")
                self.assertEqual(resolved.status_code, 200)
                self.assertEqual(resolved.json()["conflicts"][0]["status"], "resolved")

                reviewed = client.patch(f"/api/source-conflicts/{conflict_id}", json={"status": "reviewed", "reviewerNote": "checked"})
                self.assertEqual(reviewed.status_code, 200)
                self.assertEqual(reviewed.json()["status"], "reviewed")
                self.assertEqual(reviewed.json()["reviewerNote"], "checked")
            finally:
                for name, value in old_env.items():
                    if value is None:
                        os.environ.pop(name, None)
                    else:
                        os.environ[name] = value

    def test_document_model_taxonomy_historical_and_export_endpoints(self) -> None:
        try:
            with warnings.catch_warnings():
                warnings.filterwarnings("ignore", message="Using `httpx` with `starlette.testclient`.*")
                from fastapi.testclient import TestClient
            from parliament_workbench.api import create_app
        except Exception as error:
            self.skipTest(f"FastAPI dependencies not installed: {error}")
        with tempfile.TemporaryDirectory() as tmp:
            env_names = ["WORKBENCH_DATA_DIR", "WORKBENCH_SKIP_DOTENV", "DATABASE_URL"]
            old_env = {name: os.environ.get(name) for name in env_names}
            os.environ["WORKBENCH_DATA_DIR"] = tmp
            os.environ["WORKBENCH_SKIP_DOTENV"] = "1"
            os.environ.pop("DATABASE_URL", None)
            try:
                client = TestClient(create_app())

                intelligence = client.get("/api/documents/doc-a/text-intelligence")
                self.assertEqual(intelligence.status_code, 200)
                self.assertEqual(intelligence.json()["parse"]["quality"], "missing_text")

                correction = client.post(
                    "/api/documents/doc-a/corrections",
                    json={"correctedText": "Articol unic. Text corectat.", "evidenceQuote": "Articol unic", "sourceDocumentId": "doc-a"},
                )
                self.assertEqual(correction.status_code, 200)
                self.assertEqual(correction.json()["documentId"], "doc-a")

                parsed = client.post("/api/documents/doc-a/parse", json={"correctionId": correction.json()["id"]})
                self.assertEqual(parsed.status_code, 200)
                self.assertEqual(parsed.json()["correctionId"], correction.json()["id"])

                presets = client.get("/api/model/presets")
                self.assertEqual(presets.status_code, 200)
                self.assertGreaterEqual(len(presets.json()["presets"]), 3)

                model_run = client.post(
                    "/api/model/runs",
                    json={"presetId": "bill_dossier_audit", "entityType": "bill", "entityId": "bill-a", "execute": False},
                )
                self.assertEqual(model_run.status_code, 200)
                self.assertEqual(model_run.json()["run"]["status"], "preview")

                evaluation = client.post("/api/model/gold-set/evaluate", json={})
                self.assertEqual(evaluation.status_code, 200)
                self.assertIn("metrics", evaluation.json())

                taxonomy = client.get("/api/taxonomy")
                self.assertEqual(taxonomy.status_code, 200)
                topic_code = taxonomy.json()["topics"][0]["code"]
                label = client.post(
                    "/api/taxonomy/labels",
                    json={
                        "entityType": "bill",
                        "entityId": "bill-a",
                        "topicCode": topic_code,
                        "stanceCode": "technical_admin",
                        "evidenceQuote": "Text oficial",
                        "sourceId": "doc-a",
                        "status": "accepted",
                    },
                )
                self.assertEqual(label.status_code, 200)

                profile = client.get("/api/analytics/evidence-profile?entityType=bill&entityId=bill-a")
                self.assertEqual(profile.status_code, 200)
                self.assertEqual(profile.json()["coverage"]["reviewedLabelCount"], 1)

                historical = client.post(
                    "/api/imports/historical-year/run",
                    json={"year": 1992, "chamber": "deputies", "sourceType": "projects", "limit": 10, "includeText": True, "includeOcr": True, "execute": False},
                )
                self.assertEqual(historical.status_code, 200)
                self.assertFalse(historical.json()["result"]["executed"])

                diff = client.get("/api/bills/bill-a/document-diff")
                self.assertEqual(diff.status_code, 200)
                self.assertIn("warnings", diff.json())

                migration = client.get("/api/migrate/preview")
                self.assertEqual(migration.status_code, 200)
                export = client.post("/api/migrate/export", json={"title": "Test export"})
                self.assertEqual(export.status_code, 200)
                self.assertTrue(Path(export.json()["files"][0]).exists())

                queues = client.get("/api/review-queues")
                self.assertEqual(queues.status_code, 200)
                self.assertGreaterEqual(queues.json()["total"], 2)

                summary = client.get("/api/review-queues/summary")
                self.assertEqual(summary.status_code, 200)
                self.assertIn("byQueue", summary.json())

                transition = client.post(
                    f"/api/review-queues/text_corrections/{correction.json()['id']}/transition",
                    json={"status": "reviewed", "reviewer": "api-test", "reviewerNote": "checked"},
                )
                self.assertEqual(transition.status_code, 200)
                self.assertEqual(transition.json()["status"], "reviewed")

                preview = client.post(f"/api/review-queues/text_corrections/{correction.json()['id']}/proposal-preview")
                self.assertEqual(preview.status_code, 200)
                self.assertIn("proposalId", preview.json())
            finally:
                for name, value in old_env.items():
                    if value is None:
                        os.environ.pop(name, None)
                    else:
                        os.environ[name] = value


if __name__ == "__main__":
    unittest.main()
