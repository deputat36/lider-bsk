#!/usr/bin/env python3

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIXTURE_CONTRACT = ROOT / 'contracts' / 'design-task-staging-fixture-manifest-v1.json'
EVIDENCE_CONTRACT = ROOT / 'contracts' / 'design-task-staging-auth-e2e-evidence-v2.json'
LOW_LEVEL = ROOT / 'tools' / 'design-task-staging-auth-e2e.mjs'
RUNNER = ROOT / 'tools' / 'design-task-staging-auth-e2e-v2.mjs'
VALIDATOR = ROOT / 'tools' / 'validate-design-task-staging-auth-e2e-evidence.mjs'
GENERATOR = ROOT / 'tools' / 'create-design-task-staging-fixture-manifest.mjs'
RUNNER_TEST = ROOT / 'tools' / 'test_design_task_staging_auth_e2e_v2.mjs'
GENERATOR_TEST = ROOT / 'tools' / 'test_create_design_task_staging_fixture_manifest.mjs'
LAUNCHER = ROOT / 'tools' / 'run_design_task_staging_auth_e2e.ps1'
DOC = ROOT / 'docs' / 'CRM_DESIGN_TASK_STAGING_E2E_EVIDENCE_V2_2026-07-14.md'
WORKFLOW = ROOT / '.github' / 'workflows' / 'crm-design-auth-e2e-v2-check.yml'
GITIGNORE = ROOT / '.gitignore'
CONFIG = ROOT / 'supabase' / 'config.toml'

STAGING = 'otulfnouybahfnsycxqn'
PRODUCTION = 'ofewxuqfjhamgerwzull'
EXPECTED_PROJECTIONS = {
    'leader_orders': [
        'id', 'order_number', 'lead_id', 'project_name', 'status', 'priority',
        'deadline', 'layout_status', 'layout_link', 'is_archived', 'updated_at',
    ],
    'leader_lead_needs': [
        'id', 'lead_id', 'need_type', 'title', 'need_design', 'design_reason',
        'deadline_date', 'status', 'completeness_score',
    ],
    'leader_design_tasks': [
        'id', 'order_id', 'task_status', 'layout_status', 'designer_name',
        'deadline', 'layout_link', 'created_at',
    ],
}
EXPECTED_CLEANUP = [
    'receipt', 'design_event', 'design_task', 'need',
    'order', 'lead', 'profile', 'auth_user',
]
EXPECTED_STEPS = [
    'fixture_manifest', 'authenticate', 'auth_user', 'safe_read_before',
    'create', 'exact_replay', 'same_key_modified_payload',
    'new_key_active_task', 'safe_read_after', 'logout_current_session',
]

errors = []


def read(path: Path, label: str) -> str:
    if not path.exists():
        errors.append(f'Missing {label}: {path.relative_to(ROOT)}')
        return ''
    return path.read_text(encoding='utf-8')


def parse_json(source: str, label: str):
    try:
        return json.loads(source) if source else {}
    except json.JSONDecodeError as exc:
        errors.append(f'{label} JSON invalid: {exc}')
        return {}


def require(source: str, markers, label: str) -> None:
    for marker in markers:
        if marker not in source:
            errors.append(f'{label}: missing marker {marker!r}')


def forbid(source: str, markers, label: str) -> None:
    for marker in markers:
        if marker in source:
            errors.append(f'{label}: forbidden marker {marker!r}')


fixture_text = read(FIXTURE_CONTRACT, 'fixture manifest contract')
evidence_text = read(EVIDENCE_CONTRACT, 'evidence v2 contract')
low_level = read(LOW_LEVEL, 'v1 low-level transport module')
runner = read(RUNNER, 'v2 E2E runner')
validator = read(VALIDATOR, 'v2 evidence validator')
generator = read(GENERATOR, 'fixture manifest generator')
runner_test = read(RUNNER_TEST, 'v2 runner behavior test')
generator_test = read(GENERATOR_TEST, 'fixture generator test')
launcher = read(LAUNCHER, 'PowerShell launcher')
doc = read(DOC, 'v2 operator documentation')
workflow = read(WORKFLOW, 'v2 workflow')
gitignore = read(GITIGNORE, '.gitignore')
config = read(CONFIG, 'Supabase config')

fixture = parse_json(fixture_text, 'Fixture manifest contract')
evidence = parse_json(evidence_text, 'Evidence v2 contract')

if fixture:
    if fixture.get('contract_version') != 'leader-design-task-staging-fixture-manifest-v1':
        errors.append('Fixture contract version drifted')
    environment = fixture.get('environment') or {}
    if environment.get('project_ref') != STAGING:
        errors.append('Fixture contract staging ref drifted')
    if environment.get('production_project_ref') != PRODUCTION:
        errors.append('Fixture contract production ref drifted')
    if environment.get('production_enabled') is not False:
        errors.append('Fixture contract must remain production-disabled')
    required_doc = fixture.get('required_document') or {}
    if required_doc.get('cleanup_order') != EXPECTED_CLEANUP:
        errors.append('Fixture cleanup order drifted')
    if fixture.get('identity_rules', {}).get('profile_user_id_must_equal_auth_user_id') is not True:
        errors.append('Fixture identity equality rule missing')
    if fixture.get('operator_lifecycle', {}).get('delete_auth_user_last') is not True:
        errors.append('Fixture Auth user cleanup-last rule missing')

if evidence:
    if evidence.get('contract_version') != 'leader-design-task-staging-auth-e2e-evidence-contract-v2':
        errors.append('Evidence contract version drifted')
    if evidence.get('evidence_version') != 'leader-design-task-staging-auth-e2e-evidence-v2':
        errors.append('Evidence format version drifted')
    if evidence.get('runner_version') != 'leader-design-task-staging-auth-e2e-runner-v2':
        errors.append('Runner contract version drifted')
    environment = evidence.get('environment') or {}
    if environment.get('project_ref') != STAGING or environment.get('production_enabled') is not False:
        errors.append('Evidence environment boundary drifted')
    if evidence.get('safe_read_projections') != EXPECTED_PROJECTIONS:
        errors.append('Evidence safe projections drifted')
    actual_steps = [step.get('name') for step in evidence.get('allowed_suite', {}).get('steps', [])]
    if actual_steps != EXPECTED_STEPS:
        errors.append(f'Evidence allowed steps drifted: {actual_steps!r}')
    logout = evidence.get('logout_semantics') or {}
    if logout.get('must_complete_before_evidence_is_built') is not True:
        errors.append('Logout-before-evidence contract missing')
    if logout.get('must_be_present_in_saved_evidence') is not True:
        errors.append('Logout evidence requirement missing')
    if evidence.get('cleanup', {}).get('external_cleanup_order') != EXPECTED_CLEANUP:
        errors.append('Evidence cleanup order drifted')

require(low_level, [
    'export async function authenticate',
    'export async function verifyAuthenticatedUser',
    'export async function safeRead',
    'export async function invokeDesignEdge',
    'export async function logoutCurrentSession',
    'export function sanitizeEvidence',
], 'v1 low-level module')

require(runner, [
    "RUNNER_VERSION = 'leader-design-task-staging-auth-e2e-runner-v2'",
    "EVIDENCE_VERSION_V2 = 'leader-design-task-staging-auth-e2e-evidence-v2'",
    "FIXTURE_MANIFEST_VERSION = 'leader-design-task-staging-fixture-manifest-v1'",
    'validateFixtureManifest',
    'manifestDigest',
    'loadFixtureManifest',
    'buildRunnerConfig',
    'runAllowedSuiteV2',
    'runDeniedProbeV2',
    'appendLogoutStep',
    "name: 'logout_current_session'",
    "assertStep(logout?.name === 'logout_current_session' && logout.passed === true, 'logout_failed')",
    'fixture_manifest_digest_sha256',
    'connector_can_create_or_delete_auth_user: false',
], 'v2 runner')
forbid(runner, [
    '/rest/v1/rpc/leader_create_design_task_from_order_rpc',
    '/rest/v1/leader_command_receipts',
    'SUPABASE_SERVICE_ROLE_KEY',
    '.insert(', '.update(', '.upsert(', '.delete(',
], 'v2 runner boundary')

require(validator, [
    'validateEvidenceV2',
    'ALLOWED_STEP_ORDER',
    "'logout_current_session'",
    'fixture_manifest_digest_mismatch',
    'replay_response_invalid',
    'safe_read_after_task_mismatch',
    'FORBIDDEN_STRING',
    'process.exitCode = 1',
], 'v2 evidence validator')
forbid(validator, [
    '/auth/v1/', '/functions/v1/', '/rest/v1/',
    'SUPABASE_SERVICE_ROLE_KEY',
], 'validator network boundary')

require(generator, [
    'buildFixtureManifest',
    'writeFixtureManifest',
    'synthetic_only: true',
    'production_enabled: false',
    'contains_credentials: false',
    "mode: 0o600",
], 'fixture manifest generator')
forbid(generator, [
    '/auth/v1/', '/functions/v1/', '/rest/v1/',
    'STAGING_TEST_EMAIL', 'STAGING_TEST_PASSWORD',
    'SUPABASE_SERVICE_ROLE_KEY',
], 'fixture generator network/secret boundary')

require(runner_test, [
    'runAllowedSuiteV2',
    'runDeniedProbeV2',
    "evidence.steps.at(-1).name, 'logout_current_session'",
    'validateEvidenceV2',
    'withoutLogout.steps.pop()',
    'leakedSecret.password',
    'wrongReplay',
    'Staging design E2E v2 evidence includes logout',
], 'v2 behavior test')
require(generator_test, [
    'buildFixtureManifest',
    'validateFixtureManifest',
    'manifestDigest',
    'cleanup_order',
    "JSON.stringify(manifest).includes('password')",
    'Staging fixture manifest generator is exact-environment',
], 'fixture generator test')

require(launcher, [
    "tools/design-task-staging-auth-e2e-v2.mjs",
    "tools/validate-design-task-staging-auth-e2e-evidence.mjs",
    'STAGING_FIXTURE_MANIFEST_PATH',
    'Fixture manifest not found',
    'node $Validator',
    'Remove-Item "Env:$name"',
], 'PowerShell launcher v2')
forbid(launcher, [
    'node tools/design-task-staging-auth-e2e.mjs',
    'SUPABASE_SERVICE_ROLE_KEY',
    'service_role',
], 'PowerShell launcher boundary')

require(doc, [
    STAGING,
    PRODUCTION,
    'logout_current_session',
    'manifest-driven runner',
    'SHA-256 digest',
    'не предоставляет безопасные create/delete Auth user операции',
    'не выполнялся',
    'Production boundary',
    'receipt;',
    'Auth user через Dashboard',
], 'v2 documentation')

require(workflow, [
    'CRM design authenticated E2E v2 evidence check',
    'python3 -m json.tool contracts/design-task-staging-fixture-manifest-v1.json',
    'python3 -m json.tool contracts/design-task-staging-auth-e2e-evidence-v2.json',
    'node tools/test_create_design_task_staging_fixture_manifest.mjs',
    'node tools/test_design_task_staging_auth_e2e_v2.mjs',
    'python3 tools/check_design_task_staging_auth_e2e_v2.py',
    'tools/run_design_task_staging_auth_e2e.ps1',
], 'v2 workflow')

require(gitignore, [
    '/artifacts/design-task-staging-fixture-manifest.json',
    '/artifacts/design-task-staging-auth-e2e-evidence-v2.json',
], '.gitignore')

if f'project_id = "{PRODUCTION}"' not in config:
    errors.append('supabase/config.toml must continue to point to production')
if STAGING in config:
    errors.append('Staging ref must not replace production Supabase config')

secret_patterns = [
    r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}',
    r'sb_secret_[A-Za-z0-9_-]{10,}',
    r'(?i)Bearer\s+[A-Za-z0-9._-]{20,}',
]
for path, source in [
    (FIXTURE_CONTRACT, fixture_text),
    (EVIDENCE_CONTRACT, evidence_text),
    (RUNNER, runner),
    (VALIDATOR, validator),
    (GENERATOR, generator),
    (RUNNER_TEST, runner_test),
    (GENERATOR_TEST, generator_test),
    (LAUNCHER, launcher),
    (DOC, doc),
    (WORKFLOW, workflow),
]:
    for pattern in secret_patterns:
        if re.search(pattern, source):
            errors.append(f'{path.relative_to(ROOT)} contains possible secret material')

if errors:
    print('Staging design E2E v2 checks failed:', file=sys.stderr)
    for error in errors:
        print(f'- {error}', file=sys.stderr)
    raise SystemExit(1)

print('Staging design E2E v2 is manifest-bound, logout-complete, independently validated and production-locked.')
