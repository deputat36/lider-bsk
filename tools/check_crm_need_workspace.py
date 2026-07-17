#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
needs = (root / 'crm/v4/assets/v4/needs.js').read_text(encoding='utf-8')
model = (root / 'crm/v4/assets/v4/need-workspace-model-v1.js').read_text(encoding='utf-8')
lead_card = (root / 'crm/v4/assets/v4/lead-card.js').read_text(encoding='utf-8')
styles = (root / 'crm/v4/assets/v4/needs.css').read_text(encoding='utf-8')
html = (root / 'crm/v4/index.html').read_text(encoding='utf-8')
product = (root / 'docs/CRM_PRODUCT_SIMPLICITY_AND_EXCEPTION_MODEL.md').read_text(encoding='utf-8')

errors = []

for marker in [
    "mode: 'view'",
    "openNeedForm('edit'",
    "openNeedForm('copy'",
    'findDuplicateNeed(payload',
    'if (saveBusy) return',
    'insertNeedIdempotently',
    ".eq('id', payload.id)",
    'Потребность уже была сохранена — повтор не создан',
    "workspace.mode === 'edit'",
    'Добавить ещё одну позицию',
    'Архивировать',
    'CRM_V4_ACTIONS.NEEDS_READ',
    'CRM_V4_ACTIONS.NEEDS_WRITE',
    'CRM_V4_ACTIONS.CALCULATIONS_WRITE',
    'requireV4Action',
]:
    if marker not in needs:
        errors.append('Missing need workspace marker: ' + marker)

for marker in [
    'needFingerprint',
    'findDuplicateNeed',
    'needDraftFromRecord',
    'needFormPresentation',
]:
    if marker not in model:
        errors.append('Missing pure need model marker: ' + marker)

for forbidden in [".from('", '.insert(', '.update(', '.delete(', 'fetch(']:
    if forbidden in model:
        errors.append('Need workspace model must remain browser-only: ' + forbidden)

for marker in [
    'data-action="open-create-need"',
    '<div id="needFormBox"></div>',
]:
    if marker not in lead_card:
        errors.append('Missing lead card workspace marker: ' + marker)

for marker in ['.v4-need-workspace-summary', '.v4-need-form-head', '.v4-needs-head-actions']:
    if marker not in styles:
        errors.append('Missing responsive need style: ' + marker)

for marker in [
    'needs.css?v=20260717-workspace-1',
    'lead-card.js?v=20260717-first-contact-1',
    'needs.js?v=20260717-load-integrity-1',
]:
    if marker not in html:
        errors.append('Missing cache marker: ' + marker)

for marker in [
    '## Основной маршрут',
    '## Обязательные данные',
    '## Нестандартные ситуации',
    '## Правила следующего действия',
    '## Ранжированный UX-аудит',
]:
    if marker not in product:
        errors.append('Missing product model section: ' + marker)

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('CRM need workspace and product simplicity contract is valid.')
