#!/usr/bin/env python3
"""Validate CRM calculation builder v2 documentation markers.

This script has no network access and no side effects.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOC = ROOT / "docs" / "CRM_CALCULATION_BUILDER_V2_2026-07-01.md"

REQUIRED_MARKERS = [
    "CRM calculation builder v2 — 2026-07-01",
    "Tracking issue: #143",
    "A calculation consists of client-facing positions",
    "Standard item",
    "Catalog item",
    "Contractor quote",
    "Manual position",
    "Composite item",
    "single_line",
    "detailed",
    "internal_only",
    "leader_lead_calculations",
    "leader_lead_calculation_items",
    "leader_catalog",
    "leader_contractors",
    "never show `contractor_price`, `contractor_sum`, profit or margin",
    "Do not change Supabase production schema or deploy Edge Functions without explicit owner approval",
]


def main() -> int:
    if not DOC.exists():
        print(f"Missing file: {DOC.relative_to(ROOT)}")
        return 1
    text = DOC.read_text(encoding="utf-8")
    for marker in REQUIRED_MARKERS:
        if marker not in text:
            print(f"Missing marker: {marker}")
            return 1
    print("CRM calculation builder v2 documentation markers are valid.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
