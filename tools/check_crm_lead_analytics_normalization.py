#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
helper = root / 'crm/v4/assets/v4/lead-analytics-normalization.js'
badges = root / 'crm/v4/assets/v4/lead-analytics-badges-v1.js'
summary = root / 'crm/v4/assets/v4/lead-analytics-summary-v1.js'
leads = root / 'crm/v4/assets/v4/leads.js'
index = root / 'crm/v4/index.html'
plan = root / 'docs/CRM_LEAD_ANALYTICS_NORMALIZATION_PLAN_2026-07-07.md'
source_audit = root / 'docs/PUBLIC_LEAD_FUNNEL_AGGREGATES_READONLY_2026-07-15.md'
previous_source_audit = root / 'docs/PUBLIC_LEAD_FUNNEL_AGGREGATES_READONLY_2026-07-05.md'
dry_run = root / 'docs/CRM_LEAD_ANALYTICS_NORMALIZED_DRY_RUN_READONLY_2026-07-15.md'
previous_dry_run = root / 'docs/CRM_LEAD_ANALYTICS_NORMALIZED_DRY_RUN_READONLY_2026-07-10.md'
manual_test = root / 'docs/CRM_LEAD_ANALYTICS_BADGES_MANUAL_TEST_2026-07-09.md'

errors = []

if not helper.exists():
    errors.append('Missing lead analytics normalization helper')
else:
    text = helper.read_text(encoding='utf-8')
    required = [
        'normalizeLeadServiceCategory',
        'normalizeLeadSourceCategory',
        'deriveLeadAnalytics',
        'leadAnalyticsSearchText',
        'Баннеры',
        'Наклейки',
        'Таблички',
        'Вывески',
        'ПВХ изделия',
        'Ручной ввод',
        "['Сайт', ['сайт', 'site', 'lider-bsk.ru', 'форма сайта']]",
        "['Ручной ввод', ['вручную', 'звонок', 'офис', 'рекомендация']]",
    ]
    for marker in required:
        if marker not in text:
            errors.append(f'Missing helper marker: {marker}')

if not leads.exists():
    errors.append('Missing CRM leads module')
else:
    text = leads.read_text(encoding='utf-8')
    required = [
        "import { leadAnalyticsSearchText } from './lead-analytics-normalization.js';",
        'function leadHaystack(lead)',
        'leadAnalyticsSearchText(lead)',
    ]
    for marker in required:
        if marker not in text:
            errors.append(f'Missing leads search marker: {marker}')

if not badges.exists():
    errors.append('Missing lead analytics badges module')
else:
    text = badges.read_text(encoding='utf-8')
    required = [
        "import './lead-analytics-summary-v1.js'",
        "import { v4State } from './state.js'",
        "import { deriveLeadAnalytics } from './lead-analytics-normalization.js'",
        'MutationObserver',
        'leader-v4:leads-loaded',
        'Услуга:',
        'Источник:',
    ]
    for marker in required:
        if marker not in text:
            errors.append(f'Missing badges marker: {marker}')

if not summary.exists():
    errors.append('Missing lead analytics summary module')
else:
    text = summary.read_text(encoding='utf-8')
    required = [
        "import { v4State, subscribeState } from './state.js'",
        "import { setLeadFilters } from './state.js'",
        "import { renderLeads } from './leads.js'",
        "import { deriveLeadAnalytics } from './lead-analytics-normalization.js'",
        'Сводка по заявкам',
        'Услуги',
        'Источники',
        'Raw service/source в базе не меняются',
        'data-lead-analytics-search',
        'data-lead-analytics-clear',
        'aria-pressed=',
        'function applySummarySearch(value)',
        'function clearSummarySearch()',
        "current.toLowerCase() === requested.toLowerCase() ? '' : requested",
        "setLeadFilters({ search: '' })",
        'Сбросить поиск',
        'lead-analytics-summary-pill.is-active',
        'renderLeads()',
        'lead-analytics-summary',
    ]
    for marker in required:
        if marker not in text:
            errors.append(f'Missing summary marker: {marker}')

if not index.exists():
    errors.append('Missing CRM v4 index')
else:
    text = index.read_text(encoding='utf-8')
    if 'lead-analytics-badges-v1.js?v=20260709-1' not in text:
        errors.append('CRM index does not load lead analytics badges module')

if not plan.exists():
    errors.append('Missing lead analytics normalization plan')
else:
    text = plan.read_text(encoding='utf-8')
    required = [
        'Keep raw values as the audit trail',
        'Do not change Supabase production',
        'No destructive updates',
        'No automatic backfill',
        'No Supabase DDL/DML',
        'Current public lead contract',
        'Manual browser verification remains required',
        'leadAnalyticsSearchText(lead)',
        'PUBLIC_LEAD_FUNNEL_AGGREGATES_READONLY_2026-07-15.md',
        'Previous source audit',
        'CRM_LEAD_ANALYTICS_NORMALIZED_DRY_RUN_READONLY_2026-07-15.md',
        'Previous normalized dry run',
        'one manual CRM lead increased `Баннеры` from 3 to 4',
    ]
    for marker in required:
        if marker not in text:
            errors.append(f'Missing plan marker: {marker}')

if not previous_source_audit.exists():
    errors.append('Missing previous public lead funnel source audit')

if not source_audit.exists():
    errors.append('Missing current public lead funnel source audit')
else:
    text = source_audit.read_text(encoding='utf-8')
    required = [
        'read-only aggregate checks only',
        'Total leads checked: `13`',
        '2026-06-07 09:44:56.778722+00',
        '2026-07-15 09:55:01.673176+00',
        'leader-public-lead` v10',
        '| Создан заказ | 5 |',
        '| Новая | 3 |',
        '| Расчёт подготовлен | 3 |',
        '| Баннер | 2 |',
        '| Вручную | 2 |',
        '| Сайт | 2 |',
        '| `request_id` | 1 | 7.7% |',
        '| `source_page_path` | 1 | 7.7% |',
        '| `submitted_at` | 1 | 7.7% |',
        '| `utm_source` | 6 | 46.2% |',
        '| `page_url` | 9 | 69.2% |',
        '`5` of `13` leads have status `Создан заказ`',
        'Source and service normalization tasks #196 and #197 are completed',
        'controlled production browser E2E is still approval-gated in issue #206',
        'No DDL was executed',
        'No DML was executed',
        'No CRM UI code was changed',
    ]
    for marker in required:
        if marker not in text:
            errors.append(f'Missing current source-audit marker: {marker}')
    stale_markers = (
        'Total leads checked: `12`',
        '`5` of `12` leads',
        '`Расчёт подготовлен`: `2`',
        'Add a future CRM/reporting task to normalize service categories',
        'Add a future CRM/reporting task to normalize source categories',
    )
    for marker in stale_markers:
        if marker in text:
            errors.append(f'Current source audit contains stale marker: {marker}')

if not previous_dry_run.exists():
    errors.append('Missing previous normalized lead analytics dry run document')

if not dry_run.exists():
    errors.append('Missing current normalized lead analytics dry run document')
else:
    text = dry_run.read_text(encoding='utf-8')
    required = [
        'Mode: read-only SQL dry run',
        'Snapshot metadata',
        'Total leads: 13',
        '2026-06-07 09:44:56.778722+00',
        '2026-07-15 09:55:01.673176+00',
        'Service category dry run',
        'Source category dry run',
        '| Баннеры | 4 | 1 |',
        '| Наклейки | 3 | 0 |',
        '| Таблички | 3 | 3 |',
        '| Ручной ввод | 5 | 2 |',
        '| Сайт | 4 | 1 |',
        'Control total: 13 leads',
        'Change from the 2026-07-10 snapshot',
        'This row is not a public-form submission',
        'source matching uses the combined raw `source` and `page_url` text',
        'Сбросить поиск',
        'No DDL was executed',
        'No DML was executed',
        'No Edge Function deploy was executed',
        'No CRM UI code was changed',
    ]
    for marker in required:
        if marker not in text:
            errors.append(f'Missing current dry-run marker: {marker}')
    if 'Total leads: 12' in text or '| Баннеры | 3 | 1 |' in text or '| Ручной ввод | 4 | 2 |' in text:
        errors.append('Current dry-run document contains stale 2026-07-10 control totals')

if not manual_test.exists():
    errors.append('Missing lead analytics badges manual test document')
else:
    text = manual_test.read_text(encoding='utf-8')
    required = [
        'https://deputat36.github.io/lider-bsk/crm/v4/?tab=leads',
        'Услуга:',
        'Источник:',
        'search works by derived categories',
        'summary category clicks fill the search field and filter the list',
        'active summary category is visually highlighted',
        'clicking the active category again clears the search',
        'Сбросить поиск',
        'aria-pressed="true"',
        'badges are not duplicated',
        'raw source/service values remain visible',
        'no data changes are made in Supabase',
    ]
    for marker in required:
        if marker not in text:
            errors.append(f'Missing manual-test marker: {marker}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('CRM lead analytics normalization, current 13-lead funnel and normalized read-only snapshots, derived search toggle, clickable summary, badges, plan and manual test are valid.')