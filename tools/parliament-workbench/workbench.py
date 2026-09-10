#!/usr/bin/env python3
"""Entrypoint wrapper for the local parliament workbench."""

from pathlib import Path
import os
import sys


ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

VENV_PYTHON = ROOT / ".venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
VENV_ROOT = ROOT / ".venv"
if VENV_PYTHON.exists() and Path(sys.prefix).resolve() != VENV_ROOT.resolve():
    os.execv(str(VENV_PYTHON), [str(VENV_PYTHON), *sys.argv])

from parliament_workbench.cli import main  # noqa: E402


if __name__ == "__main__":
    raise SystemExit(main())
