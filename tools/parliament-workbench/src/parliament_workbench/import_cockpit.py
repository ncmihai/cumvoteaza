from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import subprocess
import sys
from typing import Any, Literal

from .config import WorkbenchConfig, repo_root
from .jobs import JobStore


ImportMode = Literal["dry_run", "persist"]


@dataclass(frozen=True)
class ImportStage:
    id: str
    label: str
    description: str
    command: list[str]
    read_only: bool
    requires_write_token: bool
    writes: Literal["none", "neon", "digi", "neon_and_digi"]
    source: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "label": self.label,
            "description": self.description,
            "command": self.command,
            "commandText": shell_join(self.command),
            "readOnly": self.read_only,
            "requiresWriteToken": self.requires_write_token,
            "writes": self.writes,
            # Kept for older UI/tests while the workbench migrates to explicit stage metadata.
            "mutatesCanonical": not self.read_only,
            "source": self.source,
        }


def current_import_plan(
    *,
    year: int | None = None,
    limit: int = 25,
    include_text: bool = True,
    mode: ImportMode = "dry_run",
) -> dict[str, Any]:
    year = year or datetime.now().year
    safe_limit = max(1, min(int(limit), 100))
    dry_run = mode == "dry_run"
    dry_run_args = ["--dry-run"] if dry_run else []
    stages = [
        ImportStage(
            id="discover-deputies-bills",
            label="Discover CDEP bills",
            description="Find Chamber of Deputies bill dossiers for the selected year.",
            command=["npm", "run", "ingest:discover:deputies", "--", f"--years={year}", f"--discovery-limit={safe_limit}", *dry_run_args],
            read_only=dry_run,
            requires_write_token=not dry_run,
            writes="none" if dry_run else "neon",
            source="cdep",
        ),
        ImportStage(
            id="discover-senate-bills",
            label="Discover Senate bills",
            description="Find Senate bill dossiers for the selected year.",
            command=["npm", "run", "ingest:discover:senate", "--", f"--years={year}", f"--discovery-limit={safe_limit}", *dry_run_args],
            read_only=dry_run,
            requires_write_token=not dry_run,
            writes="none" if dry_run else "neon",
            source="senate",
        ),
        ImportStage(
            id="discover-deputies-votes",
            label="Discover CDEP votes",
            description="Find Chamber of Deputies votes for the selected year.",
            command=["npm", "run", "ingest:discover:deputies-votes", "--", f"--years={year}", f"--discovery-limit={safe_limit}", *dry_run_args],
            read_only=dry_run,
            requires_write_token=not dry_run,
            writes="none" if dry_run else "neon",
            source="cdep",
        ),
        ImportStage(
            id="import-pending-bills",
            label="Import pending bills",
            description="Import pending bill discoveries with a capped, sequential run.",
            command=["npm", "run", "ingest:import:pending", "--", f"--years={year}", "--kind=bill", f"--max-imports={safe_limit}", *dry_run_args],
            read_only=dry_run,
            requires_write_token=not dry_run,
            writes="none" if dry_run else "neon",
            source="neon",
        ),
        ImportStage(
            id="import-pending-votes",
            label="Import pending votes",
            description="Import pending vote discoveries with a capped, sequential run.",
            command=["npm", "run", "ingest:import:pending", "--", f"--years={year}", "--kind=vote", f"--max-imports={safe_limit}", *dry_run_args],
            read_only=dry_run,
            requires_write_token=not dry_run,
            writes="none" if dry_run else "neon",
            source="neon",
        ),
    ]
    if include_text:
        stages.append(
            ImportStage(
                id="extract-bill-text",
                label="Extract bill text",
                description="Extract stored derived text for proposal documents; official PDFs stay external.",
                command=[
                    "npm",
                    "run",
                    "ingest:bill-text:batch",
                    "--",
                    f"--year={year}",
                    f"--limit={safe_limit}",
                    "--include-unsupported",
                    "--summary-only",
                    *(["--persist"] if mode == "persist" else []),
                ],
                read_only=dry_run,
                requires_write_token=not dry_run,
                writes="none" if dry_run else "neon_and_digi",
                source="cdep-senate-digi",
            )
        )
    stages.append(
        ImportStage(
            id="audit-current-health",
            label="Audit current legislature",
            description="Run current legislature and dossier health checks after import.",
            command=["npm", "run", "ingest:audit:current-legislature", "--", f"--year={year}"],
            read_only=True,
            requires_write_token=False,
            writes="none",
            source="health",
        )
    )
    if mode == "persist":
        stages.append(
            ImportStage(
                id="refresh-read-models",
                label="Refresh read models",
                description="Refresh derived read models used by the public app after reviewed/persisted changes.",
                command=["npm", "run", "ingest:refresh-read-models", "--"],
                read_only=False,
                requires_write_token=True,
                writes="neon",
                source="neon",
            )
        )
    return {
        "kind": "current_import",
        "year": year,
        "limit": safe_limit,
        "includeText": include_text,
        "mode": mode,
        "requiresWriteToken": mode == "persist",
        "stages": [stage.to_dict() for stage in stages],
        "warnings": [
            "CDEP/Senate sources are fragile; keep limits low and run sequentially.",
            "Persist mode writes reviewed/imported facts to Neon and should be run only after preview.",
            "Official PDFs are not stored; only derived text artifacts may go to Digi.",
        ],
    }


def run_current_import(
    config: WorkbenchConfig,
    *,
    year: int | None,
    limit: int,
    include_text: bool,
    mode: ImportMode,
    execute: bool,
) -> dict[str, Any]:
    plan = current_import_plan(year=year, limit=limit, include_text=include_text, mode=mode)
    if execute and mode == "dry_run":
        validate_dry_run_plan(plan)
    store = JobStore(config)
    job = store.create(
        "imports.current",
        {"year": plan["year"], "limit": plan["limit"], "includeText": include_text, "mode": mode, "execute": execute},
    )
    store.start(job)
    step_ids = [
        store.add_step(job.id, stage["id"], stage["label"], command=stage["command"], command_text=stage["commandText"])["id"]
        for stage in plan["stages"]
    ]
    if not execute:
        output = {"executed": False, "plan": plan, "message": "Command preview stored. No commands were executed."}
        for step_id, stage in zip(step_ids, plan["stages"]):
            store.succeed_step(step_id, {"previewOnly": True, "commandText": stage["commandText"]})
        store.succeed(job, output)
        return {"job": store.get(job.id).to_dict(), "steps": store.list_steps(job.id), "logs": store.list_logs(job.id), "result": output}

    stage_results = []
    repo = repo_root()
    for index, stage in enumerate(plan["stages"]):
        step_id = step_ids[index]
        store.start_step(step_id)
        store.append_log(job.id, "info", f"Executing: {stage['commandText']}", step_id=step_id)
        completed = subprocess.run(
            stage["command"],
            cwd=repo,
            capture_output=True,
            text=True,
            timeout=1800,
            check=False,
        )
        result = {
            "stageId": stage["id"],
            "commandText": stage["commandText"],
            "returnCode": completed.returncode,
            "stdout": trim_output(completed.stdout),
            "stderr": trim_output(completed.stderr),
        }
        stage_results.append(result)
        if completed.returncode != 0:
            store.fail_step(step_id, f"Command failed with exit code {completed.returncode}", result, return_code=completed.returncode)
            for remaining_step_id in step_ids[index + 1 :]:
                store.skip_step(remaining_step_id, "Skipped because an earlier stage failed.")
            output = {"executed": True, "plan": plan, "stages": stage_results}
            store.fail(job, f"Stage failed: {stage['id']}", output)
            return {"job": store.get(job.id).to_dict(), "steps": store.list_steps(job.id), "logs": store.list_logs(job.id), "result": output}
        store.succeed_step(step_id, result, return_code=completed.returncode)

    output = {"executed": True, "plan": plan, "stages": stage_results}
    store.succeed(job, output)
    return {"job": store.get(job.id).to_dict(), "steps": store.list_steps(job.id), "logs": store.list_logs(job.id), "result": output}


def historical_year_plan(
    year: int,
    chamber: str = "both",
    limit: int = 25,
    *,
    source_type: str = "projects",
    include_text: bool = False,
    mode: ImportMode = "dry_run",
) -> dict[str, Any]:
    safe_year = max(1990, min(int(year), datetime.now().year))
    safe_limit = max(1, min(int(limit), 100))
    dry_run = mode == "dry_run"
    dry_run_args = ["--dry-run"] if dry_run else []
    stages: list[ImportStage] = []
    if chamber in {"both", "deputies"}:
        stages.append(
            ImportStage(
                id="historical-discover-deputies-bills",
                label="Discover historical CDEP bills",
                description="Find Chamber bill dossiers for the historical year.",
                command=["npm", "run", "ingest:discover:deputies", "--", f"--years={safe_year}", f"--discovery-limit={safe_limit}", *dry_run_args],
                read_only=dry_run,
                requires_write_token=not dry_run,
                writes="none" if dry_run else "neon",
                source="cdep",
            )
        )
        if source_type in {"official", "votes", "both"}:
            stages.append(
                ImportStage(
                    id="historical-discover-deputies-votes",
                    label="Discover historical CDEP votes",
                    description="Find Chamber vote pages for the historical year.",
                    command=["npm", "run", "ingest:discover:deputies-votes", "--", f"--years={safe_year}", f"--discovery-limit={safe_limit}", *dry_run_args],
                    read_only=dry_run,
                    requires_write_token=not dry_run,
                    writes="none" if dry_run else "neon",
                    source="cdep",
                )
            )
    if chamber in {"both", "senate"}:
        stages.append(
            ImportStage(
                id="historical-discover-senate-bills",
                label="Discover historical Senate bills",
                description="Find Senate bill dossiers for the historical year.",
                command=["npm", "run", "ingest:discover:senate", "--", f"--years={safe_year}", f"--discovery-limit={safe_limit}", *dry_run_args],
                read_only=dry_run,
                requires_write_token=not dry_run,
                writes="none" if dry_run else "neon",
                source="senate",
            )
        )
    kind_arg = historical_kind_arg(source_type)
    stages.append(
        ImportStage(
            id="historical-import-pending",
            label="Import pending historical discoveries",
            description="Parse pending historical discoveries with the same safe command builder used for current imports.",
            command=[
                "npm",
                "run",
                "ingest:import:pending",
                "--",
                f"--years={safe_year}",
                *([kind_arg] if kind_arg else []),
                f"--max-imports={safe_limit}",
                *dry_run_args,
            ],
            read_only=dry_run,
            requires_write_token=not dry_run,
            writes="none" if dry_run else "neon",
            source="neon",
        )
    )
    if include_text:
        stages.append(
            ImportStage(
                id="historical-extract-bill-text",
                label="Extract historical bill text",
                description="Dry-run or persist derived historical text artifacts for already discovered documents.",
                command=[
                    "npm",
                    "run",
                    "ingest:bill-text:batch",
                    "--",
                    f"--year={safe_year}",
                    f"--limit={safe_limit}",
                    "--include-unsupported",
                    "--summary-only",
                    *(["--persist"] if mode == "persist" else []),
                ],
                read_only=dry_run,
                requires_write_token=not dry_run,
                writes="none" if dry_run else "neon_and_digi",
                source="cdep-senate-digi",
            )
        )
    commands = [stage.to_dict() for stage in stages]
    return {
        "kind": "historical_year",
        "year": safe_year,
        "chamber": chamber,
        "sourceType": source_type,
        "limit": safe_limit,
        "includeText": include_text,
        "mode": mode,
        "requiresWriteToken": mode == "persist",
        "stages": commands,
        "commands": [{"command": stage["command"], "commandText": stage["commandText"]} for stage in commands],
        "contextRequirements": ["legislature", "government", "party_periods", "member_switches", "committee_context"],
    }


def historical_kind_arg(source_type: str) -> str | None:
    if source_type == "votes":
        return "--kind=vote"
    if source_type in {"projects", "bills"}:
        return "--kind=bill"
    return None


def validate_dry_run_plan(plan: dict[str, Any]) -> None:
    for stage in plan.get("stages") or []:
        command = [str(part) for part in stage.get("command") or []]
        command_text = stage.get("commandText") or shell_join(command)
        if not stage.get("readOnly"):
            raise ValueError(f"Dry-run stage is not read-only: {stage.get('id')}")
        is_discovery = len(command) >= 3 and command[:2] == ["npm", "run"] and str(command[2]).startswith("ingest:discover:")
        is_import_pending = len(command) >= 3 and command[:3] == ["npm", "run", "ingest:import:pending"]
        if (is_discovery or is_import_pending) and "--dry-run" not in command:
            raise ValueError(f"Dry-run import command is missing --dry-run: {command_text}")


def shell_join(command: list[str]) -> str:
    return " ".join(quote_arg(part) for part in command)


def quote_arg(part: str) -> str:
    if not part:
        return "''"
    if all(ch.isalnum() or ch in "-_./:=@" for ch in part):
        return part
    return "'" + part.replace("'", "'\"'\"'") + "'"


def trim_output(value: str, limit: int = 8000) -> str:
    if len(value) <= limit:
        return value
    return value[:limit] + f"\n... truncated {len(value) - limit} characters"
