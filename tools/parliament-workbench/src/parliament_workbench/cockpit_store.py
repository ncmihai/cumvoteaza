"""Transactional cockpit state. Source data lives in the isolated PostgreSQL workspace."""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import sqlite3
import uuid

from .state import WorkbenchState


def stamp():
    return datetime.now(timezone.utc).isoformat()


def encode(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, default=str)


def digest(value):
    return hashlib.sha256(encode(value).encode()).hexdigest()


SCHEMA = """
create table if not exists cockpit_objects (
 id text primary key, kind text not null, payload text not null,
 created_at text not null, updated_at text not null
);
create index if not exists cockpit_objects_kind on cockpit_objects(kind, updated_at);
create table if not exists cockpit_jobs (
 id text primary key, kind text not null, status text not null, payload text not null,
 checkpoint integer not null default 0, result text, error text,
 cancel_requested integer not null default 0, created_at text not null, updated_at text not null
);
create table if not exists cockpit_events (
 seq integer primary key autoincrement, job_id text not null,
 created_at text not null, level text not null, message text not null
);
create table if not exists cockpit_changes (
 id text primary key, batch_id text not null, table_name text not null, record_id text not null,
 before_json text, after_json text, origin text not null, evidence text not null,
 status text not null default 'pending', reviewed_at text, created_at text not null,
 unique(batch_id, table_name, record_id)
);
create table if not exists cockpit_overrides (
 table_name text not null, record_id text not null, fields_json text not null,
 primary key(table_name, record_id)
);
"""


class CockpitStore:
    def __init__(self, config):
        self.config = config
        self.state = WorkbenchState(config)
        self.state.initialize()
        with self.connect() as db:
            db.executescript(SCHEMA)

    def connect(self):
        db = self.state.connect()
        db.execute("pragma busy_timeout = 10000")
        db.execute("pragma journal_mode = wal")
        return db

    def put(self, kind, payload, identifier=None):
        identifier = identifier or f"{kind}-{uuid.uuid4().hex[:16]}"
        now = stamp()
        with self.connect() as db:
            previous = db.execute("select kind from cockpit_objects where id=?", (identifier,)).fetchone()
            if previous and previous[0] != kind:
                raise ValueError("Object kind cannot change")
            db.execute("""insert into cockpit_objects values (?,?,?,?,?)
                on conflict(id) do update set payload=excluded.payload, updated_at=excluded.updated_at""",
                (identifier, kind, encode(payload), now, now))
        return self.get(identifier)

    def get(self, identifier):
        with self.connect() as db:
            row = db.execute("select * from cockpit_objects where id=?", (identifier,)).fetchone()
        if row is None:
            raise KeyError(identifier)
        return {**json.loads(row["payload"]), "id": row["id"], "kind": row["kind"],
                "createdAt": row["created_at"], "updatedAt": row["updated_at"]}

    def objects(self, kind):
        with self.connect() as db:
            ids = db.execute("select id from cockpit_objects where kind=? order by updated_at desc", (kind,)).fetchall()
        return [self.get(row[0]) for row in ids]

    def enqueue(self, kind, payload):
        identifier = f"run-{uuid.uuid4().hex[:16]}"
        with self.connect() as db:
            db.execute("insert into cockpit_jobs(id,kind,status,payload,created_at,updated_at) values (?,?,'queued',?,?,?)",
                       (identifier, kind, encode(payload), stamp(), stamp()))
        return self.job(identifier)

    def job(self, identifier):
        with self.connect() as db:
            row = db.execute("select * from cockpit_jobs where id=?", (identifier,)).fetchone()
        if row is None:
            raise KeyError(identifier)
        out = dict(row)
        out["payload"] = json.loads(out["payload"])
        out["result"] = json.loads(out["result"]) if out["result"] else None
        return out

    def jobs(self):
        with self.connect() as db:
            ids = db.execute("select id from cockpit_jobs order by created_at desc limit 100").fetchall()
        return [self.job(row[0]) for row in ids]

    def claim(self):
        with self.connect() as db:
            db.execute("begin immediate")
            row = db.execute("select id from cockpit_jobs where status='queued' and cancel_requested=0 order by created_at limit 1").fetchone()
            if row:
                db.execute("update cockpit_jobs set status='running',updated_at=? where id=?", (stamp(), row[0]))
        return self.job(row[0]) if row else None

    def update_job(self, identifier, **fields):
        allowed = {"status", "checkpoint", "result", "error", "cancel_requested"}
        if not fields or not set(fields) <= allowed:
            raise ValueError("Invalid job update")
        if "result" in fields:
            fields["result"] = encode(fields["result"])
        fields["updated_at"] = stamp()
        with self.connect() as db:
            db.execute("update cockpit_jobs set " + ",".join(f"{key}=?" for key in fields) + " where id=?",
                       (*fields.values(), identifier))
        return self.job(identifier)

    def cancel(self, identifier):
        job = self.job(identifier)
        if job["status"] not in {"queued", "running", "interrupted"}:
            raise ValueError("Only an active job can be canceled")
        return self.update_job(identifier, cancel_requested=1,
                               status="canceling" if job["status"] == "running" else "canceled")

    def retry(self, identifier):
        job = self.job(identifier)
        if job["status"] not in {"failed", "interrupted", "canceled"}:
            raise ValueError("Only failed, interrupted or canceled jobs can resume")
        with self.connect() as db:
            if db.execute("select 1 from cockpit_changes where batch_id=? and status in ('accepted','published')", (identifier,)).fetchone():
                raise ValueError("This batch already has reviewed changes. Start a new import to preserve that review.")
        return self.update_job(identifier, status="queued", cancel_requested=0, error=None)

    def event(self, job_id, message, level="info"):
        # Child processes receive no production credentials; bound individual log lines.
        with self.connect() as db:
            db.execute("insert into cockpit_events(job_id,created_at,level,message) values (?,?,?,?)",
                       (job_id, stamp(), level, message[:12000]))

    def events(self, job_id, after=0, *, tail=False):
        with self.connect() as db:
            query = "select * from cockpit_events where job_id=? and seq>? order by seq limit 500"
            if tail:
                query = "select * from (select * from cockpit_events where job_id=? and seq>? order by seq desc limit 500) order by seq"
            return [dict(row) for row in db.execute(query, (job_id, after))]

    def changes(self, batch_id=None):
        with self.connect() as db:
            rows = db.execute("select * from cockpit_changes where status != 'derived'" + (" and batch_id=?" if batch_id else "") + " order by created_at desc",
                              (batch_id,) if batch_id else ()).fetchall()
        return [{**dict(row), "before": json.loads(row["before_json"]) if row["before_json"] else None,
                 "after": json.loads(row["after_json"]) if row["after_json"] else None,
                 "evidence": json.loads(row["evidence"])} for row in rows]

    def change(self, batch, table, record, before, after, origin="official", evidence=None, conflict=False):
        identifier = "change-" + digest([batch, table, record])[:24]
        with self.connect() as db:
            db.execute("""insert into cockpit_changes
                (id,batch_id,table_name,record_id,before_json,after_json,origin,evidence,status,created_at)
                values (?,?,?,?,?,?,?,?,?,?) on conflict(batch_id,table_name,record_id) do update set
                  after_json=excluded.after_json,evidence=excluded.evidence,status=excluded.status
                  where cockpit_changes.status in ('pending','conflict')""",
                (identifier, batch, table, record, encode(before) if before is not None else None,
                 encode(after) if after is not None else None, origin, encode(evidence or []),
                 "conflict" if conflict else "pending", stamp()))
        return identifier

    def review(self, identifiers, decision):
        if decision not in {"accepted", "rejected", "pending"} or not identifiers:
            raise ValueError("Select changes and a valid review decision")
        with self.connect() as db:
            db.execute("begin immediate")
            for identifier in identifiers:
                row = db.execute("select * from cockpit_changes where id=?", (identifier,)).fetchone()
                if not row:
                    raise KeyError(identifier)
                active = db.execute("select status from cockpit_jobs where id=?", (row["batch_id"],)).fetchone()
                if active and active[0] in {"running", "queued", "canceling"}:
                    raise ValueError("Wait for this import to stop before reviewing its changes")
                if row["status"] in {"published", "derived"}:
                    raise ValueError("Published changes require a reversal release")
                if row["origin"] == "manual" and row["status"] == "accepted" and decision != "accepted":
                    raise ValueError("This correction is active in working data. Propose a new correction to replace it.")
                if decision == "accepted":
                    if row["status"] == "conflict":
                        raise ValueError("Resolve the conflicting fields before accepting")
                    if row["origin"] == "ai" and len(identifiers) != 1:
                        raise ValueError("AI suggestions require individual review")
                    if not json.loads(row["evidence"]):
                        raise ValueError("Source evidence is required")
                    if row["origin"] == "manual" and row["after_json"]:
                        before = json.loads(row["before_json"] or "{}")
                        after = json.loads(row["after_json"])
                        fields = {k: v for k, v in after.items() if before.get(k) != v}
                        old = db.execute("select fields_json from cockpit_overrides where table_name=? and record_id=?",
                                         (row["table_name"], row["record_id"])).fetchone()
                        db.execute("insert or replace into cockpit_overrides values (?,?,?)",
                                   (row["table_name"], row["record_id"], encode({**(json.loads(old[0]) if old else {}), **fields})))
                db.execute("update cockpit_changes set status=?,reviewed_at=? where id=?", (decision, stamp(), identifier))
        return {"reviewed": len(identifiers), "decision": decision}


    def resolve_conflict(self, identifier, choice, reason):
        if choice not in {"keep_correction","use_source"} or len(reason.strip()) < 10:
            raise ValueError("Choose a resolution and explain why")
        with self.connect() as db:
            db.execute("begin immediate")
            row=db.execute("select * from cockpit_changes where id=?",(identifier,)).fetchone()
            if not row or row["status"] != "conflict":
                raise ValueError("Select an unresolved source conflict")
            active=db.execute("select status from cockpit_jobs where id=?",(row["batch_id"],)).fetchone()
            if active and active[0] in {"queued","running","canceling"}:
                raise ValueError("Wait for the import to stop before resolving conflicts")
            before=json.loads(row["before_json"]) if row["before_json"] else None
            source=json.loads(row["after_json"]) if row["after_json"] else None
            override=db.execute("select fields_json from cockpit_overrides where table_name=? and record_id=?",(row["table_name"],row["record_id"])).fetchone()
            fields=json.loads(override[0]) if override else {}
            if not fields or not (source or before):
                raise ValueError("The protected correction is no longer available")
            if choice == "use_source" and source is None:
                raise ValueError("Review record deletion separately; this action replaces corrected fields only")
            kept={**(source or before),**fields}
            evidence=json.loads(row["evidence"])+[{"type":"conflict_resolution","choice":choice,"reason":reason,"sourceValues":source}]
            from .cockpit_workspace import semantic
            db.execute("update cockpit_changes set after_json=?,evidence=?,status=? where id=?",
                (encode(kept),encode(evidence),"rejected" if semantic(before)==semantic(kept) else "pending",identifier))
            correction=None
            if choice == "use_source" and semantic(kept)!=semantic(source):
                batch="resolution-"+identifier
                correction="change-"+digest([batch,row["table_name"],row["record_id"]])[:24]
                db.execute("""insert into cockpit_changes(id,batch_id,table_name,record_id,before_json,after_json,origin,evidence,status,created_at)
                    values (?,?,?,?,?,?,'manual',?,'pending',?)""",(correction,batch,row["table_name"],row["record_id"],encode(kept),encode(source),encode(evidence),stamp()))
        return {"resolved":identifier,"correctionId":correction,"reviewRequired":True}
