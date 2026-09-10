from __future__ import annotations

from pathlib import Path
from typing import Any

from .config import WorkbenchConfig


def list_datasets(config: WorkbenchConfig) -> list[dict[str, Any]]:
    roots = [config.wiki_dir, config.suggestions_dir, config.reports_dir, config.jobs_dir]
    rows: list[dict[str, Any]] = []
    for root in roots:
        if not root.exists():
            continue
        for path in sorted(root.glob("**/*")):
            if path.is_file():
                rows.append(dataset_row(config.data_dir, path))
    return sorted(rows, key=lambda row: row["updatedAt"], reverse=True)


def dataset_row(base: Path, path: Path) -> dict[str, Any]:
    stat = path.stat()
    return {
        "name": path.name,
        "relativePath": str(path.relative_to(base)),
        "kind": path.suffix.lstrip(".") or "file",
        "byteSize": stat.st_size,
        "updatedAt": stat.st_mtime,
    }
