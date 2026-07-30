from pathlib import Path

acceptance = Path("supabase/staging-tests/20260730_lead_to_order_acceptance.sql").read_text()
preflight = Path("supabase/staging-tests/20260730_lead_to_order_schema_preflight.sql").read_text()
compat = Path("supabase/staging-migrations/20260730_01_lead_to_order_acceptance_compat.sql").read_text()
canonical_rpc = Path("supabase/migrations/20260626_06_leader_order_from_offer_rpc.sql").read_text().strip()

required = (
    "project_ref = 'otulfnouybahfnsycxqn'",
    "leader_create_calculation_version_rpc",
    "leader_create_offer_from_calculation_rpc",
    "leader_create_order_from_offer_rpc",
    "order_idempotency_failed",
    "rollback;",
    "cleanup verified: zero residue",
)
missing = [marker for marker in required if marker not in acceptance]
if missing:
    raise SystemExit(f"acceptance scenario markers missing: {missing}")
for name, sql in (("acceptance", acceptance), ("preflight", preflight), ("compatibility migration", compat)):
    if "ofewxuqfjhamgerwzull" in sql or "nav_" in sql or "parket_" in sql:
        raise SystemExit(f"{name} crosses an environment boundary")
    if "project_ref = 'otulfnouybahfnsycxqn'" not in sql:
        raise SystemExit(f"{name} has no staging environment guard")

catalog_markers = (
    "information_schema.columns",
    "'leader_clients','leader_lead_needs'",
    "'leader_order_items','leader_order_status_history'",
    "to_regclass('public.' || name)",
    "to_regprocedure(signature)",
)
missing = [marker for marker in catalog_markers if marker not in preflight]
if missing:
    raise SystemExit(f"schema preflight catalog checks missing: {missing}")
if canonical_rpc not in compat:
    raise SystemExit("staging compatibility RPC differs from the canonical main migration")
print("staging lead-to-order acceptance contract: OK")
