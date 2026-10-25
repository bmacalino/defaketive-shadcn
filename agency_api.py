"""The agency view: the saved reports, arranged for a partner government office looking into product safety.

Who it is for. The DTI (Department of Trade and Industry): its E-Commerce Bureau, which can order an online listing
taken down when it threatens public safety (Internet Transactions Act, RA 11967), and its Bureau of Philippine
Standards. Only accounts the team marks as an agency's may open it, from the server PC with
scripts/agency_accounts.py; nobody becomes one by signing up, because signing up takes seconds and checks nothing.

What it shows. Nothing that is not already in the saved reports anyone can open, only arranged differently: the
Lazada listings whose buyers report safety problems, how each kind of product fares, and an evidence sheet per
listing. No reviewer names (as protections.py removes them from reports), and nothing about anyone's account.

How it words things. These are leads, not findings. Every answer carries the server's own note saying so and the
safety check's measured accuracy, and every verdict is the server's own headline: what buyers report, never that a
product is unsafe or that a seller broke a rule.

    GET  /api/agency/me                     {member, office}: false for guests and shoppers
    GET  /api/agency/watch?level=reports    listings with safety reports (the red level), newest report first
    GET  /api/agency/watch?level=mentions   listings where reviews mention safety below that level
    GET  /api/agency/patterns               per kind of product: listings checked, with reports, with mentions
    GET  /api/agency/evidence?link=...      one listing's evidence sheet; opening it marks the listing as seen
    POST /api/agency/sheets                 {"links": [...]}: up to 60 sheets for a combined report (marks nothing)
    POST /api/agency/seen                   {"links": [...]} or {"level": "reports"|"mentions"}: mark as seen
    GET  /api/agency/watch.csv?level=all    the watch list as a spreadsheet, with this account's status and notes
    GET  /api/agency/sellers                sellers with two or more flagged listings, and those listings
    PUT  /api/agency/case                   {link, status, note}: where a listing stands for this account
    POST|DELETE /api/agency/feedback        {link, sentence, reason?}: "not a safety problem", and taking it back
    POST /api/agency/guide                  this account closed the "Get started" guide (it opens by itself until then)

/patterns also carries what the Overview charts draw (`charts`). Notes, statuses and "not a safety problem" marks are
each account's own. A mark never changes a report or a count: it is feedback for the team's next checker round
(scripts/agency_feedback.py lists them).

"New" means a listing this agency account has not opened or marked as seen. It does not come from report dates,
so re-checking every saved report (scripts/recheck_products.py) never makes old listings look new.
"""

from __future__ import annotations

import re
from collections import Counter
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

from flask import Blueprint, Response, current_app, jsonify, request

blueprint = Blueprint("agency", __name__, url_prefix="/api/agency")

SCHEMA = """
CREATE TABLE IF NOT EXISTS agency_members (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    office TEXT NOT NULL, added_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS agency_seen (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    link TEXT NOT NULL, seen_at TEXT NOT NULL,
    PRIMARY KEY (user_id, link)
);
CREATE TABLE IF NOT EXISTS agency_cases (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    link TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT '' CHECK (status IN ('', 'looking', 'referred', 'no_action')),
    note TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL,
    PRIMARY KEY (user_id, link)
);
CREATE TABLE IF NOT EXISTS agency_feedback (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    link TEXT NOT NULL, sentence TEXT NOT NULL, hazard TEXT, reason TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    UNIQUE (user_id, link, sentence)
);
CREATE TABLE IF NOT EXISTS agency_guide (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    seen_at TEXT NOT NULL
);
"""

DEFAULT_OFFICE = "DTI"
OFFICE_NAMES = {"DTI": "Department of Trade and Industry"}
LEVELS = ("reports", "mentions")
QUOTES_PER_ROW = 2
MAX_SEEN_LINKS = 500
# Where a listing stands for this agency account. The words are the screens' and the spreadsheet's.
# "Referred" was dropped on 24 Oct 2026 (unclear outside an office); a saved one now reads "Under review" (_connect).
STATUSES = {"": "Not reviewed", "looking": "Under review", "no_action": "Closed, no action"}
MAX_NOTE = 2000
MAX_REASON = 500
MAX_REPORT_LISTINGS = 60
PRICE_BANDS = ((200, "Under ₱200"), (500, "₱200–499"), (1000, "₱500–999"), (float("inf"), "₱1,000 and up"))
SELLER_NOTE = (
    "Seller names are as Lazada shows them, not checked identities. More than one flagged listing is a reason to "
    "look closer, not proof that a seller did anything wrong."
)
CSV_COLUMNS = (
    "Level", "Listing", "Link", "Seller", "Kind of product", "Price", "Safety reviews", "Latest safety review",
    "Reviews read", "Ratings listed", "What buyers mention", "Also reported", "Report date", "Made with an older check",
    "Case status", "Your note",
)
LEVEL_NAMES = {"reports": "Safety reports", "mentions": "Safety mentions"}
# The other things buyers report that concern the office too: misleading listings and copies. Their labels are the
# report's own (dashboard_utils.BADGE_COPY), so every screen words them the same way.
ALSO = ("not_as_described", "counterfeit")
VARIANTS_SHOWN = 6

SIGN_IN_MESSAGE = "Sign in to open the agency view."
NOT_MEMBER_MESSAGE = "This page is for partner agencies. If you work with one, ask the DeFaketive team for access."
NOT_FOUND_MESSAGE = "There is no saved Lazada report for this listing."
LEADS_NOTE = (
    "These are what buyers wrote in their Lazada reviews, found and sorted by an automatic check. They are leads to "
    "look into, not findings: a buyer's review is not proof, and the check misses some real reports and flags some "
    "harmless ones. Please verify before acting."
)
SCOPE_NOTE = "Only the Lazada listings DeFaketive has checked are counted here, not all of Lazada."

# Set by server.py: every saved product (shared, never altered) and when each one's report was last written, by link.
# A name of this module, so tests can replace it.
saved_reports: Callable[[], tuple[list[dict[str, Any]], dict[str, str]]] = lambda: ([], {})


# --- Who is an agency's account ------------------------------------------------------------------------------------


@contextmanager
def _connect(path: str | Path) -> Iterator[Any]:
    import accounts  # the original app's; server.py puts it on the path

    # The accounts module makes its own tables first and turns foreign keys on, so deleting an account removes its
    # agency rows too.
    with accounts._connect(path) as connection:
        connection.executescript(SCHEMA)
        connection.execute("UPDATE agency_cases SET status = 'looking' WHERE status = 'referred'")
        yield connection


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def user_by_email(path: str | Path, email: str) -> dict[str, Any] | None:
    with _connect(path) as connection:
        row = connection.execute("SELECT id, full_name, email FROM users WHERE email = ?", (email.strip().lower(),)).fetchone()
    return {"id": row["id"], "name": row["full_name"], "email": row["email"]} if row else None


def office_of(path: str | Path, user_id: int) -> str | None:
    with _connect(path) as connection:
        row = connection.execute("SELECT office FROM agency_members WHERE user_id = ?", (int(user_id),)).fetchone()
    return str(row["office"]) if row else None


def add_member(path: str | Path, user_id: int, office: str = DEFAULT_OFFICE) -> None:
    with _connect(path) as connection:
        connection.execute(
            "INSERT INTO agency_members(user_id, office, added_at) VALUES (?, ?, ?) "
            "ON CONFLICT(user_id) DO UPDATE SET office = excluded.office",
            (int(user_id), office, _now()),
        )


def remove_member(path: str | Path, user_id: int) -> bool:
    with _connect(path) as connection:
        removed = connection.execute("DELETE FROM agency_members WHERE user_id = ?", (int(user_id),)).rowcount
        connection.execute("DELETE FROM agency_seen WHERE user_id = ?", (int(user_id),))
    return bool(removed)


def members(path: str | Path) -> list[dict[str, Any]]:
    with _connect(path) as connection:
        rows = connection.execute(
            "SELECT users.id, users.full_name, users.email, agency_members.office, agency_members.added_at "
            "FROM agency_members JOIN users ON users.id = agency_members.user_id ORDER BY agency_members.added_at"
        ).fetchall()
    return [
        {"id": row["id"], "name": row["full_name"], "email": row["email"], "office": row["office"], "added_at": row["added_at"]}
        for row in rows
    ]


def seen_links(path: str | Path, user_id: int) -> set[str]:
    with _connect(path) as connection:
        rows = connection.execute("SELECT link FROM agency_seen WHERE user_id = ?", (int(user_id),)).fetchall()
    return {str(row["link"]) for row in rows}


def mark_seen(path: str | Path, user_id: int, links: list[str]) -> None:
    now = _now()
    with _connect(path) as connection:
        connection.executemany(
            "INSERT INTO agency_seen(user_id, link, seen_at) VALUES (?, ?, ?) ON CONFLICT(user_id, link) DO NOTHING",
            [(int(user_id), link, now) for link in links],
        )


# --- This account's notes, and quotes it says are not safety problems ------------------------------------------------


def cases_of(path: str | Path, user_id: int) -> dict[str, dict[str, Any]]:
    """Where each listing stands for this account (only listings it gave a status or a note)."""
    with _connect(path) as connection:
        rows = connection.execute(
            "SELECT link, status, note, updated_at FROM agency_cases WHERE user_id = ?", (int(user_id),)
        ).fetchall()
    return {str(row["link"]): {"status": row["status"], "note": row["note"], "updated_at": row["updated_at"]} for row in rows}


def save_case(path: str | Path, user_id: int, link: str, status: str, note: str) -> dict[str, Any] | None:
    """Keep a listing's status and note for this account; with neither, forget the listing."""
    with _connect(path) as connection:
        if not status and not note:
            connection.execute("DELETE FROM agency_cases WHERE user_id = ? AND link = ?", (int(user_id), link))
            return None
        now = _now()
        connection.execute(
            "INSERT INTO agency_cases(user_id, link, status, note, updated_at) VALUES (?, ?, ?, ?, ?) "
            "ON CONFLICT(user_id, link) DO UPDATE SET status = excluded.status, note = excluded.note, "
            "updated_at = excluded.updated_at",
            (int(user_id), link, status, note, now),
        )
    return {"status": status, "note": note, "updated_at": now}


def marked_sentences(path: str | Path, user_id: int, link: str) -> set[str]:
    with _connect(path) as connection:
        rows = connection.execute(
            "SELECT sentence FROM agency_feedback WHERE user_id = ? AND link = ?", (int(user_id), link)
        ).fetchall()
    return {str(row["sentence"]) for row in rows}


def mark_not_safety(path: str | Path, user_id: int, link: str, sentence: str, hazard: str | None, reason: str) -> None:
    with _connect(path) as connection:
        connection.execute(
            "INSERT INTO agency_feedback(user_id, link, sentence, hazard, reason, created_at) VALUES (?, ?, ?, ?, ?, ?) "
            "ON CONFLICT(user_id, link, sentence) DO UPDATE SET reason = excluded.reason",
            (int(user_id), link, sentence, hazard, reason, _now()),
        )


def unmark_not_safety(path: str | Path, user_id: int, link: str, sentence: str) -> bool:
    with _connect(path) as connection:
        return bool(connection.execute(
            "DELETE FROM agency_feedback WHERE user_id = ? AND link = ? AND sentence = ?", (int(user_id), link, sentence)
        ).rowcount)


def guide_seen(path: str | Path, user_id: int) -> bool:
    """Whether this account has closed the "Get started" guide once. It opens by itself until then."""
    with _connect(path) as connection:
        return connection.execute("SELECT 1 FROM agency_guide WHERE user_id = ?", (int(user_id),)).fetchone() is not None


def mark_guide_seen(path: str | Path, user_id: int) -> None:
    with _connect(path) as connection:
        connection.execute(
            "INSERT INTO agency_guide(user_id, seen_at) VALUES (?, ?) ON CONFLICT(user_id) DO NOTHING", (int(user_id), _now())
        )


def all_feedback(path: str | Path) -> list[dict[str, Any]]:
    """Every quote an agency account said is not a safety problem, oldest first, for the team's next checker round.
    Which office said it, never which person."""
    with _connect(path) as connection:
        rows = connection.execute(
            "SELECT agency_feedback.link, agency_feedback.sentence, agency_feedback.hazard, agency_feedback.reason, "
            "agency_feedback.created_at, agency_members.office FROM agency_feedback "
            "LEFT JOIN agency_members ON agency_members.user_id = agency_feedback.user_id ORDER BY agency_feedback.id"
        ).fetchall()
    return [
        {"link": row["link"], "sentence": row["sentence"], "hazard": row["hazard"] or "", "reason": row["reason"],
         "created_at": row["created_at"], "office": row["office"] or ""}
        for row in rows
    ]


# --- The saved reports, arranged ------------------------------------------------------------------------------------


def _is_lazada(product: dict[str, Any]) -> bool:
    # The app checks Lazada only (webapp.SCAN_PLATFORMS); the few old Temu reports are left out.
    return "lazada" in str(product.get("platform") or "").casefold() or "lazada." in str(product.get("link") or "")


def _review_tags(review: dict[str, Any]) -> set[str]:
    analysis = review.get("sentiment_analysis") or {}
    return {*(analysis.get("review_tags") or []), *(analysis.get("review_extra_tags") or [])}


def _sentence_tags(sentence: dict[str, Any]) -> set[str]:
    return {*(sentence.get("tags") or []), *(sentence.get("extra_tags") or [])}


RELATIVE_DATE = re.compile(r"^\s*(\d+)\s*(minute|hour|day|week|month|year)s?\s+ago\s*$", re.IGNORECASE)
DAYS_PER = {"minute": 0, "hour": 0, "day": 1, "week": 7, "month": 30, "year": 365}


MANILA = timezone(timedelta(hours=8))


def _moment(value: Any) -> datetime | None:
    """An ISO date and time; one written without a zone is Philippine time (the scanner's own clock)."""
    try:
        moment = datetime.fromisoformat(str(value or "").strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    return moment if moment.tzinfo else moment.replace(tzinfo=MANILA)


def collected_at(product: dict[str, Any], checked_at: str | None) -> datetime | None:
    """When this listing's reviews were collected: the scan's own record, else the report's date (later, if the
    report was re-checked since, so dates counted from it come out a little too recent)."""
    checkpoint = product.get("review_checkpoint")
    return _moment(checkpoint.get("updated_at") if isinstance(checkpoint, dict) else None) or _moment(checked_at)


def review_day(text: str, collected: datetime | None) -> tuple[date | None, bool]:
    """The day a review was written, and whether that is a guess. Most saved dates are "2025-10-27". Lazada shows its
    newest reviews as "3 weeks ago", true on the day they were collected, so those count back from then (months as
    30 days): approximate, and said so on screen."""
    relative = RELATIVE_DATE.match(text)
    if relative:
        if collected is None:
            return None, True
        back = timedelta(days=int(relative.group(1)) * DAYS_PER[relative.group(2).lower()])
        return (collected - back).astimezone(MANILA).date(), True
    try:
        return datetime.strptime(text[:10], "%Y-%m-%d").date(), False
    except ValueError:
        return None, False


def _today() -> date:
    return datetime.now(MANILA).date()


def _safety_spans(sentence: dict[str, Any]) -> list[list[int]]:
    """Where the safety words are in a sentence, as dashboard_utils._evidence_items finds them: never a negated one."""
    return sorted(
        [int(term["span"][0]), int(term["span"][1])]
        for term in [*(sentence.get("terms") or []), *(sentence.get("extra_terms") or [])]
        if isinstance(term, dict)
        and term.get("category") == "safety"
        and not term.get("negated")
        and isinstance(term.get("span"), list)
        and len(term["span"]) == 2
    )


class Reports:
    """One request's view of the saved Lazada reports. Builds each product's badge view once."""

    def __init__(self, products: list[dict[str, Any]], dates: dict[str, str]) -> None:
        from dashboard_utils import badge_view

        self.items = [
            (product, badge_view(product), dates.get(str(product.get("link") or "")))
            for product in products
            if isinstance(product, dict) and product.get("link") and _is_lazada(product)
        ]

    @staticmethod
    def level(view: dict[str, Any]) -> str | None:
        """"reports" for the red level, "mentions" for any other report that mentions safety, else None.

        The same split as the screens' groups (product.ts chipFor): red only for the checker's serious level, and any
        safety mention below it still counts, so one report is never left out.
        """
        if view.get("state") == "safety_warning":
            return "reports"
        if int((view.get("counts") or {}).get("safety") or 0) > 0:
            return "mentions"
        return None

    def find(self, link: str) -> tuple[dict[str, Any], dict[str, Any], str | None] | None:
        """The saved report for this link: the same address first, else the same listing (host and path)."""
        exact = next((item for item in self.items if str(item[0]["link"]) == link), None)
        if exact:
            return exact
        wanted = _identity(link)
        return next((item for item in self.items if wanted[0] and _identity(item[0]["link"]) == wanted), None)


def _identity(link: Any) -> tuple[str, ...]:
    """Host and path name a Lazada listing; the rest of the address is tracking."""
    parts = urlsplit(str(link or "").strip())
    return (parts.netloc.casefold().removeprefix("www."), parts.path.rstrip("/").casefold())


def kind_label(product: dict[str, Any]) -> str:
    """The kind of product a listing is, as the "Similar products" matching reads it, or "Other"."""
    from dashboard_utils import RECOMMENDATION_PRODUCT_TYPES, _recommendation_type

    kind = _recommendation_type(product)
    labels = {canonical: label for _variants, label, canonical in RECOMMENDATION_PRODUCT_TYPES}
    label = labels.get(kind, kind) if kind else "Other"
    return label[:1].upper() + label[1:]


def _safety_badge(view: dict[str, Any]) -> dict[str, Any]:
    return next((badge for badge in view.get("badges") or [] if badge.get("category") == "safety"), {})


def _current(product: dict[str, Any]) -> bool:
    from dashboard_utils import analysis_is_current

    return analysis_is_current([product])


def _safety_reviews(product: dict[str, Any]) -> Iterator[tuple[dict[str, Any], list[dict[str, Any]]]]:
    """Each review the report counts as a safety report (tagged "safety"), with its sentences tagged "safety"."""
    for review in product.get("comments") or []:
        if not isinstance(review, dict) or "safety" not in _review_tags(review):
            continue
        yield review, [
            sentence
            for sentence in (review.get("sentiment_analysis") or {}).get("sentences") or []
            if isinstance(sentence, dict) and "safety" in _sentence_tags(sentence) and str(sentence.get("text_raw") or "").strip()
        ]


def _hazard_label(sentence: dict[str, Any]) -> str:
    from dashboard_utils import HAZARD_LABELS

    return HAZARD_LABELS.get(str(sentence.get("hazard_subtype") or ""), HAZARD_LABELS["safety_unspecified"])


def _price_value(text: Any) -> float | None:
    """₱1,299.00 -> 1299.0. A price range ("₱99 - ₱199") counts by its lowest price. None when there is no number."""
    found = re.search(r"\d[\d,]*(?:\.\d+)?", str(text or ""))
    return float(found.group(0).replace(",", "")) if found else None


def _price_band(text: Any) -> str | None:
    price = _price_value(text)
    return None if price is None else next(label for limit, label in PRICE_BANDS if price < limit)


def _review_text_date(review: dict[str, Any]) -> str:
    return str(review.get("time") or review.get("reviewed_at") or "").strip()


def latest_report(product: dict[str, Any], checked_at: str | None) -> tuple[str | None, bool, int | None]:
    """The newest review the report counts as a safety report: its day ("2026-10-14"), whether that day is
    approximate (Lazada gave "3 weeks ago"), and how many days old it is.

    This, not the report's own date, says what is recent: re-checking every saved report gives them all one date.
    """
    collected = collected_at(product, checked_at)
    days = [review_day(_review_text_date(review), collected) for review, _ in _safety_reviews(product)]
    dated = [(day, approximate) for day, approximate in days if day]
    if not dated:
        return None, False, None
    day, approximate = max(dated, key=lambda item: (item[0], not item[1]))
    return day.isoformat(), approximate, (_today() - day).days


def watch_row(
    product: dict[str, Any], view: dict[str, Any], checked_at: str | None, seen: set[str],
    cases: dict[str, dict[str, Any]] | None = None,
) -> dict[str, Any]:
    badge = _safety_badge(view)
    latest, approximate, age = latest_report(product, checked_at)
    return {
        "link": product["link"],
        "name": product.get("name") or "",
        "img": product.get("img") or "",
        "price": product.get("price") or "",
        "seller": product.get("seller") or "",
        "kind": kind_label(product),
        "level": Reports.level(view),
        "state": view.get("state"),
        "tone": view.get("tone"),
        "headline": view.get("headline"),
        "safety_mentions": int(badge.get("mentions") or 0),
        "summary": badge.get("summary") or "",
        "reviews_analyzed": int(view.get("reviews_analyzed") or 0),
        "ratings_listed": int(product.get("total_rating") or product.get("reported_review_count") or 0),
        "price_band": _price_band(product.get("price")),
        "latest_report": latest,
        "latest_report_approx": approximate,
        "latest_report_age": age,
        "quotes": list(badge.get("evidence") or [])[:QUOTES_PER_ROW],
        "checked_at": checked_at,
        "checked_with_current": _current(product),
        "new": product["link"] not in seen,
        "case": (cases or {}).get(product["link"]),
        "also": also_reported(view),
    }


def watch_list(
    reports: Reports, level: str, seen: set[str], cases: dict[str, dict[str, Any]] | None = None
) -> list[dict[str, Any]]:
    rows = [
        watch_row(product, view, checked_at, seen, cases)
        for product, view, checked_at in reports.items
        if Reports.level(view) == level
    ]
    # Newest complaint first (a listing with no dated safety review last); then the one with more safety reviews.
    rows.sort(key=lambda row: (
        row["latest_report_age"] is None, row["latest_report_age"] or 0, -row["safety_mentions"], row["name"].casefold()
    ))
    return rows


def new_counts(reports: Reports, seen: set[str]) -> dict[str, int]:
    found = Counter(Reports.level(view) for product, view, _ in reports.items if product["link"] not in seen)
    return {level: found.get(level, 0) for level in LEVELS}


def patterns(reports: Reports) -> list[dict[str, Any]]:
    """Per kind of product: how many listings were checked and how many carry safety reports or mentions.

    Counts, not percentages: most kinds have only a handful of listings, and "1 of 2" is clearer than "50%".
    """
    from dashboard_utils import HAZARD_LABELS

    kinds: dict[str, dict[str, Any]] = {}
    for product, view, _ in reports.items:
        label = kind_label(product)
        entry = kinds.setdefault(label, {"kind": label, "listings": 0, "reports": 0, "mentions": 0, "hazards": Counter()})
        entry["listings"] += 1
        level = Reports.level(view)
        if level:
            entry[level] += 1
        subtypes = ((product.get("sentiment_summary") or {}).get("safety") or {}).get("hazard_subtypes") or {}
        for name, detail in subtypes.items():
            if name in HAZARD_LABELS and name != "safety_unspecified" and isinstance(detail, dict):
                entry["hazards"][name] += int(detail.get("reviews") or 0)
    rows = []
    for entry in kinds.values():
        hazards: Counter = entry.pop("hazards")
        top = hazards.most_common(1)
        rows.append({**entry, "top_hazard": HAZARD_LABELS[top[0][0]] if top and top[0][1] else None})
    # Kinds with the most listings with reports first; "Other" always last.
    rows.sort(key=lambda row: (row["kind"] == "Other", -row["reports"], -row["mentions"], -row["listings"], row["kind"]))
    return rows


def _also_label(category: str) -> str:
    from dashboard_utils import BADGE_COPY

    return BADGE_COPY[category]["label"]


def also_reported(view: dict[str, Any]) -> list[dict[str, Any]]:
    """The other problems buyers report about a listing that the office looks into too, with how many reviews say so."""
    counts = view.get("counts") or {}
    return [
        {"category": category, "label": _also_label(category), "reviews": int(counts.get(category) or 0)}
        for category in ALSO
        if int(counts.get(category) or 0) > 0
    ]


def _tidy_variant(text: Any) -> str:
    """ "Model:65W" -> "Model: 65W"; spaces tidied; a bare "Variation:" or "Options:" in front, which says nothing,
    left out ("Variation: 480w charger" -> "480w charger")."""
    tidy = re.sub(r"\s*:\s*", ": ", " ".join(str(text or "").split())).strip(" :")
    return re.sub(r"^(?:variations?|options?)\s*:\s*(?=[^:]+$)", "", tidy, flags=re.IGNORECASE)


def variants_named(reviews: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], int]:
    """The product variants named in a listing's safety reviews, most first: which model to buy for a test.

    Grouped with case ignored, written the way most reviews write it (on a tie, the one with capitals: "Model: 65W"
    over "model: 65w"). Returns the first VARIANTS_SHOWN and how many others."""
    counts: Counter = Counter()
    spellings: dict[str, Counter] = {}
    for review in reviews:
        variant = _tidy_variant(review.get("variation"))
        if not variant:
            continue
        key = variant.casefold()
        spellings.setdefault(key, Counter())[variant] += 1
        counts[key] += 1
    spelling = {
        key: max(found, key=lambda text: (found[text], sum(char.isupper() for char in text), text))
        for key, found in spellings.items()
    }
    ranked = sorted(counts.items(), key=lambda item: (-item[1], spelling[item[0]].casefold()))
    shown = [{"variant": spelling[key], "reviews": count} for key, count in ranked[:VARIANTS_SHOWN]]
    return shown, max(0, len(ranked) - VARIANTS_SHOWN)


def charts(reports: Reports) -> dict[str, Any]:
    """What the Overview charts draw: safety quotes per kind of hazard, safety reviews per year, listings per price
    band, and what else buyers report about the flagged listings. Counts only; the screens say what each one does and
    does not show."""
    hazards: Counter = Counter()
    also = {category: {"category": category, "label": _also_label(category), "reports": 0, "mentions": 0} for category in ALSO}
    flagged = 0
    years: Counter = Counter()
    undated = 0
    bands = {label: {"band": label, "listings": 0, "reports": 0, "mentions": 0} for _, label in PRICE_BANDS}
    no_price = 0
    for product, view, checked_at in reports.items:
        level = Reports.level(view)
        price = _price_value(product.get("price"))
        if price is None:
            no_price += 1
        else:
            band = bands[next(label for limit, label in PRICE_BANDS if price < limit)]
            band["listings"] += 1
            if level:
                band[level] += 1
        if not level:
            continue
        flagged += 1
        for item in also_reported(view):
            also[item["category"]][level] += 1
        collected = collected_at(product, checked_at)
        for review, sentences in _safety_reviews(product):
            for sentence in sentences:
                hazards[_hazard_label(sentence)] += 1
            day, _ = review_day(_review_text_date(review), collected)
            if day:
                years[day.year] += 1
            else:
                undated += 1
    # Every year between the first and the last, so a quiet year shows as a gap, not as nothing.
    span = range(min(years), max(years) + 1) if years else range(0)
    return {
        "hazards": [{"hazard": label, "quotes": count} for label, count in hazards.most_common()],
        "years": [{"year": year, "reviews": years.get(year, 0)} for year in span],
        "recent_or_unknown": undated,
        "prices": list(bands.values()),
        "no_price": no_price,
        "also": sorted(
            ({**row, "flagged": flagged} for row in also.values()), key=lambda row: -(row["reports"] + row["mentions"])
        ),
    }


def sellers(reports: Reports, minimum: int = 2) -> list[dict[str, Any]]:
    """Sellers with at least `minimum` flagged listings (either level), with every listing of theirs that is flagged.

    Grouped by the name Lazada shows (spaces tidied, case ignored); a listing with no seller name is left out.
    """
    groups: dict[str, dict[str, Any]] = {}
    for product, view, _ in reports.items:
        name = " ".join(str(product.get("seller") or "").split())
        if not name:
            continue
        group = groups.setdefault(name.casefold(), {"seller": name, "listings": 0, "reports": 0, "mentions": 0, "flagged": []})
        group["listings"] += 1
        level = Reports.level(view)
        if level:
            group[level] += 1
            group["flagged"].append({
                "link": product["link"], "name": product.get("name") or "", "kind": kind_label(product),
                "level": level, "safety_mentions": int(_safety_badge(view).get("mentions") or 0),
            })
    rows = [group for group in groups.values() if group["reports"] + group["mentions"] >= minimum]
    for group in rows:
        group["flagged"].sort(key=lambda item: (item["level"] != "reports", -item["safety_mentions"]))
    rows.sort(key=lambda group: (-group["reports"], -(group["reports"] + group["mentions"]), group["seller"].casefold()))
    return rows


def _cell(value: Any) -> str:
    """A spreadsheet cell that is always read as text: one starting with = + - @ would otherwise run as a formula."""
    text = str(value if value is not None else "")
    return "'" + text if text[:1] in ("=", "+", "-", "@", "\t", "\r") else text


def watch_csv(rows: list[dict[str, Any]]) -> str:
    """The watch list as a spreadsheet (CSV with a byte-order mark, so Excel reads ₱ and Filipino text)."""
    import csv
    import io

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(CSV_COLUMNS)
    for row in rows:
        case = row.get("case") or {}
        writer.writerow([_cell(value) for value in (
            LEVEL_NAMES.get(row["level"], ""), row["name"], row["link"], row["seller"], row["kind"], row["price"],
            row["safety_mentions"],
            f"{'about ' if row['latest_report_approx'] else ''}{row['latest_report']}" if row["latest_report"] else "",
            row["reviews_analyzed"], row["ratings_listed"], row["summary"], "; ".join(item["label"] for item in row["also"]),
            str(row["checked_at"] or "")[:10], "no" if row["checked_with_current"] else "yes",
            STATUSES.get(case.get("status") or "", ""), case.get("note") or "",
        )])
    return "\ufeff" + buffer.getvalue()


def evidence_sheet(
    product: dict[str, Any], view: dict[str, Any], checked_at: str | None,
    case: dict[str, Any] | None = None, marked: set[str] | frozenset[str] = frozenset(),
) -> dict[str, Any]:
    """Everything the report says about safety for one listing, with every review it counts, newest first.

    The reviews are the ones the report counts (each tagged "safety"), so their number is the report's own. Each
    review gives its stars, its date, its variation and its text; never who wrote it. `case` and `marked` are this
    agency account's own: its status and note, and the quotes it said are not safety problems.
    """
    reviews = []
    collected = collected_at(product, checked_at)
    for review, sentences in _safety_reviews(product):
        written = _review_text_date(review)
        day, approximate = review_day(written, collected)
        reviews.append({
            "rating": review.get("rating"),
            "date": written or None,
            # "3 weeks ago" was true when the reviews were collected, not when the sheet is read.
            "date_relative": bool(RELATIVE_DATE.match(written)),
            # The day it stands for ("2026-10-01"); approximate when Lazada gave it as "3 weeks ago".
            "day": day.isoformat() if day else None,
            "day_approx": approximate,
            "variation": review.get("variation") or "",
            "text": str(review.get("content") or "").strip(),
            "quotes": [
                {
                    "text": str(sentence["text_raw"]),
                    "hazard": _hazard_label(sentence),
                    "highlights": _safety_spans(sentence),
                    "marked_not_safety": str(sentence["text_raw"]) in marked,
                }
                for sentence in sentences
            ],
        })
    # Newest first; a review with no date last.
    reviews.sort(key=lambda item: item["day"] or "", reverse=True)
    reviews.sort(key=lambda item: item["day"] is None)
    summary = product.get("sentiment_summary") or {}
    badge = _safety_badge(view)
    variants, variants_more = variants_named(reviews)
    return {
        "link": product["link"],
        "name": product.get("name") or "",
        "img": product.get("img") or "",
        "price": product.get("price") or "",
        "seller": product.get("seller") or "",
        "kind": kind_label(product),
        "level": Reports.level(view),
        "state": view.get("state"),
        "tone": view.get("tone"),
        "headline": view.get("headline"),
        "detail": view.get("detail"),
        "summary": badge.get("summary") or "",
        "safety_mentions": int(badge.get("mentions") or 0),
        "reviews_analyzed": int(view.get("reviews_analyzed") or 0),
        "ratings_listed": int(product.get("total_rating") or product.get("reported_review_count") or 0),
        "star_quota": product.get("star_quota"),
        "checked_at": checked_at,
        "checked_with_current": _current(product),
        "checker_version": str(summary.get("model_version") or ""),
        "reviews": reviews,
        "variants": variants,
        "variants_more": variants_more,
        "also": also_reported(view),
        "accuracy": view.get("safety_check_accuracy"),
        "note": LEADS_NOTE,
        "case": case,
    }


# --- Routes ---------------------------------------------------------------------------------------------------------


def install(webapp: Any, app: Any = None) -> None:
    """Add the agency routes to the original app."""
    app = app or webapp.app

    def database() -> str:
        return str(current_app.config["ACCOUNTS_DB"])

    def member() -> tuple[dict[str, Any] | None, Any]:
        """The signed-in agency account, or the answer to give instead."""
        user = webapp._current_user()
        if user is None:
            return None, (jsonify({"error": SIGN_IN_MESSAGE, "sign_in": True}), 401)
        office = office_of(database(), user["id"])
        if not office:
            return None, (jsonify({"error": NOT_MEMBER_MESSAGE, "not_member": True}), 403)
        return {**user, "office": office}, None

    def reports() -> Reports:
        return Reports(*saved_reports())

    def accuracy() -> dict[str, Any]:
        from dashboard_utils import SAFETY_CHECK_ACCURACY

        return dict(SAFETY_CHECK_ACCURACY)

    @blueprint.get("/me")
    def me() -> Any:
        user = webapp._current_user()
        office = office_of(database(), user["id"]) if user else None
        return jsonify({
            "member": bool(office),
            "office": office,
            "office_name": OFFICE_NAMES.get(office or "", office),
            "guide_seen": bool(office) and guide_seen(database(), user["id"]),
        })

    @blueprint.post("/guide")
    def guide() -> Any:
        payload = webapp._json_body()
        if payload is None:
            return jsonify({"error": "Send this request as JSON."}), 415
        user, refusal = member()
        if refusal:
            return refusal
        mark_guide_seen(database(), user["id"])
        return jsonify({"guide_seen": True})

    @blueprint.get("/watch")
    def watch() -> Any:
        user, refusal = member()
        if refusal:
            return refusal
        level = request.args.get("level") or "reports"
        if level not in LEVELS:
            return jsonify({"error": "Choose reports or mentions."}), 400
        found = reports()
        seen = seen_links(database(), user["id"])
        return jsonify({
            "level": level,
            "rows": watch_list(found, level, seen, cases_of(database(), user["id"])),
            "new": new_counts(found, seen),
            "accuracy": accuracy(),
            "note": LEADS_NOTE,
        })

    @blueprint.get("/watch.csv")
    def watch_spreadsheet() -> Any:
        user, refusal = member()
        if refusal:
            return refusal
        level = request.args.get("level") or "all"
        if level not in (*LEVELS, "all"):
            return jsonify({"error": "Choose reports, mentions or all."}), 400
        # ?also=counterfeit keeps only the listings whose reviews also report that (the watch list's "Label" menu).
        also = request.args.get("also") or ""
        if also and also not in ALSO:
            return jsonify({"error": "Choose one of the other problems."}), 400
        found = reports()
        seen = seen_links(database(), user["id"])
        cases = cases_of(database(), user["id"])
        rows = [row for wanted in (LEVELS if level == "all" else (level,)) for row in watch_list(found, wanted, seen, cases)]
        if also:
            rows = [row for row in rows if any(item["category"] == also for item in row["also"])]
        import accounts

        name = f"defaketive-dti-watch-list-{accounts.manila_day()}.csv"
        return Response(watch_csv(rows), mimetype="text/csv", headers={"Content-Disposition": f'attachment; filename="{name}"'})

    @blueprint.get("/patterns")
    def kinds() -> Any:
        _, refusal = member()
        if refusal:
            return refusal
        found = reports()
        return jsonify({
            "kinds": patterns(found),
            "charts": charts(found),
            "listings": len(found.items),
            "note": LEADS_NOTE,
            "scope": SCOPE_NOTE,
        })

    @blueprint.get("/sellers")
    def seller_list() -> Any:
        _, refusal = member()
        if refusal:
            return refusal
        return jsonify({"sellers": sellers(reports()), "note": SELLER_NOTE, "leads": LEADS_NOTE})

    @blueprint.put("/case")
    def case() -> Any:
        payload = webapp._json_body()
        if payload is None:
            return jsonify({"error": "Send this request as JSON."}), 415
        user, refusal = member()
        if refusal:
            return refusal
        status = str(payload.get("status") or "")
        note = str(payload.get("note") or "").strip()
        if status not in STATUSES:
            return jsonify({"error": "Choose one of the statuses."}), 400
        if len(note) > MAX_NOTE:
            return jsonify({"error": f"Keep the note to {MAX_NOTE:,} characters or fewer."}), 400
        found = reports().find(str(payload.get("link") or ""))
        if not found:
            return jsonify({"error": NOT_FOUND_MESSAGE}), 404
        return jsonify({"case": save_case(database(), user["id"], str(found[0]["link"]), status, note)})

    @blueprint.route("/feedback", methods=["POST", "DELETE"])
    def feedback() -> Any:
        payload = webapp._json_body()
        if payload is None:
            return jsonify({"error": "Send this request as JSON."}), 415
        user, refusal = member()
        if refusal:
            return refusal
        found = reports().find(str(payload.get("link") or ""))
        if not found:
            return jsonify({"error": NOT_FOUND_MESSAGE}), 404
        product, view, checked_at = found
        link, sentence = str(product["link"]), str(payload.get("sentence") or "")
        if request.method == "DELETE":
            unmark_not_safety(database(), user["id"], link, sentence)
            return jsonify({"marked": False})
        reason = str(payload.get("reason") or "").strip()
        if len(reason) > MAX_REASON:
            return jsonify({"error": f"Keep the reason to {MAX_REASON} characters or fewer."}), 400
        # Only a sentence the report itself counts as a safety report can be marked, so nothing else is written here.
        quote = next(
            (quote for review in evidence_sheet(product, view, checked_at)["reviews"] for quote in review["quotes"]
             if quote["text"] == sentence),
            None,
        )
        if quote is None:
            return jsonify({"error": "That sentence is not one of this listing's safety quotes."}), 400
        mark_not_safety(database(), user["id"], link, sentence, quote["hazard"], reason)
        return jsonify({"marked": True})

    @blueprint.get("/evidence")
    def evidence() -> Any:
        user, refusal = member()
        if refusal:
            return refusal
        found = reports().find(str(request.args.get("link") or ""))
        if not found:
            return jsonify({"error": NOT_FOUND_MESSAGE}), 404
        product, view, checked_at = found
        link = str(product["link"])
        # Opening a listing's sheet is looking at it: it is no longer new for this account.
        mark_seen(database(), user["id"], [link])
        sheet = evidence_sheet(
            product, view, checked_at, cases_of(database(), user["id"]).get(link), marked_sentences(database(), user["id"], link)
        )
        return jsonify({"sheet": sheet})

    @blueprint.post("/sheets")
    def sheets() -> Any:
        """Several evidence sheets at once, for a combined report, in the order asked. Printing a set is not reviewing
        each listing, so nothing is marked as seen here."""
        payload = webapp._json_body()
        if payload is None:
            return jsonify({"error": "Send this request as JSON."}), 415
        user, refusal = member()
        if refusal:
            return refusal
        links = payload.get("links")
        if not isinstance(links, list) or not links:
            return jsonify({"error": "Send the links of the listings to include."}), 400
        if len(links) > MAX_REPORT_LISTINGS:
            return jsonify({"error": f"A report can hold up to {MAX_REPORT_LISTINGS} listings. Narrow the filters."}), 400
        found, cases, out, done = reports(), cases_of(database(), user["id"]), [], set()
        for link in links:
            item = found.find(str(link or ""))
            if not item or item[0]["link"] in done:
                continue
            product, view, checked_at = item
            done.add(product["link"])
            out.append(evidence_sheet(
                product, view, checked_at, cases.get(product["link"]), marked_sentences(database(), user["id"], product["link"])
            ))
        return jsonify({"sheets": out})

    @blueprint.post("/seen")
    def seen() -> Any:
        payload = webapp._json_body()
        if payload is None:
            return jsonify({"error": "Send this request as JSON."}), 415
        user, refusal = member()
        if refusal:
            return refusal
        found = reports()
        on_list = {str(product["link"]): Reports.level(view) for product, view, _ in found.items if Reports.level(view)}
        level = payload.get("level")
        if level in LEVELS:
            links = [link for link, at in on_list.items() if at == level]
        elif isinstance(payload.get("links"), list):
            # Only listings on the watch list are recorded, so nothing else can be written here.
            links = [str(link) for link in payload["links"][:MAX_SEEN_LINKS] if str(link) in on_list]
        else:
            return jsonify({"error": "Send the links to mark, or a level."}), 400
        mark_seen(database(), user["id"], links)
        return jsonify({"marked": len(links), "new": new_counts(found, seen_links(database(), user["id"]))})

    app.register_blueprint(blueprint)
