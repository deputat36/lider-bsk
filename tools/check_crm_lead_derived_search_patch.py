#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
patch = root / 'patches/crm-lead-derived-search.patch'

errors = []

if not patch.exists():
    errors.append('Missing derived lead search patch file')
else:
    text = patch.read_text(encoding='utf-8')
    required = [
        'crm/v4/assets/v4/leads.js',
        "import { leadAnalyticsSearchText } from './lead-analytics-normalization.js';",
        'leadAnalyticsSearchText(lead)',
        'function leadHaystack(lead)',
    ]
    for marker in required:
        if marker not in text:
            errors.append(f'Missing patch marker: {marker}')

    forbidden = [
        'supabase/functions',
        'supabase/migrations',
        'leader_leads.service =',
        'leader_leads.source =',
        'update leader_leads',
        'alter table',
        'drop table',
    ]
    lowered = text.lower()
    for marker in forbidden:
        if marker in lowered:
            errors.append(f'Forbidden patch marker: {marker}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('CRM derived lead search patch is present and scoped to browser search only.')
