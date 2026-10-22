"""Lists the quotes a partner agency marked "Not a safety problem" in the agency view, for the team's next checker round.

A mark changes nothing in the app: the report and its counts stay as the checker made them. The marks are a list
of sentences someone who reads them closely believes were flagged by mistake (for example song lyrics with
"burned" in them), worth a look when the safety rules are next labelled and tested.

Run with the original app's Python, on the PC that runs DeFaketive:

    ..\\Capstone-Version-Control-Version-1.1\\.venv\\Scripts\\python.exe scripts\\agency_feedback.py
    ...agency_feedback.py --csv agency-feedback.csv        the same as a spreadsheet

Each line says which office marked it, never which person. Same accounts database as scripts/agency_accounts.py.
"""

from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import agency_accounts  # noqa: E402  (finds the original app and the accounts database the same way)

import agency_api  # noqa: E402

COLUMNS = ("Marked on", "Office", "Listing link", "Sentence", "Read as", "Their reason")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="List the quotes a partner agency marked as not a safety problem.")
    parser.add_argument("--csv", type=Path, help="write them to this spreadsheet file instead of the screen")
    args = parser.parse_args(argv)

    marks = agency_api.all_feedback(agency_accounts.accounts_db())
    rows = [
        (mark["created_at"][:10], mark["office"], mark["link"], mark["sentence"], mark["hazard"], mark["reason"])
        for mark in marks
    ]
    if args.csv:
        with open(args.csv, "w", encoding="utf-8-sig", newline="") as handle:
            writer = csv.writer(handle)
            writer.writerow(COLUMNS)
            writer.writerows([[agency_api._cell(value) for value in row] for row in rows])
        print(f"{len(rows)} mark{'' if len(rows) == 1 else 's'} written to {args.csv}")
        return 0
    if not rows:
        print("No quotes have been marked as not a safety problem.")
    for day, office, link, sentence, hazard, reason in rows:
        print(f"{day}  {office or '-':<5} {link}\n    \"{sentence}\"  (read as {hazard or 'a safety problem'})")
        if reason:
            print(f"    Reason: {reason}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
