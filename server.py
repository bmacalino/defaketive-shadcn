"""Starts the original DeFaketive app plus the few extra, read-only routes the shadcn version needs.

The original app (../Capstone-Version-Control-Version-1.1) is imported, not edited. Its accounts, scan limits, live
scans, review checker and verdict wording all stay exactly as they are, and it keeps using the same two databases:
`defaketive.db` (analyzed products and reviews) and `instance/accounts.db` (accounts, history, wishlist).

What the original does not offer is a way to list or open every product in `defaketive.db`. The lists and reports it
serves come from the visitor's own session catalog, so a product that is only in the database (for example one that
another person scanned) cannot be opened. The routes below add that, reading the same database:

    GET /api/saved/products          every analyzed product, as list cards (no review text)
    GET /api/saved/detail?link=...   one product with all its reviews, plus similar products picked from the
                                     whole database (same shape as /api/products/detail)
    GET /api/saved/popular           products saved by two or more accounts, with how many saved them

Who sees what: these routes serve the SHARED pool (the products table), which is what recommendations are picked
from. A person's own history and wishlist stay in their account (user_activity, user_wishlist) and are only ever
served to them, by the original app's /api/me/* routes.

Run it with the original's Python (start.cmd does this):

    ..\\Capstone-Version-Control-Version-1.1\\.venv\\Scripts\\python.exe server.py
"""

from __future__ import annotations

import os
import sqlite3
import sys
from contextlib import closing
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlsplit

HERE = Path(__file__).resolve().parent
ORIGINAL = Path(os.environ.get("DEFAKETIVE_ORIGINAL") or HERE.parent / "Capstone-Version-Control-Version-1.1")
if not (ORIGINAL / "webapp.py").exists():
    sys.exit(f"The original DeFaketive app was not found at {ORIGINAL}. Set DEFAKETIVE_ORIGINAL to its folder.")

# The original resolves its own folders from where its files are, but work from its folder to be safe.
sys.path.insert(0, str(ORIGINAL))
os.chdir(ORIGINAL)

import accounts  # noqa: E402  (the original accounts module)
import webapp  # noqa: E402  (the original app; importing it creates `webapp.app`)
from dashboard_utils import rank_recommendations, with_badge_view  # noqa: E402
from data_store import DEFAULT_DB, load_saved_products  # noqa: E402
from flask import Blueprint, jsonify, request  # noqa: E402

# These helpers are private to the original module. Fail with a clear message if they ever change.
for name in ("app", "_products", "_cards", "_card", "_accounts_db"):
    if not hasattr(webapp, name):
        sys.exit(f"webapp.{name} is missing: server.py needs updating to match the original app.")

saved = Blueprint("saved", __name__, url_prefix="/api/saved")


def _identity(link: Any) -> tuple[str, ...]:
    """A listing address reduced to what names the product, so two copies of one link compare equal.

    Host and path are enough for Shopee and Lazada (the rest is tracking). Temu gives every product the same
    path (/goods.html), so its goods_id is part of the identity: without it, all Temu listings look like one.
    """
    parts = urlsplit(str(link or "").strip())
    host = parts.netloc.casefold().removeprefix("www.")
    path = parts.path.rstrip("/").casefold()
    if host.endswith("temu.com"):
        goods = (parse_qs(parts.query).get("goods_id") or [""])[0]
        if goods:
            return (host, path, goods)
    return (host, path)


def _saved_dates() -> dict[tuple[str, ...], str]:
    """When each product's report was last saved, by listing. Read only.

    The saved product itself carries no date, so without this every report says "Report date: Unavailable".
    The database row does record when it was last written, which is when its report was last made.
    """
    try:
        with closing(sqlite3.connect(f"file:{Path(DEFAULT_DB).as_posix()}?mode=ro", uri=True)) as connection:
            rows = connection.execute("SELECT link, updated_at FROM products").fetchall()
    except sqlite3.Error:
        return {}
    return {_identity(link): updated_at for link, updated_at in rows if link and updated_at}


def _catalog() -> list[dict[str, Any]]:
    """This visitor's session catalog first, then everything in the database. One entry per listing."""
    merged: list[dict[str, Any]] = []
    seen: set[tuple[str, ...]] = set()
    dates = _saved_dates()
    for product in [*webapp._products(), *load_saved_products()]:
        if not isinstance(product, dict) or not product.get("link"):
            continue
        key = _identity(product["link"])
        if key in seen:
            continue
        seen.add(key)
        # A copy, so the original app's own session catalog is never altered.
        if dates.get(key) and not (product.get("analysis_date") or product.get("analyzed_at") or product.get("updated_at")):
            product = {**product, "updated_at": dates[key]}
        merged.append(product)
    return merged


@saved.get("/products")
def saved_products():
    products = _catalog()
    return jsonify({"products": webapp._cards(products), "count": len(products)})


@saved.get("/detail")
def saved_detail():
    link = str(request.args.get("link") or "")
    catalog = _catalog()
    wanted = _identity(link)
    product = next((p for p in catalog if str(p.get("link") or "") == link), None) or next(
        (p for p in catalog if wanted[0] and _identity(p.get("link")) == wanted), None
    )
    if not product:
        return jsonify({"error": "Product not found in the saved database."}), 404
    recommendations = rank_recommendations(product, catalog, limit=3)
    return jsonify({"product": with_badge_view(product), "recommendations": webapp._cards(recommendations)})


@saved.get("/popular")
def saved_popular():
    by_identity = {_identity(product.get("link")): product for product in reversed(_catalog())}
    popular = []
    for link, saves in accounts.popular_wishlist(webapp._accounts_db()):
        product = by_identity.get(_identity(link))
        if product:
            popular.append({"product": webapp._card(product), "saves": saves})
    return jsonify({"products": popular})


webapp.app.register_blueprint(saved)

if __name__ == "__main__":
    # Flask's debug mode shows a developer's error page in the browser. That is for changing the code (dev.cmd
    # sets DEFAKETIVE_DEBUG=1), not for using or demonstrating the app, so it is off unless asked for.
    debug = os.environ.get("DEFAKETIVE_DEBUG") == "1"
    webapp.app.run(host="127.0.0.1", port=int(os.environ.get("PORT", "5000")), debug=debug, use_reloader=False)
