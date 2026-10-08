"""Audit the exact Python packages installed in the native build environment."""

import argparse
import os
from pathlib import Path
import subprocess
import sys


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", required=True)
    args = parser.parse_args()
    build = Path(".build", "argos", args.target)
    python = build / "venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    requirements = build / "audit-requirements.txt"
    installed = subprocess.run(
        [str(python), "-m", "pip", "freeze"], check=True, capture_output=True, text=True,
    ).stdout
    if not installed.strip():
        raise RuntimeError("No Python build packages found to audit")
    requirements.write_text(installed, encoding="utf-8")
    # The build uses --no-deps for Argos to exclude unused Torch/Stanza packages.
    # Audit the actual installed versions without resolving those unused extras.
    subprocess.run(
        [sys.executable, "-m", "pip_audit", "--strict", "--no-deps", "--disable-pip",
         "--progress-spinner", "off", "-r", str(requirements)],
        check=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
