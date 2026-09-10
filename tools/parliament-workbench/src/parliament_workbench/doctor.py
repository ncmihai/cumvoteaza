from __future__ import annotations

import importlib.util
import socket
from typing import Any

from .config import WorkbenchConfig
from .db import ReadOnlyDb
from .digi_storage import digi_status
from .wiki import wiki_status


def doctor_report(config: WorkbenchConfig) -> dict[str, Any]:
    checks = [
        python_dependency_check("fastapi"),
        python_dependency_check("uvicorn"),
        python_dependency_check("pydantic"),
        python_dependency_check("httpx"),
        python_dependency_check("psycopg"),
        ui_build_check(config),
        database_check(config),
        ollama_check(config),
        digi_check(config),
        wiki_check(config),
        port_check("api", config.api_host, config.api_port),
        port_check("vite", "127.0.0.1", 5173),
    ]
    return {
        "ok": all(check["ok"] for check in checks if check.get("required", True)),
        "checks": checks,
    }


def python_dependency_check(module_name: str) -> dict[str, Any]:
    return {
        "id": f"python:{module_name}",
        "label": f"Python dependency: {module_name}",
        "ok": importlib.util.find_spec(module_name) is not None,
        "required": True,
    }


def ui_build_check(config: WorkbenchConfig) -> dict[str, Any]:
    index_path = config.ui_dist_dir / "index.html"
    return {
        "id": "ui:dist",
        "label": "Workbench UI build",
        "ok": index_path.exists(),
        "required": config.serve_ui,
        "path": str(index_path),
        "hint": "Run `npm run workbench:build-ui` if missing.",
    }


def database_check(config: WorkbenchConfig) -> dict[str, Any]:
    status = ReadOnlyDb(config).status()
    return {
        "id": "database",
        "label": "Database",
        "ok": bool(status.get("ok")),
        "required": False,
        "details": status,
    }


def ollama_check(config: WorkbenchConfig) -> dict[str, Any]:
    try:
        import httpx

        with httpx.Client(timeout=2) as client:
            response = client.get(f"{config.ollama_base_url}/api/tags")
            response.raise_for_status()
            payload = response.json()
        models = [item.get("name") for item in payload.get("models", []) if item.get("name")]
        return {
            "id": "ollama",
            "label": "Ollama",
            "ok": True,
            "required": False,
            "baseUrl": config.ollama_base_url,
            "models": models,
            "modelAvailable": config.model in models,
        }
    except Exception as error:
        return {
            "id": "ollama",
            "label": "Ollama",
            "ok": False,
            "required": False,
            "baseUrl": config.ollama_base_url,
            "error": str(error),
        }


def digi_check(config: WorkbenchConfig) -> dict[str, Any]:
    status = digi_status(config)
    return {
        "id": "digi",
        "label": "Digi Storage",
        "ok": bool(status.get("configured")) and bool(status.get("authenticated")) and bool(status.get("mountFound")),
        "required": False,
        "details": status,
    }


def wiki_check(config: WorkbenchConfig) -> dict[str, Any]:
    status = wiki_status(config)
    return {
        "id": "wiki",
        "label": "Local wiki",
        "ok": bool(status.get("built")) and bool(status.get("sqlitePath")),
        "required": False,
        "details": status,
    }


def port_check(name: str, host: str, port: int) -> dict[str, Any]:
    listening = is_port_listening(host, port)
    return {
        "id": f"port:{port}",
        "label": f"{name} port {host}:{port}",
        "ok": True,
        "required": False,
        "listening": listening,
        "hint": "Listening is expected if the workbench is already running." if listening else "No listener detected.",
    }


def is_port_listening(host: str, port: int) -> bool:
    try:
        with socket.create_connection((host, port), timeout=0.35):
            return True
    except OSError:
        return False
