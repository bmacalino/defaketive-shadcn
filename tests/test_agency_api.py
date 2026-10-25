"""agency_api.py: the agency view opens only for accounts the team marked, and shows leads without names.

Run with the original app's Python, from this project's folder:

    ..\\Capstone-Version-Control-Version-1.1\\.venv\\Scripts\\python.exe -m unittest discover -s tests -p "test_*.py"

The saved reports are replaced by made-up ones while the routes are tested, so the real database is not read and
the numbers do not change when it does. Accounts go to the temporary database server_under_test sets up.
"""

from __future__ import annotations

import contextlib
import io
import json
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
from server_under_test import accounts, app, sign_up  # noqa: E402

import agency_api  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import agency_accounts  # noqa: E402

LAZADA = "https://www.lazada.com.ph/products/pdp-i{}-s1.html"
REVIEWER = "Juana Dela Cruz"
SENTENCE = "Umiinit ng sobra, hindi naman nakakapaso."
# "Umiinit" is a safety word; "nakakapaso" is negated here and must not be picked out.
TERMS = [
    {"category": "safety", "span": [0, 7], "negated": False},
    {"category": "safety", "span": [30, 40], "negated": True},
]


def made_up(item: int, state: str, safety: int = 0, *, name: str = "Power Bank 10000mAh Fast Charging",
            platform: str = "lazada", hazard: str = "overheat_burn", price: str = "₱599.00",
            seller: str = "Test Store", dates: list[str] | None = None, fake: int = 0, nad: int = 0,
            variations: list[str] | None = None) -> dict:
    """A saved product in the checker's format, with `safety` reviews tagged as safety reports, and `fake` / `nad`
    reviews saying it may be a copy / differs from the listing."""
    comments = [
        {
            "author": REVIEWER, "rating": 1, "time": (dates or [])[n] if n < len(dates or []) else f"2026-10-{10 + n:02d}",
            "variation": (variations or [])[n] if n < len(variations or []) else "Color:Black",
            "content": f"{SENTENCE} Review {n}.",
            "sentiment_analysis": {
                "review_tags": ["safety"],
                "sentences": [
                    {"text_raw": SENTENCE, "tags": ["safety"], "hazard_subtype": hazard, "terms": TERMS},
                    {"text_raw": f"Review {n}.", "tags": [], "terms": []},
                ],
            },
        }
        for n in range(safety)
    ]
    comments.append({"author": "Happy Buyer", "rating": 5, "time": "2026-09-01", "content": "Ganda!",
                     "sentiment_analysis": {"review_tags": [], "sentences": []}})
    evidence = [{"text": f"{SENTENCE} ({n})", "score": 3.0, "high_confidence": True, "hazard_subtype": hazard,
                 "terms": TERMS, "rating": None} for n in range(safety)]
    summary = {
        "schema_version": "defaketive-summary-2.test",
        "usable_review_count": 40,
        "verdict": {"state": state},
        "flags": {"counterfeit": {"flagged_reviews": fake}, "defect": {"flagged_reviews": 0}},
        "reports": {"not_as_described": {"flagged_reviews": nad}},
        "safety": {
            "flagged_reviews": safety,
            "evidence": evidence,
            "hazard_subtypes": {hazard: {"severity": 2, "reviews": safety}} if safety else {},
        },
    }
    link = LAZADA.format(1000 + item) if platform == "lazada" else f"https://www.temu.com/goods.html?goods_id={item}"
    return {"link": link, "name": name, "platform": platform, "price": price, "seller": seller,
            "total_rating": 500, "comments": comments, "sentiment_summary": summary}


PRODUCTS = [
    # red, older; one review from 2024 and one Lazada showed as "3 weeks ago"
    made_up(1, "safety_warning", 3, price="₱1,299.00", seller="Spark Shop", dates=["2024-03-05", "3 weeks ago"],
            fake=2, nad=3, variations=["Model:65W", "model : 65w", "Color:White"]),  # also: possible fake, not as advertised
    made_up(2, "safety_warning", 5, name="Wall Charger 20W USB-C", price="₱79.00", seller="Spark Shop"),  # red, newer
    made_up(3, "possible_safety_issue", 1, price="₱99 - ₱199", seller="  spark   SHOP ", nad=1),  # one mention, same seller
    made_up(4, "no_warning_signs", 1, name="Wireless Mouse", hazard="shock_spark_short", price="₱450.00",
            seller="Mouse Hub"),                                                         # a mention below the verdict
    made_up(5, "no_warning_signs", 0, name="Wireless Mouse", price="₱450.00", seller="Mouse Hub"),  # nothing about safety
    made_up(6, "safety_warning", 4, platform="temu"),                                    # not Lazada: left out
    made_up(7, "no_warning_signs", 0, name="Mystery Gadget", price="", seller=""),       # unknown kind, no price, no seller
]
DATES = {
    PRODUCTS[0]["link"]: "2026-10-18T05:00:00+00:00",
    PRODUCTS[1]["link"]: "2026-10-19T05:00:00+00:00",
    PRODUCTS[2]["link"]: "2026-10-19T05:00:00+00:00",
    PRODUCTS[3]["link"]: "2026-10-17T05:00:00+00:00",
}
RED = [PRODUCTS[1]["link"], PRODUCTS[0]["link"]]
MENTIONS = [PRODUCTS[2]["link"], PRODUCTS[3]["link"]]
DATABASE = lambda: app.config["ACCOUNTS_DB"]  # noqa: E731


def signed_in(agency: bool = False):
    """A client signed in to a new account; an agency's when asked."""
    client = app.test_client()
    sign_up(client, "agency" if agency else "shopper")
    email = client.get("/api/auth/me").get_json()["user"]["email"]
    if agency:
        agency_api.add_member(DATABASE(), agency_api.user_by_email(DATABASE(), email)["id"])
    return client


class AgencyTestCase(unittest.TestCase):
    def setUp(self) -> None:
        patcher = mock.patch.object(agency_api, "saved_reports", lambda: (PRODUCTS, DATES))
        patcher.start()
        self.addCleanup(patcher.stop)


class AccessTest(AgencyTestCase):
    ROUTES = [
        ("get", "/api/agency/watch"),
        ("get", "/api/agency/patterns"),
        ("get", f"/api/agency/evidence?link={RED[0]}"),
        ("post", "/api/agency/seen"),
        ("get", "/api/agency/watch.csv"),
        ("get", "/api/agency/sellers"),
        ("put", "/api/agency/case"),
        ("post", "/api/agency/feedback"),
        ("delete", "/api/agency/feedback"),
        ("post", "/api/agency/guide"),
    ]
    BODIES = {
        "/api/agency/seen": {"level": "reports"},
        "/api/agency/case": {"link": RED[0], "status": "looking", "note": ""},
        "/api/agency/feedback": {"link": RED[0], "sentence": SENTENCE},
        "/api/agency/guide": {},
    }

    def call(self, client, method: str, path: str):
        if method == "get":
            return client.get(path)
        return getattr(client, method)(path, json=self.BODIES[path])

    def test_a_guest_is_asked_to_sign_in(self) -> None:
        client = app.test_client()
        self.assertEqual(client.get("/api/agency/me").get_json()["member"], False)
        for method, path in self.ROUTES:
            answer = self.call(client, method, path)
            self.assertEqual(answer.status_code, 401, path)
            self.assertTrue(answer.get_json()["sign_in"])

    def test_a_shopper_is_turned_away(self) -> None:
        client = signed_in()
        self.assertEqual(client.get("/api/agency/me").get_json()["member"], False)
        for method, path in self.ROUTES:
            answer = self.call(client, method, path)
            self.assertEqual(answer.status_code, 403, path)
            self.assertEqual(answer.get_json()["error"], agency_api.NOT_MEMBER_MESSAGE)

    def test_an_agency_account_gets_in(self) -> None:
        client = signed_in(agency=True)
        me = client.get("/api/agency/me").get_json()
        self.assertEqual((me["member"], me["office"], me["office_name"]), (True, "DTI", "Department of Trade and Industry"))
        for method, path in self.ROUTES:
            self.assertEqual(self.call(client, method, path).status_code, 200, path)

    def test_access_taken_back_closes_the_view(self) -> None:
        client = signed_in(agency=True)
        email = client.get("/api/auth/me").get_json()["user"]["email"]
        self.assertTrue(agency_api.remove_member(DATABASE(), agency_api.user_by_email(DATABASE(), email)["id"]))
        self.assertEqual(client.get("/api/agency/watch").status_code, 403)

    def test_seen_takes_json_only(self) -> None:
        client = signed_in(agency=True)
        self.assertEqual(client.post("/api/agency/seen", data={"level": "reports"}).status_code, 415)
        self.assertEqual(client.post("/api/agency/seen", json={"nothing": 1}).status_code, 400)


class WatchListTest(AgencyTestCase):
    def test_red_level_newest_first_lazada_only(self) -> None:
        answer = signed_in(agency=True).get("/api/agency/watch").get_json()
        self.assertEqual([row["link"] for row in answer["rows"]], RED)
        row = answer["rows"][0]
        self.assertEqual((row["level"], row["safety_mentions"], row["kind"]), ("reports", 5, "Charger"))
        self.assertEqual(row["headline"], "Reviewers report safety problems")
        self.assertLessEqual(len(row["quotes"]), agency_api.QUOTES_PER_ROW)
        self.assertEqual(answer["note"], agency_api.LEADS_NOTE)
        self.assertEqual(answer["accuracy"]["reports_confirmed"], 16)

    def test_mentions_level_holds_every_other_safety_mention(self) -> None:
        answer = signed_in(agency=True).get("/api/agency/watch?level=mentions").get_json()
        self.assertEqual([row["link"] for row in answer["rows"]], MENTIONS)

    def test_newest_complaint_first_with_its_date_and_price_band(self) -> None:
        rows = {row["link"]: row for row in signed_in(agency=True).get("/api/agency/watch").get_json()["rows"]}
        newer, older = rows[RED[0]], rows[RED[1]]
        # The charger's newest safety review is 14 Oct; the power bank's is 12 Oct (its others are older, or "3 weeks ago").
        self.assertEqual((newer["latest_report"], older["latest_report"]), ("2026-10-14", "2026-10-12"))
        self.assertLess(newer["latest_report_age"], older["latest_report_age"])
        self.assertFalse(newer["latest_report_approx"])
        self.assertEqual((newer["price_band"], older["price_band"]), ("Under ₱200", "₱1,000 and up"))

    def test_a_relative_date_counts_back_from_when_the_reviews_were_collected(self) -> None:
        checked = "2026-10-20T04:00:00+00:00"
        product = made_up(9, "safety_warning", 2, dates=["5 days ago", ""])
        # No record of the scan: counted from the report's date.
        self.assertEqual(agency_api.latest_report(product, checked)[:2], ("2026-10-15", True))
        # The scan's own record (Philippine time) comes first.
        product["review_checkpoint"] = {"updated_at": "2026-10-10T09:00:00"}
        self.assertEqual(agency_api.latest_report(product, checked)[:2], ("2026-10-05", True))
        # No date at all, or a relative one with nothing to count from.
        self.assertEqual(agency_api.latest_report(made_up(10, "safety_warning", 1, dates=[""]), checked), (None, False, None))
        self.assertEqual(agency_api.latest_report(made_up(11, "safety_warning", 1, dates=["2 weeks ago"]), None), (None, False, None))
        self.assertIsNone(agency_api._price_band(""))

    def test_an_unknown_level_is_refused(self) -> None:
        self.assertEqual(signed_in(agency=True).get("/api/agency/watch?level=all").status_code, 400)


class NewListingsTest(AgencyTestCase):
    def test_everything_is_new_at_first(self) -> None:
        answer = signed_in(agency=True).get("/api/agency/watch").get_json()
        self.assertEqual(answer["new"], {"reports": 2, "mentions": 2})
        self.assertTrue(all(row["new"] for row in answer["rows"]))

    def test_marking_a_level_seen_leaves_the_other(self) -> None:
        client = signed_in(agency=True)
        answer = client.post("/api/agency/seen", json={"level": "reports"}).get_json()
        self.assertEqual((answer["marked"], answer["new"]), (2, {"reports": 0, "mentions": 2}))
        self.assertFalse(any(row["new"] for row in client.get("/api/agency/watch").get_json()["rows"]))

    def test_opening_a_sheet_marks_that_listing_only(self) -> None:
        client = signed_in(agency=True)
        client.get(f"/api/agency/evidence?link={RED[1]}")
        rows = {row["link"]: row["new"] for row in client.get("/api/agency/watch").get_json()["rows"]}
        self.assertEqual(rows, {RED[0]: True, RED[1]: False})

    def test_each_account_keeps_its_own(self) -> None:
        first, second = signed_in(agency=True), signed_in(agency=True)
        first.post("/api/agency/seen", json={"level": "reports"})
        self.assertEqual(second.get("/api/agency/watch").get_json()["new"]["reports"], 2)

    def test_only_listings_on_the_watch_list_are_recorded(self) -> None:
        client = signed_in(agency=True)
        stray = [PRODUCTS[4]["link"], PRODUCTS[5]["link"], "https://example.com/anything"]
        answer = client.post("/api/agency/seen", json={"links": [*stray, MENTIONS[0]]}).get_json()
        self.assertEqual(answer["marked"], 1)
        email = client.get("/api/auth/me").get_json()["user"]["email"]
        user_id = agency_api.user_by_email(DATABASE(), email)["id"]
        self.assertEqual(agency_api.seen_links(DATABASE(), user_id), {MENTIONS[0]})


class EvidenceTest(AgencyTestCase):
    def test_every_review_the_report_counts_newest_first(self) -> None:
        sheet = signed_in(agency=True).get(f"/api/agency/evidence?link={RED[0]}").get_json()["sheet"]
        self.assertEqual(len(sheet["reviews"]), sheet["safety_mentions"])
        self.assertEqual([review["date"] for review in sheet["reviews"]], [f"2026-10-{day}" for day in (14, 13, 12, 11, 10)])
        quote = sheet["reviews"][0]["quotes"]
        self.assertEqual(len(quote), 1)
        self.assertEqual((quote[0]["text"], quote[0]["hazard"]), (SENTENCE, "overheating or burns"))
        # The negated word is not picked out.
        self.assertEqual(quote[0]["highlights"], [[0, 7]])
        self.assertEqual((sheet["ratings_listed"], sheet["reviews_analyzed"]), (500, 40))
        self.assertEqual(sheet["note"], agency_api.LEADS_NOTE)

    def test_dates_lazada_showed_as_ago_sort_with_real_dates(self) -> None:
        product = made_up(8, "safety_warning", 4)
        for review, date in zip(product["comments"], ["2025-01-05", "2 weeks ago", "", "3 days ago"]):
            review["time"] = date
        from dashboard_utils import badge_view

        sheet = agency_api.evidence_sheet(product, badge_view(product), "2026-10-20T04:00:00+00:00")
        self.assertEqual([review["date"] for review in sheet["reviews"]], ["3 days ago", "2 weeks ago", "2025-01-05", None])
        self.assertEqual([review["date_relative"] for review in sheet["reviews"]], [True, True, False, False])
        self.assertEqual([review["day"] for review in sheet["reviews"]], ["2026-10-17", "2026-10-06", "2025-01-05", None])
        self.assertEqual([review["day_approx"] for review in sheet["reviews"]], [True, True, False, False])

    def test_found_however_the_address_is_written(self) -> None:
        client = signed_in(agency=True)
        answer = client.get("/api/agency/evidence", query_string={"link": RED[0] + "?spm=a2o4l.tracking"})
        self.assertEqual(answer.get_json()["sheet"]["link"], RED[0])

    def test_unknown_and_non_lazada_listings_are_not_found(self) -> None:
        client = signed_in(agency=True)
        for link in (LAZADA.format(99999), PRODUCTS[5]["link"]):
            self.assertEqual(client.get("/api/agency/evidence", query_string={"link": link}).status_code, 404)


class PatternsTest(AgencyTestCase):
    def test_counts_by_kind_other_last(self) -> None:
        answer = signed_in(agency=True).get("/api/agency/patterns").get_json()
        kinds = {row["kind"]: row for row in answer["kinds"]}
        self.assertEqual(answer["listings"], 6)
        self.assertEqual({k: (v["listings"], v["reports"], v["mentions"]) for k, v in kinds.items()}, {
            "Power bank": (2, 1, 1), "Charger": (1, 1, 0), "Mouse": (2, 0, 1), "Other": (1, 0, 0),
        })
        self.assertEqual(kinds["Power bank"]["top_hazard"], "overheating or burns")
        self.assertIsNone(kinds["Other"]["top_hazard"])
        self.assertEqual(answer["kinds"][-1]["kind"], "Other")
        self.assertEqual(answer["scope"], agency_api.SCOPE_NOTE)


class AlsoReportedTest(AgencyTestCase):
    def test_rows_carry_the_other_problems_in_the_reports_own_words(self) -> None:
        client = signed_in(agency=True)
        rows = {row["link"]: row for row in client.get("/api/agency/watch").get_json()["rows"]}
        self.assertEqual(rows[RED[1]]["also"], [
            {"category": "not_as_described", "label": "Not as advertised", "reviews": 3},
            {"category": "counterfeit", "label": "Possible fake", "reviews": 2},
        ])
        self.assertEqual(rows[RED[0]]["also"], [])
        mentions = {row["link"]: row for row in client.get("/api/agency/watch?level=mentions").get_json()["rows"]}
        self.assertEqual([item["category"] for item in mentions[MENTIONS[0]]["also"]], ["not_as_described"])

    def test_the_chart_counts_flagged_listings_by_level(self) -> None:
        also = signed_in(agency=True).get("/api/agency/patterns").get_json()["charts"]["also"]
        # Four flagged Lazada listings: the red power bank has both, the orange one "not as advertised".
        self.assertEqual(
            [(row["category"], row["label"], row["reports"], row["mentions"], row["flagged"]) for row in also],
            [("not_as_described", "Not as advertised", 1, 1, 4), ("counterfeit", "Possible fake", 1, 0, 4)],
        )

    def test_the_sheet_names_the_variants_most_first(self) -> None:
        sheet = signed_in(agency=True).get("/api/agency/evidence", query_string={"link": RED[1]}).get_json()["sheet"]
        # "Model:65W" and "model : 65w" are one variant, written with its capitals, tidied.
        self.assertEqual(sheet["variants"], [{"variant": "Model: 65W", "reviews": 2}, {"variant": "Color: White", "reviews": 1}])
        self.assertEqual(sheet["variants_more"], 0)
        self.assertEqual([item["label"] for item in sheet["also"]], ["Not as advertised", "Possible fake"])

    def test_a_label_that_says_nothing_is_left_out(self) -> None:
        self.assertEqual(agency_api._tidy_variant("Variation:480w  type-c charger"), "480w type-c charger")
        self.assertEqual(agency_api._tidy_variant("Options: 12V5A"), "12V5A")
        self.assertEqual(agency_api._tidy_variant("Color Family:Black"), "Color Family: Black")
        # Kept when more labels follow: then it is part of the description.
        self.assertEqual(agency_api._tidy_variant("Variation: Type-C, Color: White"), "Variation: Type-C, Color: White")

    def test_at_most_six_variants_are_listed(self) -> None:
        shown, more = agency_api.variants_named([{"variation": f"Size:{n}"} for n in range(9)] + [{"variation": "  "}])
        self.assertEqual((len(shown), more), (6, 3))

    def test_the_spreadsheet_says_it_too(self) -> None:
        import csv

        text = signed_in(agency=True).get("/api/agency/watch.csv?level=reports").get_data(as_text=True)
        rows = {row["Link"]: row for row in csv.DictReader(io.StringIO(text.lstrip("﻿")))}
        self.assertEqual(rows[RED[1]]["Also reported"], "Not as advertised; Possible fake")
        self.assertEqual(rows[RED[0]]["Also reported"], "")

    def test_the_spreadsheet_can_hold_one_other_problem_only(self) -> None:
        import csv

        client = signed_in(agency=True)
        text = client.get("/api/agency/watch.csv?level=all&also=not_as_described").get_data(as_text=True)
        self.assertEqual([row["Link"] for row in csv.DictReader(io.StringIO(text.lstrip("﻿")))], [RED[1], MENTIONS[0]])
        self.assertEqual(client.get("/api/agency/watch.csv?also=quality").status_code, 400)


class SheetsTest(AgencyTestCase):
    def test_several_sheets_in_the_order_asked_and_nothing_marked_seen(self) -> None:
        client = signed_in(agency=True)
        stray = [LAZADA.format(99999), PRODUCTS[5]["link"], RED[1]]  # unknown, not Lazada, asked twice
        answer = client.post("/api/agency/sheets", json={"links": [MENTIONS[0], RED[1], *stray]})
        self.assertEqual(answer.status_code, 200)
        self.assertEqual([sheet["link"] for sheet in answer.get_json()["sheets"]], [MENTIONS[0], RED[1]])
        self.assertNotIn(REVIEWER, answer.get_data(as_text=True))
        self.assertEqual(client.get("/api/agency/watch").get_json()["new"], {"reports": 2, "mentions": 2})

    def test_limits_and_refusals(self) -> None:
        client = signed_in(agency=True)
        self.assertEqual(client.post("/api/agency/sheets", json={"links": [RED[0]] * 61}).status_code, 400)
        self.assertEqual(client.post("/api/agency/sheets", json={"links": []}).status_code, 400)
        self.assertEqual(client.post("/api/agency/sheets", data="links").status_code, 415)
        self.assertEqual(signed_in().post("/api/agency/sheets", json={"links": [RED[0]]}).status_code, 403)
        self.assertEqual(app.test_client().post("/api/agency/sheets", json={"links": [RED[0]]}).status_code, 401)


class GuideTest(AgencyTestCase):
    def test_the_guide_is_remembered_per_account(self) -> None:
        first, second = signed_in(agency=True), signed_in(agency=True)
        self.assertIs(first.get("/api/agency/me").get_json()["guide_seen"], False)
        self.assertEqual(first.post("/api/agency/guide", json={}).get_json(), {"guide_seen": True})
        self.assertIs(first.get("/api/agency/me").get_json()["guide_seen"], True)
        # Again is fine, and another account is untouched.
        self.assertEqual(first.post("/api/agency/guide", json={}).status_code, 200)
        self.assertIs(second.get("/api/agency/me").get_json()["guide_seen"], False)

    def test_not_for_others_and_json_only(self) -> None:
        self.assertIs(signed_in().get("/api/agency/me").get_json()["guide_seen"], False)
        self.assertIs(app.test_client().get("/api/agency/me").get_json()["guide_seen"], False)
        self.assertEqual(signed_in(agency=True).post("/api/agency/guide", data="x").status_code, 415)

    def test_deleting_the_account_removes_it(self) -> None:
        accounts.create_user(DATABASE(), "Guide Reader", "guide@example.com", "long enough 1")
        user = agency_api.user_by_email(DATABASE(), "guide@example.com")
        agency_api.add_member(DATABASE(), user["id"])
        agency_api.mark_guide_seen(DATABASE(), user["id"])
        accounts.delete_user(DATABASE(), user["id"], "long enough 1")
        self.assertFalse(agency_api.guide_seen(DATABASE(), user["id"]))


class ChartsTest(AgencyTestCase):
    def test_what_the_overview_charts_draw(self) -> None:
        drawn = signed_in(agency=True).get("/api/agency/patterns").get_json()["charts"]
        self.assertEqual(drawn["hazards"], [
            {"hazard": "overheating or burns", "quotes": 9},
            {"hazard": "electric shocks, sparks or short circuits", "quotes": 1},
        ])
        # Every year from the first to the last, a quiet year as 0; "3 weeks ago" counts back from the report date.
        self.assertEqual(drawn["years"], [{"year": 2024, "reviews": 1}, {"year": 2025, "reviews": 0}, {"year": 2026, "reviews": 9}])
        self.assertEqual(drawn["recent_or_unknown"], 0)
        self.assertEqual(drawn["prices"], [
            {"band": "Under ₱200", "listings": 2, "reports": 1, "mentions": 1},
            {"band": "₱200–499", "listings": 2, "reports": 0, "mentions": 1},
            {"band": "₱500–999", "listings": 0, "reports": 0, "mentions": 0},
            {"band": "₱1,000 and up", "listings": 1, "reports": 1, "mentions": 0},
        ])
        self.assertEqual(drawn["no_price"], 1)

    def test_prices_are_read_from_how_lazada_writes_them(self) -> None:
        self.assertEqual(agency_api._price_value("₱1,299.00"), 1299.0)
        self.assertEqual(agency_api._price_value("₱99 - ₱199"), 99.0)
        self.assertIsNone(agency_api._price_value(""))
        self.assertIsNone(agency_api._price_value("Price not shown"))


class SellersTest(AgencyTestCase):
    def test_sellers_with_two_or_more_flagged_listings(self) -> None:
        answer = signed_in(agency=True).get("/api/agency/sellers").get_json()
        # "  spark   SHOP " is the same seller as "Spark Shop"; Mouse Hub has one flagged listing; a blank name is left out.
        self.assertEqual([(s["seller"], s["listings"], s["reports"], s["mentions"]) for s in answer["sellers"]], [("Spark Shop", 3, 2, 1)])
        flagged = answer["sellers"][0]["flagged"]
        self.assertEqual([item["link"] for item in flagged], [RED[0], RED[1], MENTIONS[0]])
        self.assertEqual(answer["note"], agency_api.SELLER_NOTE)


class CasesTest(AgencyTestCase):
    def test_a_status_and_note_are_kept_for_this_account_only(self) -> None:
        first, second = signed_in(agency=True), signed_in(agency=True)
        answer = first.put("/api/agency/case", json={"link": RED[0], "status": "no_action", "note": "  Sent to the regional office.  "})
        self.assertEqual(answer.status_code, 200)
        self.assertEqual((answer.get_json()["case"]["status"], answer.get_json()["case"]["note"]), ("no_action", "Sent to the regional office."))
        rows = {row["link"]: row["case"] for row in first.get("/api/agency/watch").get_json()["rows"]}
        self.assertEqual(rows[RED[0]]["status"], "no_action")
        self.assertIsNone(rows[RED[1]])
        self.assertEqual(first.get("/api/agency/evidence", query_string={"link": RED[0]}).get_json()["sheet"]["case"]["note"], "Sent to the regional office.")
        self.assertTrue(all(row["case"] is None for row in second.get("/api/agency/watch").get_json()["rows"]))

    def test_referred_is_gone_and_an_old_one_reads_under_review(self) -> None:
        import sqlite3
        from contextlib import closing

        client = signed_in(agency=True)
        self.assertEqual(client.put("/api/agency/case", json={"link": RED[0], "status": "referred"}).status_code, 400)
        email = client.get("/api/auth/me").get_json()["user"]["email"]
        user_id = agency_api.user_by_email(DATABASE(), email)["id"]
        # A status saved before "Referred" was dropped.
        with closing(sqlite3.connect(DATABASE())) as connection, connection:
            connection.execute("INSERT INTO agency_cases(user_id, link, status, note, updated_at) VALUES (?, ?, 'referred', '', 'x')", (user_id, RED[0]))
        self.assertEqual(agency_api.cases_of(DATABASE(), user_id)[RED[0]]["status"], "looking")

    def test_clearing_both_forgets_the_listing(self) -> None:
        client = signed_in(agency=True)
        client.put("/api/agency/case", json={"link": RED[0], "status": "looking", "note": ""})
        self.assertIsNone(client.put("/api/agency/case", json={"link": RED[0], "status": "", "note": " "}).get_json()["case"])
        self.assertIsNone(client.get("/api/agency/watch").get_json()["rows"][0]["case"])

    def test_bad_requests_are_refused(self) -> None:
        client = signed_in(agency=True)
        self.assertEqual(client.put("/api/agency/case", json={"link": RED[0], "status": "closed"}).status_code, 400)
        self.assertEqual(client.put("/api/agency/case", json={"link": RED[0], "status": "", "note": "x" * 2001}).status_code, 400)
        self.assertEqual(client.put("/api/agency/case", json={"link": LAZADA.format(99999), "status": "looking"}).status_code, 404)
        self.assertEqual(client.put("/api/agency/case", data="status=looking").status_code, 415)


class FeedbackTest(AgencyTestCase):
    def sheet(self, client, link=RED[0]):
        return client.get("/api/agency/evidence", query_string={"link": link}).get_json()["sheet"]

    def test_marking_a_quote_changes_nothing_but_the_mark(self) -> None:
        client = signed_in(agency=True)
        before = self.sheet(client)
        answer = client.post("/api/agency/feedback", json={"link": RED[0], "sentence": SENTENCE, "reason": "Song lyrics"})
        self.assertEqual(answer.get_json(), {"marked": True})
        after = self.sheet(client)
        self.assertTrue(all(quote["marked_not_safety"] for review in after["reviews"] for quote in review["quotes"]))
        self.assertEqual((after["safety_mentions"], len(after["reviews"]), after["headline"]),
                         (before["safety_mentions"], len(before["reviews"]), before["headline"]))
        self.assertFalse(any(quote["marked_not_safety"] for review in self.sheet(signed_in(agency=True))["reviews"] for quote in review["quotes"]))
        client.delete("/api/agency/feedback", json={"link": RED[0], "sentence": SENTENCE})
        self.assertFalse(any(quote["marked_not_safety"] for review in self.sheet(client)["reviews"] for quote in review["quotes"]))

    def test_only_a_real_safety_sentence_of_that_listing_can_be_marked(self) -> None:
        client = signed_in(agency=True)
        self.assertEqual(client.post("/api/agency/feedback", json={"link": RED[0], "sentence": "Anything at all"}).status_code, 400)
        self.assertEqual(client.post("/api/agency/feedback", json={"link": RED[0], "sentence": "Review 1."}).status_code, 400)
        self.assertEqual(client.post("/api/agency/feedback", json={"link": PRODUCTS[4]["link"], "sentence": SENTENCE}).status_code, 400)
        self.assertEqual(client.post("/api/agency/feedback", json={"link": RED[0], "sentence": SENTENCE, "reason": "x" * 501}).status_code, 400)

    def test_the_team_script_lists_marks_by_office_not_person(self) -> None:
        import tempfile

        import agency_feedback

        client = signed_in(agency=True)
        client.post("/api/agency/feedback", json={"link": MENTIONS[1], "sentence": SENTENCE, "reason": "=not a hazard"})
        target = Path(tempfile.mkdtemp()) / "marks.csv"
        with mock.patch.object(agency_accounts, "accounts_db", lambda: Path(DATABASE())), contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(agency_feedback.main(["--csv", str(target)]), 0)
        text = target.read_text(encoding="utf-8-sig")
        self.assertTrue(text.startswith("Marked on,Office,Listing link,Sentence,Read as,Their reason"))
        self.assertIn(f"DTI,{MENTIONS[1]},", text)
        self.assertIn("electric shocks, sparks or short circuits", text)
        self.assertIn("'=not a hazard", text)
        self.assertNotIn("@example.com", text)


class SpreadsheetTest(AgencyTestCase):
    def test_the_watch_list_as_a_spreadsheet(self) -> None:
        import csv

        client = signed_in(agency=True)
        client.put("/api/agency/case", json={"link": RED[0], "status": "looking", "note": "=1+1 check this"})
        answer = client.get("/api/agency/watch.csv")
        self.assertEqual(answer.status_code, 200)
        self.assertTrue(answer.mimetype == "text/csv")
        self.assertRegex(answer.headers["Content-Disposition"], r'attachment; filename="defaketive-dti-watch-list-\d{4}-\d{2}-\d{2}\.csv"')
        text = answer.get_data(as_text=True)
        self.assertTrue(text.startswith("﻿"))
        rows = list(csv.reader(io.StringIO(text.lstrip("﻿"))))
        self.assertEqual(tuple(rows[0]), agency_api.CSV_COLUMNS)
        self.assertEqual([row[2] for row in rows[1:]], RED + MENTIONS)
        first = dict(zip(rows[0], rows[1]))
        self.assertEqual((first["Level"], first["Price"], first["Safety reviews"], first["Case status"]), ("Safety reports", "₱79.00", "5", "Under review"))
        self.assertEqual(first["Your note"], "'=1+1 check this")
        self.assertNotIn(REVIEWER, text)
        only_mentions = client.get("/api/agency/watch.csv?level=mentions").get_data(as_text=True)
        self.assertEqual(len(list(csv.reader(io.StringIO(only_mentions.lstrip("﻿"))))), 1 + len(MENTIONS))
        self.assertEqual(client.get("/api/agency/watch.csv?level=everything").status_code, 400)


class NoNamesTest(AgencyTestCase):
    def test_no_answer_holds_a_reviewer_name(self) -> None:
        client = signed_in(agency=True)
        answers = [
            client.get("/api/agency/watch").get_data(as_text=True),
            client.get("/api/agency/watch?level=mentions").get_data(as_text=True),
            client.get("/api/agency/patterns").get_data(as_text=True),
            *(client.get("/api/agency/evidence", query_string={"link": link}).get_data(as_text=True) for link in RED + MENTIONS),
        ]
        for text in answers:
            self.assertNotIn(REVIEWER, text)
            self.assertNotIn("Happy Buyer", text)
            self.assertNotIn('"author"', text)
            json.loads(text)


class ScriptTest(unittest.TestCase):
    def run_script(self, *args: str) -> tuple[int, str, str]:
        out, err = io.StringIO(), io.StringIO()
        with mock.patch.object(agency_accounts, "accounts_db", lambda: Path(DATABASE())), \
                contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            code = agency_accounts.main(list(args))
        return code, out.getvalue(), err.getvalue()

    def test_makes_an_account_and_gives_access(self) -> None:
        code, out, _ = self.run_script("add", "--email", "officer@dti.example", "--name", "Officer One")
        self.assertEqual(code, 0)
        self.assertIn("Password, shown only this once:", out)
        password = out.split("shown only this once: ")[1].split()[0]
        user = accounts.authenticate(DATABASE(), "officer@dti.example", password)
        self.assertIsNotNone(user)
        self.assertEqual(agency_api.office_of(DATABASE(), user["id"]), "DTI")
        code, out, _ = self.run_script("list")
        self.assertIn("officer@dti.example", out)

    def test_gives_access_to_an_existing_account_without_a_new_password(self) -> None:
        accounts.create_user(DATABASE(), "Existing Person", "existing@example.com", "long enough 1")
        code, out, _ = self.run_script("add", "--email", "Existing@Example.com")
        self.assertEqual(code, 0)
        self.assertNotIn("Password", out)
        self.assertIsNotNone(accounts.authenticate(DATABASE(), "existing@example.com", "long enough 1"))

    def test_needs_a_name_for_a_new_account(self) -> None:
        code, _, err = self.run_script("add", "--email", "nobody@example.com")
        self.assertEqual(code, 2)
        self.assertIn("--name", err)
        self.assertIsNone(agency_api.user_by_email(DATABASE(), "nobody@example.com"))

    def test_remove_keeps_the_account(self) -> None:
        self.run_script("add", "--email", "leaving@dti.example", "--name", "Leaving Officer")
        code, _, _ = self.run_script("remove", "--email", "leaving@dti.example")
        self.assertEqual(code, 0)
        user = agency_api.user_by_email(DATABASE(), "leaving@dti.example")
        self.assertIsNotNone(user)
        self.assertIsNone(agency_api.office_of(DATABASE(), user["id"]))
        self.assertEqual(self.run_script("remove", "--email", "leaving@dti.example")[0], 1)

    def test_deleting_the_account_removes_its_access(self) -> None:
        accounts.create_user(DATABASE(), "Short Stay", "short@example.com", "long enough 1")
        user = agency_api.user_by_email(DATABASE(), "short@example.com")
        agency_api.add_member(DATABASE(), user["id"])
        agency_api.mark_seen(DATABASE(), user["id"], [RED[0]])
        accounts.delete_user(DATABASE(), user["id"], "long enough 1")
        self.assertNotIn("short@example.com", [person["email"] for person in agency_api.members(DATABASE())])
        self.assertEqual(agency_api.seen_links(DATABASE(), user["id"]), set())


if __name__ == "__main__":
    unittest.main()
