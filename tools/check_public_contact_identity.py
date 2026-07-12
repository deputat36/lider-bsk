#!/usr/bin/env python3
"""Validate published contact identity and guard unconfirmed NAP fields.

Phone and email are current technical source-of-truth values. Exact address,
opening hours, geo coordinates, map identity and social profiles remain pending
owner confirmation in issue #236 and must not enter public JSON-LD yet.
"""
from pathlib import Path
import json
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
PHONE_HREF = "tel:+79802457471"
PHONE_JSON = "+79802457471"
PHONE_DIGITS = "79802457471"
PHONE_VISIBLE = "8 980 245-74-71"
EMAIL = "zakaz@lider-bsk.ru"

TEL_RE = re.compile(r'href=["\'](tel:[^"\']+)["\']', re.IGNORECASE)
MAILTO_RE = re.compile(r'href=["\']mailto:([^"\'?]+)', re.IGNORECASE)
JSON_PHONE_RE = re.compile(r'"telephone"\s*:\s*"([^"]+)"', re.IGNORECASE)
JSON_EMAIL_RE = re.compile(r'"email"\s*:\s*"([^"]+)"', re.IGNORECASE)
JSON_LD_RE = re.compile(
    r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>',
    re.IGNORECASE | re.DOTALL,
)
UNCONFIRMED_NAP_KEYS = (
    "streetAddress",
    "postalCode",
    "openingHours",
    "openingHoursSpecification",
    "geo",
    "latitude",
    "longitude",
    "sameAs",
    "hasMap",
)


def compact(value: str, limit: int = 180) -> str:
    value = " ".join(value.split())
    return value if len(value) <= limit else value[: limit - 1] + "…"


def normalize_phone(value: str) -> str:
    """Return one canonical Russian phone digit sequence for comparison."""
    digits = re.sub(r"\D+", "", value)
    if len(digits) == 10:
        digits = "7" + digits
    elif len(digits) == 11 and digits.startswith("8"):
        digits = "7" + digits[1:]
    return digits


def find_unconfirmed_json_keys(value: str) -> list[str]:
    found: list[str] = []
    for key in UNCONFIRMED_NAP_KEYS:
        if re.search(rf'"{re.escape(key)}"\s*:', value, re.IGNORECASE):
            found.append(key)
    return found


def main() -> int:
    pages = sorted(ROOT.glob("*.html"))
    if not pages:
        raise SystemExit("No root public HTML files found")

    errors: list[str] = []
    pages_with_tel = 0
    pages_with_email = 0

    for path in pages:
        text = path.read_text(encoding="utf-8")

        tel_values = TEL_RE.findall(text)
        if tel_values:
            pages_with_tel += 1
        for value in tel_values:
            if value != PHONE_HREF:
                errors.append(f"{path.name}: stale or malformed telephone href: {value!r}")

        mail_values = MAILTO_RE.findall(text)
        if mail_values:
            pages_with_email += 1
        for value in mail_values:
            if value.casefold() != EMAIL:
                errors.append(f"{path.name}: stale or malformed email href: {value!r}")

        for value in JSON_PHONE_RE.findall(text):
            if normalize_phone(value) != PHONE_DIGITS:
                errors.append(f"{path.name}: LocalBusiness telephone differs: {value!r}")

        for value in JSON_EMAIL_RE.findall(text):
            if value.casefold() != EMAIL:
                errors.append(f"{path.name}: LocalBusiness email differs: {value!r}")

        for block in JSON_LD_RE.findall(text):
            for key in find_unconfirmed_json_keys(block):
                errors.append(
                    f"{path.name}: unconfirmed NAP key {key!r} is present in public JSON-LD"
                )

    structured_path = ROOT / "tools" / "structured_data_pages.json"
    try:
        structured_data = json.loads(structured_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        errors.append(f"Cannot read structured data source: {exc}")
        structured_data = {}

    business = structured_data.get("business", {}) if isinstance(structured_data, dict) else {}
    if not isinstance(business, dict):
        errors.append("tools/structured_data_pages.json: business must be an object")
    else:
        for key in UNCONFIRMED_NAP_KEYS:
            if key in business:
                errors.append(
                    f"tools/structured_data_pages.json: unconfirmed business key {key!r}"
                )
        address = business.get("address", {})
        if isinstance(address, dict):
            for key in ("streetAddress", "postalCode"):
                if key in address:
                    errors.append(
                        f"tools/structured_data_pages.json: unconfirmed address key {key!r}"
                    )

    required_markers = {
        ROOT / "kontakty.html": (PHONE_HREF, PHONE_VISIBLE, f"mailto:{EMAIL}", EMAIL),
        ROOT / "privacy.html": (PHONE_HREF, PHONE_VISIBLE, f"mailto:{EMAIL}", EMAIL),
        ROOT / "assets" / "public-lead-form.js": (PHONE_HREF, PHONE_VISIBLE),
        structured_path: (PHONE_JSON, EMAIL),
    }
    for path, markers in required_markers.items():
        if not path.is_file():
            errors.append(f"Missing contact source file: {path.relative_to(ROOT)}")
            continue
        text = path.read_text(encoding="utf-8")
        for marker in markers:
            if marker not in text:
                errors.append(
                    f"{path.relative_to(ROOT)}: missing current contact marker {compact(marker)!r}"
                )

    if pages_with_tel == 0:
        errors.append("No public HTML page contains a telephone link")
    if pages_with_email == 0:
        errors.append("No public HTML page contains an email link")

    if errors:
        print("\n".join(errors))
        return 1

    print(
        "Public contact identity and pending NAP guard are valid: "
        f"{len(pages)} root HTML checked, tel links on {pages_with_tel} pages, "
        f"email links on {pages_with_email} pages."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
