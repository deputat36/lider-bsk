#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
doc = root / 'docs' / 'CRM_V4_BACKEND_WRITE_CONTRACT_INVENTORY_2026-07-10.md'
addendum = root / 'docs' / 'CRM_V4_BACKEND_WRITE_INVENTORY_ADDENDUM_2026-07-10.md'
actions = root / 'crm' / 'v4' / 'assets' / 'v4' / 'action-permissions-v1.js'
crm_dir = root / 'crm' / 'v4' / 'assets' / 'v4'

errors = []
known_direct_write_files = {
    'calculations-advanced.js',
    'calculations-standard.js',
    'calculations.js',
    'contact-control-v1.js',
    'followups.js',
    'installation-job-card-v2.js',
    'lead-card.js',
    'lead-create.js',
    'lead-timeline.js',
    'leads.js',
    'needs.js',
    'offers.js',
    'production-job-card-v2.js',
    'user-admin-v1.js',
}

if not doc.exists():
    errors.append('Missing CRM v4 backend write contract inventory')
else:
    text = doc.read_text(encoding='utf-8')
    required = [
        'simple, non-sensitive reads may remain direct Supabase REST',
        'privileged, multi-table, state-transition and audit-sensitive writes must use versioned RPC/Edge actions',
        'Current direct browser writes',
        '`crm/v4/assets/v4/leads.js`',
        '`crm/v4/assets/v4/needs.js`',
        '`crm/v4/assets/v4/calculations.js`',
        '`crm/v4/assets/v4/offers.js`',
        '`crm/v4/assets/v4/production-job-card-v2.js`',
        '`crm/v4/assets/v4/installation-job-card-v2.js`',
        '`crm/v4/assets/v4/user-admin-v1.js`',
        'transactional `calculation.save`',
        'transactional `offer.create_from_calculation`',
        'transactional `production_job.update`',
        'transactional `installation_job.update`',
        '`leader-crm-leads` v12',
        '`leader-crm-orders` v2',
        'Canonical permission keys',
        '`expected_updated_at` provides optimistic concurrency',
        'no production DDL/DML in this inventory',
        'no `nav_*` changes',
    ]
    for marker in required:
        if marker not in text:
            errors.append(f'Missing backend inventory marker: {marker}')

if not addendum.exists():
    errors.append('Missing CRM v4 backend write inventory addendum')
else:
    text = addendum.read_text(encoding='utf-8')
    required = [
        '`crm/v4/assets/v4/lead-create.js`',
        '`crm/v4/assets/v4/lead-timeline.js`',
        '`crm/v4/assets/v4/calculation-version-editor-v1.js`',
        'canonical action: `leads.create`',
        'future dedicated `lead_events.write` key',
        'canonical permission: `calculations.write`',
        'server action: `calculation.create_version`',
        'production route: fail-closed',
        'removed from the direct-write inventory',
        'source calculation and its items remain unchanged',
        'Confirmed direct-write file set',
        'Any new CRM v4 JavaScript file containing a direct insert/update/delete must be added to the inventory',
        'no production Supabase change was made',
    ]
    for marker in required:
        if marker not in text:
            errors.append(f'Missing backend inventory addendum marker: {marker}')

if not actions.exists():
    errors.append('Missing canonical CRM v4 action registry')
else:
    text = actions.read_text(encoding='utf-8')
    required = [
        'export const CRM_V4_ACTIONS',
        'export const CRM_V4_ROLE_ACTIONS',
        "LEADS_TRANSITION: 'leads.transition'",
        "CALCULATIONS_WRITE: 'calculations.write'",
        "OFFERS_TRANSITION: 'offers.transition'",
        "ORDERS_TRANSITION: 'orders.transition'",
        "PRODUCTION_WRITE: 'production.write'",
        "INSTALLATION_WRITE: 'installation.write'",
        "FINANCE_WRITE: 'finance.write'",
        "USERS_MANAGE: 'users.manage'",
        'export function canPerformV4Action',
        'export function requireV4Action',
        "enforcement: 'ui_only'",
        'Server-side enforcement is tracked in #202 and #204',
    ]
    for marker in required:
        if marker not in text:
            errors.append(f'Missing canonical action marker: {marker}')

write_tokens = ('.insert(', '.update(', '.delete()')
actual_write_files = set()
for path in crm_dir.glob('*.js'):
    text = path.read_text(encoding='utf-8')
    if any(token in text for token in write_tokens):
        actual_write_files.add(path.name)

unclassified = sorted(actual_write_files - known_direct_write_files)
if unclassified:
    errors.append('Unclassified direct-write CRM files: ' + ', '.join(unclassified))

missing_expected = sorted(known_direct_write_files - actual_write_files)
if missing_expected:
    errors.append('Inventory expects direct writes that are no longer present; update the decision record: ' + ', '.join(missing_expected))

if 'calculation-version-editor-v1.js' in actual_write_files:
    errors.append('Calculation version editor must remain free of direct insert/update/delete writes')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('All CRM v4 direct-write files are classified; calculation version editor is write-free and canonical actions are present.')
