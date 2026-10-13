"""saved_pool.SavedPool: the saved products are read once and again only when the database changes.

Run with the original app's Python, from this project's folder:

    ..\\Capstone-Version-Control-Version-1.1\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"

Every test works on a database of its own in a temporary folder. The real one is not opened.
"""

from __future__ import annotations

import os
import sqlite3
import sys
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
ORIGINAL = Path(os.environ.get("DEFAKETIVE_ORIGINAL") or HERE.parent / "Capstone-Version-Control-Version-1.1")
sys.path[:0] = [str(HERE), str(ORIGINAL)]

from data_store import load_saved_products, save_products  # noqa: E402  (the original app's own reader and writer)
from saved_pool import SavedPool  # noqa: E402


def product(number: int, note: str = "first report") -> dict:
    return {
        "link": f"https://www.lazada.com.ph/products/pdp-i{number}.html",
        "name": f"Listing {number}",
        "platform": "Lazada PH",
        "review_count": 1,
        "note": note,
        "comments": [{"author": "A", "rating": 5, "time": "2026-10-01", "content": f"review of {number}"}],
    }


class SavedPoolTest(unittest.TestCase):
    def setUp(self) -> None:
        folder = tempfile.TemporaryDirectory()
        self.addCleanup(folder.cleanup)
        self.database = Path(folder.name) / "products.db"
        # Three saved together carry one time; the fourth is newer.
        save_products([product(1), product(2), product(3)], path=self.database)
        save_products([product(4)], path=self.database)
        self.pool = SavedPool(self.database)

    def run_sql(self, statement: str, *values: object) -> None:
        with closing(sqlite3.connect(self.database)) as connection:
            connection.execute(statement, values)
            connection.commit()

    def test_it_returns_what_the_original_reader_returns_in_the_same_order(self):
        products, saved_at = self.pool.snapshot()
        self.assertEqual(products, load_saved_products(self.database))
        self.assertEqual(products[0]["name"], "Listing 4")
        self.assertEqual(set(saved_at), {product(number)["link"] for number in (1, 2, 3, 4)})
        self.assertTrue(all(when.startswith("20") for when in saved_at.values()))

    def test_nothing_is_read_again_while_the_database_is_unchanged(self):
        first, _ = self.pool.snapshot()
        self.assertEqual(self.pool.parsed, 4)
        again, _ = self.pool.snapshot()
        self.assertEqual(self.pool.parsed, 4)
        # The very same products, not copies: that is what makes it quick, and why nobody may alter one.
        self.assertTrue(all(one is other for one, other in zip(first, again)))

    def test_only_the_product_that_was_saved_again_is_read_again(self):
        before, _ = self.pool.snapshot()
        untouched = next(item for item in before if item["name"] == "Listing 1")
        save_products([product(2, note="second report")], path=self.database)
        after, saved_at = self.pool.snapshot()
        self.assertEqual(self.pool.parsed, 5)
        self.assertEqual(after, load_saved_products(self.database))
        self.assertEqual(after[0]["note"], "second report")
        self.assertIs(next(item for item in after if item["name"] == "Listing 1"), untouched)
        self.assertEqual(len(saved_at), 4)

    def test_a_new_product_appears_and_a_removed_one_goes(self):
        self.pool.snapshot()
        save_products([product(5)], path=self.database)
        self.assertEqual([item["name"] for item in self.pool.snapshot()[0]][0], "Listing 5")
        self.run_sql("DELETE FROM products WHERE link = ?", product(5)["link"])
        products, saved_at = self.pool.snapshot()
        self.assertEqual(len(products), 4)
        self.assertNotIn(product(5)["link"], saved_at)
        self.assertEqual(products, load_saved_products(self.database))

    def test_a_row_that_is_not_a_product_is_left_out_as_the_original_reader_does(self):
        self.run_sql("UPDATE products SET raw_json = 'not json', updated_at = '2999' WHERE link = ?", product(1)["link"])
        self.run_sql("UPDATE products SET raw_json = '[1, 2]', updated_at = '2998' WHERE link = ?", product(2)["link"])
        products, _ = self.pool.snapshot()
        self.assertEqual(sorted(item["name"] for item in products), ["Listing 3", "Listing 4"])
        self.assertEqual(products, load_saved_products(self.database))

    def test_the_list_handed_out_can_be_changed_without_changing_the_pool(self):
        products, saved_at = self.pool.snapshot()
        products.clear()
        saved_at.clear()
        products, saved_at = self.pool.snapshot()
        self.assertEqual((len(products), len(saved_at)), (4, 4))

    def test_no_database_means_no_products_and_none_is_created(self):
        missing = self.database.with_name("not-there.db")
        self.assertEqual(SavedPool(missing).snapshot(), ([], {}))
        self.assertFalse(missing.exists())

    def test_a_file_that_is_not_a_database_gives_nothing_and_is_looked_at_again_later(self):
        other = self.database.with_name("other.db")
        other.write_bytes(b"this is not a database, and it is longer than a database's first hundred bytes " * 4)
        pool = SavedPool(other)
        self.assertEqual(pool.snapshot(), ([], {}))
        other.unlink()
        save_products([product(9)], path=other)
        self.assertEqual([item["name"] for item in pool.snapshot()[0]], ["Listing 9"])

    def test_reading_does_not_write_the_database(self):
        before = self.database.read_bytes()
        self.pool.snapshot()
        self.pool.snapshot()
        self.assertEqual(self.database.read_bytes(), before)
        self.assertEqual(sorted(path.name for path in self.database.parent.iterdir()), ["products.db"])


if __name__ == "__main__":
    unittest.main()
