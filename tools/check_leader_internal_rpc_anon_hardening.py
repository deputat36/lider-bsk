#!/usr/bin/env python3
"""Validate the anonymous RPC hardening migration and rollback contract."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase/migrations/20260721123000_revoke_anon_execute_leader_internal_rpcs.sql"
ROLLBACK = ROOT / "docs/ROLLBACK_REVOKE_ANON_LEADER_INTERNAL_RPCS_2026-07-21.sql"
DOC = ROOT / "docs/LEADER_INTERNAL_RPC_ANON_HARDENING_2026-07-21.md"
WORKFLOW = ROOT / ".github/workflows/leader-internal-rpc-anon-hardening-check.yml"

FUNCTIONS = (
    "leader_add_status_history",
    "leader_create_task",
    "leader_dashboard_metrics",
    "leader_normalize_invite_email",
)


def require(text: str, marker: str, label: str) -> None:
    if marker not in text:
        raise AssertionError(f"{label}: missing marker {marker!r}")


def main() -> int:
    for path in (MIGRATION, ROLLBACK, DOC, WORKFLOW):
        if not path.is_file():
            raise AssertionError(f"missing file: {path.relative_to(ROOT)}")

    migration = MIGRATION.read_text(encoding="utf-8")
    rollback = ROLLBACK.read_text(encoding="utf-8")
    doc = DOC.read_text(encoding="utf-8")
    workflow = WORKFLOW.read_text(encoding="utf-8")

    require(migration, "begin;", "migration transaction")
    require(migration, "commit;", "migration transaction")
    require(migration, "from public;", "PUBLIC trigger-function revoke")
    require(migration, "has_function_privilege('anon'", "migration postflight")
    require(migration, "has_function_privilege('authenticated'", "authenticated preservation")

    for function_name in FUNCTIONS:
        require(migration, function_name, "migration function inventory")
        require(rollback, function_name, "rollback function inventory")
        require(doc, function_name, "documentation function inventory")

    if "grant execute" in migration.lower():
        raise AssertionError("migration must not widen EXECUTE grants")

    require(rollback, "grant execute", "rollback grants")
    require(rollback, "to public;", "rollback PUBLIC restoration")
    require(doc, "Production Supabase", "production safety note")
    require(workflow, "python3 tools/check_leader_internal_rpc_anon_hardening.py", "workflow command")

    print("leader internal RPC anon hardening contract OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
