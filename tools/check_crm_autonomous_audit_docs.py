#!/usr/bin/env python3
"""Validate CRM autonomous audit documentation markers.

This script is intentionally local and side-effect free.
It reads repository files and exits with a non-zero code if a required marker is missing.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

FILES = {
    "audit": ROOT / "docs" / "CRM_AUTONOMOUS_AUDIT_2026-06-30.md",
    "role_matrix": ROOT / "docs" / "CRM_SERVER_ROLE_MATRIX_2026-06-30.md",
    "request_chain": ROOT / "docs" / "CRM_PUBLIC_REQUEST_CHAIN_CHECK_2026-06-30.md",
}

MARKERS = {
    "audit": [
        "CRM autonomous audit checkpoint — 2026-06-30",
        "Supabase project: `ofewxuqfjhamgerwzull`",
        "leader-public-lead",
        "version `9`",
        "leader-crm-leads",
        "version `12`",
        "leader-crm-orders",
        "version `2`",
        "SECURITY DEFINER",
        "manual end-to-end request testing is still required",
        "No production Supabase changes were made",
    ],
    "role_matrix": [
        "CRM server role matrix plan — 2026-06-30",
        "owner",
        "admin",
        "manager",
        "designer",
        "production",
        "installer",
        "The browser must never be the only place where role permissions are enforced",
        "leader-crm-leads",
        "leader-crm-orders",
        "Not implemented in this PR",
    ],
    "request_chain": [
        "CRM public request chain checklist — 2026-06-30",
        "site form → leader-public-lead → leader_leads → leader_public_lead_audit → CRM audit → leader_request_trace",
        "Номер обращения",
        "Цепочка полная",
        "duplicate",
        "suspicious",
        "rejected",
        "Supabase production was not changed",
    ],
}


def main() -> int:
    for key, path in FILES.items():
        if not path.exists():
            print(f"Missing file: {path.relative_to(ROOT)}")
            return 1
        text = path.read_text(encoding="utf-8")
        for marker in MARKERS[key]:
            if marker not in text:
                print(f"Missing marker in {path.relative_to(ROOT)}: {marker}")
                return 1
    print("CRM autonomous audit docs markers are valid.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
