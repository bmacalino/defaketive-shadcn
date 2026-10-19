"""Copies DeFaketive's two databases into backups/daily/<date>/ and keeps the newest seven days.

    defaketive.db        every analyzed product and its reviews
    instance/accounts.db accounts, scan history, wishlists, daily scan counts

Safe while the app is running: SQLite's own backup copies a consistent state even while the app writes.
serve.py runs this once a day by itself. To run it by hand, with the original app's Python:

    ..\\Capstone-Version-Control-Version-1.1\\.venv\\Scripts\\python.exe scripts\\backup_databases.py

To restore, close the app and copy a day's files back over the originals.
"""

from __future__ import annotations

import argparse
import os
import shutil
import sqlite3
import sys
from contextlib import closing
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
MANILA = timezone(timedelta(hours=8))
KEEP_DAYS = 7


def original_app() -> Path:
    """Same rule as server.py: DEFAKETIVE_ORIGINAL, else the folder beside this project, else backend/."""
    named = os.environ.get("DEFAKETIVE_ORIGINAL")
    if named:
        return Path(named)
    beside = HERE.parent / "Capstone-Version-Control-Version-1.1"
    return beside if (beside / "webapp.py").is_file() else HERE / "backend"


def databases() -> dict[str, Path]:
    original = original_app()
    accounts = Path(os.environ.get("DEFAKETIVE_ACCOUNTS_DB") or original / "instance" / "accounts.db")
    return {"defaketive.db": original / "defaketive.db", "accounts.db": accounts}


def copy_database(source: Path, target: Path) -> None:
    """A consistent copy of one SQLite database, written whole before it gets its real name."""
    partial = target.with_suffix(".partial")
    with closing(sqlite3.connect(f"file:{source.as_posix()}?mode=ro", uri=True)) as reader, \
            closing(sqlite3.connect(partial)) as writer:
        reader.backup(writer)
    partial.replace(target)


def backup(sources: dict[str, Path], folder: Path, keep: int = KEEP_DAYS, now: datetime | None = None) -> Path:
    """Copy the databases into folder/<Manila date>/ and remove day folders beyond the newest `keep`."""
    day = (now or datetime.now(timezone.utc)).astimezone(MANILA).date().isoformat()
    target = folder / day
    target.mkdir(parents=True, exist_ok=True)
    for name, source in sources.items():
        if source.is_file():
            copy_database(source, target / name)
    days = sorted(path for path in folder.iterdir() if path.is_dir() and len(path.name) == 10 and path.name[4] == "-")
    for old in days[:-keep] if keep > 0 else []:
        shutil.rmtree(old, ignore_errors=True)
    return target


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--folder", type=Path, default=HERE / "backups" / "daily", help="where the day folders go")
    parser.add_argument("--keep", type=int, default=KEEP_DAYS, help="how many days to keep (default 7)")
    args = parser.parse_args()
    sources = databases()
    missing = [str(path) for path in sources.values() if not path.is_file()]
    if len(missing) == len(sources):
        print("No database was found:", *missing, sep="\n  ")
        return 1
    target = backup(sources, args.folder, args.keep)
    print(f"Backed up to {target}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
