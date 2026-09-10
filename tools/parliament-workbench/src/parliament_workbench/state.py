from __future__ import annotations

from datetime import datetime, timezone
import json
import sqlite3
from typing import Any

from .config import WorkbenchConfig


SCHEMA_VERSION = 5


STATE_TABLES = [
    "workflow_jobs",
    "workflow_job_steps",
    "workflow_job_logs",
    "source_claims",
    "source_conflicts",
    "patches",
    "patch_events",
    "model_runs",
    "model_evaluations",
    "agent_task_packs",
    "taxonomy_labels",
    "document_parses",
    "text_corrections",
    "extracted_citations",
    "analytics_snapshots",
    "export_batches",
    "institution_entities",
    "institution_sources",
    "institution_terms",
    "institution_events",
    "procedure_nodes",
    "procedure_transitions",
    "institution_examples",
    "publish_batches",
    "publish_batch_items",
]


class WorkbenchState:
    def __init__(self, config: WorkbenchConfig):
        self.config = config
        self.path = config.state_db_path

    def connect(self) -> sqlite3.Connection:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(self.path, factory=ClosingConnection)
        conn.row_factory = sqlite3.Row
        conn.execute("pragma foreign_keys = on")
        return conn

    def initialize(self) -> dict[str, Any]:
        with self.connect() as conn:
            create_schema(conn)
            conn.execute(
                "insert or replace into schema_meta(key, value, updated_at) values (?, ?, ?)",
                ("schema_version", str(SCHEMA_VERSION), utc_now()),
            )
            seed_taxonomy(conn)
            conn.commit()
        return self.status()

    def status(self) -> dict[str, Any]:
        initialized = self.path.exists()
        counts = {table: 0 for table in STATE_TABLES}
        schema_version = None
        if initialized:
            try:
                with self.connect() as conn:
                    rows = conn.execute("select key, value from schema_meta").fetchall()
                    meta = {str(row["key"]): str(row["value"]) for row in rows}
                    schema_version = meta.get("schema_version")
                    for table in STATE_TABLES:
                        counts[table] = int(conn.execute(f"select count(*) from {table}").fetchone()[0])
            except sqlite3.Error as error:
                return {
                    "path": str(self.path),
                    "initialized": False,
                    "ok": False,
                    "schemaVersion": schema_version,
                    "counts": counts,
                    "error": str(error),
                }
        return {
            "path": str(self.path),
            "initialized": initialized,
            "ok": initialized,
            "schemaVersion": schema_version,
            "counts": counts,
        }

    def upsert(self, table: str, payload: dict[str, Any]) -> None:
        keys = list(payload.keys())
        placeholders = ", ".join("?" for _ in keys)
        columns = ", ".join(keys)
        assignments = ", ".join(f"{key}=excluded.{key}" for key in keys if key != "id")
        values = [json_value(payload[key]) for key in keys]
        with self.connect() as conn:
            create_schema(conn)
            conn.execute(
                f"insert into {table} ({columns}) values ({placeholders}) on conflict(id) do update set {assignments}",
                values,
            )
            conn.commit()


def create_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        create table if not exists schema_meta (
          key text primary key,
          value text not null,
          updated_at text not null
        );

        create table if not exists workflow_jobs (
          id text primary key,
          kind text not null,
          status text not null,
          input_json text not null default '{}',
          output_json text,
          error text,
          parent_job_id text,
          created_at text not null,
          updated_at text not null,
          started_at text,
          finished_at text,
          canceled_at text
        );

        create table if not exists workflow_job_steps (
          id text primary key,
          job_id text not null,
          step_index integer not null,
          stage_id text not null,
          label text not null,
          status text not null,
          command_json text not null default '[]',
          command_text text not null default '',
          started_at text,
          finished_at text,
          return_code integer,
          output_json text,
          error text,
          updated_at text not null,
          foreign key(job_id) references workflow_jobs(id) on delete cascade
        );

        create table if not exists workflow_job_logs (
          id text primary key,
          job_id text not null,
          step_id text,
          level text not null,
          message text not null,
          payload_json text,
          created_at text not null,
          foreign key(job_id) references workflow_jobs(id) on delete cascade,
          foreign key(step_id) references workflow_job_steps(id) on delete cascade
        );

        create table if not exists source_claims (
          id text primary key,
          entity_type text not null,
          entity_id text not null,
          field_path text not null,
          value_json text not null,
          source_url text,
          source_title text,
          evidence_quote text,
          source_type text not null default 'official',
          confidence text not null default 'unknown',
          status text not null default 'open',
          observed_at text not null,
          updated_at text not null
        );

        create table if not exists source_conflicts (
          id text primary key,
          entity_type text not null,
          entity_id text not null,
          field_path text not null,
          conflict_json text not null,
          status text not null default 'open',
          reviewer_note text,
          created_at text not null,
          updated_at text not null
        );

        create table if not exists patches (
          id text primary key,
          status text not null,
          patch_type text not null,
          entity_type text not null,
          entity_id text not null,
          field_path text,
          current_value_json text,
          proposed_value_json text,
          evidence_quote text,
          source_id text,
          source_url text,
          explanation text,
          created_by text not null default 'local',
          created_at text not null,
          updated_at text not null
        );

        create table if not exists patch_events (
          id text primary key,
          patch_id text not null,
          event_type text not null,
          payload_json text not null,
          created_at text not null,
          foreign key(patch_id) references patches(id) on delete cascade
        );

        create table if not exists model_runs (
          id text primary key,
          task_type text not null,
          entity_type text,
          entity_id text,
          job_id text,
          model text not null,
          prompt_version text not null,
          schema_version text not null,
          status text not null,
          input_json text not null,
          output_json text,
          validation_json text,
          created_at text not null,
          updated_at text not null
        );

        create table if not exists model_evaluations (
          id text primary key,
          run_id text,
          gold_set_id text not null,
          metrics_json text not null,
          notes text,
          created_at text not null
        );

        create table if not exists agent_task_packs (
          id text primary key,
          entity_type text not null,
          entity_id text not null,
          task_type text not null,
          title text not null,
          context_json text not null,
          acceptance_criteria_json text not null,
          file_path text,
          created_at text not null
        );

        create table if not exists taxonomy_labels (
          id text primary key,
          entity_type text not null,
          entity_id text not null,
          taxonomy_version text not null,
          topic_code text not null,
          topic_label text not null,
          stance_code text,
          stance_label text,
          confidence real,
          status text not null default 'draft',
          evidence_quote text,
          source_id text,
          reviewer text,
          reviewer_note text,
          reviewed_at text,
          decision_reason text,
          proposal_id text,
          created_at text not null,
          updated_at text not null
        );

        create table if not exists document_parses (
          id text primary key,
          document_id text not null,
          source_text_hash text not null,
          correction_id text,
          parser_version text not null,
          quality text not null,
          warnings_json text not null default '[]',
          sections_json text not null default '[]',
          citations_json text not null default '[]',
          created_at text not null,
          updated_at text not null
        );

        create table if not exists text_corrections (
          id text primary key,
          document_id text not null,
          status text not null default 'draft',
          base_text_hash text not null,
          corrected_text text,
          correction_note text,
          evidence_quote text not null,
          source_document_id text,
          official_url text,
          proposal_id text,
          reviewer text,
          reviewer_note text,
          reviewed_at text,
          decision_reason text,
          created_by text not null default 'local',
          created_at text not null,
          updated_at text not null
        );

        create table if not exists extracted_citations (
          id text primary key,
          document_id text not null,
          parse_id text,
          citation_type text not null,
          raw_text text not null,
          normalized_target text not null,
          snippet text not null,
          start_offset integer not null,
          end_offset integer not null,
          confidence real,
          status text not null default 'candidate',
          reviewer text,
          reviewer_note text,
          reviewed_at text,
          decision_reason text,
          proposal_id text,
          created_at text not null,
          updated_at text not null
        );

        create table if not exists analytics_snapshots (
          id text primary key,
          snapshot_type text not null,
          entity_type text,
          entity_id text,
          payload_json text not null,
          created_at text not null
        );

        create table if not exists export_batches (
          id text primary key,
          status text not null,
          title text not null,
          payload_json text not null,
          blockers_json text not null,
          files_json text not null,
          created_at text not null,
          updated_at text not null
        );

        create table if not exists institution_entities (
          id text primary key,
          entity_type text not null,
          name text not null,
          short_name text,
          category text not null,
          status text not null default 'known',
          summary text not null,
          body text not null,
          temporal_scope text not null default 'structural',
          source_confidence text not null default 'official_reference',
          updated_at text not null
        );

        create table if not exists institution_sources (
          id text primary key,
          entity_id text not null,
          title text not null,
          url text not null,
          source_type text not null default 'official',
          citation_note text not null,
          updated_at text not null,
          foreign key(entity_id) references institution_entities(id) on delete cascade
        );

        create table if not exists institution_terms (
          id text primary key,
          entity_id text not null,
          role_type text not null,
          holder_name text not null,
          holder_entity_id text,
          starts_on text,
          ends_on text,
          status text not null default 'known',
          source_ids_json text not null default '[]',
          updated_at text not null,
          foreign key(entity_id) references institution_entities(id) on delete cascade
        );

        create table if not exists institution_events (
          id text primary key,
          entity_id text not null,
          event_type text not null,
          occurred_on text,
          title text not null,
          description text not null,
          related_entity_type text,
          related_entity_id text,
          source_url text,
          status text not null default 'known',
          updated_at text not null,
          foreign key(entity_id) references institution_entities(id) on delete cascade
        );

        create table if not exists procedure_nodes (
          id text primary key,
          label text not null,
          actor_entity_id text,
          stage_order integer not null,
          status text not null default 'known',
          description text not null,
          source_ids_json text not null default '[]',
          updated_at text not null
        );

        create table if not exists procedure_transitions (
          id text primary key,
          from_node_id text not null,
          to_node_id text not null,
          condition_label text not null,
          required integer not null default 1,
          description text not null,
          source_ids_json text not null default '[]',
          updated_at text not null,
          foreign key(from_node_id) references procedure_nodes(id) on delete cascade,
          foreign key(to_node_id) references procedure_nodes(id) on delete cascade
        );

        create table if not exists institution_examples (
          id text primary key,
          entity_id text not null,
          bill_id text,
          title text not null,
          description text not null,
          source_url text,
          status text not null default 'candidate',
          updated_at text not null,
          foreign key(entity_id) references institution_entities(id) on delete cascade
        );

        create table if not exists publish_batches (
          id text primary key,
          status text not null,
          title text not null,
          description text,
          strict_gate_json text not null,
          created_at text not null,
          updated_at text not null
        );

        create table if not exists publish_batch_items (
          id text primary key,
          batch_id text not null,
          item_type text not null,
          entity_type text not null,
          entity_id text not null,
          payload_json text not null,
          status text not null default 'pending',
          created_at text not null,
          foreign key(batch_id) references publish_batches(id) on delete cascade
        );

        create index if not exists workflow_jobs_status_idx on workflow_jobs(status, updated_at);
        create index if not exists workflow_steps_job_idx on workflow_job_steps(job_id, step_index);
        create index if not exists workflow_logs_job_idx on workflow_job_logs(job_id, created_at);
        create index if not exists source_claims_entity_idx on source_claims(entity_type, entity_id);
        create index if not exists conflicts_entity_idx on source_conflicts(entity_type, entity_id);
        create index if not exists patches_entity_idx on patches(entity_type, entity_id, status);
        create index if not exists model_runs_entity_idx on model_runs(entity_type, entity_id, task_type);
        create index if not exists model_evaluations_run_idx on model_evaluations(run_id, gold_set_id);
        create index if not exists task_packs_entity_idx on agent_task_packs(entity_type, entity_id, task_type);
        create index if not exists taxonomy_entity_idx on taxonomy_labels(entity_type, entity_id, status);
        create index if not exists document_parses_document_idx on document_parses(document_id, updated_at);
        create index if not exists corrections_document_idx on text_corrections(document_id, status, updated_at);
        create index if not exists citations_document_idx on extracted_citations(document_id, status);
        create index if not exists analytics_entity_idx on analytics_snapshots(snapshot_type, entity_type, entity_id);
        create index if not exists institution_category_idx on institution_entities(category);
        create index if not exists sources_entity_idx on institution_sources(entity_id);
        create index if not exists institution_terms_entity_idx on institution_terms(entity_id, starts_on);
        create index if not exists institution_events_entity_idx on institution_events(entity_id, occurred_on);
        """
    )
    ensure_column(conn, "source_claims", "evidence_quote", "text")
    ensure_column(conn, "source_claims", "reviewer", "text")
    ensure_column(conn, "source_claims", "reviewer_note", "text")
    ensure_column(conn, "source_claims", "reviewed_at", "text")
    ensure_column(conn, "source_claims", "decision_reason", "text")
    ensure_column(conn, "source_claims", "proposal_id", "text")
    ensure_column(conn, "model_runs", "job_id", "text")
    for table in ("taxonomy_labels", "text_corrections", "extracted_citations"):
        ensure_column(conn, table, "reviewer", "text")
        ensure_column(conn, table, "reviewer_note", "text")
        ensure_column(conn, table, "reviewed_at", "text")
        ensure_column(conn, table, "decision_reason", "text")
    ensure_column(conn, "taxonomy_labels", "proposal_id", "text")
    ensure_column(conn, "extracted_citations", "proposal_id", "text")
    conn.execute("create index if not exists model_runs_job_idx on model_runs(job_id)")


def ensure_column(conn: sqlite3.Connection, table: str, column: str, definition: str) -> None:
    columns = {str(row["name"]) for row in conn.execute(f"pragma table_info({table})").fetchall()}
    if column not in columns:
        conn.execute(f"alter table {table} add column {column} {definition}")


class ClosingConnection(sqlite3.Connection):
    def __exit__(self, exc_type, exc_value, traceback) -> bool:
        try:
            return bool(super().__exit__(exc_type, exc_value, traceback))
        finally:
            self.close()


def seed_taxonomy(conn: sqlite3.Connection) -> None:
    now = utc_now()
    seeds = [
        ("taxonomy-cap-ro-public-finance", "system", "taxonomy", "cap-ro-v1", "public_finance", "Finante publice", None, None),
        ("taxonomy-cap-ro-health", "system", "taxonomy", "cap-ro-v1", "health", "Sanatate", None, None),
        ("taxonomy-cap-ro-education", "system", "taxonomy", "cap-ro-v1", "education", "Educatie", None, None),
        ("taxonomy-cap-ro-justice", "system", "taxonomy", "cap-ro-v1", "justice", "Justitie si institutii", None, None),
        ("taxonomy-cap-ro-labor-pensions", "system", "taxonomy", "cap-ro-v1", "labor_pensions", "Munca si pensii", None, None),
        ("taxonomy-cap-ro-economy", "system", "taxonomy", "cap-ro-v1", "economy_private_sector", "Economie si sector privat", None, None),
        ("taxonomy-cap-ro-local-admin", "system", "taxonomy", "cap-ro-v1", "local_administration", "Administratie locala", None, None),
        ("taxonomy-cap-ro-rights", "system", "taxonomy", "cap-ro-v1", "rights_liberties", "Drepturi si libertati", None, None),
    ]
    for row in seeds:
        conn.execute(
            """
            insert or ignore into taxonomy_labels (
              id, entity_type, entity_id, taxonomy_version, topic_code, topic_label,
              stance_code, stance_label, confidence, status, evidence_quote, source_id,
              created_at, updated_at
            ) values (?, ?, ?, ?, ?, ?, ?, ?, null, 'seed', null, null, ?, ?)
            """,
            (*row, now, now),
        )


def json_value(value: Any) -> Any:
    if isinstance(value, (dict, list, tuple)):
        return json.dumps(value, ensure_ascii=False, sort_keys=True)
    return value


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()
