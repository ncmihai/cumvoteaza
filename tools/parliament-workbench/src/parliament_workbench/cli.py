from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import signal
import socket
import subprocess
import sys
import time
from typing import Any
import urllib.request

from .config import load_config, workbench_root
from .db import ReadOnlyDb
from .doctor import doctor_report
from .institution_atlas import atlas_status, seed_institution_atlas
from .model_audit import audit_bill
from .storage import read_json, write_json
from .state import WorkbenchState
from .wiki import build_wiki, search_wiki, wiki_status


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="workbench", description="Local parliament workbench")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("status", help="Print workbench status.")
    sub.add_parser("pip-install", help="Install Python dependencies into the active interpreter.")
    sub.add_parser("test", help="Run workbench Python tests.")
    sub.add_parser("build-ui", help="Build the React UI for standalone serving.")
    sub.add_parser("app-start", help="Start API and UI in the background and open the browser.")
    sub.add_parser("app-restart", help="Restart the standalone workbench app.")
    sub.add_parser("app-stop", help="Stop background API and UI processes.")
    sub.add_parser("app-status", help="Print background API and UI process status.")
    sub.add_parser("doctor", help="Run local workbench setup checks.")
    sub.add_parser("state-init", help="Initialize the local SQLite workflow database.")
    sub.add_parser("atlas-seed", help="Seed the local Institution Atlas.")

    serve = sub.add_parser("serve", help="Start the FastAPI server.")
    serve.add_argument("--host", default=None)
    serve.add_argument("--port", type=int, default=None)

    sub.add_parser("dev", help="Start local API and UI servers.")

    build = sub.add_parser("build-wiki", help="Build the local parliament wiki.")
    build.add_argument("--limit", type=int, default=5000)

    search = sub.add_parser("search", help="Search the generated local wiki.")
    search.add_argument("query")
    search.add_argument("--limit", type=int, default=10)
    search.add_argument("--entity-type", default=None, choices=["bill", "document", "vote", "member", "party", "group", "government", "data_health_review"])

    audit = sub.add_parser("audit-bill", help="Run local model audit for one bill.")
    audit.add_argument("--bill", required=True)
    audit.add_argument("--model", default=None)

    args = parser.parse_args(argv)
    config = load_config()

    if args.command == "status":
        print_json(
            {
                "database": ReadOnlyDb(config).status(),
                "workbenchState": WorkbenchState(config).status(),
                "wiki": wiki_status(config),
                "institutionAtlas": atlas_status(config),
                "dataDir": str(config.data_dir),
                "model": config.model,
            }
        )
        return 0
    if args.command == "pip-install":
        return pip_install()
    if args.command == "test":
        return run_tests()
    if args.command == "build-ui":
        return build_ui()
    if args.command == "app-start":
        print_json(app_start(config))
        return 0
    if args.command == "app-restart":
        print_json(app_restart(config))
        return 0
    if args.command == "app-stop":
        print_json(app_stop(config))
        return 0
    if args.command == "app-status":
        print_json(app_status(config))
        return 0
    if args.command == "doctor":
        print_json(doctor_report(config))
        return 0
    if args.command == "state-init":
        print_json(WorkbenchState(config).initialize())
        return 0
    if args.command == "atlas-seed":
        print_json(seed_institution_atlas(config))
        return 0
    if args.command == "serve":
        return serve_api(host=args.host or config.api_host, port=args.port or config.api_port)
    if args.command == "dev":
        return run_dev()
    if args.command == "build-wiki":
        print_json(build_wiki(config, limit=args.limit))
        return 0
    if args.command == "search":
        print_json({"results": search_wiki(config, args.query, limit=args.limit, entity_type=args.entity_type)})
        return 0
    if args.command == "audit-bill":
        result = audit_bill(config, args.bill, model=args.model)
        print_json(result.__dict__)
        return 0 if result.status == "succeeded" else 1
    raise SystemExit(f"Unsupported command: {args.command}")


def serve_api(host: str, port: int) -> int:
    try:
        import uvicorn
        from .api import create_app
    except Exception as error:
        print(f"Cannot start API: {error}", file=sys.stderr)
        print("Run `npm run workbench:install` first.", file=sys.stderr)
        return 1
    uvicorn.run(create_app(), host=host, port=port, log_level="info")
    return 0


def pip_install() -> int:
    root = workbench_root()
    return subprocess.call([sys.executable, "-m", "pip", "install", "-r", str(root / "requirements.txt")])


def run_tests() -> int:
    root = workbench_root()
    return subprocess.call([sys.executable, "-m", "unittest", "discover", "-s", str(root / "tests")])


def build_ui() -> int:
    root = workbench_root()
    npm = "npm.cmd" if os.name == "nt" else "npm"
    return subprocess.call([npm, "--prefix", str(root / "ui"), "run", "build"], cwd=root.parents[1])


def app_state_path(config) -> Path:
    return config.data_dir / "workbench-app.json"


def app_start(config) -> dict[str, Any]:
    current = app_status(config)
    standalone_url = f"http://{config.api_host}:{config.api_port}"
    if current.get("api", {}).get("running"):
        open_browser(standalone_url)
        return {**current, "started": False, "message": "Workbench is already running."}

    root = workbench_root()
    repo = root.parents[1]
    logs_dir = config.data_dir / "logs"
    logs_dir.mkdir(parents=True, exist_ok=True)
    api_log = logs_dir / "api.log"

    build_code = build_ui()
    if build_code != 0:
        return {**current, "started": False, "buildCode": build_code, "message": "UI build failed. Run `npm run workbench:build-ui` for details."}

    api = launch_background(
        [sys.executable, str(root / "workbench.py"), "serve"],
        cwd=repo,
        log_path=api_log,
    )
    write_json(
        app_state_path(config),
        {
            "startedAt": time.time(),
            "mode": "standalone",
            "api": {"pid": api.pid, "port": config.api_port, "log": str(api_log)},
        },
    )
    api_ready = wait_for_port("127.0.0.1", config.api_port, timeout=12)
    if api_ready:
        open_browser(standalone_url)
    return {**app_status(config), "started": True, "apiReady": api_ready, "url": standalone_url}


def app_restart(config) -> dict[str, Any]:
    stopped = app_stop(config)
    started = app_start(config)
    return {"stopped": stopped, "started": started}


def app_stop(config) -> dict[str, Any]:
    state = read_json(app_state_path(config), default={}) or {}
    stopped = {}
    for name in ["api", "ui"]:
        pid = state.get(name, {}).get("pid")
        stopped[name] = stop_pid(pid if isinstance(pid, int) else None)
    write_json(app_state_path(config), {**state, "stoppedAt": time.time()})
    return {"stopped": stopped}


def app_status(config) -> dict[str, Any]:
    state = read_json(app_state_path(config), default={}) or {}
    api_state = state.get("api", {}) if isinstance(state.get("api", {}), dict) else {}
    ui_state = state.get("ui", {}) if isinstance(state.get("ui", {}), dict) else {}
    return {
        "statePath": str(app_state_path(config)),
        "mode": state.get("mode") or "unknown",
        "api": process_state({**api_state, "port": api_state.get("port") or config.api_port}, host=config.api_host, health_path="/api/status"),
        "ui": process_state(ui_state, host=config.api_host),
        "url": f"http://{config.api_host}:{config.api_port}",
    }


def process_state(state: Any, host: str = "127.0.0.1", health_path: str | None = None) -> dict[str, Any]:
    if not isinstance(state, dict):
        state = {}
    pid = state.get("pid")
    running = isinstance(pid, int) and pid_running(pid)
    port = state.get("port")
    if not running and isinstance(port, int):
        running = http_health_ok(host, port, health_path) if health_path else port_listening(host, port)
    return {**state, "running": running}


def launch_background(command: list[str], cwd: Path, log_path: Path) -> subprocess.Popen:
    log_handle = log_path.open("a", encoding="utf-8")
    kwargs: dict[str, Any] = {
        "cwd": cwd,
        "stdout": log_handle,
        "stderr": subprocess.STDOUT,
    }
    if os.name == "nt":
        kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
    else:
        kwargs["start_new_session"] = True
    return subprocess.Popen(command, **kwargs)


def pid_running(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except PermissionError:
        return True
    except ProcessLookupError:
        return False
    except OSError:
        return False


def stop_pid(pid: int | None) -> dict[str, Any]:
    if not isinstance(pid, int):
        return {"pid": pid, "stopped": False, "reason": "missing pid"}
    if not pid_running(pid):
        return {"pid": pid, "stopped": True, "reason": "already stopped"}
    try:
        if os.name == "nt":
            completed = subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], capture_output=True, text=True, check=False)
            return {"pid": pid, "stopped": completed.returncode == 0, "output": completed.stdout.strip() or completed.stderr.strip()}
        os.killpg(pid, signal.SIGTERM)
        time.sleep(0.5)
        if pid_running(pid):
            os.killpg(pid, signal.SIGKILL)
        return {"pid": pid, "stopped": True}
    except Exception as error:
        return {"pid": pid, "stopped": False, "reason": str(error)}


def wait_for_port(host: str, port: int, timeout: float) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection((host, port), timeout=0.5):
                return True
        except OSError:
            time.sleep(0.25)
    return False


def port_listening(host: str, port: int) -> bool:
    try:
        with socket.create_connection((host, port), timeout=0.4):
            return True
    except OSError:
        return False


def http_health_ok(host: str, port: int, path: str | None) -> bool:
    if not path:
        return port_listening(host, port)
    url = f"http://{host}:{port}{path}"
    try:
        request = urllib.request.Request(url, method="GET")
        with urllib.request.urlopen(request, timeout=0.8) as response:
            return 200 <= int(response.status) < 400
    except Exception:
        return False


def open_browser(url: str) -> None:
    try:
        if sys.platform == "darwin":
            subprocess.Popen(["open", url])
        elif os.name == "nt":
            os.startfile(url)  # type: ignore[attr-defined]
        else:
            subprocess.Popen(["xdg-open", url])
    except Exception:
        pass


def run_dev() -> int:
    root = workbench_root()
    api = [sys.executable, str(root / "workbench.py"), "serve"]
    npm = "npm.cmd" if os.name == "nt" else "npm"
    ui = [npm, "--prefix", str(root / "ui"), "run", "dev", "--", "--host", "127.0.0.1"]
    processes = [
        subprocess.Popen(api, cwd=root.parents[1]),
        subprocess.Popen(ui, cwd=root.parents[1]),
    ]

    def stop_processes(*_: Any) -> None:
        for process in processes:
            if process.poll() is None:
                process.terminate()

    signal.signal(signal.SIGTERM, stop_processes)
    if hasattr(signal, "SIGINT"):
        signal.signal(signal.SIGINT, stop_processes)
    try:
        while True:
            for process in processes:
                code = process.poll()
                if code is not None:
                    stop_processes()
                    return code
            wait_portably(processes)
    except KeyboardInterrupt:
        stop_processes()
        return 130


def wait_portably(processes: list[subprocess.Popen]) -> None:
    import time

    time.sleep(0.5)


def print_json(payload: Any) -> None:
    print(json.dumps(payload, ensure_ascii=False, indent=2))
