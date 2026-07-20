#!/usr/bin/env python3
"""Validate the public lead health view migration contract."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase" / "migrations" / "20260720203000_leader_public_lead_health_view_v1.sql"


def require(text: str, marker: str) -> None:
    if marker not in text:
        raise AssertionError(f"missing marker: {marker}")


def main() -> int:
    if not MIGRATION.is_file():
        raise AssertionError("public lead health migration is missing")

    sql = MIGRATION.read_text(encoding="utf-8")
    require(sql, "create or replace view public.leader_public_lead_health_v1")
    require(sql, "security_invoker = true")
    require(sql, "from public.leader_public_lead_audit")
    require(sql, "accepted_rate_percent")
    require(sql, "revoke all on public.leader_public_lead_health_v1 from anon")
    require(sql, "grant select on public.leader_public_lead_health_v1 to authenticated")

    lowered = sql.lower()
    if "phone_normalized" in lowered or "page_url" in lowered or "user_agent" in lowered:
        raise AssertionError("health view must remain aggregated and contain no lead-level identifiers")

    print("public lead health view contract OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
