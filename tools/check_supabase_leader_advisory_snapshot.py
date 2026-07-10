#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
doc = root / 'docs/SUPABASE_ADVISORS_LEADER_SCOPE_READONLY_2026-07-10.md'

errors = []

if not doc.exists():
    errors.append('Missing scoped Supabase advisor snapshot')
else:
    text = doc.read_text(encoding='utf-8')
    required = [
        'Mode: read-only advisor and SQL inspection',
        'authenticated_can_execute = false',
        '`leader_apply_profile_invite`',
        '`leader_create_order_from_offer_rpc`',
        '`leader_create_order_rpc`',
        '`leader_ensure_profile`',
        '`leader_get_leads_for_crm`',
        '`leader_guard_user_profile_security`',
        '`leader_log`',
        '`leader_my_role`',
        'Leaked Password Protection Disabled',
        'unused noncritical index count: 78',
        'approximately 1,048 kB',
        'largest individual index: 16 kB',
        'No index should be dropped autonomously',
        'No DDL was executed',
        'No DML was executed',
        'No Auth setting was changed',
        'No `nav_*` object was modified',
    ]
    for marker in required:
        if marker not in text:
            errors.append(f'Missing advisory snapshot marker: {marker}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('Scoped Supabase advisor snapshot is present and preserves RA Lider production guardrails.')
