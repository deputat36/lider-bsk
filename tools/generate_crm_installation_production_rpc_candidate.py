#!/usr/bin/env python3

import argparse
import hashlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
READ_SOURCE = ROOT / "supabase/staging-migrations/20260722_06_installation_read_rpc_main_reconcile.sql"
UPDATE_SOURCE = ROOT / "supabase/staging-migrations/20260721_06_installation_job_update_rpc.sql"

READ_SOURCE_BLOB_SHA = "f001cec60245f1f48b8a0b71b8651fa84c6c4a6a"
UPDATE_SOURCE_BLOB_SHA = "700728bbead1fb9270390aafb50cfe26816767cd"

READ_MARKER = "create or replace function public.leader_read_installation_job_rpc("
UPDATE_MARKER = "create or replace function leader_private.leader_installation_command_error("

COMMON_REQUIRED_COLUMNS = {
    "leader_user_profiles": ["user_id", "role", "is_active"],
    "leader_orders": [
        "id", "order_number", "project_name", "status", "installation_status", "layout_link",
        "installation_address", "installation_scheduled_at", "installation_completed_at",
        "installer_name", "installer_phone", "current_stage", "stage_updated_at", "updated_at"
    ],
    "leader_production_jobs": [
        "id", "title", "production_status", "layout_status", "priority", "deadline", "ready_at",
        "file_url", "technical_task", "updated_at"
    ],
    "leader_installation_jobs": [
        "id", "order_id", "production_job_id", "title", "install_status", "priority",
        "installer_name", "installer_phone", "address", "scheduled_at", "started_at",
        "completed_at", "accepted_at", "technical_task", "tools_required", "installer_comment",
        "result_comment", "before_photo_url", "after_photo_url", "created_at", "created_by",
        "updated_at", "updated_by"
    ],
    "leader_installation_job_items": [
        "id", "job_id", "name", "unit", "qty", "width", "height", "comment", "created_at"
    ],
    "leader_installation_events": [
        "id", "job_id", "order_id", "event_type", "old_status", "new_status", "body",
        "created_by", "created_at"
    ],
    "leader_installation_comments": [
        "id", "job_id", "comment_type", "body", "created_at"
    ],
}


def git_blob_sha(data: bytes) -> str:
    header = f"blob {len(data)}\0".encode("ascii")
    return hashlib.sha1(header + data).hexdigest()


def read_verified(path: Path, expected_blob_sha: str) -> str:
    data = path.read_bytes()
    actual = git_blob_sha(data)
    if actual != expected_blob_sha:
        raise SystemExit(
            f"Source drift: {path.relative_to(ROOT)} has Git blob {actual}, expected {expected_blob_sha}"
        )
    return data.decode("utf-8")


def body_from_marker(source: str, marker: str, label: str) -> str:
    index = source.find(marker)
    if index < 0:
        raise SystemExit(f"{label} marker not found")
    body = source[index:].strip() + "\n"
    if "otulfnouybahfnsycxqn" in body or "leader_staging.environment_guard" in body:
        raise SystemExit(f"{label} body still contains staging guard")
    return body


def required_columns_values() -> str:
    rows = []
    for table_name, columns in COMMON_REQUIRED_COLUMNS.items():
        for column_name in columns:
            rows.append(f"      ('{table_name}', '{column_name}')")
    return ",\n".join(rows)


def common_preflight(target_signature: str, require_read_rpc: bool) -> str:
    dependency_clause = ""
    if require_read_rpc:
        dependency_clause = """
  if to_regprocedure('public.leader_read_installation_job_rpc(uuid,uuid)') is null then
    raise exception 'installation_read_rpc_dependency_missing';
  end if;
"""

    return f"""begin;

do $production_preflight$
declare
  v_missing_columns text[];
begin
  if to_regclass('leader_staging.environment_guard') is not null then
    raise exception 'production_rpc_candidate_rejected_on_staging';
  end if;

  if to_regclass('leader_private.leader_role_action_matrix_v1') is null
     or to_regclass('leader_private.leader_command_receipts') is null
     or to_regprocedure('leader_private.leader_actor_has_crm_action(uuid,text)') is null
     or to_regprocedure('public.leader_actor_has_crm_action_rpc(uuid,text)') is null then
    raise exception 'production_rbac_receipts_dependency_missing';
  end if;

  if to_regprocedure('{target_signature}') is not null then
    raise exception 'production_rpc_already_present: {target_signature}';
  end if;
{dependency_clause}
  select array_agg(required.table_name || '.' || required.column_name order by required.table_name, required.column_name)
  into v_missing_columns
  from (
    values
{required_columns_values()}
  ) as required(table_name, column_name)
  where not exists (
    select 1
    from information_schema.columns as column_info
    where column_info.table_schema = 'public'
      and column_info.table_name = required.table_name
      and column_info.column_name = required.column_name
  );

  if coalesce(cardinality(v_missing_columns), 0) > 0 then
    raise exception 'production_installation_columns_missing: %', array_to_string(v_missing_columns, ', ');
  end if;
end
$production_preflight$;

"""


def generated_header(label: str, source_path: Path, source_blob_sha: str) -> str:
    return f"""-- GENERATED SOURCE-ONLY PRODUCTION CANDIDATE.
-- Target project: lider-bsk production / ofewxuqfjhamgerwzull.
-- Candidate: {label}.
-- Source: {source_path.relative_to(ROOT)}.
-- Source Git blob SHA: {source_blob_sha}.
-- DO NOT APPLY without an explicit production database approval.
-- Generated by tools/generate_crm_installation_production_rpc_candidate.py.

"""


def build_read_candidate(source: str) -> str:
    body = body_from_marker(source, READ_MARKER, "read RPC")
    return (
        generated_header("installation read RPC", READ_SOURCE, READ_SOURCE_BLOB_SHA)
        + common_preflight("public.leader_read_installation_job_rpc(uuid,uuid)", False)
        + body
        + "\ncommit;\n"
    )


def build_update_candidate(source: str) -> str:
    body = body_from_marker(source, UPDATE_MARKER, "update RPC")
    digest_guard = """do $digest_preflight$
begin
  if to_regprocedure('extensions.digest(bytea,text)') is null then
    raise exception 'extensions_digest_dependency_missing';
  end if;
end
$digest_preflight$;

"""
    return (
        generated_header("installation update RPC", UPDATE_SOURCE, UPDATE_SOURCE_BLOB_SHA)
        + common_preflight("public.leader_update_installation_job_rpc(jsonb)", True)
        + digest_guard
        + body
        + "\ncommit;\n"
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output-dir",
        default="build/installation-production-rpc-candidate",
        help="Output directory relative to repository root or an absolute path",
    )
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    if not output_dir.is_absolute():
        output_dir = ROOT / output_dir
    output_dir.mkdir(parents=True, exist_ok=True)

    read_source = read_verified(READ_SOURCE, READ_SOURCE_BLOB_SHA)
    update_source = read_verified(UPDATE_SOURCE, UPDATE_SOURCE_BLOB_SHA)

    read_output = output_dir / "20260723_02_installation_read_rpc_candidate.sql"
    update_output = output_dir / "20260723_03_installation_update_rpc_candidate.sql"
    read_output.write_text(build_read_candidate(read_source), encoding="utf-8")
    update_output.write_text(build_update_candidate(update_source), encoding="utf-8")

    print(read_output.relative_to(ROOT) if read_output.is_relative_to(ROOT) else read_output)
    print(update_output.relative_to(ROOT) if update_output.is_relative_to(ROOT) else update_output)


if __name__ == "__main__":
    main()
