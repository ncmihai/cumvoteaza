"""Single durable worker, safe command recipes, schedules and local recovery archives."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import fcntl
import json
import httpx
import os
from pathlib import Path
import selectors
import signal
import sqlite3
import subprocess
import tarfile
import threading
import time

from .config import repo_root
from .cockpit_store import CockpitStore, encode, stamp
from . import cockpit_workspace as workspace

CATEGORIES = ["bills", "votes", "documents", "text", "members", "parties", "groups", "affiliations", "photos", "logos"]


def recipe(payload):
    selected = set(payload.get("categories", ["bills", "votes", "documents", "text"]))
    if not selected or not selected <= set(CATEGORIES):
        raise ValueError("Select supported import categories")
    year_from = int(payload.get("yearFrom", datetime.now().year))
    year_to = int(payload.get("yearTo", year_from))
    if not 1990 <= year_from <= year_to <= datetime.now().year or year_to - year_from > 8:
        raise ValueError("Choose a range of up to nine years between 1990 and today")
    chamber = payload.get("chamber", "both")
    if chamber not in {"both", "deputies", "senate"}:
        raise ValueError("Unknown chamber")
    limit = max(1, min(int(payload.get("limit", 25)), 10000))
    expanded = set(selected)
    if expanded & {"members", "parties", "groups", "affiliations"}:
        expanded.update(["members", "parties", "groups", "affiliations"])
    if "text" in expanded:
        expanded.add("documents")
    if "documents" in expanded:
        expanded.add("bills")
    stages = []
    vote_date_flags = []
    bounds = []
    for key, flag in [("dateFrom", "date-from"), ("dateTo", "date-to")]:
        value = payload.get(key)
        if value:
            parsed = datetime.strptime(value, "%Y-%m-%d").date()
            if parsed.isoformat() != value or parsed.year < year_from or parsed.year > year_to:
                raise ValueError("Vote dates must be ISO dates within the selected years")
            bounds.append(parsed)
            vote_date_flags.append(f"--{flag}={value}")
    if len(bounds) == 2 and bounds[0] > bounds[1]:
        raise ValueError("Start date must precede end date")
    mode = payload.get("mode", "latest")
    if mode not in {"latest", "queued", "discover"}:
        raise ValueError("Invalid import mode")
    def add(label, command, *flags):
        stages.append({"label": label, "command": ["npm", "run", command, "--", *flags]})
    for year in range(year_from, year_to + 1):
        flags = [f"--years={year}"]
        if chamber != "both":
            flags.append(f"--chamber={chamber}")
        if "bills" in expanded:
            for source in ["deputies", "senate"]:
                if mode != "queued" and chamber in {"both", source}:
                    add(f"{year} · {source} bills discovery", f"ingest:discover:{source}", *flags)
            add(f"{year} · Import bill discoveries", "ingest:import:pending", *flags, "--kind=bill", f"--max-imports={limit}")
            if payload.get("refreshActive", True):
                add(f"{year} · Refresh existing bill dossiers", "ingest:import:pending", *flags, "--kind=bill", "--refresh-existing", f"--max-imports={limit}")
        if "votes" in expanded:
            if mode != "queued" and chamber in {"both", "senate"} and payload.get("dateFrom") and payload.get("dateTo"):
                add(f"{year} · Senate vote calendar", "ingest:discover:senate-votes", *flags, *vote_date_flags)
            if mode != "queued" and chamber in {"both", "deputies"}:
                months = range(bounds[0].month if payload.get("dateFrom") and bounds[0].year == year else 1,
                               bounds[-1].month + 1 if payload.get("dateTo") and bounds[-1].year == year else 13)
                add(f"{year} · Vote discovery", "ingest:discover:deputies-votes", *flags, *vote_date_flags,
                    "--deputies-vote-months=" + ",".join(map(str, months)))
            add(f"{year} · Import vote discoveries", "ingest:import:pending", *flags, *vote_date_flags, "--kind=vote", f"--max-imports={limit}")
        if "text" in expanded:
            add(f"{year} · Extract text", "ingest:bill-text:batch", f"--year={year}", f"--limit={limit}", "--include-unsupported", "--summary-only", "--persist")
    if "members" in expanded:
        start = 2024 if year_to >= 2024 else 2020 if year_to >= 2020 else 2016 if year_to >= 2016 else None
        if start is None:
            raise ValueError("Use the historical roster tools for this period")
        for source in ["deputies", "senate"]:
            if chamber in {"both", source}:
                add(f"{source} · Members, parties and affiliations", f"ingest:{source}:roster", f"--legislature={start}-{start+4}", "--persist")
    for category, kind in [("photos", "photo"), ("logos", "party_logo")]:
        if category in selected:
            add(f"Prepare {category} locally", "ingest:assets:import", f"--asset-type={kind}", f"--limit={limit}", "--persist")
    add("Refresh local read models", "ingest:refresh-read-models")
    if payload.get("billIds"):
        if selected != {"text"} or not isinstance(payload["billIds"], list) or len(payload["billIds"]) > 1000:
            raise ValueError("Selected bill runs support text extraction only, for up to 1000 existing bills")
        if any(not isinstance(identifier,str) or not identifier.startswith("bill-") for identifier in payload["billIds"]):
            raise ValueError("Select existing bill identifiers")
        stages = []
        for identifier in dict.fromkeys(payload["billIds"]):
            add(f"{identifier} · Extract proposal text", "ingest:bill-text", f"--bill={identifier}", "--persist")
        add("Refresh local read models", "ingest:refresh-read-models")
    if mode == "discover":
        stages = [stage for stage in stages if "ingest:discover:" in stage["command"][2]]
    return {"categories": sorted(selected), "dependencies": sorted(expanded-selected), "stages": stages,
            "yearFrom": year_from, "yearTo": year_to, "limit": limit, "target": "local",
            "coverage": "Discovery traverses supported sources; parsing is bounded by the selected per-year limit."}


def child_environment(config, role="working"):
    # Deliberate allowlist: production database/storage credentials never enter importer processes.
    env = {key: value for key, value in os.environ.items() if key in {
        "PATH", "HOME", "TMPDIR", "LANG", "LC_ALL", "SSL_CERT_FILE", "NODE_EXTRA_CA_CERTS"}}
    env.update(DATABASE_URL=workspace.local_url(role), COCKPIT_DATABASE_ROLE=role,
               COCKPIT_ASSET_DIR=str(config.data_dir / "assets"), WORKBENCH_SKIP_DOTENV="1",
               PYTHONUNBUFFERED="1", PYTHON_BIN=str(repo_root()/"tools/parliament-workbench/.venv/bin/python"), NO_COLOR="1")
    return env


def backup(config, *, include_databases=True):
    directory = config.data_dir / "backups"
    directory.mkdir(parents=True, exist_ok=True)
    key = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%f")
    destination = directory / f"cockpit-{key}.tar.gz"
    temp_db = directory / f"{key}.sqlite3"
    with sqlite3.connect(config.state_db_path) as source, sqlite3.connect(temp_db) as target:
        source.backup(target)
    try:
        with tarfile.open(destination, "w:gz") as archive:
            archive.add(temp_db, arcname="workbench.sqlite3")
            for name in ["references", "assets", "proposals", "suggestions", "jobs"]:
                path = config.data_dir / name
                if path.exists():
                    archive.add(path, arcname=name)
            if include_databases:
                import io
                for role, name in workspace.DATABASES.items():
                    data = workspace.docker_command(["pg_dump", "-U", "cockpit", "-Fc", "--no-owner", "--no-acl", name])
                    info = tarfile.TarInfo(f"databases/{role}.dump")
                    info.size = len(data)
                    archive.addfile(info, io.BytesIO(data))
        # Keep seven daily representatives and four older weekly representatives.
        keep, days, weeks = set(), set(), set()
        for path in sorted(directory.glob("cockpit-*.tar.gz"), reverse=True):
            date = datetime.strptime(path.name[8:16], "%Y%m%d")
            day, week = date.date(), date.isocalendar()[:2]
            if day not in days and len(days) < 7:
                days.add(day); keep.add(path)
            elif week not in weeks and len(weeks) < 4:
                weeks.add(week); keep.add(path)
        keep.add(destination)
        for path in directory.glob("cockpit-*.tar.gz"):
            if path not in keep:
                path.unlink()
        return {"file": destination.name, "bytes": destination.stat().st_size, "databasesIncluded": include_databases}
    except BaseException:
        destination.unlink(missing_ok=True)
        raise
    finally:
        temp_db.unlink(missing_ok=True)


class Canceled(Exception):
    pass


def process_identity(pid):
    result = subprocess.run(["ps","-p",str(pid),"-o","lstart="],capture_output=True,text=True)
    return result.stdout.strip() if result.returncode == 0 else None


class Worker:
    def __init__(self, config, canonical_url):
        self.config, self.canonical_url = config, canonical_url
        self.store = CockpitStore(config)
        self.stop_event = threading.Event()
        self.thread = None
        self.lock = None
        self.last_backup_check = 0.0

    def start(self):
        self.lock = (self.config.data_dir / "cockpit-worker.lock").open("a+")
        try:
            fcntl.flock(self.lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            self.lock.close(); self.lock = None
            return
        self.recover_children()
        with self.store.connect() as db:
            db.execute("update cockpit_jobs set status='interrupted',error='Worker interrupted; resume from the saved checkpoint' where status in ('running','canceling')")
        self.thread = threading.Thread(target=self.loop, name="cockpit-worker", daemon=True)
        self.thread.start()

    def recover_children(self):
        for child in self.store.objects("child_process"):
            if child.get("status") != "running":
                continue
            pid, identity = child["pid"], child.get("identity")
            if identity and process_identity(pid) == identity:
                try:
                    os.killpg(pid, signal.SIGTERM)
                    deadline = time.monotonic()+3
                    while time.monotonic()<deadline and process_identity(pid)==identity:
                        time.sleep(.1)
                    if process_identity(pid)==identity:
                        os.killpg(pid,signal.SIGKILL)
                except ProcessLookupError:
                    pass
            self.store.put("child_process",{**child,"status":"recovered"},child["id"])

    def stop(self):
        self.stop_event.set()
        if self.thread:
            self.thread.join(timeout=10)
        if self.lock and (not self.thread or not self.thread.is_alive()):
            self.lock.close()

    def check(self, job_id):
        if self.stop_event.is_set():
            raise InterruptedError("Worker stopped; resume this run")
        if self.store.job(job_id)["cancel_requested"]:
            raise Canceled("Canceled by operator")

    def command(self, job_id, command, environment=None):
        self.check(job_id)
        process = subprocess.Popen(command, cwd=repo_root(), env=environment or child_environment(self.config),
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, start_new_session=True)
        started = time.monotonic()
        tail = bytearray()
        child = None
        try:
            identity = process_identity(process.pid)
            if not identity:
                raise RuntimeError("Cannot record child process identity for restart recovery")
            child = self.store.put("child_process",{"jobId":job_id,"pid":process.pid,"identity":identity,"status":"running"},job_id+"-process")
            with selectors.DefaultSelector() as selector:
                selector.register(process.stdout, selectors.EVENT_READ)
                while True:
                    self.check(job_id)
                    if time.monotonic() - started > 3600:
                        raise TimeoutError("Stage exceeded one hour; progress retained")
                    for key, _ in selector.select(timeout=0.25):
                        data = os.read(key.fd, 8192)
                        if data:
                            tail.extend(data)
                            self.store.event(job_id, data.decode(errors="replace"))
                            del tail[:-16000]
                    if process.poll() is not None:
                        remaining = process.stdout.read()
                        if remaining:
                            tail.extend(remaining); self.store.event(job_id, remaining.decode(errors="replace"))
                        break
            if process.returncode:
                raise RuntimeError(f"Stage exited with code {process.returncode}: " + tail.decode(errors="replace")[-2000:])
            return tail.decode(errors="replace")
        finally:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGTERM)
                try:
                    process.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    os.killpg(process.pid, signal.SIGKILL); process.wait()
            process.stdout.close()
            if child:
                self.store.put("child_process",{**child,"status":"stopped"},child["id"])

    def schedules(self):
        now = datetime.now(timezone.utc)
        for schedule in self.store.objects("schedule"):
            if not schedule.get("enabled") or datetime.fromisoformat(schedule["nextRun"]) > now:
                continue
            if not any(job["status"] in {"running", "queued"} and job["payload"].get("scheduleId") == schedule["id"] for job in self.store.jobs()):
                self.store.enqueue("import", {**schedule["recipe"], "scheduleId": schedule["id"]})
            schedule["nextRun"] = (now + timedelta(hours=schedule["intervalHours"])).isoformat()
            self.store.put("schedule", schedule, schedule["id"])

    def loop(self):
        while not self.stop_event.is_set():
            try:
                self.schedules()
                if time.monotonic()-self.last_backup_check > 3600:
                    self.last_backup_check = time.monotonic()
                    today = datetime.now(timezone.utc).strftime("%Y%m%d")
                    if not list((self.config.data_dir/"backups").glob(f"cockpit-{today}*.tar.gz")):
                        self.store.enqueue("backup", {})
                job = self.store.claim()
                if not job:
                    self.stop_event.wait(1)
                    continue
                try:
                    result = self.execute(job)
                    self.check(job["id"])
                    self.store.update_job(job["id"], status="succeeded", result=result)
                except Canceled as error:
                    self.store.update_job(job["id"], status="canceled", error=str(error))
                except InterruptedError as error:
                    self.store.update_job(job["id"], status="interrupted", error=str(error))
                except Exception as error:
                    self.store.event(job["id"], str(error), "error")
                    self.store.update_job(job["id"], status="failed", error=str(error))
            except Exception:
                self.stop_event.wait(2)

    def execute(self, job):
        key, payload = job["id"], job["payload"]
        if job["kind"] == "setup":
            backup(self.config, include_databases=False)
            self.command(key, ["docker", "compose", "-f", "compose.cockpit.yml", "up", "-d"])
            return workspace.migrate_local()
        if job["kind"] == "seed":
            backup(self.config)
            return workspace.seed_baseline(self.canonical_url, self.store)
        if job["kind"] == "backup":
            return backup(self.config)
        if job["kind"] == "review":
            return workspace.review_changes(self.store,payload["ids"],payload["decision"])
        if job["kind"] == "analysis":
            from .cockpit_analysis import run_analysis
            return run_analysis(self, job)
        if job["kind"] == "preview":
            release = workspace.preview_release(self.store, payload["changes"], payload.get("title", "Reviewed release"))
            try:
                self.command(key, ["npm", "run", "ingest:refresh-read-models"], child_environment(self.config, "release"))
                start_preview(self.config, release["id"], check=lambda: self.check(key))
            except BaseException:
                self.store.put("release", {**release, "status":"preview_failed"}, release["id"])
                raise
            return self.store.put("release", {**release, "status":"preview_ready"}, release["id"])
        if job["kind"] == "restore":
            return restore_backup(self.config, payload["name"])
        if job["kind"] != "import":
            raise ValueError("Unsupported worker job")
        plan = recipe(payload)
        if payload.get("billIds"):
            from .cockpit_api import bill_rows
            corpus, _ = bill_rows(self.store)
            by_id = {row["id"]:row for row in corpus}
            for stage in plan["stages"]:
                for i, flag in enumerate(stage["command"]):
                    if flag.startswith("--bill="):
                        selected = by_id.get(flag[7:])
                        if selected and not selected["documents"]:
                            aliases = [row for row in corpus if row["familyId"] == selected["familyId"] and row["documents"]]
                            if aliases:
                                target = max(aliases,key=lambda row:row["documents"])
                                stage["command"][i] = "--bill="+target["id"]
                                stage["label"] += " · source alias "+target["id"]
        previous_path = self.config.jobs_dir / f"{key}-baseline.json"
        previous_path.parent.mkdir(parents=True, exist_ok=True)
        if not previous_path.exists():
            previous_path.write_text(encode(workspace.snapshot()))
        previous = json.loads(previous_path.read_text())
        source_failures = []
        discovery = payload.get("mode") == "discover" or bool(payload.get("billIds"))
        try:
            for index, stage in enumerate(plan["stages"]):
                stage_id = f"{key}-stage-{index}"
                completed = any(item["id"] == stage_id and item.get("status") == "succeeded" for item in self.store.objects("source_stage")) if discovery else False
                completed = completed and stage["command"][2] != "ingest:refresh-read-models"
                if completed or (not discovery and index < job["checkpoint"]):
                    continue
                self.store.event(key, stage["label"])
                try:
                    self.command(key, stage["command"])
                    if discovery: self.store.put("source_stage", {"jobId":key,"label":stage["label"],"status":"succeeded"}, stage_id)
                except (RuntimeError, TimeoutError) as error:
                    if not discovery: raise
                    failure = {"jobId":key,"label":stage["label"],"status":"failed","error":str(error)}
                    self.store.put("source_stage", failure, stage_id)
                    source_failures.append(failure)
                    self.store.event(key, f"Source failed; continuing independent sources: {stage['label']}", "error")
                self.store.update_job(key, checkpoint=max(job["checkpoint"],index+1))
        finally:
            counts = workspace.capture_changes(self.store, key, previous)
            self.store.put("import_batch", {"jobId": key, "recipe": payload, "counts": counts,
                                            "lastAttempt": stamp(), "complete": False}, key + "-batch")
        if source_failures:
            self.store.update_job(key, result={"counts":counts,"plan":plan,"sourceFailures":source_failures})
            raise RuntimeError(f"{len(source_failures)} source ranges failed. Successful ranges are retained; retry reruns failed ranges only.")
        self.store.update_job(key, checkpoint=len(plan["stages"]))
        self.store.put("import_batch", {"jobId": key, "recipe": payload, "counts": counts,
                                        "lastSuccess": stamp(), "complete": True, "bounded": True}, key + "-batch")
        for profile in payload.get("profiles", []):
            ids = sorted({(item["after"] or {}).get("bill_id") or (item["after"] or {}).get("id")
                          for item in self.store.changes(key) if item["after"] and (item["table_name"] == "bills" or item["after"].get("bill_id"))})
            if ids:
                self.store.enqueue("analysis", {"profileId": profile, "billIds": ids})
        return {"counts": counts, "plan": plan, "publication": "review_required"}


def start_preview(config, release_id, check=lambda: None):
    pidfile = config.data_dir / "preview-process.json"
    next_bin = str(repo_root()/"node_modules/next/dist/bin/next")
    if pidfile.exists():
        previous = json.loads(pidfile.read_text())
        command = subprocess.run(["ps", "-p", str(previous["pid"]), "-o", "command="], capture_output=True, text=True).stdout
        if next_bin in command and "3001" in command:
            try:
                os.killpg(previous["pid"], signal.SIGTERM)
            except ProcessLookupError:
                pass
    env = child_environment(config, "release")
    env["COCKPIT_PREVIEW_RELEASE_ID"] = release_id
    env["NEXT_TELEMETRY_DISABLED"] = "1"
    log = (config.data_dir/"preview-server.log").open("ab")
    process = subprocess.Popen(["node", next_bin, "dev", "--port", "3001", "--hostname", "127.0.0.1"],
                              cwd=repo_root()/"apps/web", env=env, stdout=log, stderr=log, start_new_session=True)
    log.close()
    pidfile.write_text(encode({"pid": process.pid, "releaseId": release_id}))
    try:
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline:
            check()
            if process.poll() is not None:
                raise RuntimeError("Website preview exited during startup; inspect preview-server.log")
            try:
                response = httpx.get("http://127.0.0.1:3001/api/cockpit-preview", timeout=2)
                if response.status_code == 200 and response.json().get("releaseId") == release_id:
                    return process.pid
            except (httpx.HTTPError, ValueError):
                pass
            time.sleep(.25)
        raise RuntimeError("Website preview did not confirm the selected release within 90 seconds")
    except BaseException:
        try: os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError: pass
        raise


def restore_backup(config, name):
    from psycopg import sql
    if Path(name).name != name or not name.startswith("cockpit-") or not name.endswith(".tar.gz"):
        raise ValueError("Choose an existing cockpit backup")
    source = config.data_dir/"backups"/name
    root = config.data_dir/"recovery"/datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S%f")
    root.mkdir(parents=True)
    with tarfile.open(source) as archive:
        for member in archive.getmembers():
            if member.issym() or member.islnk() or not (root/member.name).resolve().is_relative_to(root.resolve()):
                raise ValueError("Unsafe recovery archive")
        archive.extractall(root, filter="data")
    with sqlite3.connect(root/"workbench.sqlite3") as db:
        if db.execute("pragma integrity_check").fetchone()[0] != "ok":
            raise ValueError("Recovered SQLite database failed its integrity check")
    databases = []
    for role in workspace.DATABASES:
        file = root/"databases"/f"{role}.dump"
        if not file.exists():
            continue
        name = "cockpit_restore_"+root.name+"_"+role
        with workspace.connect() as db:
            db.autocommit = True
            db.execute(sql.SQL("create database {}").format(sql.Identifier(name)))
        workspace.docker_command(["pg_restore", "-U", "cockpit", "--no-owner", "--no-acl", "--exit-on-error", "--single-transaction", "-d", name], input=file.read_bytes())
        databases.append(name)
    return {"directory": str(root), "databases": databases, "sqliteIntegrity": "ok", "activeWorkspaceChanged": False}
