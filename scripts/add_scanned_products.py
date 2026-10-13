"""Add listings that were scanned, but never saved, to the saved products, so there is more to suggest from.

Why. "Similar products" on a report can only suggest products the app has a report for, and only those with no
warning signs and not one safety mention. With 27 saved products, 6 qualified and most reports had nothing to
show.

Where the scans come from. Two folders, both holding scans made exactly as the app scans:
  * the original app's research/data/reference_scans/feed/: the 59 listings scanned on 12 October 2026 to measure
    what is typical (its research/scan_baseline_listings.py);
  * this project's backups/pool-scans/: listings scanned only to fill the pool (scan_more_products.py).

What it does. Each scanned product that is not already among the saved products (same Lazada item) is read by the
original app's own checker and saved the way the app saves a scan. No marketplace is contacted. The products then
appear on Products and in suggestions. Nobody's History changes: that is kept per account.

A scan is added only if it read the review feed, recorded the ratings per star level and finished every star
level, the rule a fresh scan must meet to replace a report (rescan_products.py). A product already saved is left
exactly as it is, whichever report is newer.

Run it with the original app's Python, from this folder, with DeFaketive closed:

    ..\\Capstone-Version-Control-Version-1.1\\.venv\\Scripts\\python.exe scripts\\add_scanned_products.py
    ..\\Capstone-Version-Control-Version-1.1\\.venv\\Scripts\\python.exe scripts\\add_scanned_products.py --apply

Without --apply it is a dry run: it lists what it would add and writes nothing at all.

With --apply it first copies the database into backups/ and checks the copy. To undo, close both apps and copy
that backup file back over the original's defaketive.db. --database points it at another copy of the database,
and --limit adds only the first few, which is how to try it out.

Reading the reviews is the slow part (about half an hour). --prepare does only that, with the app still open: it
writes nothing to the database and keeps each result in backups/add-products-prepared/. A later --apply uses a kept
result when it was made by the checker the app runs now from the same scan file, and reads the rest itself, so the
app then has to be closed for a minute, not half an hour.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import time
from pathlib import Path
from typing import Any

# recheck_products finds the original app, works from its folder and brings in its functions.
from recheck_products import HERE, ORIGINAL, back_up, counts, saved_rows, short, show_counts, verdict_counts
from rescan_products import app_is_running, not_kept

from dashboard_utils import (  # noqa: E402
    analyze_products,
    badge_view,
    model_unavailable_error,
    sentiment_model_version,
)
from data_store import DEFAULT_DB, save_products  # noqa: E402

BASELINE_SCANS = ORIGINAL / "research" / "data" / "reference_scans" / "feed"
POOL_SCANS = HERE / "backups" / "pool-scans"
SCAN_FOLDERS = (BASELINE_SCANS, POOL_SCANS)
PREPARED = HERE / "backups" / "add-products-prepared"
# The original app's own note: the transformer takes about 13 seconds for 100 reviews.
SECONDS_PER_REVIEW = 0.2
# Files the scraper and the research scripts keep beside the scans.
NOT_SCANS = ("_discovery.json", "_quality.json", "scan_log.json", "rows_kept.json")


def item_id(link: str) -> str:
    """The Lazada item a link is for. Two links to one item differ only in the part after it."""
    match = re.search(r"-i(\d{5,})", str(link or ""))
    return match.group(1) if match else str(link or "")


def scanned_products() -> list[tuple[Path, dict[str, Any]]]:
    """Every scanned product in the two folders: one per Lazada item, the first one met."""
    found, seen = [], set()
    for folder in SCAN_FOLDERS:
        for path in sorted(folder.glob("*.json")):
            if path.name.endswith(NOT_SCANS) or path.name.startswith("not_kept_"):
                continue
            try:
                data = json.loads(path.read_bytes().decode("utf-8"))
            except (OSError, ValueError):
                continue
            for product in data if isinstance(data, list) else []:
                if not isinstance(product, dict) or not product.get("link"):
                    continue
                if item_id(product["link"]) not in seen:
                    seen.add(item_id(product["link"]))
                    found.append((path, product))
    return found


def written(product: dict[str, Any]) -> int:
    return sum(1 for comment in product.get("comments") or [] if str(comment.get("content") or "").strip())


def where_from(path: Path) -> str:
    """A scan file's place, written the short way for the saved product's "source"."""
    for base in (ORIGINAL, HERE.parent):
        try:
            return path.relative_to(base).as_posix()
        except ValueError:
            continue
    return str(path)


def read(path: Path, product: dict[str, Any], checker: str) -> tuple[dict[str, Any], bool]:
    """The product with its report, and whether a result kept by --prepare was used."""
    scan = hashlib.sha256(json.dumps(product, sort_keys=True, ensure_ascii=False).encode("utf-8")).hexdigest()
    kept = PREPARED / f"lazada_i{item_id(product['link'])}.json"
    if kept.is_file():
        try:
            earlier = json.loads(kept.read_bytes().decode("utf-8"))
        except ValueError:
            earlier = {}
        # Only the same scan read by the same checker is the same report.
        if earlier.get("checker") == checker and earlier.get("scan_sha256") == scan:
            return earlier["product"], True
    analysed = analyze_products([product])[0]
    PREPARED.mkdir(parents=True, exist_ok=True)
    kept.write_bytes(
        json.dumps({"checker": checker, "scan_sha256": scan, "product": analysed}, ensure_ascii=False).encode("utf-8")
    )
    return analysed, False


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--apply", action="store_true", help="back up the database, then read and save")
    parser.add_argument(
        "--prepare", action="store_true",
        help="read the reviews now and keep the results; nothing is saved to the database and the app may stay open",
    )
    parser.add_argument("--limit", type=int, default=0, help="add only this many products")
    parser.add_argument("--database", help="another copy of the database (for trying this out)")
    arguments = parser.parse_args()
    for stream in (sys.stdout, sys.stderr):
        stream.reconfigure(encoding="utf-8", errors="replace")

    database = Path(arguments.database or DEFAULT_DB)
    if not database.exists():
        sys.exit(f"No database at {database}.")
    scans = scanned_products()
    if not scans:
        sys.exit("No scans in " + " or ".join(str(folder) for folder in SCAN_FOLDERS) + ".")
    rows = saved_rows(database)
    saved_items = {item_id(row["link"]) for row in rows}

    already = [(path, product) for path, product in scans if item_id(product["link"]) in saved_items]
    refused = [(path, product, not_kept(product)) for path, product in scans
               if item_id(product["link"]) not in saved_items and not_kept(product)]
    chosen = [(path, product) for path, product in scans
              if item_id(product["link"]) not in saved_items and not not_kept(product)]
    if arguments.limit > 0:
        chosen = chosen[: arguments.limit]
    reviews = sum(written(product) for _, product in chosen)

    print(f"Database: {database}")
    print(f"{len(rows)} saved products. {len(scans)} scanned products: "
          f"{len(already)} already saved (left as they are), {len(refused)} not usable, {len(chosen)} to add.")
    show_counts("\nVerdicts now:", verdict_counts(rows))
    # A search also returns listings that were looked at and passed over, such as those with too few ratings.
    reasons: dict[str, int] = {}
    for _, _, why_not in refused:
        reasons[why_not] = reasons.get(why_not, 0) + 1
    for why_not, number in sorted(reasons.items(), key=lambda item: -item[1]):
        print(f"  not usable, {number}: {why_not}")
    print("\nTo add:")
    for _, product in chosen:
        print(f"  {written(product):>4} reviews  {short(product.get('name'), 62)}")
    print(f"\nRough time: {max(1, round(reviews * SECONDS_PER_REVIEW / 60))} minutes, plus loading the model.")

    if not (arguments.apply or arguments.prepare):
        print("\nDry run: nothing was written. Add --prepare to read the reviews ahead, or --apply to back up the "
              "database and add these products.")
        return 0
    if not chosen:
        print("\nNothing to add.")
        return 0
    unavailable = model_unavailable_error()
    checker = sentiment_model_version()
    started = time.monotonic()

    if arguments.prepare and not arguments.apply:
        for number, (path, product) in enumerate(chosen, start=1):
            print(f"  [{number}/{len(chosen)}] {short(product.get('name'), 50)} ...", end=" ", flush=True)
            try:
                analysed, kept = read(path, product, checker)
            except unavailable as error:
                sys.exit(f"\nThe review model could not be loaded.\n{error}")
            print(badge_view(analysed)["headline"] + (" (already read)" if kept else ""))
        print(f"\nRead in {(time.monotonic() - started) / 60:.0f} minutes. Nothing was saved to the database.")
        print(f"Results kept in {PREPARED}. Close DeFaketive and run this again with --apply to add them.")
        return 0

    # A copy named with --database is nobody's but ours; the app's own database is not.
    if not arguments.database and app_is_running():
        sys.exit("\nDeFaketive is running (port 5000 answers). Close it first: the app and this script would both write the database.")

    backup = back_up(database, "add-products")
    print(f"\nBackup written and checked: {backup}")

    added = 0
    for number, (path, product) in enumerate(chosen, start=1):
        print(f"  [{number}/{len(chosen)}] {short(product.get('name'), 50)} ...", end=" ", flush=True)
        try:
            analysed, _ = read(path, product, checker)
        except unavailable as error:
            sys.exit(f"\nThe review model could not be loaded. {added} products were added; the rest were not.\n{error}")
        save_products([analysed], source=where_from(path), path=database)
        added += 1
        print(badge_view(analysed)["headline"])

    after = saved_rows(database)
    print(f"\nDone in {(time.monotonic() - started) / 60:.0f} minutes.")
    show_counts("\nVerdicts after:", verdict_counts(after))
    print(f"\n{added} products added. {len(after)} saved products now.")
    print(f"Row counts: {counts(database)} (before: {counts(backup)}).")
    print(f"To undo: close both apps, then copy\n  {backup}\nover\n  {database}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
