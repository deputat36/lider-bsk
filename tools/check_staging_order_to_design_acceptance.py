from pathlib import Path

sql = Path("supabase/staging-tests/20260731_order_to_design_acceptance.sql").read_text(encoding="utf-8")
doc = Path("docs/CRM_STAGING_ORDER_TO_DESIGN_ACCEPTANCE_2026-07-31.md").read_text(encoding="utf-8")
workflow = Path(".github/workflows/staging-order-to-design-acceptance-check.yml").read_text(encoding="utf-8")

required_sql = (
    "project_ref='otulfnouybahfnsycxqn'",
    "design_task.create_from_order",
    "leader_create_design_task_from_order_rpc",
    "design_idempotent_replay_failed",
    "design_idempotency_conflict_failed",
    "active_design_task_conflict_failed",
    "design_task_reopen_failed",
    "rollback;",
    "order-to-design acceptance: OK; cleanup verified: zero residue",
)
missing = [marker for marker in required_sql if marker not in sql]
if missing:
    raise SystemExit(f"order-to-design acceptance markers missing: {missing}")

for name, text in (("sql", sql), ("doc", doc), ("workflow", workflow)):
    lowered = text.lower()
    for forbidden in ("ofewxuqfjhamgerwzull", "nav_", "parket_"):
        if forbidden.lower() in lowered:
            raise SystemExit(f"{name} crosses environment boundary: {forbidden}")

if "begin;" not in sql.lower() or "rollback;" not in sql.lower():
    raise SystemExit("acceptance must be transactional")
if "create table" in sql.lower() or "alter table" in sql.lower() or "drop table" in sql.lower():
    raise SystemExit("acceptance must not contain DDL")
if "Runtime result" not in doc or "zero residue" not in doc:
    raise SystemExit("runtime evidence missing from documentation")
if "python3 tools/check_staging_order_to_design_acceptance.py" not in workflow:
    raise SystemExit("workflow does not run the checker")

print("staging order-to-design acceptance contract: OK")
