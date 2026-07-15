#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
leads = (root / 'crm/v4/assets/v4/leads.js').read_text(encoding='utf-8')
model = (root / 'crm/v4/assets/v4/lead-list-preferences-v1.js').read_text(encoding='utf-8')
html = (root / 'crm/v4/index.html').read_text(encoding='utf-8')
css = (root / 'crm/v4/assets/v4/styles.css').read_text(encoding='utf-8')
errors = []

for marker in ['leadSort', 'resetLeadFiltersBtn', 'leadActiveFilters', 'data-reset-lead-filters']:
    if marker not in html + leads:
        errors.append(f'Missing lead filter UX marker: {marker}')

for marker in ['localStorage', 'LEAD_LIST_PREFERENCES_KEY', 'sortLeadRows', 'describeLeadFilters']:
    if marker not in model:
        errors.append(f'Missing lead preference model marker: {marker}')

if "search:" in model.split('saveLeadListPreferences', 1)[1].split('}', 1)[0]:
    errors.append('Free-text search must not be written to local preferences')

for marker in [".from('leader_leads')", '.update(', '.insert(', '.delete(', 'supabase/functions', 'supabase/migrations']:
    if marker in model:
        errors.append(f'Preference model must remain browser-only: {marker}')

if '@media(max-width:850px)' not in css or '.v4-filter-state-row' not in css:
    errors.append('Missing responsive lead filter layout')

if errors:
    print('\n'.join(errors))
    sys.exit(1)
print('CRM lead list filter UX contract is valid and browser-only.')
