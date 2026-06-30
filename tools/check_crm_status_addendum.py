#!/usr/bin/env python3
"""Validate the 2026-06-30 CRM status addendum markers."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOC = ROOT / "docs" / "CRM_STATUS_ADDENDUM_2026-06-30.md"

MARKERS = [
    "CRM status addendum — 2026-06-30",
    "PR #135 — CRM autonomous audit checkpoint",
    "PR #136 — Document Supabase Edge Function sources",
    "PR #137 — Prepare CRM order Edge Function role matrix",
    "Issue #139 — CRM: добавить серверную матрицу ролей в leader-crm-leads",
    "leader-public-lead v9",
    "leader-crm-leads v12",
    "leader-crm-orders v2",
    "No Supabase production mutation was performed",
    "Do not deploy Edge Functions from GitHub source to Supabase production without explicit owner approval",
]


def main() -> int:
    if not DOC.exists():
        print(f"Missing file: {DOC.relative_to(ROOT)}")
        return 1
    text = DOC.read_text(encoding="utf-8")
    for marker in MARKERS:
        if marker not in text:
            print(f"Missing marker: {marker}")
            return 1
    print("CRM status addendum markers are valid.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
