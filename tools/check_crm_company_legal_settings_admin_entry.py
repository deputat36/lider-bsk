#!/usr/bin/env python3

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

FILES = {
    'entry': ROOT / 'crm/v4/assets/v4/company-legal-settings-entry-v1.js',
    'preview': ROOT / 'crm/v4/assets/v4/company-legal-settings-preview-v1.js',
    'act': ROOT / 'crm/v4/assets/v4/order-act-preview-v1.js',
    'index': ROOT / 'crm/v4/index.html',
    'test': ROOT / 'tools/test_crm_company_legal_settings_entry.mjs',
    'doc': ROOT / 'docs/CRM_COMPANY_LEGAL_SETTINGS_ADMIN_ENTRY_2026-07-15.md',
    'workflow': ROOT / '.github/workflows/crm-order-completion-act-check.yml',
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


require('entry', [
    "DOCUMENT: 'document'",
    "STANDALONE: 'standalone'",
    'companyLegalSettingsEntryMode',
    'companyLegalSettingsEntryCopy',
    'companyLegalSettingsJson',
    'Применить к текущему черновику',
    'Проверка завершена',
    'Сохранение в CRM отключено',
])

require('preview', [
    "from './company-legal-settings-entry-v1.js'",
    'COMPANY_LEGAL_SETTINGS_ENTRY_MODES.STANDALONE',
    'companyLegalSettingsEntryMode',
    'companyLegalSettingsEntryCopy',
    'companyLegalSettingsJson',
    "document.getElementById('userAdminContent')",
    'data-company-settings-admin-entry',
    'Реквизиты документов',
    'Открыть реквизиты',
    'JSON для будущей безопасной настройки',
    'data-company-settings-json',
    'Проверка завершена. Сохранение реквизитов пока отключено.',
    'CRM_V4_ACTIONS.SETTINGS_MANAGE',
    'requireV4Action',
    'canPerformV4Action',
    'new MutationObserver(injectOpenButton)',
])

forbid('preview', [
    '.insert(',
    '.update(',
    '.delete(',
    '.upsert(',
    '.rpc(',
    'SUPABASE_SERVICE_ROLE_KEY',
    'service_role',
    'localStorage',
    'sessionStorage',
])

require('act', [
    "import './order-act-company-settings-v1.js';",
])

if 'company-legal-settings-preview-v1.js' in texts['index'] or 'company-legal-settings-entry-v1.js' in texts['index']:
    errors.append('index: company settings must remain activated through the existing order-act module')

require('test', [
    'COMPANY_LEGAL_SETTINGS_ENTRY_MODES.DOCUMENT',
    'COMPANY_LEGAL_SETTINGS_ENTRY_MODES.STANDALONE',
    "documentCopy.action, 'Применить к текущему черновику'",
    "standaloneCopy.action, 'Проверка завершена'",
    'companyLegalSettingsJson',
    'CRM company legal settings entry model is document-aware and standalone-safe.',
])

require('doc', [
    '`Доступ и роли`',
    '`#userAdminContent`',
    '`Реквизиты документов`',
    '`Открыть реквизиты`',
    'Document mode',
    'Standalone mode',
    '`Проверка завершена`',
    'read-only JSON',
    '`settings.manage`',
    'INSERT, UPDATE, DELETE или UPSERT',
    'новый script tag в `crm/v4/index.html` не добавляется',
    'Production сохранение остаётся отдельным approval gate',
])

require('workflow', [
    "- 'crm/v4/assets/v4/company-legal-settings-entry-v1.js'",
    "- 'tools/test_crm_company_legal_settings_entry.mjs'",
    "- 'tools/check_crm_company_legal_settings_admin_entry.py'",
    "- 'docs/CRM_COMPANY_LEGAL_SETTINGS_ADMIN_ENTRY_2026-07-15.md'",
    'node tools/test_crm_company_legal_settings_entry.mjs',
    'python3 tools/check_crm_company_legal_settings_admin_entry.py',
    'node --check crm/v4/assets/v4/company-legal-settings-entry-v1.js',
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
    if forbidden_prefix in texts['entry'] or forbidden_prefix in texts['preview']:
        errors.append(f'company settings admin entry entered forbidden scope: {forbidden_prefix}')

if errors:
    print('CRM company legal settings admin-entry checks failed:', file=sys.stderr)
    for error in errors:
        print(f'- {error}', file=sys.stderr)
    raise SystemExit(1)

print('CRM company legal settings admin entry is permission-guarded, standalone-safe and read-only.')
