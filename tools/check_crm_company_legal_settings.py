#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
helper = root / 'crm/v4/assets/v4/company-legal-settings-v1.js'
sidecar = root / 'crm/v4/assets/v4/order-act-company-settings-v1.js'
doc = root / 'docs/CRM_COMPANY_LEGAL_SETTINGS_CONTRACT_2026-07-10.md'
index = root / 'crm/v4/index.html'

errors = []

checks = {
    helper: [
        "COMPANY_LEGAL_SETTINGS_KEY = 'company_legal_details_v1'",
        'DEFAULT_COMPANY_LEGAL_SETTINGS',
        'normalizeCompanyLegalSettings',
        'companyLegalName',
        'companyLegalDetailsText',
        'loadCompanyLegalSettings',
        ".from('leader_settings')",
        ".select('value')",
        'schema_version',
        'configured',
    ],
    sidecar: [
        "from './company-legal-settings-v1.js'",
        'applyCompanySettings',
        'actDraftExecutor',
        'actDraftExecutorDetails',
        'actDraftSignatory',
        'actDraftSignatoryRole',
        'actDraftTax',
        'companySettingsApplied',
        'new MutationObserver(applyCompanySettings)',
    ],
    doc: [
        'company_legal_details_v1',
        'schema_version',
        '`settings.manage`',
        'must not contain',
        'source sidecar is prepared',
        'it is not yet loaded by `crm/v4/index.html`',
        'existing act preview remains usable with manual entry',
        'No production setting, DDL, DML, RLS, grant, policy, Auth, Storage or Edge Function change was made',
    ],
}

for path, markers in checks.items():
    if not path.exists():
        errors.append(f'Missing company legal settings file: {path.relative_to(root)}')
        continue
    text = path.read_text(encoding='utf-8')
    for marker in markers:
        if marker not in text:
            errors.append(f'Missing company legal settings marker in {path.relative_to(root)}: {marker}')

if helper.exists():
    text = helper.read_text(encoding='utf-8')
    forbidden = [
        '.insert(',
        '.update(',
        '.delete(',
        'SUPABASE_SERVICE_ROLE_KEY',
        'SUPABASE_SECRET_KEYS',
        'password',
        'api_token',
        'private_key',
    ]
    for marker in forbidden:
        if marker in text:
            errors.append(f'Company legal settings helper contains forbidden marker: {marker}')

if sidecar.exists():
    text = sidecar.read_text(encoding='utf-8')
    for marker in ['.insert(', '.update(', '.delete(']:
        if marker in text:
            errors.append(f'Company legal settings sidecar contains write marker: {marker}')

if index.exists():
    text = index.read_text(encoding='utf-8')
    if 'order-act-company-settings-v1.js' in text:
        errors.append('Company settings sidecar activation changed; update contract doc and manual proof before enabling it')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('CRM company legal settings contract is read-only, versioned, secret-free and not yet activated in index.')
