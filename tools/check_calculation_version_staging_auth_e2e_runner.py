#!/usr/bin/env python3

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STAGING = 'otulfnouybahfnsycxqn'
PRODUCTION = 'ofewxuqfjhamgerwzull'

FILES = {
    'runner': ROOT / 'tools/run_calculation_version_staging_auth_e2e.mjs',
    'test': ROOT / 'tools/test_calculation_version_staging_auth_e2e_runner.mjs',
    'transport': ROOT / 'crm/v4/assets/v4/calculation-version-staging-transport-v1.js',
    'doc': ROOT / 'docs/CRM_CALCULATION_VERSION_STAGING_AUTH_E2E_RUNNER_2026-07-15.md',
    'workflow': ROOT / '.github/workflows/crm-calculation-version-staging-transport-check.yml',
}

errors: list[str] = []
texts: dict[str, str] = {}

for name, path in FILES.items():
    if not path.is_file():
        errors.append(f'Missing file: {path.relative_to(ROOT)}')
        texts[name] = ''
    else:
        texts[name] = path.read_text(encoding='utf-8')


def require(name: str, markers: list[str] | tuple[str, ...]) -> None:
    for marker in markers:
        if marker not in texts[name]:
            errors.append(f'{name}: missing marker {marker!r}')


def forbid(name: str, markers: list[str] | tuple[str, ...]) -> None:
    for marker in markers:
        if marker in texts[name]:
            errors.append(f'{name}: forbidden marker found {marker!r}')


require('runner', [
    'buildStagingCalculationVersionCommand',
    'isStagingCalculationEnvironment',
    "FUNCTION_SLUG = 'leader-crm-calculations'",
    "PERMISSION = 'calculations.write'",
    "new Set(['allowed', 'forbidden', 'inactive'])",
    'LIDER_STAGING_SUPABASE_URL',
    'LIDER_STAGING_PUBLISHABLE_KEY',
    'LIDER_STAGING_EMAIL',
    'LIDER_STAGING_PASSWORD',
    'LIDER_STAGING_SOURCE_CALCULATION_ID',
    'LIDER_STAGING_EXPECTED_UPDATED_AT',
    '/auth/v1/token?grant_type=password',
    '/functions/v1/${FUNCTION_SLUG}',
    '/auth/v1/logout',
    'Authorization: `Bearer ${accessToken}`',
    "expectResponse('create', created, 201)",
    "expectResponse('replay', replay, 200)",
    "expectResponse('conflict', conflict, 409, 'idempotency_conflict')",
    "expectResponse('stale', stale, 409, 'source_changed')",
    "expectResponse('forbidden', response, 403, 'forbidden')",
    "expectResponse('inactive', response, 403, 'inactive_profile')",
    'validateSafeCalculationResponse',
    "'source_calculation_id'",
    'source_calculation_id_mismatch',
    'sourceCalculationId: created.body.source_calculation_id',
    'cleanupRequired: true',
    'Bearer [redacted]',
])

for field in (
    'created_by', 'updated_by', 'commercial_offer_id', 'order_id',
    'calculation_id', 'actor_id', 'actor_email'
):
    if f"'{field}'" not in texts['test'] and field not in texts['doc']:
        errors.append(f'runner evidence does not cover forbidden field: {field}')

for env_name in (
    'LIDER_STAGING_SUPABASE_URL',
    'LIDER_STAGING_PUBLISHABLE_KEY',
    'LIDER_STAGING_EMAIL',
    'LIDER_STAGING_PASSWORD',
    'LIDER_STAGING_SOURCE_CALCULATION_ID',
    'LIDER_STAGING_EXPECTED_UPDATED_AT',
):
    require('test', [env_name])
    require('doc', [env_name])

forbid('runner', [
    PRODUCTION,
    'SUPABASE_SERVICE_ROLE_KEY',
    'service_role',
    '.from(',
    '.insert(',
    '.update(',
    '.upsert(',
    '.delete(',
    '.rpc(',
    'leader_command_receipts',
    'console.log(config',
    'console.log(accessToken',
    'console.log(response.body',
])

require('test', [
    f'https://{STAGING}.supabase.co',
    f'https://{PRODUCTION}.supabase.co',
    '/wrong_environment/',
    "command.action, 'calculation.create_version'",
    'source_calculation_id: ids.source',
    'source_calculation_id_mismatch',
    'top-level forbidden field leaked',
    'item forbidden field leaked',
    'calculation_projection_drift',
    'item_projection_drift',
    'Authenticated staging E2E runner is environment-locked, payload-minimized and projection-safe.',
])

require('transport', [
    f"STAGING_PROJECT_REF = '{STAGING}'",
    "FUNCTION_SLUG = 'leader-crm-calculations'",
    "PERMISSION = 'calculations.write'",
    'buildStagingCalculationVersionCommand',
])

require('doc', [
    f'project ref: `{STAGING}`',
    'active version: `3`',
    '`verify_jwt=true`',
    'Auth users: `0`',
    'active CRM profiles: `0`',
    'вставлять пользователя напрямую в `auth.users`',
    'не печатает email, пароль, publishable key или JWT',
    'точный `source_calculation_id`',
    'Scenario: allowed',
    'HTTP `201`',
    'HTTP `200`',
    'HTTP `409 idempotency_conflict`',
    'HTTP `409 source_changed`',
    'Scenario: forbidden',
    'permission `calculations.write`',
    'Scenario: inactive',
    'HTTP `403 inactive_profile`',
    '`sourceCalculationId`',
    'cleanupRequired: true',
    'временный Auth user',
    'production migration history и Edge Functions не изменились',
    'GitHub Actions не выполняет сетевой E2E и не требует secrets',
])

require('workflow', [
    "- 'tools/run_calculation_version_staging_auth_e2e.mjs'",
    "- 'tools/test_calculation_version_staging_auth_e2e_runner.mjs'",
    "- 'tools/check_calculation_version_staging_auth_e2e_runner.py'",
    "- 'docs/CRM_CALCULATION_VERSION_STAGING_AUTH_E2E_RUNNER_2026-07-15.md'",
    'node --check tools/run_calculation_version_staging_auth_e2e.mjs',
    'node tools/test_calculation_version_staging_auth_e2e_runner.mjs',
    'python3 -m py_compile tools/check_calculation_version_staging_auth_e2e_runner.py',
    'python3 tools/check_calculation_version_staging_auth_e2e_runner.py',
])

secret_patterns = (
    r'sb_secret_[A-Za-z0-9_-]{10,}',
    r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}',
)
for name, source in texts.items():
    for pattern in secret_patterns:
        if re.search(pattern, source):
            errors.append(f'{name}: possible secret material')

for forbidden_prefix in ('nav_', 'parket_', 'broker_'):
    if forbidden_prefix in texts['runner']:
        errors.append(f'runner entered forbidden object scope: {forbidden_prefix}')

if errors:
    print('Calculation staging authenticated E2E runner checks failed:', file=sys.stderr)
    for error in errors:
        print(f'- {error}', file=sys.stderr)
    raise SystemExit(1)

print('Calculation staging authenticated E2E runner is credential-external, environment-locked and offline-testable.')
