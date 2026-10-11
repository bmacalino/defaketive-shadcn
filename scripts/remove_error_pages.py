"""Remove saved "products" that are really a browser error page, such as "This site can't be reached".

A scrape that failed once saved the error page as if it were a product. Such a row has the error page's title as
its name and no reviews. Nothing else is touched: real products with no reviews are left alone.

Run it with the original app's Python, from this folder, with both apps closed:

    ..\\Capstone-Version-Control-Version-1.1\\.venv\\Scripts\\python.exe scripts\\remove_error_pages.py
    ..\\Capstone-Version-Control-Version-1.1\\.venv\\Scripts\\python.exe scripts\\remove_error_pages.py --apply

Without --apply it is a dry run: it lists the rows it would remove and writes nothing.

With --apply it first copies defaketive.db into this project's backups/ folder and checks the copy, and only then
removes the rows. To undo, close both apps and copy that backup file back over the original's defaketive.db.
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
from contextlib import closing
from pathlib import Path

# The same folder holds the backup helper (and finds the original app).
sys.path.insert(0, str(Path(__file__).resolve().parent))
from recheck_products import back_up, counts, read_only  # noqa: E402

from data_store import DEFAULT_DB  # noqa: E402  (the original app's own database path)

# Titles a browser shows instead of a page. Compared without regard to case or the kind of apostrophe.
ERROR_TITLES = ("this site can't be reached",)


def plain(name: object) -> str:
    return " ".join(str(name or "").replace("’", "'").split()).casefold()


def error_rows(path: Path) -> list[tuple[str, str, str]]:
    """(link, platform, name) of every saved row that is an error page with no reviews. Read only."""
    with closing(read_only(path)) as connection:
        rows = connection.execute(
            "SELECT link, platform, name, review_count, "
            "(SELECT COUNT(*) FROM reviews WHERE reviews.product_link = products.link) FROM products"
        ).fetchall()
    return [
        (link, platform, name)
        for link, platform, name, review_count, stored in rows
        if plain(name) in ERROR_TITLES and not review_count and not stored
    ]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--apply", action="store_true", help="back up the database, then remove the rows")
    arguments = parser.parse_args()
    for stream in (sys.stdout, sys.stderr):
        stream.reconfigure(encoding="utf-8", errors="replace")

    database = Path(DEFAULT_DB)
    if not database.exists():
        sys.exit(f"No database at {database}.")
    found = error_rows(database)
    print(f"Database: {database}")
    print(f"Rows now: {counts(database)}")
    if not found:
        print("\nNo error pages are saved as products. Nothing to remove.")
        return 0

    print(f"\n{len(found)} saved row(s) are an error page, not a product:")
    for link, platform, name in found:
        print(f"  {platform:<10}  {name}  <{link[:70]}>")

    if not arguments.apply:
        print("\nDry run: nothing was written. Add --apply to back up the database and remove these rows.")
        return 0

    backup = back_up(database, "cleanup")
    print(f"\nBackup written and checked: {backup}")
    with closing(sqlite3.connect(database)) as connection:
        connection.execute("PRAGMA foreign_keys = ON")
        for link, _platform, _name in found:
            connection.execute("DELETE FROM reviews WHERE product_link = ?", (link,))
            connection.execute("DELETE FROM products WHERE link = ?", (link,))
        connection.commit()

    left = error_rows(database)
    print(f"Removed {len(found) - len(left)} row(s). Rows after: {counts(database)} (before: {counts(backup)}).")
    print(f"To undo: close both apps, then copy\n  {backup}\nover\n  {database}")
    return 0 if not left else 1


if __name__ == "__main__":
    raise SystemExit(main())
