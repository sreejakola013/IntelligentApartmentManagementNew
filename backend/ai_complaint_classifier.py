
import re


CATEGORY_KEYWORDS = {
    "PLUMBING": [
        "water leak", "leakage", "pipe", "drain", "drainage",
        "tap", "faucet", "toilet", "flush", "water supply",
        "water blockage", "sewage", "overflow", "plumber",
    ],
    "ELECTRICAL": [
        "electric", "electrical", "wiring", "wire", "socket",
        "switch", "power outage", "power cut", "short circuit",
        "sparks", "spark", "shock", "voltage", "fuse", "light",
    ],
    "CLEANING": [
        "garbage", "trash", "waste", "dirty", "cleaning",
        "unclean", "smell", "odor", "rubbish", "litter",
        "pest", "insects", "cockroach", "rat",
    ],
    "SECURITY": [
        "security", "stranger", "suspicious", "theft", "stolen",
        "intruder", "break-in", "break in", "unauthorized",
        "missing vehicle", "harassment", "gate",
    ],
    "LIFT": [
        "lift", "elevator", "stuck in lift", "elevator stuck",
        "lift not working", "lift stopped",
    ],
}

CRITICAL_KEYWORDS = [
    "fire", "smoke", "flames", "gas leak", "gas smell",
    "electrical shock", "someone trapped", "person trapped",
    "trapped in lift", "sparking wire", "exposed live wire",
]

HIGH_KEYWORDS = [
    "flooding", "heavy leakage", "major leak", "short circuit",
    "sparks", "electric shock", "break-in", "intruder",
    "lift stuck", "elevator stuck", "sewage overflow",
    "water near electrical", "burning smell",
]

MEDIUM_KEYWORDS = [
    "leak", "leakage", "not working", "blocked", "broken",
    "damaged", "overflow", "repair", "faulty", "clogged",
    "no water", "power outage",
]

ACTION_BY_CATEGORY = {
    "PLUMBING": "Inspect the water supply, pipes, and drainage.",
    "ELECTRICAL": "Arrange an electrical inspection by qualified staff.",
    "CLEANING": "Inspect the area and arrange cleaning or sanitation.",
    "SECURITY": "Notify security staff and verify the reported issue.",
    "LIFT": "Arrange a lift inspection by authorized maintenance staff.",
    "OTHER": "Review the complaint and determine the appropriate action.",
}


def _normalize(text):
    """Normalize text for simple keyword matching."""
    text = str(text or "").lower()
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9\s-]", " ", text)).strip()


def _contains_phrase(text, phrases):
    """Match phrases, including phrases with spaces."""
    padded_text = f" {text} "
    return [
        phrase for phrase in phrases
        if f" {phrase} " in padded_text
    ]


def classify_complaint(title, description, selected_category="OTHER"):
    """
    Return an explainable category and priority recommendation.

    This is a lightweight rule-based classifier, not a trained ML model.
    The resident's selected category is retained separately by the API.
    """
    text = _normalize(f"{title} {description}")
    selected_category = str(selected_category or "OTHER").upper()

    scores = {}
    matched_categories = {}

    for category, keywords in CATEGORY_KEYWORDS.items():
        matches = _contains_phrase(text, [_normalize(k) for k in keywords])
        if matches:
            scores[category] = len(matches)
            matched_categories[category] = matches

    if scores:
        # Stable tie-breaking keeps results predictable.
        predicted_category = sorted(
            scores,
            key=lambda category: (-scores[category], category)
        )[0]
        total_matches = sum(scores.values())
        confidence = round(scores[predicted_category] / total_matches, 2)
        category_reason = (
            "Matched keywords: "
            + ", ".join(matched_categories[predicted_category][:5])
        )
    elif selected_category in {
        "PLUMBING", "ELECTRICAL", "CLEANING",
        "SECURITY", "LIFT", "OTHER"
    } and selected_category != "OTHER":
        predicted_category = selected_category
        confidence = 0.4
        category_reason = (
            "No strong keyword match; using the resident-selected category "
            "as a fallback."
        )
    else:
        predicted_category = "OTHER"
        confidence = 0.3
        category_reason = "No clear category keywords were found."

    critical_matches = _contains_phrase(text, CRITICAL_KEYWORDS)
    high_matches = _contains_phrase(text, HIGH_KEYWORDS)
    medium_matches = _contains_phrase(text, MEDIUM_KEYWORDS)

    if critical_matches:
        priority = "Critical"
        priority_reason = (
            "Potential immediate safety hazard: "
            + ", ".join(critical_matches[:4])
        )
    elif high_matches:
        priority = "High"
        priority_reason = (
            "Potential urgent issue: " + ", ".join(high_matches[:4])
        )
    elif medium_matches:
        priority = "Medium"
        priority_reason = (
            "Repair or service issue detected: "
            + ", ".join(medium_matches[:4])
        )
    else:
        priority = "Low"
        priority_reason = (
            "No configured high-urgency keywords were detected. "
            "A human should still review the complaint."
        )

    reasons = [category_reason, priority_reason]

    if priority == "Critical":
        suggested_action = (
            "Escalate immediately to the responsible emergency or security "
            "team. Do not rely on this text classification alone."
        )
    elif priority == "High":
        suggested_action = (
            "Arrange prompt human review and prioritize an appropriate "
            "inspection."
        )
    else:
        suggested_action = ACTION_BY_CATEGORY[predicted_category]

    return {
        "predicted_category": predicted_category,
        "priority": priority,
        "confidence": confidence,
        "reasons": reasons,
        "suggested_action": suggested_action,
    }
