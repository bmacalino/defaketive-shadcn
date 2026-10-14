"""Make backend/seed/saved_products.json.gz: the saved reports a new PC starts with, without reviewers' names.

Why. Products and "Similar products" are built from the saved reports. A fresh copy of the app has none, so this file
carries a copy of the ones on this PC. setup.cmd loads it into a new database (backend/load_starter_data.py).

How. Every saved product in the original app's defaketive.db is read again with the checker the app runs now, so a
new PC does not show each report as "made with an earlier version of the checker". Reading takes about a fifth of a
second a review (70 to 90 minutes for 180 products); each product's result is kept in backups/starter-prepared/
(keyed by the checker version and the stored report), so a second run only reads what changed. Then the reviewer's
name and the seller's reply (which can name the buyer) are taken out of every review; the rating, date, text,
variation and the checker's reading stay. Accounts, history and wishlists are never included.

The database is opened read only. Run it with the original app's Python, from this folder:

    ..\\Capstone-Version-Control-Version-1.1\\.venv\\Scripts\\python.exe scripts\\make_starter_data.py
"""

from __future__ import annotations

import gzip
import hashlib
import json
import sqlite3
import sys
import time
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# recheck_products finds the original app, works from its folder and brings in its functions.
from recheck_products import HERE, ORIGINAL, analysis_is_current, analyze_products  # noqa: F401

from data_store import DEFAULT_DB  # noqa: E402
from dashboard_utils import sentiment_model_version  # noqa: E402

PREPARED = HERE / "backups" / "starter-prepared"
SEED = HERE / "backend" / "seed" / "saved_products.json.gz"
# Taken out of every review: who wrote it, and the seller's reply, which can name the buyer.
PERSONAL_REVIEW_FIELDS = ("author", "seller_respond")


def saved_products(path: Path) -> list[tuple[dict[str, Any], str]]:
    """Every saved product with when it was saved. Read only."""
    with closing(sqlite3.connect(f"file:{path.as_posix()}?mode=ro", uri=True)) as connection:
        rows = connection.execute("SELECT raw_json, updated_at FROM products ORDER BY link").fetchall()
    return [(json.loads(raw), updated_at) for raw, updated_at in rows]


def read_again(product: dict[str, Any], checker: str) -> dict[str, Any]:
    """The product read by the current checker, from the kept result when there is one."""
    digest = hashlib.sha256(json.dumps(product, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()
    kept = PREPARED / f"{hashlib.sha256(checker.encode()).hexdigest()[:12]}-{digest[:32]}.json"
    if kept.is_file():
        return json.loads(kept.read_bytes().decode("utf-8"))
    result = product if analysis_is_current([product]) else analyze_products([product])[0]
    PREPARED.mkdir(parents=True, exist_ok=True)
    partial = kept.with_suffix(".tmp")
    partial.write_bytes(json.dumps(result, ensure_ascii=False).encode("utf-8"))
    partial.replace(kept)
    return result


def without_names(product: dict[str, Any]) -> dict[str, Any]:
    cleaned = dict(product)
    cleaned["comments"] = [
        {key: value for key, value in review.items() if key not in PERSONAL_REVIEW_FIELDS}
        for review in product.get("comments") or []
        if isinstance(review, dict)
    ]
    return cleaned


def main() -> int:
    for stream in (sys.stdout, sys.stderr):
        stream.reconfigure(encoding="utf-8", errors="replace")
    checker = sentiment_model_version()
    rows = saved_products(Path(DEFAULT_DB))
    total_reviews = sum(len(product.get("comments") or []) for product, _ in rows)
    print(f"{len(rows)} saved products, {total_reviews:,} reviews. Checker: {checker[:90]}...", flush=True)
    started = time.time()
    seed = []
    for number, (product, saved_at) in enumerate(rows, start=1):
        result = read_again(product, checker)
        if not analysis_is_current([result]):
            sys.exit(f"{product.get('name')!r} is still behind the checker after reading; nothing was written.")
        seed.append({"saved_at": saved_at, "product": without_names(result)})
        if number % 10 == 0 or number == len(rows):
            print(f"  {number}/{len(rows)} read ({round(time.time() - started)} s)", flush=True)
    text = json.dumps(seed, ensure_ascii=False, sort_keys=True)
    if any(f'"{field}"' in text for field in PERSONAL_REVIEW_FIELDS):
        # Only the review-level fields are removed; the words may still occur as parts of other text.
        leftovers = sum(1 for item in seed for review in item["product"]["comments"] if set(review) & set(PERSONAL_REVIEW_FIELDS))
        if leftovers:
            sys.exit(f"{leftovers} reviews still carry a personal field; nothing was written.")
    SEED.parent.mkdir(parents=True, exist_ok=True)
    SEED.write_bytes(gzip.compress(text.encode("utf-8"), compresslevel=9, mtime=0))
    (SEED.parent / "manifest.json").write_bytes(
        (
            json.dumps(
                {
                    "what": "Saved reports a new PC starts with. Reviewer names and seller replies removed.",
                    "products": len(seed),
                    "reviews": sum(len(item["product"]["comments"]) for item in seed),
                    "checker_version": checker,
                    "made_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                    "sha256": hashlib.sha256(SEED.read_bytes()).hexdigest(),
                },
                indent=1,
            )
            + "\n"
        ).encode("utf-8")
    )
    print(f"Written {SEED} ({SEED.stat().st_size / 1048576:.1f} MB) in {round((time.time() - started) / 60)} minutes.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
