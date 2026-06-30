#!/usr/bin/env python3
"""Validate RA Lider Supabase Edge Function source snapshots.

This script does not contact Supabase and has no side effects.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

FUNCTIONS = {
    "leader-public-lead": ROOT / "supabase" / "functions" / "leader-public-lead" / "index.ts",
    "leader-crm-leads": ROOT / "supabase" / "functions" / "leader-crm-leads" / "index.ts",
    "leader-crm-orders": ROOT / "supabase" / "functions" / "leader-crm-orders" / "index.ts",
}

REQUIRED_MARKERS = {
    "leader-public-lead": [
        "LEADER_PUBLIC_ALLOWED_ORIGINS",
        "leader_public_lead_audit",
        "request_id",
        "duplicate",
        "honeypot_filled",
        "phone_or_message_required",
        "leader_leads",
    ],
    "leader-crm-leads": [
        "leader_user_profiles",
        "ensure_profile",
        "create_order_from_offer",
        "leader_create_order_from_offer_rpc",
        "SUPABASE_SERVICE_ROLE_KEY",
        "access_denied",
    ],
    "leader-crm-orders": [
        "leader_user_profiles",
        "leader_orders",
        "layout_status",
        "production_status",
        "SUPABASE_SERVICE_ROLE_KEY",
        "access_denied",
    ],
}

FORBIDDEN_MARKERS = [
    "supabase_service_role_",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
    "password=",
    "postgres://",
]


def main() -> int:
    for name, path in FUNCTIONS.items():
        if not path.exists():
            print(f"Missing function source: {path.relative_to(ROOT)}")
            return 1
        text = path.read_text(encoding="utf-8")
        for marker in REQUIRED_MARKERS[name]:
            if marker not in text:
                print(f"Missing marker in {name}: {marker}")
                return 1
        lowered = text.lower()
        for marker in FORBIDDEN_MARKERS:
            if marker.lower() in lowered:
                print(f"Forbidden secret-like marker in {name}: {marker}")
                return 1
    print("RA Lider Edge Function source snapshots are valid.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
