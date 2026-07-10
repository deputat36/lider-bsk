#!/usr/bin/env python3
from pathlib import Path

path = Path(__file__).resolve().parents[1] / 'docs' / 'CRM_SITE_AUDIT_EXECUTION_PROGRESS_2026-07-10.md'
text = path.read_text(encoding='utf-8')
original = text

old = '''### Публичная форма — основная страница заявки

На `request.html`, где загружен `assets/public-lead-reference-v1.js`:

- pending `request_id` сохраняется в `sessionStorage`;
- повтор same-payload после сетевого сбоя использует тот же `request_id`;
- duplicate response показывает корректный текст;
- request-reference workflow проверяет retry/duplicate contract.

Site-wide retry coverage пока не подтверждается. Общий `assets/public-lead-form.js` используется на многих посадочных страницах и должен получить тот же lifecycle внутри shared module. Корректировка охвата зафиксирована в:

`docs/PUBLIC_LEAD_RETRY_COVERAGE_CORRECTION_2026-07-10.md` и #210.

Manual browser proof всё ещё требуется.
'''
new = '''### Публичная форма — site-wide retry idempotency

В общем `assets/public-lead-form.js` site-wide shared-form retry idempotency реализована для публичных посадочных страниц:

- pending `request_id` сохраняется в `sessionStorage`;
- повтор same-payload после сетевого сбоя использует тот же `request_id`;
- `+7` и `8` нормализуются по последним 10 цифрам;
- fingerprint хранится как `fnv1a-...`, без исходного телефона и текста заявки;
- pending state очищается только после подтверждённого `data.ok === true`;
- duplicate response показывает корректный текст и серверный номер обращения;
- `assets/public-lead-reference-v1.js` использует тот же fingerprint на `request.html`;
- `tools/test_public_lead_shared_retry.mjs` проверяет поведение автоматически.

Корректировка охвата зафиксирована в `docs/PUBLIC_LEAD_RETRY_COVERAGE_CORRECTION_2026-07-10.md`, ручная матрица — в `docs/PUBLIC_LEAD_SHARED_RETRY_MANUAL_TEST_2026-07-10.md`, задача — #210.

Manual browser proof site-wide retry idempotency всё ещё требуется.
'''
if old in text:
    text = text.replace(old, new, 1)
elif new not in text:
    raise SystemExit('retry progress section not found')

text = text.replace('- site-wide shared-form retry idempotency (#210);', '- browser proof site-wide retry idempotency;', 1)
text = text.replace('1. Apply #210 through a normal working-copy/PR line patch.\n2. Prepare safe `catalog_id` patch/checker for #169 without risky full-file replacement.\n3. Add status/action transition registry for transaction-backed commands.\n4. Expand manual browser evidence checklists.\n5. Prepare development-branch test specifications for #201/#202/#204.\n6. Keep #200 updated with completed and approval-gated work.', '1. Prepare safe `catalog_id` patch/checker for #169 without risky full-file replacement.\n2. Add status/action transition registry for transaction-backed commands.\n3. Expand manual browser evidence checklists, including site-wide retry proof.\n4. Prepare development-branch test specifications for #201/#202/#204.\n5. Keep #200 updated with completed and approval-gated work.', 1)

if text == original:
    print('already-applied')
else:
    path.write_text(text, encoding='utf-8')
    print('changed')
