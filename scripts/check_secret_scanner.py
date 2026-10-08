"""Fail closed if the installed secret scanner does not detect a synthetic key."""

from pathlib import Path
import secrets
import string
import subprocess
import sys
import tempfile


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="ait-scanner-check-") as directory:
        # Assemble a nonfunctional fixture so no credential is stored in source.
        token = "gh" + "p_" + "".join(secrets.SystemRandom().sample(string.ascii_letters + string.digits, 36))
        Path(directory, "fixture.txt").write_text(f'token = "{token}"\n', encoding="utf-8")
        result = subprocess.run(
            [sys.argv[1], "dir", "--redact", "--no-banner", directory],
            capture_output=True,
            timeout=30,
        )
        if result.returncode != 1:
            raise RuntimeError("Gitleaks failed its detection self-check")
    print("Secret scanner detection self-check passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
