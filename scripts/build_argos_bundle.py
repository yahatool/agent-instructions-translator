#!/usr/bin/env python3
"""Build a self-contained Argos executable and bundle ja<->en models.

Run this script natively on every target platform. PyInstaller does not cross-compile.
The output is resources/argos/<vscode-target>/ and is consumed by the extension.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import urllib.request
import zipfile


ROOT = Path(__file__).resolve().parents[1]
ARGOS_VERSION = "1.11.0"
PYINSTALLER_VERSION = "6.16.0"
MODELS = (
    (
        "translate-ja_en-1_1.argosmodel",
        "https://data.argosopentech.com/argospm/v1/translate-ja_en-1_1.argosmodel",
        "623e3477959a815eb0a5ef53e09079ae8f1f9d3bbcd230473baf28c03fb83335",
    ),
    (
        "translate-en_ja-1_1.argosmodel",
        "https://data.argosopentech.com/argospm/v1/translate-en_ja-1_1.argosmodel",
        "16300cc4eaa85320520cabcf433b63d01be40ef6966251de72043a083408f716",
    ),
)

# Runtime distributions reachable from the frozen Argos/CTranslate2 executable.
# Build-only packages and Argos's unused Stanza/SpaCy dependencies are excluded.
RUNTIME_LICENSE_PACKAGES = (
    "argostranslate",
    "charset-normalizer",
    "click",
    "ctranslate2",
    "joblib",
    "numpy",
    "packaging",
    "protobuf",
    "PyYAML",
    "regex",
    "sacremoses",
    "sentencepiece",
    "tqdm",
)


def vscode_target() -> str:
    systems = {"Darwin": "darwin", "Windows": "win32", "Linux": "linux"}
    machines = {"x86_64": "x64", "AMD64": "x64", "arm64": "arm64", "aarch64": "arm64"}
    system = systems.get(platform.system())
    machine = machines.get(platform.machine())
    if not system or not machine:
        raise RuntimeError(f"Unsupported build host: {platform.system()}/{platform.machine()}")
    return f"{system}-{machine}"


def run(*command: str, env: dict[str, str] | None = None) -> None:
    print("+", " ".join(command), flush=True)
    subprocess.run(command, check=True, env=env)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download(url: str, destination: Path, expected_hash: str) -> None:
    if destination.exists() and sha256(destination) == expected_hash:
        return
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(destination.suffix + ".part")
    print(f"Downloading {url}", flush=True)
    urllib.request.urlretrieve(url, temporary)
    actual_hash = sha256(temporary)
    if actual_hash != expected_hash:
        temporary.unlink(missing_ok=True)
        raise RuntimeError(f"SHA-256 mismatch for {url}: {actual_hash}")
    temporary.replace(destination)


def make_legacy_stanza_resources_offline_compatible(models_directory: Path) -> None:
    """Add the package map expected by Stanza 1.10 to old Argos model metadata."""
    for resources_path in models_directory.glob("*/stanza/resources.json"):
        resources = json.loads(resources_path.read_text(encoding="utf-8"))
        changed = False
        for language in resources.values():
            if not isinstance(language, dict) or "packages" in language:
                continue
            default_processors = language.get("default_processors")
            if isinstance(default_processors, dict):
                language["packages"] = {"default": default_processors.copy()}
                changed = True
        if changed:
            resources_path.write_text(
                json.dumps(resources, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", default=vscode_target())
    parser.add_argument("--model-cache", type=Path, default=ROOT / ".build" / "model-cache")
    parser.add_argument("--skip-model-download", action="store_true")
    parser.add_argument(
        "--lipo",
        type=Path,
        help="Alternative lipo-compatible executable for macOS build hosts",
    )
    args = parser.parse_args()

    native_target = vscode_target()
    if args.target != native_target:
        raise RuntimeError(f"PyInstaller cannot cross-compile: requested {args.target}, host is {native_target}")

    build_root = ROOT / ".build" / "argos" / args.target
    bundle = ROOT / "resources" / "argos" / args.target
    os.environ.setdefault("PYINSTALLER_CONFIG_DIR", str(build_root / "pyinstaller-config"))
    os.environ.setdefault("PIP_CACHE_DIR", str(build_root / "pip-cache"))
    venv = build_root / "venv"
    python = venv / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    pyinstaller = venv / ("Scripts/pyinstaller.exe" if os.name == "nt" else "bin/pyinstaller")
    pip_licenses = venv / ("Scripts/pip-licenses.exe" if os.name == "nt" else "bin/pip-licenses")

    if args.lipo:
        if platform.system() != "Darwin":
            raise RuntimeError("--lipo is only valid on macOS")
        if not args.lipo.is_file():
            raise RuntimeError(f"Alternative lipo executable not found: {args.lipo}")
        tool_directory = build_root / "tools"
        tool_directory.mkdir(parents=True, exist_ok=True)
        lipo_link = tool_directory / "lipo"
        lipo_link.unlink(missing_ok=True)
        lipo_link.symlink_to(args.lipo.resolve())
        alternative_install_name_tool = args.lipo.parent / "install_name_tool"
        if alternative_install_name_tool.is_file():
            install_name_tool_link = tool_directory / "install_name_tool"
            install_name_tool_link.unlink(missing_ok=True)
            install_name_tool_link.symlink_to(alternative_install_name_tool.resolve())
        os.environ["PATH"] = str(tool_directory) + os.pathsep + os.environ["PATH"]

    if bundle.exists():
        shutil.rmtree(bundle)
    bundle.mkdir(parents=True)
    if not python.exists():
        run(sys.executable, "-m", "venv", str(venv))
    run(
        str(python), "-m", "pip", "install", "--disable-pip-version-check", "--no-deps",
        f"argostranslate=={ARGOS_VERSION}",
    )
    run(
        str(python), "-m", "pip", "install", "--disable-pip-version-check",
        "ctranslate2>=4.0,<5",
        "packaging",
        "sacremoses>=0.0.53,<0.2",
        "sentencepiece>=0.2.0,<0.3",
        f"pyinstaller=={PYINSTALLER_VERSION}",
        "pip-licenses==5.0.0",
    )

    models_directory = bundle / "models"
    models_directory.mkdir()
    for filename, url, expected_hash in MODELS:
        archive = args.model_cache / filename
        if args.skip_model_download and not archive.exists():
            raise RuntimeError(f"Missing cached model: {archive}")
        download(url, archive, expected_hash)
        with zipfile.ZipFile(archive) as model_zip:
            model_zip.extractall(models_directory)
    make_legacy_stanza_resources_offline_compatible(models_directory)

    runtime_distribution = build_root / "dist"
    work_path = build_root / "pyinstaller"
    spec_path = build_root / "spec"
    for generated in (runtime_distribution, work_path, spec_path):
        if generated.exists():
            shutil.rmtree(generated)
    run(
        str(pyinstaller),
        "--noconfirm", "--clean", "--onedir", "--name", "argos-runtime",
        "--distpath", str(runtime_distribution),
        "--workpath", str(work_path),
        "--specpath", str(spec_path),
        "--exclude-module", "stanza",
        "--exclude-module", "torch",
        "--exclude-module", "spacy",
        "--exclude-module", "thinc",
        "--exclude-module", "minisbd",
        "--exclude-module", "onnxruntime",
        str(ROOT / "runtime" / "argos_runtime.py"),
    )
    built_runtime = runtime_distribution / "argos-runtime"
    destination_runtime = bundle / "runtime"
    shutil.move(str(built_runtime), destination_runtime)

    notices = bundle / "PYTHON_PACKAGES.md"
    run(
        str(pip_licenses), "--format=markdown", "--with-urls", "--with-license-file",
        "--packages", *RUNTIME_LICENSE_PACKAGES,
        "--output-file", str(notices),
    )
    shutil.copy2(ROOT / "runtime" / "MODEL_NOTICE.md", bundle / "MODEL_NOTICE.md")

    if platform.system() == "Darwin":
        run("codesign", "--force", "--deep", "--sign", "-", str(destination_runtime / "argos-runtime"))
    print(f"Bundled Argos runtime: {bundle}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
