"""The server the Python tests use: server.py set up exactly as serve.py sets it up for the public.

Imported by the test files (it is not a test file itself). Accounts and daily counts go to a temporary database;
the saved products are read from the real one, read only. Flask allows no new routes once a request has been
served, so everything is set up here, once, before any test runs.
"""

from __future__ import annotations

import atexit
import os
import shutil
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
TEMP = Path(tempfile.mkdtemp(prefix="defaketive-tests-"))
atexit.register(shutil.rmtree, TEMP, ignore_errors=True)
os.environ["DEFAKETIVE_ACCOUNTS_DB"] = str(TEMP / "accounts.db")
os.environ["DEFAKETIVE_ANALYSIS_CACHE"] = str(TEMP / "cache")
os.environ.setdefault("DEFAKETIVE_SECRET_KEY", "tests-only")
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

_cwd = os.getcwd()
import server  # noqa: E402  (imports the original app; it moves into the original's folder)

os.chdir(_cwd)
import accounts  # noqa: E402,F401  (the original's)
import extension_api  # noqa: E402,F401
import protections  # noqa: E402
import serve  # noqa: E402

webapp = server.webapp
app = webapp.app
BUILT = (HERE / "build" / "index.html").is_file()
if BUILT:
    serve.create_public_app(https=False)
else:
    protections.use_public_wording(webapp)


def sign_up(client, email_prefix: str = "test") -> None:
    """A new account, signed in on this client."""
    import time

    answer = client.post("/api/auth/signup", json={
        "full_name": "Test Person", "email": f"{email_prefix}{time.time_ns()}@example.com",
        "password": "long enough 1", "confirm": "long enough 1", "agree": True,
    })
    assert answer.status_code == 201, answer.get_json()


def clear_counts() -> None:
    """Forget every daily count (guests, connections, accounts, the site)."""
    import sqlite3
    from contextlib import closing

    database = app.config["ACCOUNTS_DB"]
    accounts.guest_scans_used(database, "", accounts.manila_day())  # makes the tables on first use
    with closing(sqlite3.connect(database)) as connection, connection:
        connection.execute("DELETE FROM guest_scans")
