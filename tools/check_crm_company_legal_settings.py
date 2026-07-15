#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
helper = root / 'crm/v4/assets/v4/company-legal-settings-v1.js'
draft = root / 'crm/v4/assets/v4/company-legal-settings-draft-v1.js'
entry = root / 'crm/v4/assets/v4/company-legal-settings-entry-v1.js'
sidecar = root / 'crm/v4/assets/v4/order-act-company-settings-v1.js'
preview = root / 'crm/v4/assets/v4/company-legal-settings-preview-v1.js'
act = root / 'crm/v4/assets/v4/order-act-preview-v1.js'
doc = root / 'docs/CRM_COMPANY_LEGAL_SETTINGS_CONTRACT_2026-07-10.md'
admin_doc = root / 'docs/CRM_COMPANY_LEGAL_SETTINGS_ADMIN_ENTRY_2026-07-15.md'
manual = root / 'docs/CRM_ORDER_COMPLETION_ACT_MANUAL_TEST_2026-07-10.md'
behavior = root / 'tools/test_crm_company_legal_settings.mjs'
entry_behavior = root / 'tools/test_crm_company_legal_settings_entry.mjs'
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
    draft: [
        'COMPANY_LEGAL_SCHEMA_VERSION = 1',
        'COMPANY_LEGAL_TAX_MODES',
        'normalizeCompanyLegalSettingsDraft',
        'validateCompanyLegalSettingsDraft',
        'companyLegalSettingsPreviewText',
        'ИНН должен содержать 10 или 12 цифр',
        'Расчётный счёт должен содержать 20 цифр',
        'БИК должен содержать 9 цифр',
    ],
    entry: [
        "DOCUMENT: 'document'",
        "STANDALONE: 'standalone'",
        'companyLegalSettingsEntryMode',
        'companyLegalSettingsEntryCopy',
        'companyLegalSettingsJson',
        'Применить к текущему черновику',
        'Проверка завершена',
        'Сохранение в CRM отключено',
    ],
    sidecar: [
        "import './company-legal-settings-preview-v1.js';",
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
    preview: [
        "from './company-legal-settings-entry-v1.js'",
        'CRM_V4_ACTIONS.SETTINGS_MANAGE',
        'requireV4Action',
        'canPerformV4Action',
        'validateCompanyLegalSettingsDraft',
        'companyLegalSettingsEntryMode',
        'companyLegalSettingsEntryCopy',
        'companyLegalSettingsJson',
        'Реквизиты документов',
        'Открыть реквизиты',
        'JSON для будущей безопасной настройки',
        'data-company-settings-json',
        'Проверка завершена. Сохранение реквизитов пока отключено.',
        'Данные не записываются в <code>leader_settings</code>',
        'applyToOpenAct',
        'new MutationObserver(injectOpenButton)',
    ],
    act: [
        "import './order-act-company-settings-v1.js';",
    ],
    doc: [
        'company_legal_details_v1',
        'schema_version',
        '`settings.manage`',
        'must not contain',
        'activated through `order-act-preview-v1.js`',
        'read-only owner/admin validation and preview form',
        'existing act preview remains usable with manual entry',
        'No production setting, DDL, DML, RLS, grant, policy, Auth, Storage or Edge Function change was made',
    ],
    admin_doc: [
        '`Доступ и роли`',
        '`Реквизиты документов`',
        'Document mode',
        'Standalone mode',
        'read-only JSON',
        'Production сохранение остаётся отдельным approval gate',
    ],
    manual: [
        'Проверить реквизиты',
        'only owner/admin',
        'GET/SELECT for `leader_settings`',
        'no POST, PATCH, INSERT, UPDATE or DELETE',
        'applies values only to the current unsaved act draft',
    ],
    behavior: [
        'validateCompanyLegalSettingsDraft',
        'api_token',
        'CRM company legal settings draft validation is valid.',
    ],
    entry_behavior: [
        'COMPANY_LEGAL_SETTINGS_ENTRY_MODES.DOCUMENT',
        'COMPANY_LEGAL_SETTINGS_ENTRY_MODES.STANDALONE',
        "documentCopy.action, 'Применить к текущему черновику'",
        "standaloneCopy.action, 'Проверка завершена'",
        'CRM company legal settings entry model is document-aware and standalone-safe.',
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

for path in [helper, draft, entry, sidecar, preview]:
    if not path.exists():
        continue
    text = path.read_text(encoding='utf-8')
    for marker in ['.insert(', '.update(', '.delete(', '.upsert(', '.rpc(']:
        if marker in text:
            errors.append(f'Company legal settings source contains write marker in {path.relative_to(root)}: {marker}')

if helper.exists():
    text = helper.read_text(encoding='utf-8')
    for marker in ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEYS', 'password', 'api_token', 'private_key']:
        if marker in text:
            errors.append(f'Company legal settings helper contains forbidden marker: {marker}')

if index.exists():
    text = index.read_text(encoding='utf-8')
    for marker in ['order-act-company-settings-v1.js', 'company-legal-settings-preview-v1.js', 'company-legal-settings-entry-v1.js']:
        if marker in text:
            errors.append('Company settings modules must be activated through the existing act module, not a new index script tag')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('CRM company legal settings are read-only, validated, permission-guarded and available in document and standalone admin modes.')
