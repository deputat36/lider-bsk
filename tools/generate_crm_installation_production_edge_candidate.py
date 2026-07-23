#!/usr/bin/env python3

import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX_SOURCE = ROOT / "supabase/staging-functions/leader-crm-installation/index.ts"
CONTRACT_SOURCE = ROOT / "supabase/staging-functions/leader-crm-installation/contract.ts"

INDEX_SOURCE_BLOB_SHA = "a603fc11db7dc66435c6fea4c3547775d79feac9"
CONTRACT_SOURCE_BLOB_SHA = "940c39edac833417aa1727ca04badd52fb5a415c"
STAGING_PROJECT_REF = "otulfnouybahfnsycxqn"
PRODUCTION_PROJECT_REF = "ofewxuqfjhamgerwzull"
FUNCTION_SLUG = "leader-crm-installation"


def git_blob_sha(data: bytes) -> str:
    header = f"blob {len(data)}\0".encode("ascii")
    return hashlib.sha1(header + data).hexdigest()


def sha256_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def read_verified(path: Path, expected_blob_sha: str) -> str:
    data = path.read_bytes()
    actual = git_blob_sha(data)
    if actual != expected_blob_sha:
        raise SystemExit(
            f"Source drift: {path.relative_to(ROOT)} has Git blob {actual}, expected {expected_blob_sha}"
        )
    return data.decode("utf-8")


def transform_contract(source: str) -> str:
    expected = f"export const STAGING_PROJECT_REF = '{STAGING_PROJECT_REF}'"
    replacement = f"export const PRODUCTION_PROJECT_REF = '{PRODUCTION_PROJECT_REF}'"
    if source.count(expected) != 1:
        raise SystemExit("contract.ts staging project constant drifted")
    output = source.replace(expected, replacement)
    if STAGING_PROJECT_REF in output or "STAGING_PROJECT_REF" in output:
        raise SystemExit("contract.ts production output still contains staging identity")
    if output.count(PRODUCTION_PROJECT_REF) != 1 or output.count("PRODUCTION_PROJECT_REF") != 1:
        raise SystemExit("contract.ts production identity replacement is not exact")
    return output


def transform_index(source: str) -> str:
    if source.count("STAGING_PROJECT_REF") != 2:
        raise SystemExit("index.ts STAGING_PROJECT_REF usage count drifted")
    if source.count("expected: 'staging'") != 1:
        raise SystemExit("index.ts expected environment marker drifted")

    output = source.replace("STAGING_PROJECT_REF", "PRODUCTION_PROJECT_REF")
    output = output.replace("expected: 'staging'", "expected: 'production'")

    if "STAGING_PROJECT_REF" in output or "expected: 'staging'" in output:
        raise SystemExit("index.ts production output still contains staging environment marker")
    if output.count("PRODUCTION_PROJECT_REF") != 2:
        raise SystemExit("index.ts production project constant usage count is not exact")
    if output.count("expected: 'production'") != 1:
        raise SystemExit("index.ts production environment marker count is not exact")
    return output


def deployment_manifest(index_output: str, contract_output: str) -> dict:
    return {
        "contract": "crm-installation-production-edge-deploy-candidate",
        "version": 1,
        "captured_at": "2026-07-23",
        "repository": "deputat36/lider-bsk",
        "status": "source_only_not_deployed",
        "target": {
            "project_ref": PRODUCTION_PROJECT_REF,
            "function_slug": FUNCTION_SLUG,
            "verify_jwt": True,
            "entrypoint_path": "index.ts",
            "files": ["index.ts", "contract.ts"],
        },
        "source": {
            "index": {
                "path": str(INDEX_SOURCE.relative_to(ROOT)),
                "git_blob_sha": INDEX_SOURCE_BLOB_SHA,
            },
            "contract": {
                "path": str(CONTRACT_SOURCE.relative_to(ROOT)),
                "git_blob_sha": CONTRACT_SOURCE_BLOB_SHA,
            },
        },
        "generated": {
            "index_sha256": sha256_text(index_output),
            "contract_sha256": sha256_text(contract_output),
            "environment_only_transform": True,
            "business_logic_changed": False,
        },
        "actions": {
            "installation_job.read": "installation.read",
            "installation_job.update": "installation.write",
        },
        "database_dependencies": [
            "leader_private.leader_role_action_matrix_v1",
            "leader_private.leader_command_receipts",
            "leader_private.leader_actor_has_crm_action(uuid,text)",
            "public.leader_actor_has_crm_action_rpc(uuid,text)",
            "public.leader_read_installation_job_rpc(uuid,uuid)",
            "public.leader_update_installation_job_rpc(jsonb)",
        ],
        "security": {
            "jwt_required": True,
            "auth_user_lookup": True,
            "canonical_permission_check": True,
            "service_role_in_browser": False,
            "browser_supplied_role": False,
            "post_only": True,
            "payload_limit_bytes": 65536,
            "wrong_environment_fail_closed": True,
        },
        "approval_gates": {
            "production_database_apply": True,
            "production_edge_deploy": True,
            "production_frontend_switch": True,
            "production_browser_smoke": True,
            "edge_deploy_approved": False,
        },
        "production_boundary": {
            "database_changed": False,
            "edge_deployed": False,
            "frontend_switched": False,
            "auth_changed": False,
            "data_changed": False,
            "nav_changed": False,
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output-dir",
        default="build/installation-production-edge-candidate/leader-crm-installation",
        help="Output directory relative to repository root or an absolute path",
    )
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    if not output_dir.is_absolute():
        output_dir = ROOT / output_dir
    output_dir.mkdir(parents=True, exist_ok=True)

    index_source = read_verified(INDEX_SOURCE, INDEX_SOURCE_BLOB_SHA)
    contract_source = read_verified(CONTRACT_SOURCE, CONTRACT_SOURCE_BLOB_SHA)
    index_output = transform_index(index_source)
    contract_output = transform_contract(contract_source)

    index_path = output_dir / "index.ts"
    contract_path = output_dir / "contract.ts"
    manifest_path = output_dir / "deploy-manifest.json"

    index_path.write_text(index_output, encoding="utf-8")
    contract_path.write_text(contract_output, encoding="utf-8")
    manifest_path.write_text(
        json.dumps(deployment_manifest(index_output, contract_output), ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    for path in [index_path, contract_path, manifest_path]:
        print(path.relative_to(ROOT) if path.is_relative_to(ROOT) else path)


if __name__ == "__main__":
    main()
