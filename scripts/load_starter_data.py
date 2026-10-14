"""Put the starter reports (backend/seed/saved_products.json.gz) into a new PC's empty database. setup.cmd runs it.

The database is backend/defaketive.db, made here if it does not exist. One that already holds products is left as it
is: this only ever fills an empty one. Each report keeps the date it was saved on the PC it came from.

    backend\\.venv\\Scripts\\python.exe scripts\\load_starter_data.py
"""

from __future__ import annotations

import gzip
import hashlib
import json
import os
import sqlite3
import sys
from contextlib import closing
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
BACKEND = HERE / "backend"
SEED = BACKEND / "seed" / "saved_products.json.gz"
BATCH = 20


def main() -> int:
    for stream in (sys.stdout, sys.stderr):
        stream.reconfigure(encoding="utf-8", errors="replace")
    sys.path.insert(0, str(BACKEND))
    os.chdir(BACKEND)
    from data_store import DEFAULT_DB, save_products  # the app's own database code

    database = Path(DEFAULT_DB)
    if database.is_file():
        with closing(sqlite3.connect(f"file:{database.as_posix()}?mode=ro", uri=True)) as connection:
            try:
                held = connection.execute("SELECT COUNT(*) FROM products").fetchone()[0]
            except sqlite3.Error:
                held = 0
        if held:
            print(f"The database already holds {held} products. The starter reports were not loaded.")
            return 0
    manifest = json.loads((SEED.parent / "manifest.json").read_bytes())
    raw = SEED.read_bytes()
    if hashlib.sha256(raw).hexdigest() != manifest["sha256"]:
        sys.exit("The starter file is not the one its manifest describes (a broken download?). Nothing was loaded.")
    items = json.loads(gzip.decompress(raw).decode("utf-8"))
    for start in range(0, len(items), BATCH):
        save_products([item["product"] for item in items[start : start + BATCH]], source="starter data", path=database)
        print(f"  {min(start + BATCH, len(items))}/{len(items)} reports loaded", flush=True)
    with closing(sqlite3.connect(database)) as connection:
        connection.executemany(
            "UPDATE products SET updated_at = ? WHERE link = ?",
            [(item["saved_at"], item["product"]["link"]) for item in items if item.get("saved_at")],
        )
        connection.commit()
        products, reviews = (connection.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0] for table in ("products", "reviews"))
    print(f"Starter reports loaded: {products} products, {reviews:,} reviews.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
