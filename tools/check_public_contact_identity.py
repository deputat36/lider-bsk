#!/usr/bin/env python3
"""Validate the current published phone and email across public-site sources.

This check intentionally does not validate address, opening hours, map links or
messengers because those facts remain pending owner confirmation in issue #236.
"""
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
PHONE_HREF = "tel:+79802457471"
PHONE_JSON = "+79802457471"
PHONE_VISIBLE = "8 980 245-74-71"
EMAIL = "zakaz@lider-bsk.ru"

TEL_RE = re.compile(r'href=["\'](tel:[^"\']+)["\']', re.IGNORECASE)
MAILTO_RE = re.compile(r'href=["\']mailto:([^"\'?]+)', re.IGNORECASE)
JSON_PHONE_RE = re.compile(r'"telephone"\s*:\s*"([^"]+)"', re.IGNORECASE)
JSON_EMAIL_RE = re.compile(r'"email"\s*:\s*"([^"]+)"', re.IGNORECASE)


def compact(value: str, limit: int = 180) -> str:
    value = " ".join(value.split())
    return value if len(value) <= limit else value[: limit - 1] + "…"


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
            if value != PHONE_JSON:
                errors.append(f"{path.name}: LocalBusiness telephone differs: {value!r}")

        for value in JSON_EMAIL_RE.findall(text):
            if value.casefold() != EMAIL:
                errors.append(f"{path.name}: LocalBusiness email differs: {value!r}")

    required_markers = {
        ROOT / "kontakty.html": (PHONE_HREF, PHONE_VISIBLE, f"mailto:{EMAIL}", EMAIL),
        ROOT / "privacy.html": (PHONE_HREF, PHONE_VISIBLE, f"mailto:{EMAIL}", EMAIL),
        ROOT / "assets" / "public-lead-form.js": (PHONE_HREF, PHONE_VISIBLE),
        ROOT / "tools" / "structured_data_pages.json": (PHONE_JSON, EMAIL),
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
        "Public contact identity is consistent: "
        f"{len(pages)} root HTML checked, tel links on {pages_with_tel} pages, "
        f"email links on {pages_with_email} pages."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
