"""Copy the part of the original app this app runs on into backend/, so this one repo runs on another PC.

What is copied: the files the running app was traced to import or open on 14 Oct 2026 (the Flask server, the review
checker with its word lists and models, the "what is typical" baseline, the Lazada scanner), the original app's own
pages (it serves them at its root), its requirements and its licences. Not copied: research, labelling sheets, tests,
the Shopee and Temu scanners (the app scans Lazada only), and anything with personal data (databases, accounts,
session cookies). Files are copied byte for byte: the review model checks its own files' SHA-256, and the checker's
version is worked out from its files, so a changed line ending would make a new PC's checker differ from this one.

backend/ is a copy. Change the original app, then run this again; it replaces the copy and removes files it copied
before that are no longer on the list. backend/BACKEND_FILES.json lists every file with its SHA-256 and the original
app's commit.

    ..\\Capstone-Version-Control-Version-1.1\\.venv\\Scripts\\python.exe scripts\\sync_backend.py
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
ORIGINAL = Path(os.environ.get("DEFAKETIVE_ORIGINAL") or HERE.parent / "Capstone-Version-Control-Version-1.1")
BACKEND = HERE / "backend"
MANIFEST = BACKEND / "BACKEND_FILES.json"

# Folders are copied whole (without __pycache__); files one by one.
RUNTIME = (
    "webapp.py",
    "accounts.py",
    "data_store.py",
    "dashboard_utils.py",
    "research_utils.py",
    "requirements.txt",
    "LICENSE",
    "templates/",
    "static/",
    "sentiment-analysis/defaketive_sentiment/",
    "sentiment-analysis/models/hazard_classifier_v6/",
    "sentiment-analysis/models/extra_labels_v1/",
    "sentiment-analysis/models/reference_baselines_v1.json",
    "sentiment-analysis/models/sentiment_onnx/xlmr_firecs_v1/",
    "lazada-scraper/src/",
    "lazada-scraper/LICENSE",
)
SKIP_PARTS = {"__pycache__"}
SKIP_SUFFIXES = {".pyc", ".pyo"}


def runtime_files() -> list[str]:
    files: list[str] = []
    for entry in RUNTIME:
        source = ORIGINAL / entry
        if entry.endswith("/"):
            if not source.is_dir():
                sys.exit(f"Missing in the original app: {entry}")
            for path in sorted(source.rglob("*")):
                relative = path.relative_to(ORIGINAL)
                if path.is_file() and not SKIP_PARTS & set(relative.parts) and path.suffix not in SKIP_SUFFIXES:
                    files.append(relative.as_posix())
        elif source.is_file():
            files.append(entry)
        else:
            sys.exit(f"Missing in the original app: {entry}")
    return files


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def original_commit() -> dict[str, object]:
    def git(*args: str) -> str:
        return subprocess.run(["git", *args], cwd=ORIGINAL, capture_output=True, text=True).stdout.strip()

    return {"commit": git("rev-parse", "HEAD"), "branch": git("branch", "--show-current")}


def main() -> int:
    if not (ORIGINAL / "webapp.py").is_file():
        sys.exit(f"The original DeFaketive app was not found at {ORIGINAL}. Set DEFAKETIVE_ORIGINAL to its folder.")
    files = runtime_files()
    before = json.loads(MANIFEST.read_bytes()) if MANIFEST.is_file() else {"files": {}}
    removed = [path for path in before["files"] if path not in files]
    for path in removed:
        (BACKEND / path).unlink(missing_ok=True)
    changed = 0
    listed: dict[str, str] = {}
    for path in files:
        source, target = ORIGINAL / path, BACKEND / path
        digest = sha256(source)
        if not target.is_file() or sha256(target) != digest:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
            changed += 1
        listed[path] = digest
    MANIFEST.write_bytes(
        (
            json.dumps(
                {
                    "what": "Files copied byte for byte from the original app by scripts/sync_backend.py. Do not edit them here.",
                    "original": original_commit(),
                    "copied_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                    "files": listed,
                },
                indent=1,
            )
            + "\n"
        ).encode("utf-8")
    )
    size = sum((BACKEND / path).stat().st_size for path in files) / 1048576
    print(f"backend/: {len(files)} files ({size:.1f} MB), {changed} copied or replaced, {len(removed)} removed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
