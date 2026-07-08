#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
helper = root / 'crm/v4/assets/v4/lead-analytics-normalization.js'
plan = root / 'docs/CRM_LEAD_ANALYTICS_NORMALIZATION_PLAN_2026-07-07.md'

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
    ]
    for marker in required:
        if marker not in text:
            errors.append(f'Missing plan marker: {marker}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('CRM lead analytics normalization helper and plan are valid.')
