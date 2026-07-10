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
dry_run = root / 'docs/CRM_LEAD_ANALYTICS_NORMALIZED_DRY_RUN_READONLY_2026-07-10.md'
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
        'CRM_LEAD_ANALYTICS_NORMALIZED_DRY_RUN_READONLY_2026-07-10.md',
    ]
    for marker in required:
        if marker not in text:
            errors.append(f'Missing plan marker: {marker}')

if not dry_run.exists():
    errors.append('Missing normalized lead analytics dry run document')
else:
    text = dry_run.read_text(encoding='utf-8')
    required = [
        'Mode: read-only SQL dry run',
        'Snapshot metadata',
        'Total leads: 12',
        '2026-06-07 09:44:56.778722+00',
        '2026-07-01 14:20:01.704428+00',
        'Service category dry run',
        'Source category dry run',
        '| Баннеры | 3 | 1 |',
        '| Ручной ввод | 4 | 2 |',
        'Сбросить поиск',
        'No DDL was executed',
        'No DML was executed',
        'No Edge Function deploy was executed',
    ]
    for marker in required:
        if marker not in text:
            errors.append(f'Missing dry-run marker: {marker}')

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

print('CRM lead analytics normalization, derived search toggle, clickable summary, dry-run snapshot, badges, plan and manual test are valid.')
