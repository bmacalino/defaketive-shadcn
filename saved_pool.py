"""The saved products, read from the database once and kept until it changes.

Why. Every list, every report and every set of "Similar products" is built from all the saved products, and
reading them means parsing each one together with all its reviews. Measured on 13 Oct 2026, with 168 products
and 20,609 reviews: 2.1 seconds, paid again on every request and several times over when a page asks for three
things at once. With 27 products nobody noticed.

How. The products are kept in memory. Before each use the database file is looked at: its size, when it was last
written, and the counter SQLite keeps in its first bytes and raises on every change. Nothing changed means nothing
is read. When something did, the list of products is read again and a product is parsed again only if its own row
changed. A row counts as changed when its `updated_at` does, which every save sets.

The products handed out are shared by everyone who asks. Nothing may alter one: make a copy first.

Read only. The database is opened so that it cannot be written, and is never created.
"""

from __future__ import annotations

import json
import sqlite3
import threading
from contextlib import closing
from pathlib import Path
from typing import Any


class SavedPool:
    def __init__(self, database: str | Path) -> None:
        self.database = Path(database)
        self._lock = threading.Lock()
        self._stamp: tuple[Any, ...] | None = None
        # rowid -> (link, updated_at, the product or None when its row could not be read as one)
        self._rows: dict[int, tuple[Any, Any, dict[str, Any] | None]] = {}
        self._products: list[dict[str, Any]] = []
        self._dates: dict[str, str] = {}
        self.parsed = 0  # products parsed so far: what the keeping is there to hold down

    def _stamp_now(self) -> tuple[Any, ...] | None:
        """What changes whenever the database is written. None when there is no database to read."""
        try:
            status = self.database.stat()
            with open(self.database, "rb") as handle:
                counter = handle.read(28)[24:]
        except OSError:
            return None
        stamp: list[Any] = [status.st_mtime_ns, status.st_size, counter]
        # Set up to "write ahead", SQLite puts changes in a file beside the database before the database itself.
        try:
            ahead = self.database.with_name(self.database.name + "-wal").stat()
            stamp += [ahead.st_mtime_ns, ahead.st_size]
        except OSError:
            pass
        return tuple(stamp)

    def _read(self) -> None:
        rows: dict[int, tuple[Any, Any, dict[str, Any] | None]] = {}
        with closing(sqlite3.connect(f"{self.database.resolve().as_uri()}?mode=ro", uri=True)) as connection:
            # One view of the database for the list and for the products read from it.
            connection.execute("BEGIN")
            listed = connection.execute("SELECT rowid, link, updated_at FROM products ORDER BY updated_at DESC").fetchall()
            for rowid, link, updated_at in listed:
                kept = self._rows.get(rowid)
                if kept is None or kept[:2] != (link, updated_at):
                    found = connection.execute("SELECT raw_json FROM products WHERE rowid = ?", (rowid,)).fetchone()
                    try:
                        product = json.loads(found[0]) if found else None
                    except (TypeError, ValueError):
                        product = None
                    kept = (link, updated_at, product if isinstance(product, dict) else None)
                    self.parsed += 1
                rows[rowid] = kept
        self._rows = rows
        self._products = [product for _, _, product in rows.values() if product is not None]
        self._dates = {str(link): str(updated_at) for link, updated_at, _ in rows.values() if link and updated_at}

    def snapshot(self) -> tuple[list[dict[str, Any]], dict[str, str]]:
        """The saved products, newest report first, and when each listing's report was saved (by link).

        The same products `data_store.load_saved_products()` returns. They are shared: do not alter one.
        """
        with self._lock:
            stamp = self._stamp_now()
            if stamp is None:
                return [], {}
            if stamp != self._stamp:
                try:
                    self._read()
                except sqlite3.Error:
                    # Locked by a save that is taking long, or not a database yet. What was read before still
                    # stands (nothing, the first time), and the next request looks again.
                    return list(self._products), dict(self._dates)
                self._stamp = stamp
            return list(self._products), dict(self._dates)
