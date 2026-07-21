#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
paths = {
    'model': root / 'crm/v4/assets/v4/lead-first-contact-model-v1.js',
    'card': root / 'crm/v4/assets/v4/lead-card.js',
    'styles': root / 'crm/v4/assets/v4/lead-first-contact-v1.css',
    'html': root / 'crm/v4/index.html',
    'test': root / 'tools/test_crm_lead_first_contact.mjs',
    'manual': root / 'docs/CRM_LEAD_FIRST_CONTACT_MANUAL_TEST_2026-07-17.md',
}
texts = {}
errors = []

for name, path in paths.items():
    if not path.exists():
        errors.append(f'Missing first-contact file: {path.relative_to(root)}')
        continue
    texts[name] = path.read_text(encoding='utf-8')

required = {
    'model': [
        'firstContactGreeting',
        'firstContactServiceProfile',
        'buildFirstContactQuestions',
        'buildFirstContactDraft',
        'Это РА «Лидер»',
        'Можно ответить одним сообщением',
    ],
    'card': [
        "from './lead-first-contact-model-v1.js?v=20260717-1'",
        'id="leadFirstContactDetails"',
        'id="leadFirstContactDraft"',
        'data-lead-first-contact-copy="message"',
        'data-lead-first-contact-copy="questions"',
        'navigator.clipboard',
        "document.execCommand('copy')",
        'Отправка сообщения не отмечается автоматически',
    ],
    'styles': [
        '.v4-first-contact-box',
        '.v4-first-contact-draft',
        '.v4-first-contact-actions',
        '@media(max-width:560px)',
    ],
    'html': [
        'lead-first-contact-v1.css?v=20260717-1',
        'lead-card.js?v=20260721-assignment-1',
    ],
    'test': [
        "firstContactGreeting('ООО Ромашка')",
        "service: 'Наклейки на автомобиль'",
        'Pure model must not mutate the lead',
        'CRM lead first-contact draft behavior is valid.',
    ],
    'manual': [
        'Production Supabase не изменять',
        'не создаёт сетевых запросов',
        'не означает, что сообщение отправлено',
        '360–430 px',
    ],
}

for name, markers in required.items():
    text = texts.get(name, '')
    for marker in markers:
        if marker not in text:
            errors.append(f'{name} missing first-contact marker: {marker}')

model = texts.get('model', '')
for forbidden in [".from('", '.insert(', '.update(', '.delete(', '.upsert(', 'fetch(', 'localStorage', 'sessionStorage']:
    if forbidden in model:
        errors.append(f'First-contact model must remain pure and browser-local: {forbidden}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('CRM lead first-contact kit is browser-local, copy-only and covered by source checks.')
