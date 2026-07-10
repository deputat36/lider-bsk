#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
doc = root / 'docs/CRM_SITE_AUDIT_EXECUTION_PROGRESS_2026-07-10.md'
retry_correction = root / 'docs/PUBLIC_LEAD_RETRY_COVERAGE_CORRECTION_2026-07-10.md'

errors = []

if not doc.exists():
    errors.append('Missing CRM/site audit execution progress document')
else:
    text = doc.read_text(encoding='utf-8')
    required = [
        '### Публичная форма — site-wide retry idempotency',
        'pending `request_id` сохраняется в `sessionStorage`',
        'site-wide shared-form retry idempotency реализована',
        'docs/PUBLIC_LEAD_RETRY_COVERAGE_CORRECTION_2026-07-10.md',
        'tools/test_public_lead_shared_retry.mjs',
        'docs/PUBLIC_LEAD_SHARED_RETRY_MANUAL_TEST_2026-07-10.md',
        '#210',
        '`crmReady=true` устанавливается только для `profile.is_active === true`',
        'designer/contractor: production jobs only',
        'installer: installation jobs only',
        '`contractor_cost`',
        '`installer_cost`',
        'Production/installation cards проверяют разрешённый job kind до fetch/save/print',
        'Canonical action registry',
        'crm/v4/assets/v4/action-permissions-v1.js',
        'Read-only operational quality panel',
        'crm/v4/assets/v4/lead-operational-quality-v1.js',
        'поле `task_status`',
        'Backend write inventory',
        'docs/CRM_V4_BACKEND_WRITE_CONTRACT_INVENTORY_2026-07-10.md',
        '### Catalog-backed calculation items',
        'catalog_id: raw.catalog_id || null',
        'tools/test_calculations_catalog_id.mjs',
        'docs/CRM_CALCULATION_CATALOG_ID_MANUAL_TEST_2026-07-10.md',
        'baseline 28/0',
        'browser/database proof catalog_id persistence (#169)',
        'docs/PUBLIC_INTAKE_SERVICE_ROLE_CUTOVER_PLAN_2026-07-10.md',
        'P0 public intake hardening',
        'P0 server-side RBAC',
        'UI restrictions нельзя считать полной изоляцией',
        'browser proof site-wide retry idempotency',
        'transaction-backed commands from backend inventory (#204)',
        'browser proof operational quality panel',
        'no Supabase DDL was executed',
        'no Supabase DML was executed',
        'no `nav_*` object was modified',
    ]
    for marker in required:
        if marker not in text:
            errors.append(f'Missing execution progress marker: {marker}')
    for stale in (
        'Site-wide retry coverage пока не подтверждается',
        '- site-wide shared-form retry idempotency (#210);',
        '1. Apply #210 through a normal working-copy/PR line patch.',
        '- `catalog_id` preservation in `calculations.js` (#169);',
        '1. Prepare safe `catalog_id` patch/checker for #169 without risky full-file replacement.',
    ):
        if stale in text:
            errors.append(f'Stale execution progress marker remains: {stale}')

if not retry_correction.exists():
    errors.append('Missing public lead retry coverage correction')
else:
    text = retry_correction.read_text(encoding='utf-8')
    required = [
        'Status: resolved in source',
        'Site-wide retry idempotency is implemented in `assets/public-lead-form.js`',
        'fingerprint that begins with `fnv1a-`',
        'confirmed `data.ok === true`',
        '`node tools/test_public_lead_shared_retry.mjs`',
        'manual browser proof remains required',
        'do not change Supabase production for this browser-source fix',
    ]
    for marker in required:
        if marker not in text:
            errors.append(f'Missing retry coverage correction marker: {marker}')
    for stale in (
        'Remaining site-wide gap',
        'do not claim site-wide retry coverage until #210 is verified',
    ):
        if stale in text:
            errors.append(f'Stale retry coverage marker remains: {stale}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('CRM/site audit execution progress accurately distinguishes completed, pending and approval-gated work.')
