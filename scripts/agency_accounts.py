"""Gives, lists and takes back access to the agency view (agency_api.py). The only way to get it: the website cannot.

Run with the original app's Python, on the PC that runs DeFaketive:

    ..\\Capstone-Version-Control-Version-1.1\\.venv\\Scripts\\python.exe scripts\\agency_accounts.py add --email name@dti.gov.ph --name "Full Name"
    ...agency_accounts.py add --email someone@example.com        give access to an account that already exists
    ...agency_accounts.py list
    ...agency_accounts.py remove --email name@dti.gov.ph

`add` with an email nobody has signed up with makes the account and prints a password for it, once. Hand it over in
person or by phone, not in the same message as the email, and ask them to change it in Settings. `remove` takes
access back; the account itself stays (the person can delete it in Settings).

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
import agency_api  # noqa: E402  (this project's)


def accounts_db() -> Path:
    return Path(os.environ.get("DEFAKETIVE_ACCOUNTS_DB") or ORIGINAL / "instance" / "accounts.db")


def add(database: Path, email: str, name: str | None, office: str) -> int:
    user = agency_api.user_by_email(database, email)
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
    agency_api.add_member(database, user["id"], office)
    print(f"{user['name']} <{user['email']}> can now open the agency view ({office}).")
    if password:
        print(f"New account made. Password, shown only this once: {password}")
        print("Hand it over separately from the email, and ask them to change it in Settings.")
    return 0


def remove(database: Path, email: str) -> int:
    user = agency_api.user_by_email(database, email)
    if user is None or not agency_api.remove_member(database, user["id"]):
        print(f"{email} does not have access to the agency view.", file=sys.stderr)
        return 1
    print(f"{user['name']} <{user['email']}> can no longer open the agency view. The account itself is kept.")
    return 0


def show(database: Path) -> int:
    people = agency_api.members(database)
    if not people:
        print("Nobody has access to the agency view.")
    for person in people:
        print(f"{person['office']:<6} {person['name']} <{person['email']}>  since {person['added_at'][:10]}")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Give, list or take back access to DeFaketive's agency view.")
    commands = parser.add_subparsers(dest="command", required=True)
    give = commands.add_parser("add", help="give an account access, making the account first if needed")
    give.add_argument("--email", required=True)
    give.add_argument("--name", help="the person's full name, needed when the account does not exist yet")
    give.add_argument("--office", default=agency_api.DEFAULT_OFFICE, help="the office they work for (default: DTI)")
    take = commands.add_parser("remove", help="take access back; the account is kept")
    take.add_argument("--email", required=True)
    commands.add_parser("list", help="everyone with access")
    args = parser.parse_args(argv)

    database = accounts_db()
    if args.command == "add":
        return add(database, args.email, args.name, args.office.strip() or agency_api.DEFAULT_OFFICE)
    if args.command == "remove":
        return remove(database, args.email)
    return show(database)


if __name__ == "__main__":
    sys.exit(main())
