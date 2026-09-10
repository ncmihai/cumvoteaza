"""Explicit local PostgreSQL targets, snapshots and optimistic release application."""
from __future__ import annotations

from dataclasses import replace
import json
import os
from pathlib import Path
import subprocess
from urllib.parse import urlparse

import psycopg
from psycopg import sql
from psycopg.rows import dict_row

from .config import repo_root
from .cockpit_store import digest, encode, stamp

DATABASES = {name: f"cockpit_{name}" for name in ("baseline", "working", "release")}
LOCAL_URL = "postgresql://cockpit:cockpit-local@127.0.0.1:55432/"
# Exclude runtime queues, public engagement and derived caches from editorial publication.
EXCLUDED = {"vote_explanations", "vote_explanation_attempts", "vote_explanation_reviews", "__drizzle_migrations", "cockpit_release_receipts", "bill_vote_summaries",
            "member_vote_summaries", "party_vote_summaries", "source_discoveries", "entity_search_index", "member_legislature_activity", "vote_coverage_summaries", "ingestion_runs"}


def local_url(role):
    if role not in DATABASES:
        raise ValueError("Unknown workspace role")
    value = os.environ.get(f"WORKBENCH_{role.upper()}_DATABASE_URL", LOCAL_URL + DATABASES[role])
    parsed = urlparse(value)
    if parsed.hostname not in {"localhost", "127.0.0.1", "::1"} or parsed.path != "/" + DATABASES[role]:
        raise ValueError("Cockpit database targets must be explicit, isolated localhost databases")
    if parsed.query:
        raise ValueError("Local database URL query overrides are not supported")
    return value


def local_config(config, role="working"):
    return replace(config, database_url=local_url(role), enable_writes=False)


def connect(role="working"):
    return psycopg.connect(local_url(role), row_factory=dict_row, connect_timeout=5)


def docker_command(arguments, *, input=None, environment=None):
    command = ["docker", "compose", "-f", str(repo_root() / "compose.cockpit.yml"), "exec", "-T"]
    if environment:
        for key in environment:
            command.extend(["-e", key])
    command += ["cockpit-postgres", *arguments]
    result = subprocess.run(command, input=input, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                            env={**os.environ, **(environment or {})}, timeout=600)
    if result.returncode:
        # pg utilities may echo a DSN; keep credentials out of API responses.
        raise RuntimeError("PostgreSQL snapshot operation failed: " + result.stderr.decode(errors="replace")[-1500:].replace(os.environ.get("DATABASE_URL", "__unset__"), "[canonical database]"))
    return result.stdout


def migrate_local():
    with connect() as db:
        db.autocommit = True
        for name in DATABASES.values():
            if not db.execute("select 1 from pg_database where datname=%s", (name,)).fetchone():
                db.execute(sql.SQL("create database {} ").format(sql.Identifier(name)))
    # Drizzle migrations are append-only; use a local journal without touching the public journal.
    for role in DATABASES:
        with connect(role) as db:
            db.execute("create table if not exists cockpit_local_migrations (name text primary key)")
            existing = db.execute("select to_regclass('public.bills') as name").fetchone()["name"]
            for file in sorted((repo_root() / "packages/db/drizzle").glob("[0-9]*.sql")):
                if db.execute("select 1 from cockpit_local_migrations where name=%s", (file.name,)).fetchone():
                    continue
                # A baseline copied from canonical already contains its canonical schema.
                if not existing or file.name.startswith("0016_"):
                    for statement in file.read_text().split("--> statement-breakpoint"):
                        if statement.strip():
                            db.execute(statement, prepare=False)
                db.execute("insert into cockpit_local_migrations values (%s)", (file.name,))
            ensure_editorial_schema(db)
    return {"ready": True, "databases": list(DATABASES.values())}


def ensure_editorial_schema(db):
    db.execute("""create table if not exists cockpit_editorial (
        id text primary key, page text not null, entity_id text,
        content jsonb not null, updated_at timestamptz not null default now());
        create table if not exists cockpit_topic_labels (
        id text primary key, bill_id text not null references bills(id),
        label text not null, relevance text not null, evidence jsonb not null,
        method_version text not null, updated_at timestamptz not null default now());
        create table if not exists cockpit_release_receipts (
        id text primary key, manifest_hash text not null, manifest jsonb not null,
        published_at timestamptz not null default now());""", prepare=False)


def clone(source, target):
    if source == target or source not in DATABASES or target not in DATABASES:
        raise ValueError("Invalid snapshot roles")
    archive = docker_command(["pg_dump", "-U", "cockpit", "-Fc", "--no-owner", "--no-acl", DATABASES[source]])
    docker_command(["pg_restore", "-U", "cockpit", "--clean", "--if-exists", "--no-owner", "--no-acl",
                    "--exit-on-error", "--single-transaction", "-d", DATABASES[target]], input=archive)


def seed_baseline(canonical_url, store):
    if not canonical_url:
        raise ValueError("Canonical read connection is not configured")
    if store.changes() or store.objects("release"):
        raise ValueError("Existing staged work must be resolved before replacing its baseline")
    # COPY data through a read-only snapshot instead of pg_dump: canonical may run
    # a newer PostgreSQL major version than the local workspace.
    with psycopg.connect(canonical_url, row_factory=dict_row, connect_timeout=15) as source, connect("baseline") as target:
        source.execute("set transaction isolation level repeatable read, read only")
        target.execute("set local session_replication_role = replica")
        def columns(db):
            result = {}
            for row in db.execute("select c.table_name,c.column_name from information_schema.columns c join information_schema.tables t on t.table_schema=c.table_schema and t.table_name=c.table_name where c.table_schema='public' and t.table_type='BASE TABLE' order by c.ordinal_position"):
                result.setdefault(row["table_name"], []).append(row["column_name"])
            return result
        source_columns, target_columns = columns(source), columns(target)
        shared = sorted(set(source_columns) & set(target_columns) - {"cockpit_local_migrations"})
        for table in shared:
            cols = [c for c in target_columns[table] if c in source_columns[table]]
            target.execute(sql.SQL("delete from {}").format(sql.Identifier(table)))
            names = sql.SQL(",").join(map(sql.Identifier, cols))
            with source.cursor().copy(sql.SQL("copy {} ({}) to stdout with (format csv)").format(sql.Identifier(table), names)) as reader:
                with target.cursor().copy(sql.SQL("copy {} ({}) from stdin with (format csv)").format(sql.Identifier(table), names)) as writer:
                    for data in reader:
                        writer.write(data)
        ensure_editorial_schema(target)
    clone("baseline", "working")
    clone("baseline", "release")
    store.put("setting", {"seededAt": stamp()}, "baseline-status")
    return {"seeded": True, "canonicalWriteExecuted": False}


def tables(db):
    rows = db.execute("""select c.relname as name, array_agg(a.attname order by k.ordinality) as keys
        from pg_class c join pg_namespace n on n.oid=c.relnamespace
        join pg_index i on i.indrelid=c.oid and i.indisprimary
        join lateral unnest(i.indkey) with ordinality k(attnum, ordinality) on true
        join pg_attribute a on a.attrelid=c.oid and a.attnum=k.attnum
        where n.nspname='public' and c.relkind='r'
        group by c.relname order by c.relname""").fetchall()
    return {row["name"]: row["keys"] for row in rows
            if row["name"] not in EXCLUDED and not row["name"].startswith(("cockpit_local_", "engagement", "reaction"))}


def records(db, table, keys):
    rows = db.execute(sql.SQL("select to_jsonb(t) as row from {} t").format(sql.Identifier(table))).fetchall()
    return {encode([row["row"][key] for key in keys]): row["row"] for row in rows}


def snapshot():
    with connect() as db:
        return {table: records(db, table, keys) for table, keys in tables(db).items()}


VOLATILE_FIELDS = {"updated_at", "refreshed_at", "last_attempt_at", "last_seen_at", "fetched_at", "retrieved_at", "captured_at"}


def semantic(record):
    return {key: value for key, value in record.items() if key not in VOLATILE_FIELDS} if record is not None else None


def capture_changes(store, batch, previous):
    counts = dict(added=0, changed=0, unchanged=0, conflicting=0, removed=0)
    with connect() as db, store.connect() as state:
        for table, keys in tables(db).items():
            before = previous.get(table, {})
            after = records(db, table, keys)
            overrides = {row["record_id"]: json.loads(row["fields_json"]) for row in state.execute(
                "select record_id,fields_json from cockpit_overrides where table_name=?", (table,))}
            for key in before.keys() | after.keys():
                old, new = before.get(key), after.get(key)
                if semantic(old) == semantic(new):
                    counts["unchanged"] += 1
                    continue
                protected = overrides.get(key, {})
                conflict = bool(protected and (new is None or any(new.get(k) != v for k, v in protected.items())))
                evidence = [{"type": "official_import", "batchId": batch, "sourceSnapshotIds": (new or old or {}).get("source_snapshot_ids", []),
                             "sourceUrl": (new or old or {}).get("source_url") or (new or old or {}).get("url")}]
                store.change(batch, table, key, old, new, evidence=evidence, conflict=conflict)
                counts["conflicting" if conflict else "added" if old is None else "removed" if new is None else "changed"] += 1
                if conflict:
                    write_record(db, table, keys, {**(new or old), **protected})
    return counts


def write_record(db, table, keys, record):
    columns = list(record)
    query = sql.SQL("insert into {table} ({columns}) select {columns} from jsonb_populate_record(null::{table}, %s::jsonb) on conflict ({keys}) ").format(
        table=sql.Identifier(table), columns=sql.SQL(",").join(map(sql.Identifier, columns)), keys=sql.SQL(",").join(map(sql.Identifier, keys)))
    updates = [key for key in columns if key not in keys]
    query += sql.SQL("do update set ") + sql.SQL(",").join(sql.SQL("{key}=excluded.{key}").format(key=sql.Identifier(key)) for key in updates) if updates else sql.SQL("do nothing")
    db.execute(query, (encode(record),))


def ordered_tables(db, names):
    edges = db.execute("""select child.relname as child,parent.relname as parent from pg_constraint k
        join pg_class child on child.oid=k.conrelid join pg_class parent on parent.oid=k.confrelid
        where k.contype='f' and child.oid<>parent.oid""").fetchall()
    ordered, pending = [], set(names)
    while pending:
        ready = sorted(name for name in pending if not any(e["child"] == name and e["parent"] in pending for e in edges))
        if not ready:
            raise ValueError("Release includes cyclic relationships; split or resolve the dependency cycle")
        ordered.extend(ready)
        pending.difference_update(ready)
    return ordered


def validated_changes(db, changes, *, lock=False):
    metadata = tables(db)
    if changes and all(item["before"] is None and item["after"] is not None for item in changes):
        seen, grouped = set(), {}
        for item in changes:
            table = item["table_name"]
            if table not in metadata:
                raise ValueError(f"Unsupported publication table: {table}")
            identity = (table, item["record_id"])
            if identity in seen or encode([item["after"][key] for key in metadata[table]]) != item["record_id"]:
                raise ValueError("Duplicate or invalid insert identity")
            seen.add(identity)
            grouped.setdefault(table, []).append(item["after"])
        for table, rows in grouped.items():
            keys = sql.SQL(",").join(map(sql.Identifier, metadata[table]))
            for offset in range(0, len(rows), 1000):
                requested = [{key: row[key] for key in metadata[table]} for row in rows[offset:offset+1000]]
                query = sql.SQL("select 1 from {table} where ({keys}) in (select {keys} from jsonb_populate_recordset(null::{table},%s::jsonb)) limit 1").format(table=sql.Identifier(table), keys=keys)
                if db.execute(query, (encode(requested),)).fetchone():
                    raise ValueError(f"Baseline conflict: {table} already contains a selected insert")
        return metadata, changes
    groups = {}
    for item in changes:
        groups.setdefault((item["table_name"],item["record_id"]),[]).append(item)
    combined = []
    for (table, identifier), items in groups.items():
        if table not in metadata:
            raise ValueError(f"Unsupported publication table: {table}")
        keys = metadata[table]
        reference = items[0]["before"] or items[0]["after"]
        for item in items:
            for record in (item["before"],item["after"]):
                if record is not None and encode([record[k] for k in keys]) != identifier:
                    raise ValueError("A release cannot change record identity")
        current = db.execute(sql.SQL("select to_jsonb(t) as row from {} t where ").format(sql.Identifier(table)) +
            sql.SQL(" and ").join(sql.SQL("{}=%s").format(sql.Identifier(k)) for k in keys) + sql.SQL(" for update" if lock else ""),
            tuple(reference[k] for k in keys)).fetchone()
        original = current["row"] if current else None
        value, remaining = original, list(items)
        while remaining:
            matching = [item for item in remaining if semantic(item["before"]) == semantic(value)]
            if not matching:
                raise ValueError(f"Baseline conflict or unselected prerequisite: {table} / {identifier}")
            if any(semantic(item["after"]) != semantic(matching[0]["after"]) for item in matching):
                raise ValueError(f"Conflicting selected changes: {table} / {identifier}")
            value = matching[0]["after"]
            remaining = [item for item in remaining if item not in matching]
        combined.append({**items[0],"before":original,"after":value})
    return metadata, combined


def validate_baseline(db, changes, *, lock=False):
    return validated_changes(db, changes, lock=lock)[0]


def apply_changes(db, changes):
    metadata, changes = validated_changes(db, changes, lock=True)
    order = ordered_tables(db, {item["table_name"] for item in changes})
    if changes and all(item["before"] is None and item["after"] is not None for item in changes):
        for table in order:
            rows = [item["after"] for item in changes if item["table_name"] == table]
            columns = list(rows[0])
            if any(set(row) != set(columns) for row in rows):
                raise ValueError("Insert rows must have matching columns")
            names = sql.SQL(",").join(map(sql.Identifier, columns))
            query = sql.SQL("insert into {table} ({columns}) select {columns} from jsonb_populate_recordset(null::{table},%s::jsonb)").format(table=sql.Identifier(table), columns=names)
            for offset in range(0, len(rows), 1000):
                # No upsert: a concurrent insertion must abort the release.
                db.execute(query, (encode(rows[offset:offset+1000]),))
        return
    for table in order:
        for item in changes:
            if item["table_name"] == table and item["after"] is not None:
                write_record(db, table, metadata[table], item["after"])
    for table in reversed(order):
        for item in changes:
            if item["table_name"] == table and item["after"] is None:
                db.execute(sql.SQL("delete from {} where ").format(sql.Identifier(table)) + sql.SQL(" and ").join(
                    sql.SQL("{}=%s").format(sql.Identifier(k)) for k in metadata[table]), tuple(item["before"][k] for k in metadata[table]))


def preview_release(store, identifiers, title):
    selected_ids = set(identifiers)
    selected = [row for row in store.changes() if row["id"] in selected_ids]
    if not selected or len(selected) != len(set(identifiers)) or any(row["status"] != "accepted" for row in selected):
        raise ValueError("Select only accepted changes")
    clone("baseline", "release")
    with connect("release") as db:
        apply_changes(db, selected)
    manifest = [{k: row[k] for k in ("id", "table_name", "record_id", "before", "after", "origin", "evidence")} for row in selected]
    release = store.put("release", {"title": title, "status": "preview_building", "manifest": manifest,
                                    "manifestHash": digest(manifest), "previewUrl": "http://127.0.0.1:3001/ro"})
    store.put("setting", {"releaseId": release["id"]}, "active-preview")
    release["previewUrl"] += "?cockpitRelease="+release["id"]
    return store.put("release", release, release["id"])


def review_changes(store, identifiers, decision):
    selected_ids = set(identifiers)
    selected = [row for row in store.changes() if row["id"] in selected_ids]
    if len(selected) != len(set(identifiers)):
        raise ValueError("A selected change is unavailable")
    manual = [row for row in selected if row["origin"] == "manual" and decision == "accepted"]
    if not manual:
        return store.review(identifiers,decision)
    # The durable review job can replay after a crash on either side of these commits.
    # SQLite records the operator's decision; current==after makes the local write idempotent.
    with connect() as db:
        metadata=tables(db)
        for item in manual:
            table=item["table_name"]; keys=metadata[table]
            before,after=item["before"],item["after"]
            if not before or not after:
                raise ValueError("Manual corrections edit existing records")
            fields={key:value for key,value in after.items() if before.get(key)!=value}
            current=db.execute(sql.SQL("select to_jsonb(t) as row from {} t where ").format(sql.Identifier(table))+
                sql.SQL(" and ").join(sql.SQL("{}=%s").format(sql.Identifier(key)) for key in keys)+sql.SQL(" for update"),
                tuple(before[key] for key in keys)).fetchone()
            if not current or any(current["row"].get(key) not in (before.get(key),value) for key,value in fields.items()):
                raise ValueError("Working values changed since this correction was proposed. Review the current record again.")
            write_record(db,table,keys,{**current["row"],**fields})
        result=store.review(identifiers,decision)
    return {**result,"workingCorrections":len(manual)}
