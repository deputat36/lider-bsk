#!/usr/bin/env python3
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / 'supabase' / 'functions' / 'leader-crm-design' / 'index.ts'
CONTRACT = ROOT / 'supabase' / 'functions' / 'leader-crm-design' / 'contract.ts'
TEST = ROOT / 'supabase' / 'functions' / 'leader-crm-design' / 'contract_test.ts'
CONFIG = ROOT / 'supabase' / 'config.toml'
DOC = ROOT / 'docs' / 'SUPABASE_STAGING_DESIGN_EDGE_2026-07-13.md'
WORKFLOW = ROOT / '.github' / 'workflows' / 'crm-design-edge-check.yml'

STAGING = 'otulfnouybahfnsycxqn'
PRODUCTION = 'ofewxuqfjhamgerwzull'
errors = []


def read(path: Path, label: str) -> str:
    if not path.exists():
        errors.append(f'Missing {label}: {path.relative_to(ROOT)}')
        return ''
    return path.read_text(encoding='utf-8')


def require(text: str, markers, label: str):
    for marker in markers:
        if marker not in text:
            errors.append(f'{label}: missing marker {marker!r}')


index = read(INDEX, 'Edge index')
contract = read(CONTRACT, 'Edge contract')
test = read(TEST, 'Edge behavior test')
config = read(CONFIG, 'Supabase config')
doc = read(DOC, 'Edge staging document')
workflow = read(WORKFLOW, 'Edge workflow')

if PRODUCTION in index or PRODUCTION in contract or PRODUCTION in test:
    errors.append('Design Edge source must remain locked only to staging')
if STAGING not in contract:
    errors.append('Design Edge contract must contain exact staging project ref')

require(index, [
    "import 'jsr:@supabase/functions-js/edge-runtime.d.ts'",
    "if (projectRef !== STAGING_PROJECT_REF)",
    "error: 'wrong_environment'",
    "if (req.method !== 'POST')",
    "contentLength > 64 * 1024",
    '/auth/v1/user',
    'leader_user_profiles?user_id=eq.',
    '&is_active=eq.true',
    'if (!canWriteDesign(profileResult.profile.role))',
    "permission: 'design.write'",
    'validateDesignRequest(input)',
    '/rest/v1/rpc/leader_create_design_task_from_order_rpc',
    'actor_id: checked.user.id',
    'actor_email: checked.user.email',
    'request: validation.request',
    "error: { code: 'persistence_failed'",
    "result.idempotent_replay === true ? 200 : 201",
], 'Edge index')

for forbidden in (
    '/rest/v1/leader_design_tasks',
    '/rest/v1/leader_design_task_events',
    '/rest/v1/leader_command_receipts',
    "method: 'PATCH'",
    "method: 'DELETE'",
    'details: await',
):
    if forbidden in index:
        errors.append(f'Edge index contains forbidden direct-write/detail marker {forbidden!r}')

require(contract, [
    "DESIGN_ACTION = 'design_task.create_from_order'",
    "DESIGN_PERMISSION = 'design.write'",
    "'owner'", "'admin'", "'manager'", "'designer'",
    "'action'", "'request_id'", "'expected_updated_at'", "'payload'",
    "'order_id'", "'production_job_id'", "'idempotency_key'", "'need_ids'", "'task'",
    "'title'", "'priority'", "'deadline'", "'task_text'", "'reference_link'",
    'Task contains unknown or server-owned fields',
    'need_ids must be unique',
    "case 'duplicate_request':",
], 'Edge contract')

allowed_block = re.search(r'DESIGN_WRITE_ROLES\s*=.*?\]\)\)', contract, re.S)
if not allowed_block:
    errors.append('Canonical design-write allow set was not found')
elif any(role in allowed_block.group(0) for role in ("'production'", "'accountant'", "'installer'", "'contractor'")):
    errors.append('Non-canonical role entered the design-write allow set')

require(test, [
    'canonical design-write roles are allowed',
    "['owner', 'admin', 'manager', 'designer']",
    "['accountant', 'installer', 'contractor', 'production', '', 'unknown']",
    'server-owned fields are rejected',
    'browser actor must be rejected',
    'finance field must be rejected',
    'duplicate needs accepted',
    'RPC error codes map to stable HTTP statuses',
], 'Edge behavior test')

if f'project_id = "{PRODUCTION}"' not in config:
    errors.append('Standard Supabase config must keep production project id')
if '[functions.leader-crm-design]' not in config or 'verify_jwt = true' not in config:
    errors.append('leader-crm-design must require verify_jwt=true')

require(doc, [STAGING, PRODUCTION, 'verify_jwt=true', 'wrong_environment', 'design.write', 'service_role', 'production deploy'], 'Edge document')
require(workflow, ['denoland/setup-deno@v2', 'deno check', 'deno test', 'check_crm_design_edge.py'], 'Edge workflow')

for label, text in [('index', index), ('contract', contract), ('test', test), ('doc', doc), ('workflow', workflow)]:
    if re.search(r'sb_secret_[A-Za-z0-9_-]{10,}', text) or re.search(r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}', text):
        errors.append(f'{label} contains possible secret material')

if errors:
    print('CRM design Edge checks failed:', file=sys.stderr)
    for error in errors:
        print(f'- {error}', file=sys.stderr)
    raise SystemExit(1)

print('CRM design Edge is staging-locked, JWT-protected and RPC-only.')
