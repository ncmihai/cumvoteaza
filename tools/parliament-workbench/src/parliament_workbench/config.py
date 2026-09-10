from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path


def repo_root() -> Path:
    return Path(__file__).resolve().parents[4]


def workbench_root() -> Path:
    return Path(__file__).resolve().parents[2]


def load_env_files() -> None:
    if os.environ.get("WORKBENCH_SKIP_DOTENV") == "1":
        return
    try:
        from dotenv import load_dotenv
    except Exception:
        return
    root = repo_root()
    load_dotenv(root / ".env", override=False)
    load_dotenv(workbench_root() / ".env", override=False)


@dataclass(frozen=True)
class WorkbenchConfig:
    database_url: str | None
    ollama_base_url: str
    model: str
    data_dir: Path
    api_host: str
    api_port: int
    serve_ui: bool = True
    enable_writes: bool = False
    write_token: str | None = None
    digi_storage_email: str | None = None
    digi_storage_password: str | None = None
    digi_storage_base_url: str = "https://storage.rcs-rds.ro"
    digi_storage_api_url: str = "https://storage.rcs-rds.ro/api/v2.1"
    digi_storage_mount_id: str | None = None
    digi_storage_base_path: str = "cumvoteaza-assets"
    asset_ftp_host: str | None = None
    asset_ftp_username: str | None = None
    asset_ftp_public_base_url: str | None = None

    @property
    def wiki_dir(self) -> Path:
        return self.data_dir / "wiki"

    @property
    def suggestions_dir(self) -> Path:
        return self.data_dir / "suggestions"

    @property
    def reports_dir(self) -> Path:
        return self.data_dir / "reports"

    @property
    def jobs_dir(self) -> Path:
        return self.data_dir / "jobs"

    @property
    def proposals_dir(self) -> Path:
        return self.data_dir / "proposals"

    @property
    def state_db_path(self) -> Path:
        return self.data_dir / "workbench.sqlite3"

    @property
    def ui_dist_dir(self) -> Path:
        return workbench_root() / "ui" / "dist"


def load_config() -> WorkbenchConfig:
    load_env_files()
    root = repo_root()
    data_dir = Path(os.environ.get("WORKBENCH_DATA_DIR", "data/parliament-workbench"))
    if not data_dir.is_absolute():
        data_dir = root / data_dir
    digi_base_url = os.environ.get("DIGI_STORAGE_BASE_URL", "https://storage.rcs-rds.ro").rstrip("/")
    return WorkbenchConfig(
        database_url=os.environ.get("DATABASE_URL") or None,
        ollama_base_url=os.environ.get("OLLAMA_BASE_URL", "http://127.0.0.1:11434").rstrip("/"),
        model=os.environ.get("WORKBENCH_MODEL", "qwen3:8b"),
        data_dir=data_dir,
        api_host=os.environ.get("WORKBENCH_API_HOST", "127.0.0.1"),
        api_port=int(os.environ.get("WORKBENCH_API_PORT", "8787")),
        serve_ui=os.environ.get("WORKBENCH_SERVE_UI", "1") != "0",
        enable_writes=os.environ.get("WORKBENCH_ENABLE_WRITES", "0") == "1",
        write_token=(os.environ.get("WORKBENCH_WRITE_TOKEN") or "").strip() or None,
        digi_storage_email=first_env(["DIGI_STORAGE_EMAIL", "DIGI_EMAIL", "ASSET_FTP_USERNAME"]),
        digi_storage_password=first_env(["DIGI_STORAGE_PASSWORD", "DIGI_PASSWORD", "ASSET_FTP_PASSWORD"]),
        digi_storage_base_url=digi_base_url,
        digi_storage_api_url=os.environ.get("DIGI_STORAGE_API_URL", f"{digi_base_url}/api/v2.1").rstrip("/"),
        digi_storage_mount_id=(os.environ.get("DIGI_STORAGE_MOUNT_ID") or "").strip() or None,
        digi_storage_base_path=(os.environ.get("DIGI_STORAGE_BASE_PATH") or "cumvoteaza-assets").strip().strip("/") or "cumvoteaza-assets",
        asset_ftp_host=(os.environ.get("ASSET_FTP_HOST") or "").strip() or None,
        asset_ftp_username=(os.environ.get("ASSET_FTP_USERNAME") or "").strip() or None,
        asset_ftp_public_base_url=(os.environ.get("ASSET_FTP_PUBLIC_BASE_URL") or "").strip() or None,
    )


def first_env(names: list[str]) -> str | None:
    for name in names:
        value = (os.environ.get(name) or "").strip()
        if value:
            return value
    return None
