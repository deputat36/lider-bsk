#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
doc = root / 'docs/CRM_SITE_AUDIT_EXECUTION_PROGRESS_2026-07-10.md'

errors = []

if not doc.exists():
    errors.append('Missing CRM/site audit execution progress document')
else:
    text = doc.read_text(encoding='utf-8')
    required = [
        'pending `request_id` сохраняется в `sessionStorage`',
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
        'Backend write inventory',
        'docs/CRM_V4_BACKEND_WRITE_CONTRACT_INVENTORY_2026-07-10.md',
        'docs/PUBLIC_INTAKE_SERVICE_ROLE_CUTOVER_PLAN_2026-07-10.md',
        'P0 public intake hardening',
        'P0 server-side RBAC',
        'UI restrictions нельзя считать полной изоляцией',
        '`catalog_id` preservation in `calculations.js` (#169)',
        'transaction-backed commands from backend inventory (#204)',
        'browser proof operational quality panel',
        'no Supabase DDL was executed',
        'no Supabase DML was executed',
        'no `nav_*` object was modified',
    ]
    for marker in required:
        if marker not in text:
            errors.append(f'Missing execution progress marker: {marker}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('CRM/site audit execution progress is documented with completed, pending and approval-gated work.')
