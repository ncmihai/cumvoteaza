from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import json
import uuid
from typing import Any, Literal

from .config import WorkbenchConfig
from .state import WorkbenchState, create_schema
from .storage import read_json, write_json


JobStatus = Literal["queued", "running", "succeeded", "failed", "canceled"]
StepStatus = Literal["queued", "running", "succeeded", "failed", "skipped", "canceled"]


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class JobRecord:
    id: str
    kind: str
    status: JobStatus
    created_at: str
    updated_at: str
    input: dict[str, Any] = field(default_factory=dict)
    output: dict[str, Any] | None = None
    error: str | None = None
    parent_job_id: str | None = None
    started_at: str | None = None
    finished_at: str | None = None
    canceled_at: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "kind": self.kind,
            "status": self.status,
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
            "input": self.input,
            "output": self.output,
            "error": self.error,
            "parentJobId": self.parent_job_id,
            "startedAt": self.started_at,
            "finishedAt": self.finished_at,
            "canceledAt": self.canceled_at,
        }

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "JobRecord":
        return cls(
            id=payload["id"],
            kind=payload["kind"],
            status=payload["status"],
            created_at=payload.get("createdAt", payload.get("created_at", now_iso())),
            updated_at=payload.get("updatedAt", payload.get("updated_at", now_iso())),
            input=payload.get("input", {}) or {},
            output=payload.get("output"),
            error=payload.get("error"),
            parent_job_id=payload.get("parentJobId") or payload.get("parent_job_id"),
            started_at=payload.get("startedAt") or payload.get("started_at"),
            finished_at=payload.get("finishedAt") or payload.get("finished_at"),
            canceled_at=payload.get("canceledAt") or payload.get("canceled_at"),
        )

    @classmethod
    def from_row(cls, row: Any) -> "JobRecord":
        return cls(
            id=row["id"],
            kind=row["kind"],
            status=row["status"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            input=json.loads(row["input_json"] or "{}"),
            output=json.loads(row["output_json"]) if row["output_json"] else None,
            error=row["error"],
            parent_job_id=row["parent_job_id"],
            started_at=row["started_at"],
            finished_at=row["finished_at"],
            canceled_at=row["canceled_at"],
        )


class JobStore:
    def __init__(self, config: WorkbenchConfig):
        self.config = config
        self.path = config.jobs_dir
        self.state = WorkbenchState(config)
        self.state.initialize()
        self._migrate_json_jobs()

    def create(
        self,
        kind: str,
        input_payload: dict[str, Any] | None = None,
        *,
        parent_job_id: str | None = None,
    ) -> JobRecord:
        stamp = now_iso()
        job = JobRecord(
            id=f"job-{uuid.uuid4().hex[:12]}",
            kind=kind,
            status="queued",
            created_at=stamp,
            updated_at=stamp,
            input=input_payload or {},
            parent_job_id=parent_job_id,
        )
        self.save(job)
        self.append_log(job.id, "info", f"Queued {kind}.", {"input": job.input})
        return job

    def save(self, job: JobRecord) -> JobRecord:
        with self.state.connect() as conn:
            create_schema(conn)
            conn.execute(
                """
                insert into workflow_jobs (
                  id, kind, status, input_json, output_json, error, parent_job_id,
                  created_at, updated_at, started_at, finished_at, canceled_at
                ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                on conflict(id) do update set
                  kind=excluded.kind,
                  status=excluded.status,
                  input_json=excluded.input_json,
                  output_json=excluded.output_json,
                  error=excluded.error,
                  parent_job_id=excluded.parent_job_id,
                  created_at=excluded.created_at,
                  updated_at=excluded.updated_at,
                  started_at=excluded.started_at,
                  finished_at=excluded.finished_at,
                  canceled_at=excluded.canceled_at
                """,
                (
                    job.id,
                    job.kind,
                    job.status,
                    json.dumps(job.input or {}, ensure_ascii=False, sort_keys=True),
                    json.dumps(job.output, ensure_ascii=False, sort_keys=True) if job.output is not None else None,
                    job.error,
                    job.parent_job_id,
                    job.created_at,
                    job.updated_at,
                    job.started_at,
                    job.finished_at,
                    job.canceled_at,
                ),
            )
            conn.commit()
        return job

    def get(self, job_id: str) -> JobRecord | None:
        with self.state.connect() as conn:
            row = conn.execute("select * from workflow_jobs where id = ?", (job_id,)).fetchone()
        if row:
            return JobRecord.from_row(row)
        payload = read_json(self.path / f"{job_id}.json")
        if not payload:
            return None
        job = JobRecord.from_dict(payload)
        self.save(job)
        return job

    def list(self) -> list[JobRecord]:
        self._migrate_json_jobs()
        with self.state.connect() as conn:
            rows = conn.execute("select * from workflow_jobs order by updated_at desc limit 250").fetchall()
        return [JobRecord.from_row(row) for row in rows]

    def start(self, job: JobRecord) -> JobRecord:
        stamp = now_iso()
        job.status = "running"
        job.started_at = job.started_at or stamp
        job.updated_at = stamp
        self.append_log(job.id, "info", "Job started.")
        return self.save(job)

    def succeed(self, job: JobRecord, output: dict[str, Any] | None = None) -> JobRecord:
        stamp = now_iso()
        job.status = "succeeded"
        job.output = output or {}
        job.updated_at = stamp
        job.finished_at = stamp
        self.append_log(job.id, "info", "Job succeeded.", {"output": job.output})
        return self.save(job)

    def fail(self, job: JobRecord, error: str, output: dict[str, Any] | None = None) -> JobRecord:
        stamp = now_iso()
        job.status = "failed"
        job.error = error
        job.output = output
        job.updated_at = stamp
        job.finished_at = stamp
        self.append_log(job.id, "error", error, {"output": output})
        return self.save(job)

    def cancel(self, job_id: str, reason: str | None = None) -> JobRecord:
        job = self.get(job_id)
        if not job:
            raise KeyError(job_id)
        stamp = now_iso()
        job.status = "canceled"
        job.error = reason or "Canceled locally."
        job.updated_at = stamp
        job.canceled_at = stamp
        job.finished_at = stamp
        self.append_log(job.id, "warn", job.error)
        return self.save(job)

    def retry(self, job_id: str) -> JobRecord:
        job = self.get(job_id)
        if not job:
            raise KeyError(job_id)
        return self.create(job.kind, {**job.input, "retryOf": job.id}, parent_job_id=job.id)

    def add_step(self, job_id: str, stage_id: str, label: str, command: list[str] | None = None, command_text: str = "") -> dict[str, Any]:
        with self.state.connect() as conn:
            current = conn.execute("select coalesce(max(step_index), -1) + 1 from workflow_job_steps where job_id = ?", (job_id,)).fetchone()[0]
            stamp = now_iso()
            step_id = f"step-{uuid.uuid4().hex[:12]}"
            conn.execute(
                """
                insert into workflow_job_steps (
                  id, job_id, step_index, stage_id, label, status, command_json, command_text, updated_at
                ) values (?, ?, ?, ?, ?, 'queued', ?, ?, ?)
                """,
                (
                    step_id,
                    job_id,
                    int(current),
                    stage_id,
                    label,
                    json.dumps(command or [], ensure_ascii=False),
                    command_text,
                    stamp,
                ),
            )
            conn.commit()
        self.append_log(job_id, "info", f"Queued step: {label}", step_id=step_id)
        return self.get_step(step_id)

    def start_step(self, step_id: str) -> dict[str, Any]:
        stamp = now_iso()
        with self.state.connect() as conn:
            conn.execute(
                "update workflow_job_steps set status = 'running', started_at = coalesce(started_at, ?), updated_at = ? where id = ?",
                (stamp, stamp, step_id),
            )
            conn.commit()
        step = self.get_step(step_id)
        self.append_log(step["jobId"], "info", f"Started step: {step['label']}", step_id=step_id)
        return step

    def succeed_step(self, step_id: str, output: dict[str, Any] | None = None, return_code: int = 0) -> dict[str, Any]:
        stamp = now_iso()
        with self.state.connect() as conn:
            conn.execute(
                """
                update workflow_job_steps
                set status = 'succeeded', finished_at = ?, return_code = ?, output_json = ?, updated_at = ?
                where id = ?
                """,
                (stamp, return_code, json.dumps(output or {}, ensure_ascii=False, sort_keys=True), stamp, step_id),
            )
            conn.commit()
        step = self.get_step(step_id)
        self.append_log(step["jobId"], "info", f"Finished step: {step['label']}", step_id=step_id, payload=output or {})
        return step

    def fail_step(self, step_id: str, error: str, output: dict[str, Any] | None = None, return_code: int | None = None) -> dict[str, Any]:
        stamp = now_iso()
        with self.state.connect() as conn:
            conn.execute(
                """
                update workflow_job_steps
                set status = 'failed', finished_at = ?, return_code = ?, output_json = ?, error = ?, updated_at = ?
                where id = ?
                """,
                (stamp, return_code, json.dumps(output or {}, ensure_ascii=False, sort_keys=True), error, stamp, step_id),
            )
            conn.commit()
        step = self.get_step(step_id)
        self.append_log(step["jobId"], "error", error, step_id=step_id, payload=output or {})
        return step

    def skip_step(self, step_id: str, reason: str) -> dict[str, Any]:
        stamp = now_iso()
        with self.state.connect() as conn:
            conn.execute(
                "update workflow_job_steps set status = 'skipped', finished_at = ?, error = ?, updated_at = ? where id = ?",
                (stamp, reason, stamp, step_id),
            )
            conn.commit()
        step = self.get_step(step_id)
        self.append_log(step["jobId"], "warn", reason, step_id=step_id)
        return step

    def get_step(self, step_id: str) -> dict[str, Any]:
        with self.state.connect() as conn:
            row = conn.execute("select * from workflow_job_steps where id = ?", (step_id,)).fetchone()
        if not row:
            raise KeyError(step_id)
        return step_payload(row)

    def list_steps(self, job_id: str) -> list[dict[str, Any]]:
        with self.state.connect() as conn:
            rows = conn.execute("select * from workflow_job_steps where job_id = ? order by step_index", (job_id,)).fetchall()
        return [step_payload(row) for row in rows]

    def append_log(
        self,
        job_id: str,
        level: str,
        message: str,
        payload: dict[str, Any] | None = None,
        *,
        step_id: str | None = None,
    ) -> dict[str, Any]:
        stamp = now_iso()
        log_id = f"log-{uuid.uuid4().hex[:12]}"
        with self.state.connect() as conn:
            create_schema(conn)
            conn.execute(
                """
                insert into workflow_job_logs (id, job_id, step_id, level, message, payload_json, created_at)
                values (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    log_id,
                    job_id,
                    step_id,
                    level,
                    message,
                    json.dumps(payload, ensure_ascii=False, sort_keys=True) if payload is not None else None,
                    stamp,
                ),
            )
            conn.commit()
        return {"id": log_id, "jobId": job_id, "stepId": step_id, "level": level, "message": message, "payload": payload, "createdAt": stamp}

    def list_logs(self, job_id: str, limit: int = 500) -> list[dict[str, Any]]:
        with self.state.connect() as conn:
            rows = conn.execute(
                "select * from workflow_job_logs where job_id = ? order by created_at, id limit ?",
                (job_id, max(1, min(limit, 2000))),
            ).fetchall()
        return [log_payload(row) for row in rows]

    def _migrate_json_jobs(self) -> None:
        if not self.path.exists():
            return
        with self.state.connect() as conn:
            create_schema(conn)
            for path in sorted(self.path.glob("*.json")):
                payload = read_json(path)
                if not payload or not payload.get("id"):
                    continue
                exists = conn.execute("select 1 from workflow_jobs where id = ?", (payload["id"],)).fetchone()
                if exists:
                    continue
                job = JobRecord.from_dict(payload)
                conn.execute(
                    """
                    insert or ignore into workflow_jobs (
                      id, kind, status, input_json, output_json, error, parent_job_id,
                      created_at, updated_at, started_at, finished_at, canceled_at
                    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        job.id,
                        job.kind,
                        job.status,
                        json.dumps(job.input or {}, ensure_ascii=False, sort_keys=True),
                        json.dumps(job.output, ensure_ascii=False, sort_keys=True) if job.output is not None else None,
                        job.error,
                        job.parent_job_id,
                        job.created_at,
                        job.updated_at,
                        job.started_at,
                        job.finished_at,
                        job.canceled_at,
                    ),
                )
            conn.commit()


def step_payload(row: Any) -> dict[str, Any]:
    return {
        "id": row["id"],
        "jobId": row["job_id"],
        "stepIndex": row["step_index"],
        "stageId": row["stage_id"],
        "label": row["label"],
        "status": row["status"],
        "command": json.loads(row["command_json"] or "[]"),
        "commandText": row["command_text"],
        "startedAt": row["started_at"],
        "finishedAt": row["finished_at"],
        "returnCode": row["return_code"],
        "output": json.loads(row["output_json"]) if row["output_json"] else None,
        "error": row["error"],
        "updatedAt": row["updated_at"],
    }


def log_payload(row: Any) -> dict[str, Any]:
    return {
        "id": row["id"],
        "jobId": row["job_id"],
        "stepId": row["step_id"],
        "level": row["level"],
        "message": row["message"],
        "payload": json.loads(row["payload_json"]) if row["payload_json"] else None,
        "createdAt": row["created_at"],
    }
