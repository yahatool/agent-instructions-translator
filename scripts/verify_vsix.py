"""Verify a built VSIX and run its extracted offline runtime, without Python deps."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import xml.etree.ElementTree as ET
import zipfile


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", required=True)
    parser.add_argument("--version", required=True)
    args = parser.parse_args()
    source_manifest = json.loads(Path("package.json").read_text(encoding="utf-8"))
    vsix = Path("dist", f'{source_manifest["name"]}-{args.version}-{args.target}.vsix')

    with zipfile.ZipFile(vsix) as archive, tempfile.TemporaryDirectory(prefix="ait-vsix-") as directory:
        root = Path(directory)
        manifest = json.loads(archive.read("extension/package.json"))
        identity = ET.fromstring(archive.read("extension.vsixmanifest")).find(".//{*}Identity")
        if identity is None or identity.attrib.get("TargetPlatform") != args.target:
            raise RuntimeError("VSIX target does not match the runner")
        if manifest["version"] != args.version or manifest["publisher"] != source_manifest["publisher"]:
            raise RuntimeError("VSIX publisher/version does not match package.json")
        for entry in archive.infolist():
            destination = (root / entry.filename).resolve()
            if not destination.is_relative_to(root.resolve()):
                raise RuntimeError("Unsafe path in VSIX")
        archive.extractall(root)
        bundle = root / "extension" / "resources" / "argos" / args.target
        executable = bundle / "runtime" / ("argos-runtime.exe" if args.target.startswith("win32-") else "argos-runtime")
        for pair in ("ja_en", "en_ja"):
            model = bundle / "models" / pair / "model" / "model.bin"
            if not model.is_file() or model.stat().st_size < 1_000_000:
                raise RuntimeError(f"Bundled model is missing/empty: {pair}")
        if os.name != "nt":
            executable.chmod(0o755)
        environment = {
            **os.environ,
            "ARGOS_PACKAGES_DIR": str(bundle / "models"),
            "ARGOS_DEVICE_TYPE": "cpu",
            "ARGOS_DEBUG": "0",
            "XDG_DATA_HOME": str(root / "data"),
            "XDG_CONFIG_HOME": str(root / "config"),
            "XDG_CACHE_HOME": str(root / "cache"),
        }
        for source, target, text, expected in (
            ("en", "ja", "Hello world.", r"[\u3040-\u30ff\u3400-\u9fff]"),
            ("ja", "en", "こんにちは世界。", r"[A-Za-z]"),
        ):
            result = subprocess.run(
                [str(executable), "--from-lang", source, "--to-lang", target],
                input=text, text=True, encoding="utf-8", capture_output=True,
                env=environment, check=True, timeout=120,
            )
            if result.stdout.strip() == text or not re.search(expected, result.stdout):
                raise RuntimeError(f"Translation smoke test failed: {source} -> {target}")
            print(f"Packaged runtime smoke test passed: {source} -> {target}")

    with vsix.open("rb") as stream:
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    vsix.with_suffix(".vsix.sha256").write_text(f"{digest}  {vsix.name}\n", encoding="utf-8")
    print(f"Verified {vsix.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
