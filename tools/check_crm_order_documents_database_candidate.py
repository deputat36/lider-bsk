#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
spec = root / 'docs/CRM_ORDER_DOCUMENTS_DATABASE_CANDIDATE_SPEC_2026-07-10.md'
migrations = root / 'supabase/migrations'

errors = []

if not spec.exists():
    errors.append('Missing persistent order documents database candidate specification')
else:
    text = spec.read_text(encoding='utf-8')
    required = [
        'Mode: architecture specification only.',
        'No migration file was created',
        '`leader_document_number_counters`',
        '`leader_order_documents`',
        '`leader_order_document_events`',
        '`(document_group_id, version)`',
        '`ON DELETE RESTRICT`',
        '`ON DELETE SET NULL`',
        '`АВР-YYYY-NNNN`',
        'The browser must never calculate the final number.',
        'RLS must be enabled immediately.',
        'revoke all table privileges from `PUBLIC`, `anon`, and `authenticated`',
        'grant only the minimum SELECT/INSERT/UPDATE privileges to `service_role`',
        '`leader_create_order_act_rpc(jsonb)`',
        '`leader_transition_order_document_rpc(jsonb)`',
        'Explicitly revoke EXECUTE from:',
        '`PUBLIC`;',
        '`anon`;',
        '`authenticated`.',
        'Grant EXECUTE only to `service_role`.',
        'idempotency key',
        'Recalculate line totals server-side.',
        'contractor cost',
        'profit or margin',
        'signed documents cannot be silently versioned',
        'voided numbers are never reused',
        'Calculate and store a deterministic snapshot hash.',
        '`documents.send`',
        '`documents.sign`',
        '`documents.void`',
        '`Подписан` and `Аннулирован` are terminal.',
        'PDF files are private by default.',
        'concurrent numbering',
        'security/performance advisors',
        'Do not copy this specification directly into production SQL.',
        'No `nav_*` object may be changed.',
    ]
    for marker in required:
        if marker not in text:
            errors.append(f'Missing order documents database candidate marker: {marker}')

    forbidden = [
        'Production migration applied',
        'RPC deployed to production',
        'public bucket enabled',
        'grant execute to authenticated',
        'grant execute to anon',
        'service_role key in browser',
    ]
    for marker in forbidden:
        if marker in text:
            errors.append(f'Unsafe order documents candidate marker: {marker}')

if migrations.exists():
    unexpected = [
        path for path in migrations.glob('*order*document*.sql')
        if 'candidate' in path.name.lower() or 'act' in path.name.lower()
    ]
    if unexpected:
        errors.append('Approval-gated order document candidate must not be placed in supabase/migrations: ' + ', '.join(str(p.relative_to(root)) for p in unexpected))

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('Persistent order documents database candidate is non-executable, service-role-only and approval-gated.')
