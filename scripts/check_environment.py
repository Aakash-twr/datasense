#!/usr/bin/env python3
"""Verify local/server environment prerequisites for DataSense."""

from __future__ import annotations

import os
import platform
import shutil
import sys
from pathlib import Path


def check_cmd(name: str) -> str:
    path = shutil.which(name)
    return f"OK ({path})" if path else "MISSING"


def main() -> int:
    print("=== DataSense Environment Verification ===")
    print(f"Platform:       {platform.system()} {platform.release()} ({platform.machine()})")
    print(f"Python:         {sys.version.split()[0]}")
    if sys.version_info < (3, 11):
        print("ERROR: Python 3.11+ is required.")
        return 1

    repo_root = Path(__file__).resolve().parent.parent
    venv_python = repo_root / "services" / "api" / ".venv" / "bin" / "python"
    print(f"API .venv:      {'OK' if venv_python.exists() else 'MISSING'} ({venv_python})")
    print(f"node / npm:     node={check_cmd('node')} | npm={check_cmd('npm')}")
    print(f"docker:         {check_cmd('docker')}")
    print(f"pg_dump:        {check_cmd('pg_dump')} (optional locally if using Docker postgres)")

    usage = shutil.disk_usage(repo_root)
    free_gb = usage.free / (1024**3)
    print(f"Disk Free:      {free_gb:.2f} GB")

    env_file = repo_root / "services" / "api" / ".env"
    if env_file.exists():
        content = env_file.read_text(encoding="utf-8", errors="ignore")
        if "ENVIRONMENT=production" in content and "change-this-in-production" in content:
            print("SECURITY WARN: Production ENVIRONMENT detected with default JWT secret!")
            return 2
    print("Environment check complete.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
