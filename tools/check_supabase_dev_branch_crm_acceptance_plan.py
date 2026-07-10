#!/usr/bin/env python3
from pathlib import Path
import re
import sys

root = Path(__file__).resolve().parents[1]
plan = root / 'docs/SUPABASE_DEV_BRANCH_CRM_HARDENING_ACCEPTANCE_PLAN_2026-07-10.md'

errors = []

if not plan.exists():
    errors.append('Missing Supabase CRM development-branch acceptance plan')
else:
    text = plan.read_text(encoding='utf-8')
    required = [
        'Related: #200, #201, #202, #204, #214, #217, #219.',
        'No development branch was created, no cost was confirmed',
        'Track A — protected public intake (#201)',
        'Track B — server-side RBAC (#202)',
        'Track C — transaction-backed actions (#204, #217)',
        'Track D — persistent acts of completed work (#214)',
        'call the Supabase branch cost estimator',
        'obtain explicit cost confirmation',
        'Use synthetic accounts only',
        'Do not reuse production staff accounts.',
        'direct anon/browser REST insert into `leader_leads` is denied',
        'manager reads/creates/updates leads but cannot change payment status',
        'designer cannot use generic orders endpoint',
        'accountant response excludes lead payload',
        '`calculation.save`',
        '`offer.create_from_calculation`',
        '`document.create_act`',
        'Repeat the same command with the same idempotency key.',
        'forbidden transitions fail',
        'unique number `АВР-YYYY-NNNN`',
        'signed document cannot be edited',
        'PDF is private by default',
        'run security advisors',
        'run performance advisors',
        'rehearse rollback in the development branch',
        'Passing this plan does not authorize production changes.',
        'No `nav_*` change is permitted at any step.',
        'The connector branch-list request returned a permission-validation error',
    ]
    for marker in required:
        if marker not in text:
            errors.append(f'Missing branch acceptance marker: {marker}')

    forbidden = [
        'branch was created successfully',
        'production migration was applied',
        'production Edge Function was deployed',
        'cost has been confirmed',
        'real staff password',
        'reuse production staff accounts',
    ]
    for marker in forbidden:
        if marker in text:
            errors.append(f'Unsafe or inaccurate branch acceptance marker: {marker}')

    secret_patterns = [
        r'sb_secret_[A-Za-z0-9_-]{12,}',
        r'eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}',
        r'SUPABASE_SERVICE_ROLE_KEY\s*=\s*[^`\s]+',
        r'Authorization:\s*Bearer\s+[A-Za-z0-9._-]{16,}',
    ]
    for pattern in secret_patterns:
        if re.search(pattern, text):
            errors.append(f'Potential secret material in acceptance plan: {pattern}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('Supabase CRM development-branch acceptance plan is complete, synthetic-only and approval-gated.')
