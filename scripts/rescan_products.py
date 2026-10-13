"""Scan the saved Lazada products again, so each report is made by the reader and the checker the app runs now.

Why. Since 12 October 2026 the app reads Lazada's own review feed, which carries whole reviews and up to 60 from
each star level. The reports saved before that were read off the product page, most of them with too few reviews
for a verdict, and the line a listing is compared with was measured again on feed scans. A saved report is shown
as it was stored, so only a fresh scan brings one up to date. Re-checking the stored reviews
(recheck_products.py) cannot: they are the old reader's text.

It runs the original app's own steps for a pasted link (its scan command, its checker, its save), with three
differences. The scan file goes to this project's backups/ folder, never the original app's folder, whose scan
files are sources for its labelling work. A login or a verification is not waited for and never answered. And a
product's old review rows are removed when its report is replaced, so the database's review count stays the
number of reviews the reports hold (the app itself leaves them behind).

A new report replaces the old one only if the scan read the review feed, recorded the ratings per star level and
finished every star level. Otherwise the old report is left exactly as it is and the reason is printed. Two
products in a row that cannot be replaced stop the run. Temu and Shopee products are not scanned.

Run it with the original app's Python, from this folder, with DeFaketive closed:

    ..\\Capstone-Version-Control-Version-1.1\\.venv\\Scripts\\python.exe scripts\\rescan_products.py
    ..\\Capstone-Version-Control-Version-1.1\\.venv\\Scripts\\python.exe scripts\\rescan_products.py --apply

Without --apply it is a dry run: it lists what it would scan and writes nothing at all.

With --apply it first copies the database into backups/ and checks the copy. To undo, close both apps and copy
that backup file back over the original's defaketive.db. --database points it at another copy of the database,
and --limit scans only the first few, which is how to try it out.
"""

from __future__ import annotations

import argparse
import json
import socket
import sqlite3
import sys
import time
from contextlib import closing
from datetime import datetime
from pathlib import Path
from typing import Any

# recheck_products finds the original app, works from its folder and brings in its functions.
from recheck_products import (
    HERE,
    back_up,
    counts,
    saved_rows,
    short,
    show_counts,
    verdict_counts,
)

import webapp  # noqa: E402  (the original app: its scan command and the way it runs a scraper)
from dashboard_utils import (  # noqa: E402
    analyze_products,
    badge_view,
    has_usable_products,
    json_bytes,
    load_products,
    model_unavailable_error,
    platform_name,
)
from data_store import DEFAULT_DB, save_products  # noqa: E402

FEED_SOURCE = "lazada_review_feed"
STOP_AFTER_FAILURES = 2
PAUSE_SECONDS = 5


def app_is_running() -> bool:
    with closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as probe:
        probe.settimeout(1.5)
        return probe.connect_ex(("127.0.0.1", 5000)) == 0


def lazada_rows(database: Path) -> list[dict[str, Any]]:
    return [row for row in saved_rows(database) if "lazada.com.ph" in row["link"]]


def not_kept(product: dict[str, Any]) -> str:
    """Why a fresh scan may not replace a saved report, or "" when it may."""
    if product.get("review_source") != FEED_SOURCE:
        return "the reviews were not read from the feed"
    if not product.get("review_star_distribution"):
        return "no ratings per star level"
    if product.get("review_filter_warning"):
        return str(product["review_filter_warning"])
    levels = product.get("star_collection") or {}
    unfinished = [star for star in "12345" if not (levels.get(star) or {}).get("complete")]
    if unfinished:
        return f"star level {', '.join(unfinished)} was not finished"
    if not any(str(comment.get("content") or "").strip() for comment in product.get("comments") or []):
        return "no written reviews"
    return ""


def scan(link: str, target: Path) -> tuple[dict[str, Any] | None, str]:
    """One fresh scan with the app's own command. Returns the product, or None and why not."""
    command, _ = webapp._command_for_scrape(link, "lazada", 1, webapp.MAX_REVIEWS)
    command[command.index("--output") + 1] = str(target)
    command[command.index("--verification-timeout") + 1] = "0"
    try:
        result = webapp._run_scraper(command, lambda line: None)
    except Exception as error:  # a scraper that never ended, or could not be started
        return None, f"the scan did not finish ({type(error).__name__})"
    if result.returncode:
        return None, "the scan stopped: " + webapp._scraper_failure_message(result).strip().splitlines()[-1][:120]
    products = load_products(target) if target.is_file() else []
    if not has_usable_products(products):
        return None, "the scan returned no usable product"
    return products[0], not_kept(products[0])


def replace(database: Path, saved_link: str, product: dict[str, Any], source: str) -> None:
    """Put the new report where the old one was, and drop the old report's review rows."""
    # The saved link stays the key: histories and wishlists refer to it.
    product["link"] = saved_link
    with closing(sqlite3.connect(database)) as connection, connection:
        connection.execute("DELETE FROM reviews WHERE product_link = ?", (saved_link,))
    save_products([product], source=source, path=database)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--apply", action="store_true", help="back up the database, then scan and save")
    parser.add_argument("--limit", type=int, default=0, help="scan only this many products")
    parser.add_argument("--database", help="another copy of the database (for trying this out)")
    arguments = parser.parse_args()
    for stream in (sys.stdout, sys.stderr):
        stream.reconfigure(encoding="utf-8", errors="replace")

    database = Path(arguments.database or DEFAULT_DB)
    if not database.exists():
        sys.exit(f"No database at {database}.")
    rows = lazada_rows(database)
    if arguments.limit > 0:
        rows = rows[: arguments.limit]
    everything = saved_rows(database)

    print(f"Database: {database}")
    print(f"{len(everything)} saved products, {len(lazada_rows(database))} of them on Lazada.")
    show_counts("\nVerdicts now:", verdict_counts(everything))
    print("\nTo scan again:")
    for row in rows:
        product = row["product"]
        stored = len([item for item in product.get("comments") or [] if isinstance(item, dict)])
        print(f"  {stored:>4} reviews stored  {short(product.get('name'), 46):<46}  {badge_view(product)['headline']}")
    print(f"\nRough time: {max(1, round(len(rows) * 1.2))} to {max(2, len(rows) * 2)} minutes. No Chrome window opens.")

    if not arguments.apply:
        print("\nDry run: nothing was written. Add --apply to back up the database and scan these products.")
        return 0
    if app_is_running():
        sys.exit("\nDeFaketive is running (port 5000 answers). Close it first: the app and this script would both write the database.")

    backup = back_up(database, "rescan")
    print(f"\nBackup written and checked: {backup}")
    folder = HERE / "backups" / f"rescan-{datetime.now():%Y%m%d-%H%M%S}"
    folder.mkdir(parents=True)

    unavailable = model_unavailable_error()
    replaced, left, failures = 0, [], 0
    started = time.monotonic()
    for number, row in enumerate(rows, start=1):
        name = short(row["product"].get("name"), 46)
        print(f"  [{number}/{len(rows)}] {name} ...", end=" ", flush=True)
        if number > 1:
            time.sleep(PAUSE_SECONDS)
        target = folder / f"scan-{number:02}.json"
        product, why_not = scan(row["link"], target)
        if product is not None and not why_not:
            try:
                analysed = analyze_products([product])[0]
            except unavailable as error:
                sys.exit(f"\nThe review model could not be loaded. Products scanned so far were saved; the rest are as they were.\n{error}")
            target.write_bytes(json_bytes([analysed]))
            replace(database, row["link"], analysed, source=str(target))
            replaced += 1
            failures = 0
            read = len(analysed.get("comments") or [])
            print(f"{read} reviews -> {badge_view(analysed)['headline']}")
            continue
        left.append((name, why_not))
        failures += 1
        print(f"left as it was: {why_not}")
        if failures >= STOP_AFTER_FAILURES:
            print(f"\n{STOP_AFTER_FAILURES} products in a row could not be scanned. Stopping; the rest are as they were.")
            break

    after = saved_rows(database)
    print(f"\nDone in {(time.monotonic() - started) / 60:.0f} minutes.")
    show_counts("\nVerdicts after:", verdict_counts(after))
    print(f"\n{replaced} reports replaced, {len(left)} left as they were, {len(rows) - replaced - len(left)} not reached.")
    for name, why_not in left:
        print(f"    {name}: {why_not}")
    print(f"Row counts: {counts(database)} (before: {counts(backup)}).")
    print(f"Scan files: {folder}")
    print(f"To undo: close both apps, then copy\n  {backup}\nover\n  {database}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
