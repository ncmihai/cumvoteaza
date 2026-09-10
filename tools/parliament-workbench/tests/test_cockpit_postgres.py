"""Run explicitly with COCKPIT_TEST_POSTGRES=1; creates and drops only its own test database."""
from __future__ import annotations

import os
from pathlib import Path
import sys
import tempfile
import unittest
import uuid
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/"src"))

import psycopg
from psycopg import sql
from psycopg.rows import dict_row
from parliament_workbench.cockpit_workspace import local_url, apply_changes, validate_baseline
from parliament_workbench.cockpit_publish import commit_release
from parliament_workbench.cockpit_store import digest, encode, CockpitStore
from parliament_workbench.config import WorkbenchConfig
from parliament_workbench.cockpit_workspace import review_changes


@unittest.skipUnless(os.environ.get("COCKPIT_TEST_POSTGRES") == "1", "Requires explicit isolated local PostgreSQL integration run")
class PostgresReleaseTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.name="cockpit_test_"+uuid.uuid4().hex[:12]
        cls.url=local_url("working").rsplit("/",1)[0]+"/"+cls.name
        with psycopg.connect(local_url("working"), autocommit=True) as db:
            db.execute(sql.SQL("create database {}").format(sql.Identifier(cls.name)))
        with psycopg.connect(cls.url) as db:
            db.execute("""create table parents(id text primary key,title text not null);
                create table children(id text primary key,parent_id text not null references parents(id),name text);
                create table cockpit_release_receipts(id text primary key,manifest_hash text not null,manifest jsonb not null,published_at timestamptz default now());""")

    @classmethod
    def tearDownClass(cls):
        with psycopg.connect(local_url("working"),autocommit=True) as db:
            db.execute(sql.SQL("drop database {} with (force)").format(sql.Identifier(cls.name)))

    def connect(self): return psycopg.connect(self.url,row_factory=dict_row)

    def change(self, table, before, after):
        row=before or after
        return {"table_name":table,"record_id":encode([row["id"]]),"before":before,"after":after}

    def test_dependency_order_and_no_unselected_rows(self):
        changes=[self.change("children",None,{"id":"c1","parent_id":"p1","name":"child"}),
                 self.change("parents",None,{"id":"p1","title":"selected"})]
        with self.connect() as db: apply_changes(db,changes)
        with self.connect() as db:
            self.assertEqual(db.execute("select count(*) as n from parents").fetchone()["n"],1)
            self.assertEqual(db.execute("select parent_id from children where id='c1'").fetchone()["parent_id"],"p1")

    def test_failed_dependency_rolls_back_entire_release(self):
        changes=[self.change("parents",None,{"id":"p2","title":"must roll back"}),
                 self.change("children",None,{"id":"c2","parent_id":"absent","name":"invalid"})]
        with self.assertRaises(psycopg.errors.ForeignKeyViolation):
            with self.connect() as db: apply_changes(db,changes)
        with self.connect() as db: self.assertIsNone(db.execute("select * from parents where id='p2'").fetchone())

    def test_preflight_is_read_only_and_detects_conflicts(self):
        row = {"id":"preflight", "title":"canonical"}
        with self.connect() as db: apply_changes(db, [self.change("parents", None, row)])
        with self.connect() as db:
            db.execute("set transaction read only")
            validate_baseline(db, [self.change("parents", row, {**row,"title":"draft"})])
            self.assertEqual(db.execute("select title from parents where id='preflight'").fetchone()["title"], "canonical")
            with self.assertRaisesRegex(ValueError, "Baseline conflict"):
                validate_baseline(db, [self.change("parents", {**row,"title":"stale"}, row)])

    def test_selected_change_chain_requires_every_prerequisite(self):
        original={"id":"chain","title":"baseline"}; imported={**original,"title":"official change"}; corrected={**original,"title":"reviewed correction"}
        with self.connect() as db: apply_changes(db,[self.change("parents",None,original)])
        source=self.change("parents",original,imported); correction=self.change("parents",imported,corrected)
        with self.assertRaisesRegex(ValueError,"unselected prerequisite"):
            with self.connect() as db: apply_changes(db,[correction])
        with self.connect() as db: apply_changes(db,[correction,source])
        with self.connect() as db: self.assertEqual(db.execute("select title from parents where id='chain'").fetchone()["title"],"reviewed correction")

    def test_selected_changes_cannot_fork_one_baseline(self):
        original={"id":"fork","title":"baseline"}
        with self.connect() as db: apply_changes(db,[self.change("parents",None,original)])
        with self.assertRaisesRegex(ValueError,"Conflicting selected changes"):
            with self.connect() as db: apply_changes(db,[self.change("parents",original,{**original,"title":"one"}),self.change("parents",original,{**original,"title":"two"})])
        with self.connect() as db: self.assertEqual(db.execute("select title from parents where id='fork'").fetchone()["title"],"baseline")

    def test_working_correction_review_is_replayable(self):
        original={"id":"review-working","title":"source"}; corrected={**original,"title":"reviewed"}
        with self.connect() as db: apply_changes(db,[self.change("parents",None,original)])
        with tempfile.TemporaryDirectory() as directory:
            config=WorkbenchConfig(None,"http://localhost:11434","test",Path(directory),"127.0.0.1",8787)
            store=CockpitStore(config)
            identifier=store.change("manual","parents",encode([original["id"]]),original,corrected,"manual",[{"quote":"source passage"}])
            with patch("parliament_workbench.cockpit_workspace.connect",side_effect=self.connect):
                review_changes(store,[identifier],"accepted")
                review_changes(store,[identifier],"accepted")
            with self.connect() as db: self.assertEqual(db.execute("select title from parents where id='review-working'").fetchone()["title"],"reviewed")
            self.assertEqual(store.changes()[0]["status"],"accepted")

    def test_stale_baseline_does_not_overwrite(self):
        with self.connect() as db: db.execute("insert into parents values ('conflict','new canonical')")
        change=self.change("parents",{"id":"conflict","title":"old baseline"},{"id":"conflict","title":"draft"})
        with self.assertRaisesRegex(ValueError,"Baseline conflict"):
            with self.connect() as db: apply_changes(db,[change])
        with self.connect() as db: self.assertEqual(db.execute("select title from parents where id='conflict'").fetchone()["title"],"new canonical")

    def test_receipt_is_idempotent_after_lost_response(self):
        manifest=[self.change("parents",None,{"id":"receipt","title":"published once"})]
        hash=digest(manifest)
        with self.connect() as db: commit_release(db,"release-test",hash,manifest)
        with self.connect() as db: replay=commit_release(db,"release-test",hash,manifest)
        self.assertEqual(replay,manifest)
        with self.connect() as db: self.assertEqual(db.execute("select count(*) as n from cockpit_release_receipts").fetchone()["n"],1)
        with self.assertRaises(ValueError):
            with self.connect() as db: commit_release(db,"release-test","changed",manifest)

    def test_reversal_checks_for_subsequent_edits(self):
        before={"id":"reverse","title":"original"}; after={"id":"reverse","title":"release"}
        with self.connect() as db:
            apply_changes(db,[self.change("parents",None,before)])
            apply_changes(db,[self.change("parents",before,after)])
        with self.connect() as db: apply_changes(db,[self.change("parents",after,before)])
        with self.connect() as db: self.assertEqual(db.execute("select title from parents where id='reverse'").fetchone()["title"],"original")
        with self.assertRaises(ValueError):
            with self.connect() as db: apply_changes(db,[self.change("parents",after,before)])

    def test_explanation_review_is_audited_and_cannot_approve_missing_output(self):
        from parliament_workbench.vote_explanations import review_explanation, list_explanations
        with self.connect() as db:
            db.execute("create table votes(id text primary key,title text)")
            migration=Path(__file__).resolve().parents[3]/"packages/db/drizzle/0017_vote_explanations.sql"
            for statement in migration.read_text().split("--> statement-breakpoint"):
                db.execute(statement)
            db.execute("insert into votes values('review-vote','A test motion')")
            db.execute("""insert into vote_explanations(id,vote_id,input_hash,prompt_version,model,context,output,status)
              values('explanation','review-vote','hash','v1','test','{}','{"ro":"Exemplu","en":"Example"}','unreviewed'),
              ('incomplete','review-vote','hash2','v1','test','{}',null,'failed')""")
        with self.assertRaises(ValueError): review_explanation(self.url,"incomplete","reviewed","Checked sources")
        review_explanation(self.url,"explanation","hidden","Evidence needs correction")
        self.assertEqual(next(r for r in list_explanations(self.url)["items"] if r["id"]=="explanation")["status"],"hidden")
        review_explanation(self.url,"explanation","reviewed","Verified both translations")
        with self.connect() as db:
            self.assertEqual(db.execute("select count(*) as n from vote_explanation_reviews").fetchone()["n"],2)
            self.assertEqual(db.execute("select status from vote_explanations where id='explanation'").fetchone()["status"],"reviewed")

if __name__ == "__main__": unittest.main()
