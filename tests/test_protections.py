"""protections.py and serve.py: what keeps the app safe once the public can reach it.

Run with the original app's Python, from this project's folder:

    ..\\Capstone-Version-Control-Version-1.1\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"

Accounts and daily counts go to a temporary database. The saved products are read from the real database, read
only, as the e2e tests do. No scan is started: the original's job starter is replaced while a test needs it, and
the queue is tested with a stand-in for the scraper. The app is set up exactly as serve.py sets it up for the
public, so these tests also cover that.
"""

from __future__ import annotations

import os
import sqlite3
import sys
import threading
import time
import unittest
from contextlib import closing
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
from server_under_test import BUILT, HERE, TEMP, accounts, app, clear_counts, protections, serve, sign_up, webapp  # noqa: E402
from data_store import DEFAULT_DB  # noqa: E402

LAZADA = "https://www.lazada.com.ph/products/pdp-i9000001-s1.html"
SHOPEE = "https://shopee.ph/product-i.1.2"


def counts_used(key: str) -> int:
    return accounts.guest_scans_used(app.config["ACCOUNTS_DB"], key, accounts.manila_day())


class SavedLimits:
    """Restores the limits a test changes."""

    def setUp(self) -> None:
        self.saved_limits = dict(vars(protections.limits))
        clear_counts()

    def tearDown(self) -> None:
        vars(protections.limits).update(self.saved_limits)
        clear_counts()


class ClosedRoutesTest(unittest.TestCase):
    CLOSED = [
        ("post", "/api/upload"), ("post", "/api/evaluation"), ("post", "/api/survey"),
        ("get", "/api/admin/logs"), ("get", "/api/admin/database"), ("get", "/api/admin/lexicons"),
        ("get", "/api/admin/overview"), ("get", "/api/export/products.csv"), ("get", "/api/export/reviews.csv"),
    ]

    def test_old_routes_answer_not_found(self) -> None:
        client = app.test_client()
        for method, path in self.CLOSED:
            with self.subTest(path=path):
                answer = getattr(client, method)(path)
                self.assertEqual(answer.status_code, 404)
                self.assertEqual(answer.get_json(), {"error": "Not found."})

    def test_routes_the_screens_use_still_answer(self) -> None:
        client = app.test_client()
        for path in ("/api/stats/public", "/api/auth/me", "/api/saved/products"):
            with self.subTest(path=path):
                self.assertEqual(client.get(path).status_code, 200)

    def test_old_routes_can_be_opened_again(self) -> None:
        with mock.patch.dict(os.environ, {"DEFAKETIVE_OLD_ROUTES": "1"}):
            self.assertEqual(app.test_client().get("/api/admin/lexicons").status_code, 200)


class ReviewerNamesTest(unittest.TestCase):
    def setUp(self) -> None:
        self.product = {
            "link": LAZADA, "name": "Test listing", "platform": "Lazada PH",
            "comments": [
                {"author": "Juana Dela Cruz", "rating": 1, "time": "2026-10-01", "content": "Uminit at umusok."},
                {"author": "Pedro Penduko", "rating": 5, "time": "2026-10-02", "content": "Maganda."},
            ],
        }
        self.client = app.test_client()
        with self.client.session_transaction() as session:
            session["catalog_key"] = "reviewer-names-test"
        with webapp._lock:
            webapp._catalogs["reviewer-names-test"] = [self.product]

    def tearDown(self) -> None:
        with webapp._lock:
            webapp._catalogs.pop("reviewer-names-test", None)

    def test_reports_carry_no_reviewer_names(self) -> None:
        for path in ("/api/products/detail", "/api/saved/detail"):
            with self.subTest(path=path):
                answer = self.client.get(path, query_string={"link": LAZADA})
                self.assertEqual(answer.status_code, 200)
                reviews = answer.get_json()["product"]["comments"]
                self.assertEqual([review["content"] for review in reviews], ["Uminit at umusok.", "Maganda."])
                self.assertFalse(any("author" in review for review in reviews))
                self.assertNotIn(b"Juana", answer.data)
        # Only what is sent changes: the product itself keeps them.
        self.assertEqual(self.product["comments"][0]["author"], "Juana Dela Cruz")

    def test_without_names_leaves_other_things_alone(self) -> None:
        self.assertEqual(protections.without_names({"link": LAZADA}), {"link": LAZADA})
        self.assertIsNone(protections.without_names(None))


class DailyLimitsTest(SavedLimits, unittest.TestCase):
    def setUp(self) -> None:
        super().setUp()
        self.started: list[str] = []

        def fake_start(catalog_key: str, keyword: str, *_: object) -> dict:
            self.started.append(keyword)
            return {"id": f"fake-{len(self.started)}", "state": "complete"}

        patches = [mock.patch.object(webapp, "_start_job", fake_start), mock.patch.object(webapp, "require_model", lambda: None)]
        for patch in patches:
            patch.start()
            self.addCleanup(patch.stop)

    @staticmethod
    def check(client, link: str = LAZADA, address: str = "203.0.113.5", headers: dict | None = None):
        return client.post("/api/search", json={"query": link, "live": True},
                           environ_base={"REMOTE_ADDR": address}, headers=headers or {})

    def network(self, address: str) -> str:
        return protections.network_key(app.config["SECRET_KEY"], address)

    def test_guests_share_a_limit_per_connection(self) -> None:
        protections.limits.network = 2
        answers = [self.check(app.test_client()).status_code for _ in range(3)]
        self.assertEqual(answers, [202, 202, 429])
        refused = self.check(app.test_client()).get_json()
        self.assertTrue(refused["network_limit"])
        self.assertNotIn("limit_reached", refused)  # that one asks the screens to offer sign-in with the cookie count
        self.assertEqual(self.check(app.test_client(), address="198.51.100.7").status_code, 202)
        self.assertEqual(counts_used(self.network("203.0.113.5")), 2)

    def test_the_cookie_limit_still_holds_and_gives_back_the_other_counts(self) -> None:
        client = app.test_client()
        answers = [self.check(client) for _ in range(4)]
        self.assertEqual([a.status_code for a in answers], [202, 202, 202, 429])
        self.assertTrue(answers[-1].get_json()["limit_reached"])
        self.assertEqual(counts_used(self.network("203.0.113.5")), 3)
        self.assertEqual(counts_used(protections.SITE_KEY), 3)

    def test_accounts_have_a_daily_limit(self) -> None:
        protections.limits.account = 2
        client = app.test_client()
        sign_up(client, "limit")
        answers = [self.check(client) for _ in range(3)]
        self.assertEqual([a.status_code for a in answers], [202, 202, 429])
        self.assertTrue(answers[-1].get_json()["account_limit"])
        self.assertIn("today's 2 checks", answers[-1].get_json()["error"])
        self.assertEqual(counts_used(self.network("203.0.113.5")), 0)

    def test_the_whole_site_has_a_daily_limit(self) -> None:
        protections.limits.site = 2
        answers = [self.check(app.test_client(), address=f"192.0.2.{n}") for n in range(3)]
        self.assertEqual([a.status_code for a in answers], [202, 202, 429])
        self.assertTrue(answers[-1].get_json()["site_limit"])
        self.assertEqual(len(self.started), 2)

    def test_a_check_that_does_not_start_gives_its_counts_back(self) -> None:
        answer = self.check(app.test_client(), link=SHOPEE)
        self.assertEqual(answer.status_code, 400)
        self.assertEqual(counts_used(protections.SITE_KEY), 0)
        self.assertEqual(counts_used(self.network("203.0.113.5")), 0)

    def test_saved_lookups_are_not_counted(self) -> None:
        answer = app.test_client().post("/api/search", json={"query": LAZADA, "live": False})
        self.assertEqual(answer.status_code, 200)
        self.assertEqual(counts_used(protections.SITE_KEY), 0)

    def test_busy_when_too_many_checks_are_running_or_waiting(self) -> None:
        protections.limits.active_scans = 2
        with webapp._lock:
            webapp._jobs.update({f"busy-{n}": {"state": "running"} for n in range(2)})
        try:
            answer = self.check(app.test_client())
        finally:
            with webapp._lock:
                for n in range(2):
                    webapp._jobs.pop(f"busy-{n}", None)
        self.assertEqual(answer.status_code, 503)
        self.assertTrue(answer.get_json()["busy"])
        self.assertEqual(counts_used(protections.SITE_KEY), 0)

    def test_cloudflare_names_the_visitor_only_on_requests_from_this_computer(self) -> None:
        protections.limits.network = 1
        with mock.patch.dict(os.environ, {"DEFAKETIVE_PROXY": "cloudflare"}):
            first = self.check(app.test_client(), address="127.0.0.1", headers={"CF-Connecting-IP": "203.0.113.20"})
            second = self.check(app.test_client(), address="127.0.0.1", headers={"CF-Connecting-IP": "203.0.113.21"})
            again = self.check(app.test_client(), address="127.0.0.1", headers={"CF-Connecting-IP": "203.0.113.20"})
            # From anywhere else the header is the visitor's own claim, and is ignored.
            forged = self.check(app.test_client(), address="198.51.100.9", headers={"CF-Connecting-IP": "203.0.113.99"})
            forged_again = self.check(app.test_client(), address="198.51.100.9", headers={"CF-Connecting-IP": "203.0.113.98"})
        self.assertEqual([first.status_code, second.status_code, again.status_code], [202, 202, 429])
        self.assertEqual([forged.status_code, forged_again.status_code], [202, 429])
        self.assertEqual(counts_used(self.network("203.0.113.20")), 1)

    def test_no_address_is_stored(self) -> None:
        self.check(app.test_client(), address="203.0.113.77")
        with closing(sqlite3.connect(app.config["ACCOUNTS_DB"])) as connection:
            keys = [row[0] for row in connection.execute("SELECT guest_key FROM guest_scans")]
        self.assertFalse(any("203.0.113.77" in key for key in keys))
        self.assertIn(self.network("203.0.113.77"), keys)

    def test_old_daily_counts_are_removed(self) -> None:
        database = app.config["ACCOUNTS_DB"]
        old = (datetime.now(timezone.utc) - timedelta(days=8)).date().isoformat()
        accounts.reserve_guest_scan(database, "network:old", old)
        accounts.reserve_guest_scan(database, "network:today", accounts.manila_day())
        protections._housekeeping(webapp, database)
        self.assertEqual(accounts.guest_scans_used(database, "network:old", old), 0)
        self.assertEqual(counts_used("network:today"), 1)


class ScanQueueTest(unittest.TestCase):
    def test_the_installed_scraper_runner_waits_its_turn(self) -> None:
        self.assertTrue(hasattr(webapp._run_scraper, "__wrapped__"))

    def test_one_chrome_at_a_time_and_the_wait_is_shown(self) -> None:
        jobs = {name: {"state": "running", "platform": "lazada", "message": "Opening Lazada…"} for name in ("A", "B", "C")}
        queue = protections.ScanQueue(jobs, threading.RLock())
        release = {name: threading.Event() for name in jobs}
        running: list[str] = []

        def fake_scraper(command: list[str], on_line) -> str:
            running.append(command[0])
            release[command[0]].wait(10)
            return command[0]

        queued = queue.wrap(fake_scraper)
        threads = {name: threading.Thread(target=queued, args=([name], print), name=f"{protections.SCAN_THREAD_PREFIX}{name}")
                   for name in jobs}

        def wait_for(condition) -> None:
            deadline = time.monotonic() + 10
            while not condition():
                self.assertLess(time.monotonic(), deadline, "timed out")
                time.sleep(0.01)

        threads["A"].start()
        wait_for(lambda: running == ["A"])
        threads["B"].start()
        wait_for(lambda: "Waiting for 1 other check to finish" in jobs["B"]["message"])
        threads["C"].start()
        wait_for(lambda: "Waiting for 2 other checks to finish" in jobs["C"]["message"])
        self.assertEqual(running, ["A"])
        release["A"].set()
        wait_for(lambda: running == ["A", "B"])
        wait_for(lambda: "Waiting for 1 other check" in jobs["C"]["message"])
        self.assertEqual(jobs["B"]["message"], "Opening Lazada and collecting public reviews…")
        release["B"].set()
        release["C"].set()
        for thread in threads.values():
            thread.join(10)
        self.assertEqual(running, ["A", "B", "C"])
        self.assertEqual(queue.running, 0)
        self.assertEqual(queue.waiting, [])


class SessionCatalogsTest(SavedLimits, unittest.TestCase):
    def test_empty_catalogs_go_first(self) -> None:
        protections.limits.session_catalogs = 10
        catalogs = protections.SessionCatalogs()
        catalogs["scanned"] = [{"link": LAZADA}]
        for n in range(15):
            catalogs[f"visitor-{n}"] = []
        self.assertEqual(len(catalogs), 10)
        self.assertIn("scanned", catalogs)
        self.assertIn("visitor-14", catalogs)

    def test_idle_catalogs_are_forgotten(self) -> None:
        catalogs = protections.SessionCatalogs({"idle": [{"link": LAZADA}], "busy": []})
        catalogs._used["idle"] -= protections.limits.session_idle_seconds + 1
        catalogs.prune()
        self.assertEqual(list(catalogs), ["busy"])

    def test_new_visitors_start_empty_and_write_nothing(self) -> None:
        self.assertIsInstance(webapp._catalogs, protections.SessionCatalogs)
        before = DEFAULT_DB.stat().st_mtime_ns if DEFAULT_DB.exists() else None
        for _ in range(20):
            answer = app.test_client().get("/api/products")
            self.assertEqual(answer.get_json()["count"], 0)
        after = DEFAULT_DB.stat().st_mtime_ns if DEFAULT_DB.exists() else None
        self.assertEqual(before, after)


class PublicWordingTest(unittest.TestCase):
    def test_a_check_is_worded_for_the_team(self) -> None:
        read = webapp.SCAN_PROGRESS_READERS["lazada"]
        update = read("12:00 [INFO] Step: showing the Chrome window (verification)")
        self.assertEqual(update["message"], protections.PUBLIC_CHECK_MESSAGE)
        self.assertTrue(update["needs_you"] and update["needs_team"])
        update = read("12:00 [INFO] Step: showing the Chrome window (needs a login)")
        self.assertEqual(update["message"], protections.PUBLIC_LOGIN_MESSAGE)
        ordinary = read("12:00 [INFO] Step: product page opened")
        self.assertFalse(ordinary["needs_team"])
        self.assertIsNone(read("nothing to see"))

    def test_applying_it_twice_changes_nothing_more(self) -> None:
        reader = webapp.SCAN_PROGRESS_READERS["lazada"]
        protections.use_public_wording(webapp)
        self.assertIs(webapp.SCAN_PROGRESS_READERS["lazada"], reader)


@unittest.skipUnless(BUILT, "build/ is missing: run npm run build")
class ServeTest(unittest.TestCase):
    def setUp(self) -> None:
        self.client = app.test_client()
        self.index = (HERE / "build" / "index.html").read_bytes()

    def get(self, path: str):
        """An answer, read whole and closed (a served file stays open until its answer is closed)."""
        answer = self.client.get(path)
        answer.get_data()
        answer.close()
        return answer

    def test_every_page_address_gets_the_app(self) -> None:
        for path in ("/", "/app/products", "/scan/report?link=x", "/no/such/page"):
            with self.subTest(path=path):
                answer = self.get(path)
                self.assertEqual(answer.status_code, 200)
                self.assertEqual(answer.data, self.index)
                self.assertIn("no-cache", answer.headers["Cache-Control"])

    def test_built_files_are_served_and_kept_long(self) -> None:
        asset = next((HERE / "build" / "_app" / "immutable").rglob("*.js"))
        path = asset.relative_to(HERE / "build").as_posix()
        answer = self.get(f"/{path}")
        self.assertEqual(answer.status_code, 200)
        self.assertEqual(answer.data, asset.read_bytes())
        self.assertIn("immutable", answer.headers["Cache-Control"])
        robots = self.get("/robots.txt")
        self.assertEqual(robots.data, (HERE / "build" / "robots.txt").read_bytes())

    def test_unknown_api_addresses_are_not_pages(self) -> None:
        answer = self.get("/api/no-such-thing")
        self.assertEqual(answer.status_code, 404)
        self.assertEqual(answer.get_json(), {"error": "Not found."})

    def test_nothing_outside_build_is_served(self) -> None:
        for path in ("/../server.py", "/%2e%2e/server.py", "/_app/../../server.py"):
            with self.subTest(path=path):
                self.assertNotIn(b"import protections", self.get(path).data)

    def test_safety_headers(self) -> None:
        page = self.get("/")
        self.assertEqual(page.headers["X-Frame-Options"], "DENY")
        self.assertEqual(page.headers["X-Content-Type-Options"], "nosniff")
        self.assertEqual(self.get("/api/stats/public").headers["Cache-Control"], "no-store")

    def test_https_cookies_only_when_asked(self) -> None:
        self.assertFalse(app.config["SESSION_COOKIE_SECURE"])


class BackupTest(unittest.TestCase):
    def test_copies_both_databases_and_keeps_the_newest_days(self) -> None:
        backup = serve._backup_script()
        folder = TEMP / "backups"
        sources = {}
        for name in ("defaketive.db", "accounts.db"):
            path = TEMP / f"source-{name}"
            with closing(sqlite3.connect(path)) as connection, connection:
                connection.execute("CREATE TABLE IF NOT EXISTS t (x)")
                connection.execute("INSERT INTO t VALUES (?)", (name,))
            sources[name] = path
        start = datetime(2026, 10, 1, 12, tzinfo=timezone.utc)
        for day in range(3):
            target = backup.backup(sources, folder, keep=2, now=start + timedelta(days=day))
        self.assertEqual(sorted(p.name for p in folder.iterdir()), ["2026-10-02", "2026-10-03"])
        with closing(sqlite3.connect(target / "accounts.db")) as connection:
            self.assertEqual(connection.execute("SELECT x FROM t").fetchall(), [("accounts.db",)])
        self.assertFalse(list(folder.rglob("*.partial")))


if __name__ == "__main__":
    unittest.main()
