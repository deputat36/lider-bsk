from pathlib import Path

SQL = Path("supabase/staging-tests/20260730_lead_to_order_acceptance.sql").read_text()

required = (
    "project_ref = 'otulfnouybahfnsycxqn'",
    "leader_create_calculation_version_rpc",
    "leader_create_offer_from_calculation_rpc",
    "leader_create_order_from_offer_rpc",
    "order_idempotency_failed",
    "rollback;",
    "cleanup verified: zero residue",
)
missing = [marker for marker in required if marker not in SQL]
if missing:
    raise SystemExit(f"acceptance scenario markers missing: {missing}")
if "ofewxuqfjhamgerwzull" in SQL or "nav_" in SQL or "parket_" in SQL:
    raise SystemExit("acceptance scenario crosses an environment boundary")
print("staging lead-to-order acceptance contract: OK")
