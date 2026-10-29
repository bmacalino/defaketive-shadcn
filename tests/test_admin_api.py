"""admin_api.py: the admin app has its own sign-in for admins only, keeps admins out of the shopping app, manages
accounts safely and changes the daily limits.

Run with the original app's Python, from this project's folder:

    ..\\Capstone-Version-Control-Version-1.1\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"

Accounts go to the temporary database server_under_test sets up. The limits are put back after every test.
"""

from __future__ import annotations

import contextlib
import io
import sys
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from server_under_test import accounts, app, clear_counts, webapp  # noqa: E402

import admin_api  # noqa: E402
import protections  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import admin_accounts  # noqa: E402

DATABASE = lambda: app.config["ACCOUNTS_DB"]  # noqa: E731
LAZADA = "https://www.lazada.com.ph/products/pdp-i1234-s1.html"
PASSWORD = "long enough 1"


def new_account(prefix: str = "person", admin: bool = False) -> dict:
    email = f"{prefix}{time.time_ns()}@example.com"
    user = accounts.create_user(DATABASE(), "Test Person", email, PASSWORD)
    if admin:
        admin_api.add_admin(DATABASE(), user["id"])
    return user


def shopper_client():
    """A client signed in to the shopping app with a new shopper account, and that account."""
    user = new_account("shopper")
    client = app.test_client()
    assert client.post("/api/auth/login", json={"email": user["email"], "password": PASSWORD}).status_code == 200
    return client, user


def admin_client():
    """A client signed in to the admin app with a new admin account, and that account."""
    user = new_account("admin", admin=True)
    client = app.test_client()
    answer = client.post("/api/admin/login", json={"email": user["email"], "password": PASSWORD})
    assert answer.status_code == 200, answer.get_json()
    return client, user


class AdminTestCase(unittest.TestCase):
    def setUp(self) -> None:
        before = {name: getattr(protections.limits, name) for name in admin_api.LIMIT_NAMES}

        def put_back() -> None:
            for name, value in before.items():
                setattr(protections.limits, name, value)
            with admin_api._connect(DATABASE()) as connection:
                connection.execute("DELETE FROM site_settings")

        self.addCleanup(put_back)

    def row_of(self, client, user_id: int) -> dict:
        rows = client.get("/api/admin/accounts").get_json()["accounts"]
        return next(row for row in rows if row["id"] == user_id)


class SignInTest(AdminTestCase):
    ROUTES = (
        ("get", "/api/admin/accounts", None), ("put", "/api/admin/accounts/1/role", {"admin": True}),
        ("delete", "/api/admin/accounts/1", None), ("get", "/api/admin/limits", None),
        ("put", "/api/admin/limits", {"site": 1, "account": 1, "network": 1}),
        ("put", "/api/admin/password", {"current_password": PASSWORD, "new_password": "another long one"}),
    )

    def test_nobody_signed_in_is_asked_to_sign_in(self) -> None:
        client = app.test_client()
        self.assertEqual(client.get("/api/admin/me").get_json(), {"admin": None})
        for method, path, body in self.ROUTES:
            with self.subTest(path=path, method=method):
                answer = getattr(client, method)(path, json=body)
                self.assertEqual(answer.status_code, 401)
                self.assertTrue(answer.get_json()["sign_in"])

    def test_a_shopping_app_session_does_not_open_the_admin_app(self) -> None:
        client, _user = shopper_client()
        self.assertEqual(client.get("/api/admin/me").get_json(), {"admin": None})
        for method, path, body in self.ROUTES:
            with self.subTest(path=path, method=method):
                self.assertEqual(getattr(client, method)(path, json=body).status_code, 401)
        self.assertEqual(protections.limits.site, protections.Limits().site)

    def test_a_shopper_cannot_sign_in_to_the_admin_app(self) -> None:
        user = new_account("shopper")
        answer = app.test_client().post("/api/admin/login", json={"email": user["email"], "password": PASSWORD})
        self.assertEqual(answer.status_code, 403)
        self.assertEqual(answer.get_json()["error"], admin_api.NOT_ADMIN_MESSAGE)

    def test_a_wrong_password_is_refused_and_counted(self) -> None:
        user = new_account("admin", admin=True)
        client = app.test_client()
        for _ in range(webapp.LOGIN_FAILURE_LIMIT):
            answer = client.post("/api/admin/login", json={"email": user["email"], "password": "not it at all"})
            self.assertEqual(answer.status_code, 401)
        answer = client.post("/api/admin/login", json={"email": user["email"], "password": PASSWORD})
        self.assertEqual(answer.status_code, 429)

    def test_an_admin_signs_in_and_out_apart_from_the_shopping_app(self) -> None:
        client, user = admin_client()
        me = client.get("/api/admin/me").get_json()["admin"]
        self.assertEqual((me["id"], me["email"]), (user["id"], user["email"]))
        self.assertIsNone(client.get("/api/auth/me").get_json().get("user"), "the shopping app stays signed out")
        client.post("/api/admin/logout", json={})
        self.assertEqual(client.get("/api/admin/me").get_json(), {"admin": None})
        self.assertEqual(client.get("/api/admin/accounts").status_code, 401)

    def test_the_original_admin_routes_stay_closed(self) -> None:
        client, _user = admin_client()
        for path in ("/api/admin/overview", "/api/admin/database", "/api/admin/lexicons", "/api/admin/logs"):
            with self.subTest(path=path):
                self.assertEqual(client.get(path).status_code, 404)

    def test_with_a_door_of_its_own_the_admin_routes_answer_only_there(self) -> None:
        client, _user = admin_client()
        admin_api.door_only = True
        self.addCleanup(setattr, admin_api, "door_only", False)
        self.assertEqual(client.get("/api/admin/me").status_code, 404)
        self.assertEqual(client.get("/api/admin/me", environ_overrides={admin_api.DOOR: True}).status_code, 200)
        self.assertEqual(client.get("/api/auth/me").status_code, 200)


@unittest.skipUnless((Path(__file__).resolve().parent.parent / "admin" / "build" / "index.html").is_file(),
                     "the admin app is not built (npm run admin:build)")
class AdminAddressTest(AdminTestCase):
    """serve.py's admin address: the admin app's screens, and /api marked as come in through it."""

    def test_serves_the_admin_screens_and_lets_the_admin_routes_through(self) -> None:
        import serve
        from werkzeug.test import Client

        user = new_account("admin", admin=True)
        door = Client(serve.create_admin_app(app))
        admin_api.door_only = True
        self.addCleanup(setattr, admin_api, "door_only", False)
        for address in ("/", "/some/other/address"):
            with self.subTest(address=address):
                page = door.get(address)
                self.addCleanup(page.close)
                self.assertEqual(page.status_code, 200)
                self.assertIn(b"DeFaketive Admin", page.data)
                self.assertEqual(page.headers["X-Frame-Options"], "DENY")
        self.assertEqual(door.post("/api/admin/login", json={"email": user["email"], "password": PASSWORD}).status_code, 200)
        self.assertEqual(door.get("/api/admin/me").get_json()["admin"]["id"], user["id"])
        # The public address does not answer for the admin routes.
        self.assertEqual(app.test_client().post("/api/admin/login", json={"email": user["email"], "password": PASSWORD}).status_code, 404)


class AdminOnlyTest(AdminTestCase):
    def test_the_shopping_app_refuses_an_admin_account(self) -> None:
        user = new_account("admin", admin=True)
        client = app.test_client()
        answer = client.post("/api/auth/login", json={"email": user["email"], "password": PASSWORD})
        self.assertEqual(answer.status_code, 403)
        self.assertEqual(answer.get_json()["error"], admin_api.ADMIN_ONLY_MESSAGE)
        self.assertIsNone(client.get("/api/auth/me").get_json().get("user"))
        # A wrong password says what it always says, so the refusal tells nothing without the password.
        wrong = client.post("/api/auth/login", json={"email": user["email"], "password": "not it at all"})
        self.assertEqual(wrong.status_code, 401)

    def test_a_shopper_made_admin_is_signed_out_of_the_shopping_app(self) -> None:
        shopper, user = shopper_client()
        self.assertEqual(shopper.get("/api/auth/me").get_json()["user"]["email"], user["email"])
        admin, _me = admin_client()
        admin.put(f"/api/admin/accounts/{user['id']}/role", json={"admin": True})
        self.assertIsNone(shopper.get("/api/auth/me").get_json().get("user"))

    def test_signing_in_to_the_shopping_app_keeps_an_admin_signed_in_on_the_same_computer(self) -> None:
        client, _admin = admin_client()
        shopper = new_account("shopper")
        self.assertEqual(client.post("/api/auth/login", json={"email": shopper["email"], "password": PASSWORD}).status_code, 200)
        self.assertEqual(client.get("/api/auth/me").get_json()["user"]["email"], shopper["email"])
        self.assertIsNotNone(client.get("/api/admin/me").get_json()["admin"])

    def test_an_admin_whose_role_is_removed_is_signed_out(self) -> None:
        client, user = admin_client()
        admin_api.remove_admin(DATABASE(), user["id"])
        answer = client.get("/api/admin/accounts")
        self.assertEqual(answer.status_code, 401)
        self.assertEqual(answer.get_json()["error"], admin_api.ROLE_REMOVED_MESSAGE)
        self.assertEqual(client.get("/api/admin/me").get_json(), {"admin": None})
        # Asked "who is signed in" first, the answer says why.
        other, someone = admin_client()
        admin_api.remove_admin(DATABASE(), someone["id"])
        self.assertEqual(other.get("/api/admin/me").get_json(), {"admin": None, "notice": admin_api.ROLE_REMOVED_MESSAGE})
        self.assertEqual(other.get("/api/admin/me").get_json(), {"admin": None})


class PasswordTest(AdminTestCase):
    def test_change_own_password(self) -> None:
        client, user = admin_client()
        wrong = client.put("/api/admin/password", json={"current_password": "nope nope", "new_password": "a new one 22"})
        self.assertEqual(wrong.status_code, 403)
        self.assertIn("current_password", wrong.get_json()["fields"])
        short = client.put("/api/admin/password", json={"current_password": PASSWORD, "new_password": "short"})
        self.assertEqual(short.status_code, 400)
        empty = client.put("/api/admin/password", json={"current_password": PASSWORD, "new_password": ""})
        self.assertEqual(empty.status_code, 400)
        self.assertEqual(client.put("/api/admin/password", json={"current_password": PASSWORD, "new_password": "a new one 22"}).status_code, 200)
        self.assertIsNotNone(accounts.authenticate(DATABASE(), user["email"], "a new one 22"))


class AccountsTest(AdminTestCase):
    def test_lists_names_and_emails_but_never_passwords(self) -> None:
        client, me = admin_client()
        other = new_account("shopper")
        accounts.set_wishlist(DATABASE(), other["id"], LAZADA, True)
        answer = client.get("/api/admin/accounts").get_json()
        self.assertGreaterEqual(answer["total"], 2)
        self.assertGreaterEqual(answer["admins"], 1)
        text = str(answer)
        for secret in ("password", "pbkdf2", "scrypt"):
            self.assertNotIn(secret, text)
        mine, theirs = self.row_of(client, me["id"]), self.row_of(client, other["id"])
        self.assertEqual((mine["admin"], mine["you"]), (True, True))
        self.assertEqual((theirs["admin"], theirs["you"]), (False, False))
        self.assertEqual((theirs["name"], theirs["email"]), ("Test Person", other["email"]))
        self.assertEqual((theirs["history"], theirs["wishlist"], theirs["checks_today"]), (0, 1, 0))
        self.assertTrue(theirs["joined"])
        ids = [row["id"] for row in answer["accounts"]]
        self.assertLess(ids.index(other["id"]), ids.index(me["id"]), "newest first")

    def test_search_finds_by_email_and_treats_wildcards_as_text(self) -> None:
        client, _me = admin_client()
        other = new_account("shopper")
        found = client.get("/api/admin/accounts", query_string={"q": other["email"].upper()}).get_json()["accounts"]
        self.assertEqual([row["id"] for row in found], [other["id"]])
        self.assertEqual(client.get("/api/admin/accounts", query_string={"q": "%"}).get_json()["accounts"], [])

    def test_make_and_remove_an_admin(self) -> None:
        client, _me = admin_client()
        other = new_account("shopper")
        self.assertEqual(client.put(f"/api/admin/accounts/{other['id']}/role", json={"admin": True}).status_code, 200)
        self.assertTrue(self.row_of(client, other["id"])["admin"])
        self.assertTrue(admin_api.is_admin(DATABASE(), other["id"]))
        self.assertEqual(client.put(f"/api/admin/accounts/{other['id']}/role", json={"admin": False}).status_code, 200)
        self.assertFalse(self.row_of(client, other["id"])["admin"])

    def test_role_needs_a_yes_or_no_and_a_real_account(self) -> None:
        client, _me = admin_client()
        self.assertEqual(client.put("/api/admin/accounts/1/role", json={"admin": "yes"}).status_code, 400)
        self.assertEqual(client.put("/api/admin/accounts/999999/role", json={"admin": True}).status_code, 404)

    def test_an_admin_cannot_remove_their_own_role(self) -> None:
        client, me = admin_client()
        answer = client.put(f"/api/admin/accounts/{me['id']}/role", json={"admin": False})
        self.assertEqual((answer.status_code, answer.get_json()["error"]), (409, admin_api.OWN_ROLE_MESSAGE))
        self.assertTrue(admin_api.is_admin(DATABASE(), me["id"]))

    def test_delete_removes_the_account_and_everything_it_kept(self) -> None:
        client, _me = admin_client()
        shopper, other = shopper_client()
        accounts.set_wishlist(DATABASE(), other["id"], LAZADA, True)
        self.assertEqual(client.delete(f"/api/admin/accounts/{other['id']}").get_json(), {"deleted": other["id"]})
        self.assertIsNone(accounts.get_user(DATABASE(), other["id"]))
        with admin_api._connect(DATABASE()) as connection:
            left = connection.execute("SELECT COUNT(*) FROM user_wishlist WHERE user_id = ?", (other["id"],)).fetchone()[0]
        self.assertEqual(left, 0)
        self.assertIsNone(shopper.get("/api/auth/me").get_json().get("user"))
        self.assertEqual(client.delete(f"/api/admin/accounts/{other['id']}").status_code, 404)

    def test_delete_refuses_your_own_account_and_other_admins(self) -> None:
        client, me = admin_client()
        other = new_account("admin", admin=True)
        own = client.delete(f"/api/admin/accounts/{me['id']}")
        self.assertEqual((own.status_code, own.get_json()["error"]), (409, admin_api.OWN_ACCOUNT_MESSAGE))
        theirs = client.delete(f"/api/admin/accounts/{other['id']}")
        self.assertEqual((theirs.status_code, theirs.get_json()["error"]), (409, admin_api.ADMIN_ACCOUNT_MESSAGE))
        self.assertIsNotNone(accounts.get_user(DATABASE(), me["id"]))
        self.assertIsNotNone(accounts.get_user(DATABASE(), other["id"]))


class LimitsTest(AdminTestCase):
    def test_shows_the_limits_and_todays_use(self) -> None:
        clear_counts()
        accounts.reserve_guest_scan(DATABASE(), protections.SITE_KEY, accounts.manila_day(), 1000)
        client, _me = admin_client()
        answer = client.get("/api/admin/limits").get_json()
        self.assertEqual(set(answer["limits"]), {"site", "account", "network"})
        self.assertEqual(answer["limits"]["site"], protections.limits.site)
        self.assertEqual(answer["defaults"]["site"], protections.Limits().site)
        self.assertEqual(answer["site_used_today"], 1)
        self.assertEqual(answer["max"], admin_api.MAX_LIMIT)
        clear_counts()

    def test_a_change_counts_at_once_and_is_kept(self) -> None:
        client, _me = admin_client()
        answer = client.put("/api/admin/limits", json={"site": 250, "account": 5, "network": 0})
        self.assertEqual(answer.status_code, 200)
        self.assertEqual(answer.get_json()["limits"], {"site": 250, "account": 5, "network": 0})
        self.assertEqual((protections.limits.site, protections.limits.account, protections.limits.network), (250, 5, 0))
        self.assertEqual(admin_api.saved_limits(DATABASE()), {"site": 250, "account": 5, "network": 0})
        # After a restart: the environment's numbers first, then the saved ones over them.
        protections.limits.site = 100
        admin_api.apply_saved_limits(DATABASE())
        self.assertEqual(protections.limits.site, 250)

    def test_refuses_anything_but_whole_numbers_in_range(self) -> None:
        client, _me = admin_client()
        for bad in ({"site": -1, "account": 5, "network": 5}, {"site": 10_001, "account": 5, "network": 5},
                    {"site": 2.5, "account": 5, "network": 5}, {"site": "9", "account": 5, "network": 5},
                    {"site": True, "account": 5, "network": 5}, {"site": 9, "account": 5}, []):
            with self.subTest(body=bad):
                answer = client.put("/api/admin/limits", json=bad)
                self.assertEqual(answer.status_code, 400)
                self.assertEqual(answer.get_json()["error"], admin_api.LIMITS_MESSAGE)
        self.assertEqual(admin_api.saved_limits(DATABASE()), {})

    def test_a_check_over_the_new_limit_is_refused(self) -> None:
        clear_counts()
        client, _me = admin_client()
        client.put("/api/admin/limits", json={"site": 0, "account": 10, "network": 10})
        answer = app.test_client().post("/api/search", json={"query": LAZADA, "live": True})
        self.assertEqual(answer.status_code, 429)
        self.assertTrue(answer.get_json()["site_limit"])
        clear_counts()


class ScriptTest(AdminTestCase):
    def run_script(self, *args: str) -> tuple[int, str]:
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = admin_accounts.main(list(args))
        return code, out.getvalue() + err.getvalue()

    def test_add_list_and_remove(self) -> None:
        original = admin_accounts.accounts_db
        admin_accounts.accounts_db = lambda: Path(DATABASE())
        self.addCleanup(setattr, admin_accounts, "accounts_db", original)
        email = f"new.admin.{time.time_ns()}@example.com"
        self.assertEqual(self.run_script("add", "--email", email)[0], 2)  # no such account, no name
        code, said = self.run_script("add", "--email", email, "--name", "New Admin")
        self.assertEqual(code, 0)
        self.assertIn("Password, shown only this once", said)
        self.assertIn(email, self.run_script("list")[1])
        self.assertEqual(self.run_script("remove", "--email", email)[0], 0)
        self.assertEqual(self.run_script("remove", "--email", email)[0], 1)
        user = admin_api.user_by_email(DATABASE(), email)
        self.assertIsNotNone(user)
        self.assertFalse(admin_api.is_admin(DATABASE(), user["id"]))


if __name__ == "__main__":
    unittest.main()
