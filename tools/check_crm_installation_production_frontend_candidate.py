#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'build/installation-production-frontend-candidate'
CONTRACT_PATH = ROOT / 'contracts/crm-installation-production-frontend-candidate-v1.json'
GENERATOR = ROOT / 'tools/generate_crm_installation_production_frontend_candidate.py'
CURRENT_INDEX = ROOT / 'crm/v4/index.html'
CURRENT_LOADER = ROOT / 'crm/v4/assets/v4/crm-v4-tab-loader-v1.js'
CURRENT_ROUTE = ROOT / 'crm/v4/assets/v4/installation-job-save-route-v1.js'

ERRORS: list[str] = []


def fail(message: str) -> None:
    ERRORS.append(message)


def read(path: Path) -> str:
    if not path.is_file():
        fail(f'Missing file: {path.relative_to(ROOT)}')
        return ''
    return path.read_text(encoding='utf-8')


def require(text: str, markers: list[str], label: str) -> None:
    for marker in markers:
        if marker not in text:
            fail(f'{label}: missing marker {marker!r}')


def forbid(text: str, markers: list[str], label: str) -> None:
    for marker in markers:
        if marker in text:
            fail(f'{label}: forbidden marker {marker!r}')


try:
    contract = json.loads(read(CONTRACT_PATH) or '{}')
except json.JSONDecodeError as exc:
    fail(f'Invalid contract JSON: {exc}')
    contract = {}

if contract.get('contract') != 'crm-installation-production-frontend-candidate':
    fail('contract name drifted')
if contract.get('version') != 1:
    fail('contract version must be 1')
if contract.get('status') != 'source_only_not_switched':
    fail('contract status must remain source_only_not_switched')

production = contract.get('production', {})
for key in ['database_changed', 'edge_deployed', 'frontend_switched', 'auth_changed', 'data_changed', 'nav_changed']:
    if production.get(key) is not False:
        fail(f'production.{key} must remain false')
if production.get('project_ref') != 'ofewxuqfjhamgerwzull':
    fail('production project ref drifted')
if production.get('allowed_hostname') != 'ofewxuqfjhamgerwzull.supabase.co':
    fail('production exact hostname drifted')

approval = contract.get('approval_gate', {})
if approval.get('production_frontend_switch_requires_explicit_approval') is not True:
    fail('frontend switch approval gate missing')
if approval.get('approved') is not False:
    fail('production frontend switch must remain unapproved')

current_index = read(CURRENT_INDEX)
require(current_index, [
    'assets/v4/crm-v4-tab-loader-v1.js?v=20260805-lazy-tabs-1',
], 'working index')
if re.search(r'<script\b[^>]*\bsrc=["\'][^"\']*installation-job-card-[^"\']*["\']', current_index, re.I):
    fail('working index: eager installation card script is forbidden')

current_loader = read(CURRENT_LOADER)
require(current_loader, [
    "() => import('./installation-job-card-v2.js?v=20260805-tab-loader-1')",
], 'working lazy loader')
forbid(current_loader, [
    "() => import('./installation-job-card-v3.js?v=20260723-production-edge-candidate-1')",
], 'working lazy loader')

current_route = read(CURRENT_ROUTE)
require(current_route, [
    "mode: 'production_locked'",
    "reason: 'production_backend_not_deployed'",
    'browserDirectWrite: false',
], 'working route')

if GENERATOR.is_file():
    result = subprocess.run(
        [sys.executable, str(GENERATOR)],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        fail(f'generator failed: {result.stdout}{result.stderr}')
else:
    fail('generator missing')

manifest_path = OUT / 'manifest.json'
try:
    manifest = json.loads(read(manifest_path) or '{}')
except json.JSONDecodeError as exc:
    fail(f'Invalid generated manifest JSON: {exc}')
    manifest = {}

if manifest.get('status') != 'source_only_not_switched':
    fail('generated manifest status drifted')
if manifest.get('production_project_ref') != 'ofewxuqfjhamgerwzull':
    fail('generated manifest project ref drifted')
if manifest.get('allowed_hostname') != 'ofewxuqfjhamgerwzull.supabase.co':
    fail('generated manifest hostname drifted')

expected_outputs = {
    'crm/v4/assets/v4/installation-job-save-route-v2.js',
    'crm/v4/assets/v4/installation-job-production-transport-v1.js',
    'crm/v4/assets/v4/installation-job-production-read-transport-v1.js',
    'crm/v4/assets/v4/installation-job-card-v3.js',
    'crm/v4/assets/v4/crm-v4-tab-loader-v1.js',
}
if set(manifest.get('outputs', [])) != expected_outputs:
    fail('generated manifest outputs drifted')

cutover = manifest.get('cutover', {})
for key in ['browser_direct_read', 'browser_direct_write', 'comments_write']:
    if cutover.get(key) is not False:
        fail(f'generated manifest cutover.{key} must be false')
if cutover.get('read') != 'single_production_edge_action':
    fail('generated read route drifted')
if cutover.get('write') != 'single_atomic_production_edge_action':
    fail('generated write route drifted')
if cutover.get('loader_switch_in_generated_lazy_loader_only') is not True:
    fail('generated loader boundary missing')
if cutover.get('working_index_eager_installation_script') is not False:
    fail('generated eager installation boundary missing')

route = read(OUT / 'crm/v4/assets/v4/installation-job-save-route-v2.js')
write_transport = read(OUT / 'crm/v4/assets/v4/installation-job-production-transport-v1.js')
read_transport = read(OUT / 'crm/v4/assets/v4/installation-job-production-read-transport-v1.js')
card = read(OUT / 'crm/v4/assets/v4/installation-job-card-v3.js')
candidate_loader = read(OUT / 'crm/v4/assets/v4/crm-v4-tab-loader-v1.js')

require(route, [
    "from './installation-job-production-transport-v1.js'",
    "mode: 'production_edge'",
    "mode: 'production_locked'",
    'browserDirectWrite: false',
    'browserDirectRead: false',
    'commentsWriteEnabled: false',
    'createInstallationJobIdempotencyKey',
], 'generated route')

require(write_transport, [
    "const PRODUCTION_PROJECT_REF = 'ofewxuqfjhamgerwzull'",
    'PRODUCTION_HOSTNAME',
    "const ACTION = 'installation_job.update'",
    "const PERMISSION = 'installation.write'",
    'isProductionInstallationEnvironment',
    'installationProductionTransportAvailability',
    'buildProductionInstallationJobCommand',
    'invokeProductionInstallationJob',
    'client.auth.getSession()',
    'client.functions.invoke(FUNCTION_SLUG, { body: command })',
    'expected_updated_at: exactExpectedUpdatedAt',
    'idempotency_key',
    'patch_field_not_allowed',
], 'generated write transport')

require(read_transport, [
    "const PRODUCTION_PROJECT_REF = 'ofewxuqfjhamgerwzull'",
    'PRODUCTION_HOSTNAME',
    "const ACTION = 'installation_job.read'",
    "const PERMISSION = 'installation.read'",
    'isExactInstallationProductionUrl',
    'installationProductionReadAvailability',
    'invokeProductionInstallationJobRead',
    'client.auth.getSession()',
    'client.functions.invoke(FUNCTION_SLUG, { body: command })',
    'installationReadBundle',
    'source?.entity',
], 'generated read transport')

require(card, [
    "from './installation-job-save-route-v2.js'",
    "from './installation-job-production-transport-v1.js'",
    "from './installation-job-production-read-transport-v1.js'",
    'productionEdgeEnabled()',
    "route.mode !== 'production_edge'",
    'invokeProductionInstallationJobRead({',
    'invokeProductionInstallationJob({',
    'expectedUpdatedAt: old.updated_at',
    'idempotencyKey: createInstallationJobIdempotencyKey(jobId)',
    'readAfterSuccess: () => fetchBundle(jobId)',
    'Комментарии к монтажу доступны только для чтения',
    'data-installation-production-edge',
], 'generated card')

browser_persistence_markers = [
    '.from(', '.insert(', '.update(', '.delete(', '.upsert(', '.rpc(',
    'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEYS',
]
for label, text in [
    ('generated write transport', write_transport),
    ('generated read transport', read_transport),
    ('generated card', card),
]:
    forbid(text, browser_persistence_markers, label)

for label, text in [
    ('generated route', route),
    ('generated write transport', write_transport),
    ('generated read transport', read_transport),
    ('generated card', card),
]:
    forbid(text, [
        'otulfnouybahfnsycxqn',
        'STAGING_PROJECT_REF',
        'STAGING_HOSTNAME',
        "mode === 'staging_edge'",
        'invokeStagingInstallationJob',
        'invokeStagingInstallationJobRead',
    ], label)

require(candidate_loader, [
    "() => import('./installation-job-card-v3.js?v=20260723-production-edge-candidate-1')",
], 'generated lazy loader')
forbid(candidate_loader, [
    "() => import('./installation-job-card-v2.js?v=20260805-tab-loader-1')",
], 'generated lazy loader')

backend_contracts = [
    ROOT / 'contracts/crm-installation-production-rbac-receipts-candidate-v1.json',
    ROOT / 'contracts/crm-installation-production-rpc-candidate-v1.json',
    ROOT / 'contracts/crm-installation-production-edge-candidate-v1.json',
]
for path in backend_contracts:
    if not path.is_file():
        fail(f'Missing backend dependency contract: {path.relative_to(ROOT)}')

if ERRORS:
    print('\n'.join(ERRORS), file=sys.stderr)
    raise SystemExit(1)

print('Production installation frontend candidate is deterministic, server-only, exact-host locked, and not switched in working CRM files.')
