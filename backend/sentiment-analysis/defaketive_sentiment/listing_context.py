"""Rules lc1: the two newer labels read with the listing and the whole review (17 Oct 2026).

The sentence checker sees one sentence and never the listing. Two kinds of
not-as-advertised report need more (research/PREREGISTRATION_round18.md):

- what the listing promised: "it is not a clip fan" or "hindi nman buy 1 take
  1" is a report because the title says "Clip Fan" or "BUY 1 TAKE 1";
- the next sentence: "ang sabi may otg na free" is a report because the review
  goes on to say it did not come.

listing_claims() reads the title (and, for offers, the description) for
numbers with units, features the product is sold by, and offers.
review_rules() returns, per sentence, the not-as-advertised parts that apply:

    number    a listed number denied ("not an 80000mAh") or doubted ("idk if
              it's actually 20000mAh")
    feature   a listed feature denied ("not a clip fan", "hindi conduction")
    offer     a listed offer not kept ("1 lang natanggap" under Buy 1 Take 1)
    context   a claim stated ("sabi", "daw", "says", "ad") and contradicted in
              the next sentence

Written from the training rounds whose listing is known (rounds 8 and 10-16,
research/listing_lookup.py) and checked part by part
(research/check_lc1_rules.py). Tried and not kept: a number lower than the
listed one (the reviewer's own phone or another product as often as a
report), a bare "pero wala" taking the label of the sentence before, an
expectation let down in the next sentence (poor quality; it found nothing),
and "walang"/"wala" before a feature (a missing part, Rule 1). LC1_OFF names
parts switched off, for that check only.
"""

import re

from . import text_norm as tn

LISTING_CONTEXT_REVISION = "lc1"
LC1_OFF: set[str] = set()
_NUM = r"(\d{1,3}(?:,\s?\d{3})+|\d+(?:\.\d+)?)"
UNITS = {
    "mah": r"(k\s*)?(?:mah|mha)",
    "w": r"(k\s*)?(?:w|watts?)",
    "a": r"(k\s*)?(?:a|amps?)",
    "m": r"(k\s*)?(?:m|meters?|mtrs?)",
    "h": r"(k\s*)?(?:hours?|hrs?|h)",
}
NUMBER = {unit: re.compile(rf"(?<![\w.]){_NUM}\s*{pattern}(?!\w)", re.I) for unit, pattern in UNITS.items()}
# (listing pattern, review pattern) per feature the product is sold by
FEATURES = {
    "clip_fan": (r"clip\s*-?\s*(?:on\s*)?fan|\bclip\b", r"clip\s*-?\s*(?:on\s*)?fan|clipfan|clip"),
    "big": (r"\bbig\b|\blarge\b|jumbo", r"big|malaki|large"),
    "bone_conduction": (r"bone\s*conduct\w*|conduction|air\s*conduct\w*", r"bone\s*conduct\w*|conduct\w*"),
    "noise_cancel": (r"noise\s*cancel\w*|\banc\b|\benc\b|noise\s*reduc\w*", r"noise\s*cancel\w*|\banc\b|noise\s*reduc\w*"),
    "waterproof": (r"water\s*proof|waterproof|ipx\s*\d|water\s*resist\w*", r"water\s*proof|waterproof|water\s*resist\w*"),
    "rechargeable": (r"recharge\w*", r"recharge\w*|chargeable"),
    "wireless": (r"wireless|cordless", r"wireless|cordless"),
    "fast_charge": (r"fast\s*charg\w*|super\s*fast|quick\s*charg\w*|\bqc\s*\d|\bpd\b|turbo|vooc|super\s*charg\w*|\bgan\b",
                    r"fast\s*charg\w*|super\s*charg\w*|quick\s*charg\w*|turbo|pass?\s*charg\w*|fast"),
    "n_in_one": (r"[345]\s*-?\s*in\s*-?\s*1", r"[345]\s*-?\s*in\s*-?\s*1"),
    "display": (r"digital\s*display|led\s*display|\bdisplay\b|volt\s*meter|voltmeter|percentage", r"display|meter|percent\w*"),
    "magnetic": (r"magnet\w*|magsafe", r"magnet\w*|magsafe"),
    "solar": (r"solar", r"solar"),
    "stereo": (r"stereo|\b9d\b|surround|hi-?fi", r"stereo|surround|9d"),
}
FEATURE_LISTING = {key: re.compile(pair[0], re.I) for key, pair in FEATURES.items()}
_NEG = r"(?:not|hindi|hinde|hind|di|d|hnd|ndi|nde|isn't|isnt|wasn't|wasnt|doesn't|doesnt|no)"
_SOFT = r"(?:(?:sya|siya|cia|xa|po|naman|nman|nmn|talaga|tlga|totoo|totoong|tunay|truly|truely|really|a|an|the|na|pa|real|legit|even|ito|to|yan|yung|ung|it|is|ang|siyang|syang|ganun|ganon)\s+)"
FEATURE_DENIED = {
    key: re.compile(rf"(?<!\w){_NEG}\s+{_SOFT}{{0,4}}(?:{pair[1]})(?!\w)", re.I) for key, pair in FEATURES.items()
}
FEATURE_UNTRUE = {
    key: re.compile(rf"(?<!\w)(?:hindi|di|not)\s+(?:(?:po|naman|nman)\s+)?(?:totoo|totoong|true|legit)\s+(?:na\s+)?(?:[\w']+\s+){{0,2}}(?:{pair[1]})(?!\w)", re.I)
    for key, pair in FEATURES.items()
}
FAST_NOT_CHARGING = re.compile(r"fast\s+(?:delivery|shipping|ship\w*|deliver\w*|response|reply|transaction|dating|dumating)", re.I)
OFFER_B1T1 = re.compile(r"buy\s*1\s*take\s*1|buy\s*one\s*take\s*one|\bb1t1\b|\b1\s*\+\s*1\b|buy\s*1\s*get\s*1|bogo", re.I)
OFFER_FREE = re.compile(r"\bfree\b|freebie|\bgift\b", re.I)
GOT_ONE = re.compile(
    r"(?<!\w)(?:(?:isa|isang|1|one)\s+(?:(?:lang|lng|only|piraso|pc|pcs|piece|item|ang|yung|ung|na|po)\s+){0,3}"
    r"(?:dumating|natanggap|na ?receive\w*|received|receive|binigay|pinadala|delivered|arrived|narecieve\w*|nareceive\w*)"
    r"|(?:received|receive|recieve\w*|got|dumating|natanggap)\s+(?:(?:only|lang|lng)\s+)?(?:1|one|isa)(?!\w)"
    r"|only\s+(?:1|one)\b(?!\s*(?:star|month|week|day))"
    r"|(?:not|hindi|di)\s+(?:[\w']+\s+){0,3}(?:buy\s*1|buy\s*one|b1t1|take\s*1|take\s*one)"
    r"|(?:kala ko|akala ko|i thought)\s+(?:[\w']+\s+){0,3}(?:buy\s*1|buy\s*one|b1t1)"
    r"|(?:where|nasaan|asan|bakit)\s+(?:[\w']+\s+){0,4}(?:take\s*1|take\s*one|b1t1|isa lang|1 lang))",
    re.I,
)
NO_FREE = re.compile(
    r"(?<!\w)(?:walang|wala|no|without|didn'?t (?:get|receive)|not receive\w*|hindi (?:ko )?(?:natanggap|nakuha))\s+(?:[\w']+\s+){0,3}(?:free|freebies?|gift)(?!\w)",
    re.I,
)
OWN_DEVICE = re.compile(r"(?<!\w)(?:cp|phone|cellphone|celphone|selpon|iphone|unit|battery ng|phone ng)\s+(?:ko|q|namin|nya|niya)|my\s+(?:phone|cp|iphone|device)|phone\s+is|cp\s+na|phone\s+na|ng\s+(?:cp|phone)", re.I)
DOUBT = re.compile(
    r"(?<!\w)(?:hindi|di|not)\s+(?:(?:naman|nman|po|sya|siya|talaga|really)\s+)*(?:totoo|totoong|true|legit|real)|kasinungalingan|kalokohan|kaduda|duda|doubt|\bidk\b|misleading|false|\blie\b",
    re.I,
)
# whole-review context
CLAIM_CUE = re.compile(r"(?<!\w)(?:sabi|sabe|daw|raw|says?|said|stated|advertis\w*|description|discription|nakalagay|naka lagay|nkalagay|posted|post|ads?|i ordered|in the ad)(?!\w)", re.I)
CONTRA_NEXT = re.compile(
    r"^\s*(?:pero|but|kaso|however|yet|tapos)\b|(?<!\w)(?:hindi naman|di naman|hindi pala|di pala|not really|wala naman|isa lang|1 lang|only one|only 1)(?!\w)",
    re.I,
)


def _value(text: str) -> float:
    number = re.sub(r"[,\s]", "", text)
    try:
        return float(number)
    except ValueError:
        return 0.0


def listing_claims(listing: dict | None) -> dict:
    listing = listing or {}
    text = tn.normalize_text(f"{listing.get('name') or ''} {listing.get('description') or ''}"[:4000])
    title = tn.normalize_text(listing.get("name") or "")
    numbers: dict[str, float] = {}
    for unit, pattern in NUMBER.items():
        for found in pattern.finditer(title):
            value = _value(found.group(1)) * (1000 if found.group(2) else 1)
            if value > numbers.get(unit, 0):
                numbers[unit] = value
    return {
        "numbers": numbers,
        "features": {key for key, pattern in FEATURE_LISTING.items() if pattern.search(title)},
        "b1t1": bool(OFFER_B1T1.search(text)),
        "free": bool(OFFER_FREE.search(title)),
    }


def listing_parts(normalized: str, claim: dict) -> set[str]:
    parts = set()
    if "number" not in LC1_OFF:
        for unit, listed in claim["numbers"].items():
            for found in NUMBER[unit].finditer(normalized):
                value = _value(found.group(1)) * (1000 if found.group(2) else 1)
                before = normalized[max(0, found.start() - 40): found.start()]
                around = normalized[max(0, found.start() - 30): found.end() + 30]
                if OWN_DEVICE.search(around):
                    continue
                if re.search(rf"(?<!\w){_NEG}\s+{_SOFT}{{0,3}}$", before, re.I):
                    parts.add("number_denied")
                elif value == listed and DOUBT.search(normalized):
                    parts.add("number_doubted")
    if "feature" not in LC1_OFF:
        for key in claim["features"]:
            for pattern in (FEATURE_DENIED[key], FEATURE_UNTRUE[key]):
                found = pattern.search(normalized)
                if found and not (key == "fast_charge" and FAST_NOT_CHARGING.search(normalized[found.start():found.end() + 15])):
                    parts.add(f"feature_{key}")
    if "offer" not in LC1_OFF:
        if claim["b1t1"] and GOT_ONE.search(normalized):
            parts.add("offer_b1t1")
        if claim["free"] and NO_FREE.search(normalized):
            parts.add("offer_free")
    return parts


def review_rules(segments: list[str], tagged: list[dict], listing: dict | None) -> dict[int, dict[str, set[str]]]:
    claim = listing_claims(listing)
    normalized = [tn.normalize_text(seg) for seg in segments]
    flags = [set(t.get("extra_tags") or []) for t in tagged]
    added: dict[int, dict[str, set[str]]] = {}

    def add(i: int, label: str, part: str) -> None:
        if part.split("_")[0] in LC1_OFF or part in LC1_OFF:
            return
        added.setdefault(i, {}).setdefault(label, set()).add(part)

    for i, text in enumerate(normalized):
        for part in listing_parts(text, claim):
            add(i, "not_as_described", part)
    current = [set(f) | set(added.get(i, {})) for i, f in enumerate(flags)]
    for i in range(len(normalized) - 1):
        a, b = normalized[i], normalized[i + 1]
        # a claim stated, then contradicted in the next sentence
        mentions = CLAIM_CUE.search(a) and (any(NUMBER[u].search(a) for u in NUMBER) or OFFER_B1T1.search(a) or OFFER_FREE.search(a)
                                            or any(re.search(FEATURES[k][1], a, re.I) for k in FEATURES))
        if mentions and "not_as_described" not in current[i] and CONTRA_NEXT.search(b):
            add(i, "not_as_described", "context_claim")
    return added


# Rules lc2 and lc2f (18 Oct 2026; research/PREREGISTRATION_round19.md, candidates
# A and B), written from the training rounds whose listing is known (rounds 8,
# 10-16 and 18) and checked part by part (research/check_round19_rules.py).
#
# lc2, not as advertised, beside lc1:
#   spelling  more negations and title features: "tas hnde nmm cia fast
#             charging", "No remote control" under "with Remote"
#   photo     the photo, the ad or the page stands in for the listing: "sana
#             kung ano nsa pic un ippdla", "The page shows that ... yet",
#             "budol ang mga ads"
#   brand     the title's brand denied, with a pointer to the listing: "its not
#             Panasonic as posted", "Stop saying the brand is Xiaomi"
#   bare      "BUT ITS NOT." right after a sentence naming a listed claim
# lc2f, possible fake:
#   brand     the title's brand denied or swapped: "Not a samsung", "but its
#             not its just a random china product"
#   elsewhere every "fake" aims at a listed feature or number, the seller, the
#             photos or the reviews: "fake noise cancellation", "SELLER IS
#             FAKE!!!" (a fake fast charger is still the item)
# Tried and not kept: lc1's context part limited to listed claims (it removed 4
# real reports for 1 false flag), "no brand" and "different brand" alone (1 of
# 7 right), "the pictures are fake" said of the courier.
LC2_REVISION = "lc2"
LC2F_REVISION = "lc2f"
LC2_OFF: set[str] = set()
LC2F_OFF: set[str] = set()
_NEG2 = r"(?:not|hindi|hinde|hnde|hind|di|d|hnd|ndi|nde|isn't|isnt|wasn't|wasnt|doesn't|doesnt|no|never)"
_SOFT2 = (
    r"(?:(?:sya|siya|cia|xa|cya|po|naman|nman|nmn|nmm|talaga|tlga|totoo|totoong|tunay|truly|truely|really|a|an|the|na|pa|"
    r"real|legit|even|ito|to|yan|yung|ung|it|is|ang|siyang|syang|ganun|ganon|tlaga|ganap|actually|at\s+all)\s+)"
)
EXTRA_FEATURES = {
    "remote": (r"with\s+remote|remote\s+control|\bremote\b", r"remote(?:\s+control)?"),
    "mic": (r"with\s+mic\b|with\s+microphone|\bmic\b", r"mic\b|microphone"),
}
FEATURES2 = {**FEATURES, **EXTRA_FEATURES}
FEATURE_LISTING2 = {key: re.compile(pair[0], re.I) for key, pair in EXTRA_FEATURES.items()}
FEATURE_DENIED2 = {
    key: re.compile(rf"(?<!\w){_NEG2}\s+{_SOFT2}{{0,4}}(?:{pair[1]})(?!\w)", re.I) for key, pair in FEATURES2.items()
}
_PHOTO = r"(?:pic|pics|picture|pictures|photo|photos|image|images|larawan|litrato|ads?|advertisement|page|vid|video)"
PHOTO_DIFFERS = (
    re.compile(rf"(?<!\w)sana\s+(?:[\w']+\s+){{0,4}}(?:nasa|sa|nsa|na\s+nasa)\s+{_PHOTO}(?!\w)", re.I),
    re.compile(rf"(?<!\w)(?:iba|different|differs?)\s+(?:[\w']+\s+){{0,3}}(?:nasa|nsa|sa|in\s+the|from\s+the|on\s+the|the)\s+{_PHOTO}(?!\w)", re.I),
    re.compile(
        rf"(?<!\w)(?:nasa|nsa|in\s+the|on\s+the|the)\s+{_PHOTO}\s+(?:[\w']+\s+){{0,5}}"
        r"(?:pero|but|yet|kaso|tapos|the\s+i|i\s+receive\w*|dumating|binigay|pinadala|ang\s+dumating|ang\s+pinadala)(?!\w)",
        re.I,
    ),
    re.compile(rf"(?<!\w)(?:the\s+)?{_PHOTO}\s+(?:clearly\s+)?(?:shows?|showed|says?|said|stated)\s+(?:that\s+)?", re.I),
    re.compile(
        r"(?<!\w)(?:budol|misleading|fake|peke|pekeng)\s+(?:[\w']+\s+){0,2}(?:ang\s+)?(?:mga\s+)?"
        r"(?:ads?|advertisement|presentation|pictures?|pics?|photos?|description)(?!\w)",
        re.I,
    ),
)
PHOTO_NOT_A_CLAIM = re.compile(
    r"(?<!\w)(?:(?:\d+(?:st|nd|rd|th)|first|second|third|fourth|my|attached|this|these|uploaded|last)\s+(?:photos?|pics?|pictures?|videos?|vids?)|"
    r"delivery|rider|courier|signature|same|katulad|kapareho|pareho|kagaya|gaya|exactly|just\s+like|as\s+shown|as\s+pictured|"
    r"what\s+you\s+see|photo\s+not\s+related|not\s+related|for\s+reference|no\s+pic|walang\s+pic|cant\s+upload|can't\s+upload)(?!\w)",
    re.I,
)
BRANDS = (
    "panasonic", "xiaomi", "jbl", "lenovo", "platinum", "samsung", "apple", "anker", "baseus", "ugreen", "shokz", "sony",
    "philips", "hanabishi", "asahi", "kyowa", "realme", "oppo", "vivo", "huawei", "romoss", "remax", "hoco", "yamaha",
    "shure", "logitech", "acer", "asus", "monster", "comica", "boya", "kanazawa", "orashare", "edifier", "soundcore",
    "qcy", "haylou", "tecno", "infinix", "redmi", "aukey", "vention", "imou", "tplink", "tp-link",
)
OWN_WORDS = re.compile(r"(?<!\w)(?:my|ko|q|namin|nya|niya|own|old|dati|previous|una)(?!\w)", re.I)
WRONG_ORDER = re.compile(
    r"(?<!\w)(?:mali|maling|wrong|ibang\s+item|iba\s+(?:ang\s+)?(?:dumating|pinadala|binigay)|i\s+ordered|order\s+ko|inorder\s+ko)(?!\w)", re.I
)
LISTING_POINTER = re.compile(
    r"(?<!\w)(?:as\s+(?:posted|advertised|described|stated|shown|pictured)|advertis\w*|nakalagay|naka\s+lagay|nkalagay|sabi|daw|raw|"
    r"description|title|stop\s+saying|in\s+the\s+picture|sa\s+picture|nasa\s+pic\w*|posted|listing|claims?)(?!\w)",
    re.I,
)
NO_BRAND = re.compile(
    r"(?<!\w)(?:random\s+(?:china|chinese)\s+(?:product|brand|item)|"
    r"(?:receive\w*|recieve\w*|dumating|binigay|pinadala|got)\s+(?:is\s+|was\s+)?(?:a\s+)?no\s*brand)(?!\w)",
    re.I,
)
_ELSEWHERE = r"(?:seller|shop|store|reviews?|ratings?|comments?|feedbacks?|pictures?|pics?|photos?|ads?|advertisement|description|promo|discount|sale)"
_FAKE = r"(?:fake|peke|pekeng|faker)"
BARE_DENIAL = re.compile(
    r"^\W*(?:but|pero|kaso|however)\s+(?:it'?s|its|it\s+is|it\s+was|sya|siya|cia|xa)?\s*(?:totally\s+|really\s+|actually\s+|naman\s+|nman\s+|pala\s+|po\s+)*"
    r"(?:not|hindi|di|wala)\W*(?:at\s+all\W*|naman\W*|pala\W*|po\W*)*$",
    re.I,
)
CLAIM_CUE2 = re.compile(
    r"(?<!\w)(?:as\s+described|described|as\s+advertised|advertis\w*|says?|said|stated|sabi|daw|raw|nakalagay|description|"
    r"it\s+is\s+saying|supposed|dapat)(?!\w)",
    re.I,
)


def listing_claims2(listing: dict | None) -> dict:
    """lc1's claims, with two more title features and the title's brands."""
    claim = listing_claims(listing)
    title = tn.normalize_text((listing or {}).get("name") or "")
    claim["features"] = set(claim["features"]) | {key for key, pattern in FEATURE_LISTING2.items() if pattern.search(title)}
    claim["brands"] = {brand for brand in BRANDS if re.search(rf"(?<!\w){re.escape(brand)}(?!\w)", title)}
    return claim


def _names_listed(text: str, claim: dict) -> bool:
    if any(re.search(FEATURES2[key][1], text, re.I) for key in claim["features"]):
        return True
    if any(NUMBER[unit].search(text) for unit in claim["numbers"]):
        return True
    if claim["b1t1"] and OFFER_B1T1.search(text):
        return True
    return any(re.search(rf"(?<!\w){re.escape(brand)}(?!\w)", text) for brand in claim["brands"])


def _brand_denied(text: str, claim: dict) -> set[str]:
    found: set[str] = set()
    if WRONG_ORDER.search(text):
        return found
    for brand in claim["brands"]:
        name = re.escape(brand)
        if re.search(rf"(?<!\w){_NEG2}\s+{_SOFT2}{{0,3}}(?:a\s+|an\s+)?{name}(?!\w)", text, re.I) and not OWN_WORDS.search(text):
            found.add("not")
        if re.search(rf"(?<!\w){_FAKE}\s+{name}(?!\w)", text, re.I):
            found.add("fake")
        if re.search(rf"(?<!\w)(?:saying|says|said|claims?)\s+(?:that\s+)?(?:the\s+)?brand\s+is\s+{name}", text, re.I):
            found.add("claim")
    if claim["brands"] and NO_BRAND.search(text):
        found.add("none")
    return found


def _fake_elsewhere(text: str, claim: dict) -> bool:
    hits = list(re.finditer(rf"(?<!\w){_FAKE}(?!\w)", text, re.I))
    if not hits:
        return False
    features = "|".join(FEATURES2[key][1] for key in claim["features"] if key != "fast_charge") or r"(?!x)x"
    numbers = "|".join(NUMBER[unit].pattern for unit in claim["numbers"]) or r"(?!x)x"
    for hit in hits:
        after = text[hit.end(): hit.end() + 40]
        before = text[max(0, hit.start() - 30): hit.start()]
        aimed = (
            re.match(rf"\s+(?:(?:na|ng|yung|ung|ang|the|mga)\s+)?(?:{features}|{_ELSEWHERE})(?!\w)", after, re.I)
            or re.match(rf"\s+(?:(?:na|ng|yung|ung|ang|the)\s+)?(?:{numbers})", after, re.I)
            or re.search(rf"(?:{_ELSEWHERE})\s+(?:is|are|was|were|ay|so|very|talaga|is\s+so)?\s*$", before, re.I)
        )
        if not aimed:
            return False
    return True


def lc2_rules(segments: list[str], tagged: list[dict], listing: dict | None) -> dict[int, set[str]]:
    """Rules lc2: per sentence, the not-as-advertised parts added beside lc1 (tagged is read after lc1)."""
    claim = listing_claims2(listing)
    normalized = [tn.normalize_text(seg) for seg in segments]
    flagged = ["not_as_described" in (t.get("extra_tags") or []) for t in tagged]
    added: dict[int, set[str]] = {}

    def add(i: int, part: str) -> None:
        if part.split(":")[0] not in LC2_OFF:
            added.setdefault(i, set()).add(part)

    for i, text in enumerate(normalized):
        if flagged[i]:
            continue
        for key in claim["features"]:
            found = FEATURE_DENIED2[key].search(text)
            if found and not (key == "fast_charge" and FAST_NOT_CHARGING.search(text[found.start(): found.end() + 15])):
                add(i, f"spelling:{key}")
                break
        if not PHOTO_NOT_A_CLAIM.search(text) and any(pattern.search(text) for pattern in PHOTO_DIFFERS):
            add(i, "photo")
        brand = _brand_denied(text, claim) - {"fake"}
        if brand and LISTING_POINTER.search(text):
            add(i, "brand:" + "+".join(sorted(brand)))
    for i in range(1, len(normalized)):
        if (not flagged[i] and i not in added and BARE_DENIAL.match(normalized[i])
                and _names_listed(normalized[i - 1], claim) and CLAIM_CUE2.search(normalized[i - 1])):
            add(i, "bare")
    return added


def lc2f_rules(segments: list[str], tagged: list[dict], listing: dict | None) -> dict[int, tuple[str, str]]:
    """Rules lc2f: per sentence, ("add", part) or ("remove", part) for possible fake."""
    claim = listing_claims2(listing)
    changes: dict[int, tuple[str, str]] = {}
    for i, seg in enumerate(segments):
        text = tn.normalize_text(seg)
        fake = "counterfeit" in (tagged[i].get("tags") or [])
        if not fake and "brand" not in LC2F_OFF:
            brand = _brand_denied(text, claim)
            if brand:
                changes[i] = ("add", "brand:" + "+".join(sorted(brand)))
        elif fake and "elsewhere" not in LC2F_OFF and _fake_elsewhere(text, claim):
            changes[i] = ("remove", "elsewhere")
    return changes
