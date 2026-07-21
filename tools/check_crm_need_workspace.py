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
test = (root / 'tools/test_need_workspace_model.mjs').read_text(encoding='utf-8')
manual = (root / 'docs/CRM_NEED_DUPLICATE_REVIEW_MANUAL_TEST_2026-07-21.md').read_text(encoding='utf-8')
staging_report_path = root / 'docs/CRM_NEED_DUPLICATE_REVIEW_STAGING_2026-07-21.md'
staging_sql_path = root / 'supabase/staging/20260721102500_staging_need_duplicate_dependency_compat.sql'
production_sql_path = root / 'supabase/migrations/20260721102500_staging_need_duplicate_dependency_compat.sql'

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
    'CRM_V4_ACTIONS.NEEDS_READ',
    'CRM_V4_ACTIONS.NEEDS_WRITE',
    'CRM_V4_ACTIONS.CALCULATIONS_WRITE',
    'requireV4Action',
    'renderDuplicateReview',
    'needDuplicateSummary',
    'duplicateMetaMap',
    'loadNeedArchiveDependencies',
    "from('leader_lead_calculations')",
    ".in('need_id', ids)",
    'NEED_ARCHIVE_DEPENDENCY_FIELDS',
    'needArchiveDecision',
    'archiveBusy.has(need.id)',
    'globalThis.confirm(decision.confirmMessage)',
    'Проверяю расчёты, КП и заказы',
    'Дубль архивирован, основная запись сохранена',
    'data-need-duplicate-focus',
    'CSS.escape',
]:
    if marker not in needs:
        errors.append('Missing need workspace marker: ' + marker)

for marker in [
    'needFingerprint',
    'findDuplicateNeed',
    'needDraftFromRecord',
    'needFormPresentation',
    'duplicateNeedGroups',
    'needDuplicateSummary',
    'needDuplicateMeta',
    'needArchiveDecision',
    'dependencyCountsByNeed',
    'linkedCalculationCount',
    "code: 'linked'",
    "code: 'keeper'",
    "code: 'duplicate'",
    'Сначала архивируйте более поздний дубль',
]:
    if marker not in model:
        errors.append('Missing pure need model marker: ' + marker)

for forbidden in [".from('", '.insert(', '.update(', '.delete(', '.upsert(', '.rpc(', 'fetch(']:
    if forbidden in model:
        errors.append('Need workspace model must remain browser-only: ' + forbidden)

for marker in [
    'data-action="open-create-need"',
    '<div id="needFormBox"></div>',
]:
    if marker not in lead_card:
        errors.append('Missing lead card workspace marker: ' + marker)

for marker in [
    '.v4-need-workspace-summary',
    '.v4-need-form-head',
    '.v4-needs-head-actions',
    '.v4-need-duplicate-panel',
    '.v4-need-card.is-duplicate',
    '.v4-need-duplicate-note.is-keeper',
    '.v4-need-card.is-duplicate-focus',
    '@media(max-width:520px)',
]:
    if marker not in styles:
        errors.append('Missing responsive need style: ' + marker)

for marker in [
    'needs.css?v=20260721-duplicates-1',
    'lead-card.js?v=20260721-assignment-1',
    'needs.js?v=20260721-duplicates-1',
]:
    if marker not in html:
        errors.append('Missing cache marker: ' + marker)

for marker in [
    'duplicateNeedGroups([thirdBanner, banner, sameBanner])',
    "keeperId, 'need-1'",
    "linkedGroup[0].keeperId, 'need-2'",
    "duplicateDecision.code, 'duplicate'",
    "linkedDecision.code, 'linked'",
    'Need workspace model behavior and duplicate archive decisions are valid.',
]:
    if marker not in test:
        errors.append('Missing duplicate behavior test marker: ' + marker)

for marker in [
    'Production Supabase не изменять',
    '4 записи уже имеют статус `Архив`',
    '3 активные записи имеют статус `Черновик`',
    'read-only SELECT',
    'Блокировка основной записи',
    'Связанный расчёт, КП или заказ',
    'Повторный клик',
    'Mobile 360–430 px',
]:
    if marker not in manual:
        errors.append('Missing duplicate manual-test marker: ' + marker)

if not staging_report_path.exists():
    errors.append('Missing staging duplicate-review report')
else:
    staging_report = staging_report_path.read_text(encoding='utf-8')
    for marker in [
        'staging_need_duplicate_dependency_compat',
        'три полностью одинаковые активные потребности',
        'calculation_count = 1',
        'запись с расчётом должна быть выбрана основной',
        'lead_rows = 0',
        'need_rows = 0',
        'calculation_rows = 0',
        'Production DDL/DML',
        'Новых критических предупреждений не появилось',
    ]:
        if marker.lower() not in staging_report.lower():
            errors.append('Missing staging duplicate-review marker: ' + marker)

if not staging_sql_path.exists():
    errors.append('Missing staging-only need duplicate compatibility SQL')
else:
    staging_sql = staging_sql_path.read_text(encoding='utf-8')
    for marker in [
        'Staging-only',
        'Never apply this file to production',
        'add column if not exists is_current_revision boolean not null default true',
    ]:
        if marker.lower() not in staging_sql.lower():
            errors.append('Missing staging duplicate compatibility marker: ' + marker)

if production_sql_path.exists():
    errors.append('Staging need duplicate compatibility SQL must never exist under supabase/migrations')

for marker in [
    '## Основной маршрут',
    '## Обязательные данные',
    '## Нестандартные ситуации',
    '## Правила следующего действия',
    '## Ранжированный UX-аудит',
]:
    if marker not in product:
        errors.append('Missing product model section: ' + marker)

if "from('leader_lead_needs').update({ status: 'Архив'" not in needs:
    errors.append('Existing needs.js write module must remain the archive owner')
if "from('leader_lead_calculations')" not in needs or ".select(NEED_ARCHIVE_DEPENDENCY_FIELDS)" not in needs:
    errors.append('Archive must run dependency preflight before the existing write')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('CRM need workspace, duplicate review, staging evidence and dependency-safe archive contract are valid.')
