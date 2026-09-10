from __future__ import annotations

from datetime import datetime
import subprocess
from typing import Any

from .config import WorkbenchConfig, repo_root
from .db import ReadOnlyDb
from .import_cockpit import historical_year_plan, trim_output, validate_dry_run_plan
from .jobs import JobStore


def historical_year_run(
    config: WorkbenchConfig,
    *,
    year: int,
    chamber: str,
    source_type: str,
    limit: int,
    include_text: bool,
    include_ocr: bool,
    execute: bool,
) -> dict[str, Any]:
    if chamber not in {"both", "deputies", "senate"}:
        raise ValueError("Unsupported chamber.")
    safe_year = max(1990, min(int(year), datetime.now().year))
    safe_limit = max(1, min(int(limit), 25))
    plan = historical_year_plan(
        safe_year,
        chamber=chamber,
        source_type=source_type,
        limit=safe_limit,
        include_text=include_text,
        mode="dry_run",
    )
    commands = list(plan["commands"])
    context = historical_context_checks(config, safe_year, chamber)
    plan = {
        **plan,
        "sourceType": source_type,
        "limit": safe_limit,
        "includeText": include_text,
        "includeOcr": include_ocr,
        "commands": commands,
        "contextChecks": context,
        "ocrQuarantine": {
            "enabled": include_ocr,
            "mode": "local_quarantine_only",
            "reasons": ["very_short_text", "no_structural_headings", "weird_character_ratio", "huge_section"],
        },
        "warnings": [
            "Tiny capped dry-run only tonight.",
            "No --persist flag is added by this runner.",
            "Missing historical context is a blocker/warning, not inferred truth.",
        ],
    }
    store = JobStore(config)
    job = store.create(
        "imports.historical_year",
        {
            "year": safe_year,
            "chamber": chamber,
            "sourceType": source_type,
            "limit": safe_limit,
            "includeText": include_text,
            "includeOcr": include_ocr,
            "execute": execute,
        },
    )
    store.start(job)
    step_ids = [
        store.add_step(job.id, f"historical-{index}", f"Historical stage {index + 1}", command=item["command"], command_text=item["commandText"])["id"]
        for index, item in enumerate(commands)
    ]
    context_step = store.add_step(job.id, "context-checks", "Check historical legislature/government/member context", command=[], command_text="local context checks")["id"]
    store.succeed_step(context_step, {"contextChecks": context})
    if not execute:
        for step_id, item in zip(step_ids, commands):
            store.succeed_step(step_id, {"previewOnly": True, "commandText": item["commandText"]})
        output = {"executed": False, "plan": plan, "message": "Historical command preview stored. No commands executed."}
        store.succeed(job, output)
        return {"job": store.get(job.id).to_dict(), "steps": store.list_steps(job.id), "logs": store.list_logs(job.id), "result": output}

    validate_dry_run_plan(plan)
    repo = repo_root()
    results = []
    for index, item in enumerate(commands):
        step_id = step_ids[index]
        store.start_step(step_id)
        completed = subprocess.run(item["command"], cwd=repo, capture_output=True, text=True, timeout=900, check=False)
        result = {
            "commandText": item["commandText"],
            "returnCode": completed.returncode,
            "stdout": trim_output(completed.stdout),
            "stderr": trim_output(completed.stderr),
        }
        results.append(result)
        if completed.returncode != 0:
            store.fail_step(step_id, f"Command failed with exit code {completed.returncode}", result, return_code=completed.returncode)
            for remaining in step_ids[index + 1 :]:
                store.skip_step(remaining, "Skipped because an earlier historical stage failed.")
            output = {"executed": True, "plan": plan, "stages": results}
            store.fail(job, "Historical dry-run stage failed.", output)
            return {"job": store.get(job.id).to_dict(), "steps": store.list_steps(job.id), "logs": store.list_logs(job.id), "result": output}
        store.succeed_step(step_id, result, return_code=completed.returncode)
    output = {"executed": True, "plan": plan, "stages": results}
    store.succeed(job, output)
    return {"job": store.get(job.id).to_dict(), "steps": store.list_steps(job.id), "logs": store.list_logs(job.id), "result": output}


def historical_context_checks(config: WorkbenchConfig, year: int, chamber: str) -> dict[str, Any]:
    if not ReadOnlyDb(config).configured:
        return {
            "status": "blocked",
            "checks": [
                {"key": "database", "status": "missing", "message": "DATABASE_URL is not configured."},
            ],
        }
    checks = []
    for key, query in CONTEXT_QUERIES.items():
        try:
            rows = ReadOnlyDb(config).execute(query, (year, year))
            count = int(rows[0].get("count") or 0) if rows else 0
            checks.append({"key": key, "status": "ok" if count > 0 else "missing", "count": count})
        except Exception as error:
            checks.append({"key": key, "status": "unavailable", "message": str(error)})
    blockers = [check for check in checks if check["status"] in {"missing", "unavailable"} and check["key"] in {"legislatures", "member_mandates"}]
    return {"status": "blocked" if blockers else "ready_with_warnings", "year": year, "chamber": chamber, "checks": checks, "blockers": blockers}


CONTEXT_QUERIES = {
    "legislatures": "select count(*)::int as count from legislatures where starts_on <= make_date(%s, 12, 31) and coalesce(ends_on, make_date(2100, 1, 1)) >= make_date(%s, 1, 1)",
    "governments": "select count(*)::int as count from governments where starts_on <= make_date(%s, 12, 31) and coalesce(ends_on, make_date(2100, 1, 1)) >= make_date(%s, 1, 1)",
    "member_mandates": "select count(*)::int as count from member_mandates where starts_on <= make_date(%s, 12, 31) and coalesce(ends_on, make_date(2100, 1, 1)) >= make_date(%s, 1, 1)",
    "party_switches": "select count(*)::int as count from member_party_affiliations where starts_on <= make_date(%s, 12, 31) and coalesce(ends_on, make_date(2100, 1, 1)) >= make_date(%s, 1, 1)",
    "committees": "select count(*)::int as count from member_committee_memberships where starts_on <= make_date(%s, 12, 31) and coalesce(ends_on, make_date(2100, 1, 1)) >= make_date(%s, 1, 1)",
}
