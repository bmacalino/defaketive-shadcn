"""Makes, lists and removes admins of the admin app (admin/, admin_api.py). The first admin can only be made here.

Run with the original app's Python, on the PC that runs DeFaketive:

    ..\\Capstone-Version-Control-Version-1.1\\.venv\\Scripts\\python.exe scripts\\admin_accounts.py add --email name@dti.gov.ph --name "Full Name"
    ...admin_accounts.py add --email someone@example.com        make an account that already exists an admin
    ...admin_accounts.py list
    ...admin_accounts.py remove --email name@dti.gov.ph

`add` with an email nobody has signed up with makes the account and prints a password for it, once. Hand it over in
person or by phone, not in the same message as the email, and ask them to change it in Settings. `remove` takes the
admin role back; the account itself stays. Unlike the page, this can remove the last admin.

The accounts database is the app's own: DEFAKETIVE_ACCOUNTS_DB, else instance/accounts.db in the original app's
folder (the same rule as server.py and scripts/backup_databases.py). It is safe to run while the app is running.
"""

from __future__ import annotations

import argparse
import os
import secrets
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent


def original_app() -> Path:
    """Same rule as server.py: DEFAKETIVE_ORIGINAL, else the folder beside this project, else backend/."""
    named = os.environ.get("DEFAKETIVE_ORIGINAL")
    if named:
        return Path(named)
    beside = HERE.parent / "Capstone-Version-Control-Version-1.1"
    return beside if (beside / "webapp.py").is_file() else HERE / "backend"


ORIGINAL = original_app()
if not (ORIGINAL / "accounts.py").exists():
    sys.exit(f"The original DeFaketive app was not found at {ORIGINAL}. Set DEFAKETIVE_ORIGINAL to its folder.")
sys.path.insert(0, str(ORIGINAL))
sys.path.insert(0, str(HERE))

import accounts  # noqa: E402  (the original's)
import admin_api  # noqa: E402  (this project's)


def accounts_db() -> Path:
    return Path(os.environ.get("DEFAKETIVE_ACCOUNTS_DB") or ORIGINAL / "instance" / "accounts.db")


def add(database: Path, email: str, name: str | None) -> int:
    user = admin_api.user_by_email(database, email)
    password = None
    if user is None:
        if not name:
            print(f"No account uses {email} yet. Give the person's name with --name to make one.", file=sys.stderr)
            return 2
        password = secrets.token_urlsafe(12)
        try:
            user = accounts.create_user(database, name, email, password)
        except accounts.AccountError as error:
            print(error.message, file=sys.stderr)
            return 2
    admin_api.add_admin(database, user["id"])
    print(f"{user['name']} <{user['email']}> is now an admin and can sign in to the admin app (admin-only from now on).")
    if password:
        print(f"New account made. Password, shown only this once: {password}")
        print("Hand it over separately from the email, and ask them to change it in Settings.")
    return 0


def remove(database: Path, email: str) -> int:
    user = admin_api.user_by_email(database, email)
    if user is None or not admin_api.remove_admin(database, user["id"]):
        print(f"{email} is not an admin.", file=sys.stderr)
        return 1
    print(f"{user['name']} <{user['email']}> is no longer an admin. The account itself is kept.")
    return 0


def show(database: Path) -> int:
    people = admin_api.admins(database)
    if not people:
        print("Nobody is an admin.")
    for person in people:
        print(f"{person['name']} <{person['email']}>  since {person['added_at'][:10]}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Make, list or remove admins of DeFaketive's admin app.")
    commands = parser.add_subparsers(dest="command", required=True)
    give = commands.add_parser("add", help="make an account an admin, making the account first if needed")
    give.add_argument("--email", required=True)
    give.add_argument("--name", help="the person's full name, needed when the account does not exist yet")
    take = commands.add_parser("remove", help="take the admin role back; the account is kept")
    take.add_argument("--email", required=True)
    commands.add_parser("list", help="every admin")
    args = parser.parse_args(argv)

    database = accounts_db()
    if args.command == "add":
        return add(database, args.email, args.name)
    if args.command == "remove":
        return remove(database, args.email)
    return show(database)


if __name__ == "__main__":
    sys.exit(main())
