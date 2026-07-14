#!/usr/bin/env python3
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / 'docs' / 'SUPABASE_STAGING_DESIGN_EDGE_DEPLOYMENT_2026-07-13.md'
EDGE_DOC = ROOT / 'docs' / 'SUPABASE_STAGING_DESIGN_EDGE_2026-07-13.md'
INDEX = ROOT / 'supabase' / 'functions' / 'leader-crm-design' / 'index.ts'
CONTRACT = ROOT / 'supabase' / 'functions' / 'leader-crm-design' / 'contract.ts'
ENV = ROOT / 'contracts' / 'supabase-environments-v1.json'
WORKFLOW = ROOT / '.github' / 'workflows' / 'crm-design-edge-check.yml'

PRODUCTION = 'ofewxuqfjhamgerwzull'
STAGING = 'otulfnouybahfnsycxqn'
MERGE = '9a4fc292e4aa472d521d0603b75ad5689f34f671'
DEPLOY_HASH = '3a80d01ad9b9936158c0d9fec184b96930e0c983d613708f0ffb8edfc0c3e8bb'
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


report = read(REPORT, 'deployment report')
edge_doc = read(EDGE_DOC, 'Edge design document')
index = read(INDEX, 'Edge source')
contract = read(CONTRACT, 'Edge contract')
env = read(ENV, 'environment contract')
workflow = read(WORKFLOW, 'Edge workflow')

require(report, [
    PRODUCTION,
    STAGING,
    MERGE,
    DEPLOY_HASH,
    'leader-crm-design',
    'version: `1`',
    'status: `ACTIVE`',
    '`verify_jwt=true`',
    'profiles — 0',
    'orders — 0',
    'design tasks — 0',
    'command receipts — 0',
    'security WARN/ERROR — 0',
    'performance WARN/ERROR — 0',
    'UNAUTHORIZED_NO_AUTH_HEADER',
    'внешний POST без `Authorization`',
    'authenticated positive E2E',
    'production deploy',
    'production DDL/DML',
], 'deployment report')

if 'Authenticated positive E2E нельзя считать пройденным' not in report:
    errors.append('Deployment report must explicitly preserve unverified smoke limitations')
if 'Production Auth не используется' not in report:
    errors.append('Deployment report must forbid using production Auth for staging smoke')
if 'post-merge workflow runs connector не вернул' not in report:
    errors.append('Deployment report must distinguish PR CI from unconfirmed main-push Actions')

require(index, [
    'if (projectRef !== STAGING_PROJECT_REF)',
    "error: 'wrong_environment'",
    '/auth/v1/user',
    '/rest/v1/rpc/leader_create_design_task_from_order_rpc',
], 'Edge source')
require(contract, [
    f"STAGING_PROJECT_REF = '{STAGING}'",
    "DESIGN_ACTION = 'design_task.create_from_order'",
], 'Edge contract')
require(env, [PRODUCTION, STAGING], 'environment contract')
require(edge_doc, ['verify_jwt=true', 'production deploy запрещён'], 'Edge design document')
require(workflow, ['check_crm_design_edge_deployment.py'], 'Edge workflow')

for label, text in [('report', report), ('workflow', workflow)]:
    if re.search(r'sb_secret_[A-Za-z0-9_-]{10,}', text) or re.search(r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}', text):
        errors.append(f'{label} contains possible secret material')

if errors:
    print('CRM design Edge deployment evidence checks failed:', file=sys.stderr)
    for error in errors:
        print(f'- {error}', file=sys.stderr)
    raise SystemExit(1)

print('CRM design Edge staging deployment evidence is complete and production-safe.')
