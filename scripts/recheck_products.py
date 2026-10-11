"""Re-check the saved products that an older checker analysed, so they get a verdict from the current one.

It uses the original app's own functions (nothing in the original app is edited) and the reviews that are
already stored in its database. No marketplace is contacted.

Run it with the original app's Python, from this folder:

    ..\\Capstone-Version-Control-Version-1.1\\.venv\\Scripts\\python.exe scripts\\recheck_products.py
    ..\\Capstone-Version-Control-Version-1.1\\.venv\\Scripts\\python.exe scripts\\recheck_products.py --apply

Without --apply it is a dry run: it lists what it would re-check and writes nothing at all.

With --apply it first copies defaketive.db into this project's backups/ folder and checks the copy, and only then
analyses and saves. To undo, close both apps and copy that backup file back over the original's defaketive.db.
"""

from __future__ import annotations

import argparse
import json
import os
import sqlite3
import sys
import time
from collections import Counter
from contextlib import closing
from datetime import datetime
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent.parent
ORIGINAL = Path(os.environ.get("DEFAKETIVE_ORIGINAL") or HERE.parent / "Capstone-Version-Control-Version-1.1")
if not (ORIGINAL / "webapp.py").exists():
    sys.exit(f"The original DeFaketive app was not found at {ORIGINAL}. Set DEFAKETIVE_ORIGINAL to its folder.")

# The original resolves its own folders from where its files are, but work from its folder to be safe.
sys.path.insert(0, str(ORIGINAL))
os.chdir(ORIGINAL)

from dashboard_utils import (  # noqa: E402
    analyze_products,
    badge_view,
    is_badge_summary,
    model_unavailable_error,
    platform_name,
)
from data_store import DEFAULT_DB, save_products  # noqa: E402

# The original app's own note: the transformer takes about 13 seconds for 100 reviews.
SECONDS_PER_REVIEW = 0.13


def read_only(path: Path) -> sqlite3.Connection:
    """Open the database so that nothing can be written through this connection."""
    return sqlite3.connect(f"file:{path.as_posix()}?mode=ro", uri=True)


def saved_rows(path: Path) -> list[dict[str, Any]]:
    """Every saved product with the "source" it was saved under. Read only."""
    with closing(read_only(path)) as connection:
        rows = connection.execute("SELECT link, source, raw_json FROM products ORDER BY updated_at DESC").fetchall()
    products = []
    for link, source, payload in rows:
        try:
            product = json.loads(payload)
        except (TypeError, json.JSONDecodeError):
            continue
        if isinstance(product, dict):
            products.append({"link": link, "source": source or "", "product": product})
    return products


def counts(path: Path) -> dict[str, int]:
    with closing(read_only(path)) as connection:
        return {
            table: int(connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0])
            for table in ("products", "reviews")
        }


def needs_recheck(product: dict[str, Any]) -> bool:
    """True for a product the app shows as "Not analyzed yet": its saved result is not a badge summary."""
    return not is_badge_summary(product.get("sentiment_summary") or {})


def review_total(product: dict[str, Any]) -> int:
    return len([item for item in product.get("comments") or [] if isinstance(item, dict)])


def short(text: Any, width: int = 58) -> str:
    text = " ".join(str(text or "Unnamed product").split())
    return text if len(text) <= width else text[: width - 1] + "…"


def verdict_counts(rows: list[dict[str, Any]]) -> Counter:
    return Counter(badge_view(row["product"])["state"] for row in rows)


def show_counts(title: str, tally: Counter) -> None:
    print(title)
    for state, number in sorted(tally.items(), key=lambda item: (-item[1], item[0])):
        print(f"  {number:>3}  {state}")


def back_up(source: Path, reason: str = "recheck") -> Path:
    """Copy the database with SQLite's own backup, then prove the copy is whole before anything else happens."""
    folder = HERE / "backups"
    folder.mkdir(exist_ok=True)
    target = folder / f"defaketive-before-{reason}-{datetime.now():%Y%m%d-%H%M%S}.db"
    with closing(read_only(source)) as original, closing(sqlite3.connect(target)) as copy:
        original.backup(copy)
    with closing(read_only(target)) as copy:
        healthy = copy.execute("PRAGMA integrity_check").fetchone()[0]
    if healthy != "ok" or counts(target) != counts(source):
        target.unlink(missing_ok=True)
        sys.exit("The backup did not match the database, so nothing was changed.")
    return target


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--apply", action="store_true", help="back up the database, then re-check and save")
    arguments = parser.parse_args()
    for stream in (sys.stdout, sys.stderr):
        stream.reconfigure(encoding="utf-8", errors="replace")

    database = Path(DEFAULT_DB)
    if not database.exists():
        sys.exit(f"No database at {database}.")
    rows = saved_rows(database)
    old = [row for row in rows if needs_recheck(row["product"])]
    # A product with no stored reviews has nothing to re-read, so it is left exactly as it is.
    chosen = [row for row in old if review_total(row["product"]) > 0]
    empty = [row for row in old if review_total(row["product"]) == 0]
    reviews = sum(review_total(row["product"]) for row in chosen)

    print(f"Database: {database}")
    print(f"{len(rows)} saved products, {len(old)} of them from an older checker ({reviews} stored reviews).")
    show_counts("\nVerdicts now:", verdict_counts(rows))
    if empty:
        print("\nLeft alone, because no reviews are stored for them:")
        for row in empty:
            print(f"        {platform_name(row['product']):<10}  {short(row['product'].get('name'))}")
    if not chosen:
        print("\nNothing to re-check.")
        return 0

    print("\nTo re-check:")
    for row in chosen:
        product = row["product"]
        print(f"  {review_total(product):>4} reviews  {platform_name(product):<10}  {short(product.get('name'))}")
    print(f"\nRough time: {max(1, round(reviews * SECONDS_PER_REVIEW / 60))} minute(s), plus loading the model.")

    if not arguments.apply:
        print("\nDry run: nothing was written. Add --apply to back up the database and re-check these products.")
        return 0

    backup = back_up(database)
    print(f"\nBackup written and checked: {backup}")

    unavailable = model_unavailable_error()
    analysed: list[dict[str, Any]] = []
    started = time.monotonic()
    for number, row in enumerate(chosen, start=1):
        product = row["product"]
        print(f"  [{number}/{len(chosen)}] {short(product.get('name'), 50)} ...", end=" ", flush=True)
        try:
            result = analyze_products([product])[0]
        except unavailable as error:
            # Nothing has been saved yet: the database is exactly as it was.
            sys.exit(f"\nThe review model could not be loaded, so nothing was changed.\n{error}")
        if needs_recheck(result):
            sys.exit("\nA product came back without a verdict from the current checker, so nothing was changed.")
        analysed.append({**row, "product": result})
        print(badge_view(result)["headline"])
    print(f"Analysed in {time.monotonic() - started:.0f} seconds.")

    # Each product goes back under the "source" it was first saved with.
    by_source: dict[str, list[dict[str, Any]]] = {}
    for row in analysed:
        by_source.setdefault(row["source"], []).append(row["product"])
    for source, products in by_source.items():
        save_products(products, source=source)

    after = saved_rows(database)
    left = [row for row in after if needs_recheck(row["product"])]
    show_counts("\nVerdicts after:", verdict_counts(after))
    print(f"\n{len(analysed)} products re-checked and saved. {len(left)} still from an older checker.")
    print(f"Row counts: {counts(database)} (before: {counts(backup)}).")
    print(f"To undo: close both apps, then copy\n  {backup}\nover\n  {database}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
