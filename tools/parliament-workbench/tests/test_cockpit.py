from __future__ import annotations

from dataclasses import replace
import json
import os
from pathlib import Path
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from parliament_workbench.config import WorkbenchConfig
from parliament_workbench.cockpit_store import CockpitStore, digest, encode
from parliament_workbench.cockpit_runtime import Worker, Canceled, child_environment, recipe, seed_routine_recipes
from parliament_workbench.cockpit_workspace import local_url
from parliament_workbench.cockpit_analysis import compare_methods, seed_profiles, save_profile, validate_result


class CockpitTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.config = WorkbenchConfig(database_url=None, ollama_base_url="http://127.0.0.1:11434", model="qwen3:8b",
                                      data_dir=Path(self.tmp.name), api_host="127.0.0.1", api_port=8787)
        self.store = CockpitStore(self.config)

    def tearDown(self):
        self.tmp.cleanup()

    def test_proposal_migration_has_one_authority_and_atomic_events(self):
        from parliament_workbench.proposals import create_proposal, get_proposal, update_proposal, list_proposals
        from parliament_workbench.storage import write_jsonl
        from parliament_workbench.state import WorkbenchState
        original = {"id":"legacy", "status":"draft", "proposalType":"review_note", "entityType":"bill",
                    "entityId":"bill-a", "explanation":"original", "createdAt":"2026-01-01", "updatedAt":"2026-01-01"}
        path = self.config.proposals_dir / "proposals.jsonl"
        write_jsonl(path, [original])
        original_bytes = path.read_bytes()
        self.assertEqual(get_proposal(self.config, "legacy")["explanation"], "original")
        update_proposal(self.config, "legacy", {"explanation":"corrected"})
        self.assertEqual(path.read_bytes(), original_bytes)
        self.assertEqual((path.parent / "migration-backups" / path.name).read_bytes(), original_bytes)
        write_jsonl(path, [{**original, "explanation":"stale external edit", "updatedAt":"2099-01-01"}])
        self.assertEqual(get_proposal(self.config, "legacy")["explanation"], "corrected")
        failures = []
        def create(index):
            try:
                create_proposal(self.config, {**original, "id":f"parallel-{index}"})
            except Exception as error:
                failures.append(error)
        threads = [threading.Thread(target=create, args=(i,)) for i in range(8)]
        for thread in threads: thread.start()
        for thread in threads: thread.join()
        self.assertFalse(failures)
        self.assertEqual(len(list_proposals(self.config)), 9)
        with WorkbenchState(self.config).connect() as db:
            self.assertEqual(db.execute("select count(*) from patch_events").fetchone()[0], 10)

    def test_evaluation_excludes_teaching_and_stale_results(self):
        from parliament_workbench.cockpit_analysis import evaluation, current_results
        from psycopg import OperationalError
        profile = self.store.put("profile", {"task":"public_sector", "exampleSnapshots":[{"familyId":"training"}]})
        for family in ["training","fresh","stale","failed"]:
            self.store.put("example", {"familyId":family,"billId":family,"task":"public_sector","status":"accepted",
                "split":"holdout","labels":["a"]})
            self.store.put("result", {"familyId":family,"billId":family,"profileId":profile["id"],
                "status":"incomplete" if family == "failed" else "pending", "inputHash":digest({"current":family != "stale"}),
                "output":None if family == "failed" else {"labels":["a"],"evidence":[{"quote":"evidence"}],"relevance":"direct"},
                "rawOutput":{"evidence":[{"quote":"unverified"}]}})
        with patch("parliament_workbench.cockpit_analysis.context_for", return_value={"current":True}):
            metrics = evaluation(self.store, profile["id"])
            self.assertEqual(metrics["heldOut"],3)
            self.assertEqual(metrics["attempted"],2)
            self.assertEqual(metrics["compared"],1)
            self.assertEqual(metrics["coverage"],1/3)
            self.assertEqual(metrics["citationValidity"],.5)
            self.assertIsNone(metrics["directionalAgreement"])
            self.assertEqual(metrics["review"]["total"],4)
            self.assertEqual(metrics["review"]["counts"]["stale"],1)
            self.assertEqual(metrics["review"]["needsReview"],3)
            self.assertFalse(metrics["review"]["humanReferenceRequired"])
            self.assertEqual(next(r for r in current_results(self.store) if r["billId"] == "stale")["status"],"stale")
        with patch("parliament_workbench.cockpit_analysis.context_for", side_effect=OperationalError("offline")):
            metrics = evaluation(self.store, profile["id"])
            self.assertEqual(metrics["attempted"],0)
            self.assertEqual(metrics["review"]["freshnessUnknown"],4)
            rows = current_results(self.store, profile["id"])
            self.assertTrue(all(row["freshness"] == "unknown" for row in rows))
            self.assertTrue(all(row["status"] != "stale" for row in rows))

    def test_event_tail_preserves_latest_progress_and_cursor(self):
        job = self.store.enqueue("import",{})
        with self.store.connect() as db:
            db.executemany("insert into cockpit_events(job_id,created_at,level,message) values (?,?,'info',?)",
                           [(job["id"],"2026-09-09",str(i)) for i in range(520)])
        first = self.store.events(job["id"])
        tail = self.store.events(job["id"],tail=True)
        self.assertEqual(first[-1]["message"],"499")
        self.assertEqual(tail[0]["message"],"20")
        self.assertEqual(tail[-1]["message"],"519")
        self.assertEqual(len(self.store.events(job["id"],after=first[-1]["seq"])),20)

    def test_cache_outbox_retries_without_republishing(self):
        from parliament_workbench.cockpit_publish import refresh_cache
        release=self.store.put("release",{"status":"cache_pending","readModelsPending":True})
        with patch("parliament_workbench.cockpit_publish.refresh_public_read_models",side_effect=RuntimeError("refresh failed")), patch("parliament_workbench.cockpit_publish.httpx.get") as request:
            result=refresh_cache(self.store,release["id"],"explicit-target")
            self.assertTrue(result["readModelsPending"])
            request.assert_not_called()
        with patch("parliament_workbench.cockpit_publish.refresh_public_read_models") as refresh, patch("parliament_workbench.cockpit_publish.httpx.get",side_effect=RuntimeError("cache unavailable")):
            result=refresh_cache(self.store,release["id"],"explicit-target")
            refresh.assert_called_once()
            self.assertFalse(result["readModelsPending"])
            self.assertEqual(result["status"],"cache_pending")
        with patch("parliament_workbench.cockpit_publish.refresh_public_read_models") as refresh, patch("parliament_workbench.cockpit_publish.httpx.get") as request:
            request.return_value.json.return_value={"mode":"revalidate-only"}
            result=refresh_cache(self.store,release["id"],"explicit-target")
            refresh.assert_not_called()
            self.assertEqual(result["status"],"published")

    def test_analysis_context_includes_verified_chamber_alias(self):
        from parliament_workbench.cockpit_analysis import context_for
        import copy
        documents=[{"id":"official-doc","text_excerpt":"A public service is established."}]
        original={"bill":{"id":"bill-deputies","identifiers":{"deputies":"PL-x 38/2025"}},
                  "documents":[],"votes":[],"procedureSteps":[],"healthReviews":[],"sponsors":[]}
        senate={"bill":{"id":"bill-senate","identifiers":{"deputies":"PL-x 38/2025","senate":"L633/2024"}},
                "documents":documents,"votes":[{"id":"senate-vote"}],"procedureSteps":[],"healthReviews":[],"sponsors":[]}
        with patch("parliament_workbench.cockpit_analysis.ReadOnlyDb") as reader:
            reader.return_value.bill_audit_context.side_effect=lambda identifier:copy.deepcopy(original if identifier=="bill-deputies" else senate)
            reader.return_value.execute.return_value=[{"id":"bill-senate","identifiers":senate["bill"]["identifiers"]}]
            context=context_for(self.config,"bill-deputies")
        self.assertEqual(context["familyBillIds"],["bill-deputies","bill-senate"])
        self.assertEqual(context["documents"],documents)
        self.assertEqual(context["votes"],[{"id":"senate-vote"}])
        self.assertNotIn("sponsors",context)

    def test_independent_source_retry_skips_successful_ranges(self):
        job=self.store.enqueue("import",{"mode":"discover","categories":["bills"]})
        worker=Worker(self.config,None)
        plan={"stages":[{"label":"source one","command":["npm","run","source-one"]},
                        {"label":"source two","command":["npm","run","source-two"]}]}
        calls=[]
        def first_run(key,command):
            calls.append(command[2])
            if command[2]=="source-one": raise RuntimeError("source unavailable")
        with patch("parliament_workbench.cockpit_runtime.recipe",return_value=plan), patch("parliament_workbench.cockpit_runtime.workspace.snapshot",return_value={}), patch("parliament_workbench.cockpit_runtime.workspace.capture_changes",return_value={}):
            with patch.object(worker,"command",side_effect=first_run):
                with self.assertRaisesRegex(RuntimeError,"1 source ranges failed"): worker.execute(job)
            self.assertEqual(calls,["source-one","source-two"])
            self.store.update_job(job["id"],status="failed")
            retry=self.store.retry(job["id"])
            with patch.object(worker,"command") as command:
                worker.execute(retry)
                self.assertEqual(command.call_count,1)
                self.assertEqual(command.call_args.args[1][2],"source-one")
            self.assertEqual(self.store.job(job["id"])["checkpoint"],2)

    def test_reversal_collapses_the_whole_published_chain(self):
        from parliament_workbench.cockpit_publish import reversal
        original={"id":"a","value":0}; intermediate={"id":"a","value":1}; final={"id":"a","value":2}
        items=[{"table_name":"bills","record_id":encode(["a"]),"before":original,"after":intermediate,"evidence":[{"quote":"first"}]},
               {"table_name":"bills","record_id":encode(["a"]),"before":intermediate,"after":final,"evidence":[{"quote":"second"}]}]
        release=self.store.put("release",{"status":"published","publishedManifest":items})
        result=reversal(self.store,release["id"])
        self.assertEqual(len(result["changes"]),1)
        change=self.store.changes()[0]
        self.assertEqual(change["before"],final)
        self.assertEqual(change["after"],original)
        self.assertEqual(change["status"],"pending")
        self.assertEqual(len(change["evidence"]),2)

    def test_stale_ai_evidence_blocks_release_validation(self):
        from parliament_workbench.cockpit_publish import validate_manifest
        result=self.store.put("result",{"billId":"bill-a","status":"accepted","inputHash":digest({"version":1})})
        identifier=self.store.change(result["id"],"cockpit_topic_labels",encode(["topic"]),None,{"id":"topic"},"ai",[{"quote":"evidence"}])
        self.store.review([identifier],"accepted")
        change=self.store.changes()[0]
        manifest=[{key:change[key] for key in ("id","table_name","record_id","before","after","origin","evidence")}]
        release=self.store.put("release",{"status":"preview_ready","manifest":manifest,"manifestHash":digest(manifest)})
        with patch("parliament_workbench.cockpit_analysis.context_for",return_value={"version":2}):
            with self.assertRaisesRegex(ValueError,"became stale"): validate_manifest(self.store,release)

    def test_restart_does_not_signal_a_reused_process_id(self):
        worker=Worker(self.config,None)
        self.store.put("child_process",{"jobId":"old","pid":12345,"identity":"old-start","status":"running"})
        with patch("parliament_workbench.cockpit_runtime.process_identity",return_value="different-start"), patch("parliament_workbench.cockpit_runtime.os.killpg") as kill:
            worker.recover_children()
            kill.assert_not_called()
        self.assertEqual(self.store.objects("child_process")[0]["status"],"recovered")

    def test_conflict_resolution_keeps_other_source_updates_reviewable(self):
        before={"id":"b","title":"corrected","status":"old"}
        correction=self.store.change("manual","bills",encode(["b"]),{**before,"title":"original"},before,"manual",[{"quote":"proof"}])
        self.store.review([correction],"accepted")
        conflict=self.store.change("import","bills",encode(["b"]),before,{**before,"title":"official","status":"new"},evidence=[{"quote":"source"}],conflict=True)
        result=self.store.resolve_conflict(conflict,"use_source","The updated source establishes this value")
        changes={c["id"]:c for c in self.store.changes()}
        self.assertEqual(changes[conflict]["after"],{**before,"status":"new"})
        self.assertEqual(changes[conflict]["status"],"pending")
        replacement=changes[result["correctionId"]]
        self.assertEqual(replacement["before"],changes[conflict]["after"])
        self.assertEqual(replacement["after"]["title"],"official")
        self.assertEqual(replacement["status"],"pending")
        with self.store.connect() as db:
            self.assertEqual(json.loads(db.execute("select fields_json from cockpit_overrides").fetchone()[0]),{"title":"corrected"})
        with self.assertRaisesRegex(ValueError,"active in working"):
            self.store.review([correction],"rejected")

    def test_production_targets_fail_closed(self):
        for value in ["postgres://u:p@remote.example/cockpit_working", "postgres://u:p@localhost/production",
                      "postgres://u:p@localhost/cockpit_working?host=remote.example"]:
            with self.subTest(value=value), patch.dict(os.environ, WORKBENCH_WORKING_DATABASE_URL=value):
                with self.assertRaises(ValueError):
                    local_url("working")
        with patch.dict(os.environ, DATABASE_URL="production-secret", DIGI_STORAGE_PASSWORD="storage-secret", CRON_SECRET="cron-secret"):
            env = child_environment(self.config)
            self.assertNotIn("DIGI_STORAGE_PASSWORD", env)
            self.assertNotIn("CRON_SECRET", env)
            self.assertIn("/cockpit_working", env["DATABASE_URL"])
            self.assertNotIn("production-secret", json.dumps(env))

    def test_jobs_claim_atomically_and_survive_new_store(self):
        job = self.store.enqueue("import", {"categories":["bills"]})
        claimed = []
        def claim():
            result = CockpitStore(self.config).claim()
            if result: claimed.append(result["id"])
        threads = [threading.Thread(target=claim) for _ in range(4)]
        for thread in threads: thread.start()
        for thread in threads: thread.join()
        self.assertEqual(claimed, [job["id"]])
        self.store.update_job(job["id"], checkpoint=3, status="failed")
        other = CockpitStore(self.config)
        self.assertEqual(other.retry(job["id"])["checkpoint"],3)

    @patch("parliament_workbench.cockpit_runtime.process_identity", return_value="test-child-start")
    def test_cancel_terminates_subprocess(self, identity):
        worker = Worker(self.config, None)
        job = self.store.enqueue("import", {})
        error = []
        import sys
        def run():
            try: worker.command(job["id"], [sys.executable,"-c","import time; print('started', flush=True); time.sleep(30)"])
            except Exception as e: error.append(e)
        thread = threading.Thread(target=run); thread.start()
        deadline = time.monotonic()+5
        while not self.store.events(job["id"]) and time.monotonic()<deadline: time.sleep(.05)
        self.store.cancel(job["id"])
        thread.join(timeout=5)
        self.assertFalse(thread.is_alive())
        self.assertTrue(any(isinstance(e,Canceled) for e in error))

    def test_ai_review_is_individual_and_atomic(self):
        ids = [self.store.change("b", "bills", encode([i]), None, {"id":i}, "ai", [{"quote":"evidence"}]) for i in ["a","b"]]
        with self.assertRaises(ValueError): self.store.review(ids,"accepted")
        self.assertTrue(all(c["status"]=="pending" for c in self.store.changes()))
        self.store.review([ids[0]],"accepted")
        self.assertEqual(sum(c["status"]=="accepted" for c in self.store.changes()),1)

    def test_conflict_and_active_batch_cannot_be_bulk_approved(self):
        job=self.store.enqueue("import",{})
        change=self.store.change(job["id"],"bills",'["a"]',None,{"id":"a"},evidence=[{"source":"official"}])
        with self.assertRaises(ValueError): self.store.review([change],"accepted")
        self.store.update_job(job["id"],status="failed")
        self.store.review([change],"accepted")
        with self.assertRaises(ValueError): self.store.retry(job["id"])
        conflict=self.store.change("other","bills",'["b"]',None,{"id":"b"},evidence=[{"source":"official"}],conflict=True)
        with self.assertRaises(ValueError): self.store.review([conflict],"accepted")

    def test_manual_override_records_only_changed_fields(self):
        c=self.store.change("manual","bills",'["a"]',{"id":"a","title":"old","status":"open"},{"id":"a","title":"correct","status":"open"},"manual",[{"quote":"source"}])
        self.store.review([c],"accepted")
        with self.store.connect() as db: row=db.execute("select fields_json from cockpit_overrides").fetchone()
        self.assertEqual(json.loads(row[0]),{"title":"correct"})

    def test_teaching_versions_are_immutable_and_holdout_is_excluded(self):
        seed_profiles(self.store)
        original=self.store.objects("profile")[0]
        old=digest(original)
        new=save_profile(self.store,{"parentId":original["id"],"name":"Revised definition"})
        self.assertEqual(new["version"],2)
        self.assertEqual(digest(self.store.get(original["id"])),old)
        example=self.store.put("example",{"status":"accepted","split":"holdout","billId":"a"})
        with self.assertRaises(ValueError): save_profile(self.store,{"parentId":original["id"],"examples":[example["id"]]})
        with self.assertRaises(ValueError): save_profile(self.store,{"parentId":original["id"],"axisSummaryEnabled":True,"minimumFamilies":None})

    def test_method_comparison_keeps_versions_and_reports_agreement(self):
        seed_profiles(self.store)
        original=self.store.objects("profile")[0]
        revised=save_profile(self.store,{"parentId":original["id"],"name":"Revised"})
        for profile in (original,revised):
            self.store.put("result",{"profileId":profile["id"],"billId":"bill-a","familyId":"family-a",
                                      "status":"pending","output":{"relevance":"direct","labels":["administration"],"evidence":[],"indicators":[]}})
        comparison=compare_methods(self.store,[original["id"],revised["id"]])
        self.assertEqual(comparison["families"],1)
        self.assertEqual(comparison["pairwise"][0]["relevanceAgreement"],1)
        self.assertEqual(comparison["methods"][1]["version"],2)

    def test_unverified_quotations_fail_and_unknown_baseline_is_unscored(self):
        context={"documents":[{"id":"d","url":"https://www.cdep.ro/a","text_excerpt":"Exact official passage with substantive evidence."}],"votes":[{"id":"v"}]}
        result={"relevance":"direct","labels":[],"evidence":[{"documentId":"d","quote":"invented quote with words"}],"indicators":[]}
        with self.assertRaises(ValueError): validate_result(result,context,{"task":"political"})
        result["evidence"][0]["quote"]="Exact official passage"
        result["indicators"]=[{"indicator":"E1","direction":1,"voteId":"v","motion":"adopt","billVersion":"d","baseline":"missing"}]
        checked=validate_result(result,context,{"task":"political"})
        self.assertEqual(checked["indicators"][0]["direction"],"insufficient_evidence")

    def test_evidence_accepts_only_controlled_romanian_legacy_diacritics(self):
        context={"documents":[{"id":"d","url":"https://www.senat.ro/a","text_excerpt":"Protecţia salariaţilor şi accesul public."}],"votes":[]}
        result={"relevance":"direct","labels":[],"evidence":[{"documentId":"d","quote":"Protecția salariaților și accesul public"}],"indicators":[]}
        checked=validate_result(result,context,{"task":"public_sector","labels":[]})
        self.assertEqual(checked["evidence"][0]["quote"],"Protecţia salariaţilor şi accesul public")

    def test_recipe_dependencies_and_local_only_commands(self):
        plan=recipe({"categories":["text"],"yearFrom":2024,"yearTo":2025})
        self.assertEqual(plan["dependencies"],["bills","documents"])
        self.assertEqual(plan["target"],"local")
        self.assertTrue(all("--dry-run" not in s["command"] for s in plan["stages"]))
        selected=recipe({"categories":["text"],"billIds":["bill-a","bill-a","bill-b"]})
        self.assertEqual(len(selected["stages"]),3)
        self.assertNotIn("ingest:discover",str(selected))
        with self.assertRaises(ValueError): recipe({"categories":["votes"],"billIds":["bill-a"]})
        with self.assertRaises(ValueError): recipe({"categories":["publish"]})
        with self.assertRaises(ValueError): recipe({"categories":["votes"],"chamber":"injected"})

    def test_routine_recipe_seeds_are_complete_and_preserve_operator_edits(self):
        created = seed_routine_recipes(self.store, 2026)
        self.assertEqual(len(created), 4)
        self.assertEqual({item["id"] for item in created}, {
            "recipe-routine-votes", "recipe-routine-bills", "recipe-routine-rosters", "recipe-routine-assets"
        })
        edited = {**self.store.get("recipe-routine-votes"), "name": "My vote workflow"}
        self.store.put("recipe", edited, edited["id"])
        self.assertEqual(seed_routine_recipes(self.store, 2026), [])
        self.assertEqual(self.store.get("recipe-routine-votes")["name"], "My vote workflow")

if __name__ == "__main__": unittest.main()
