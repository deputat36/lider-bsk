#!/usr/bin/env python3
from pathlib import Path
import runpy
import sys

root = Path(__file__).resolve().parents[1]
plan = root / 'docs/PUBLIC_INTAKE_SERVICE_ROLE_CUTOVER_PLAN_2026-07-10.md'
edge = root / 'supabase/functions/leader-public-lead/index.ts'
form = root / 'assets/public-lead-form.js'
retry = root / 'assets/public-lead-reference-v1.js'
candidate_checker = root / 'tools/check_public_intake_service_role_candidate.py'
errors = []

if not plan.exists():
    errors.append('Missing protected public intake cutover plan')
else:
    text = plan.read_text(encoding='utf-8')
    required = [
        'Mode: design and source plan only',
        'SUPABASE_SECRET_KEYS',
        'SUPABASE_SERVICE_ROLE_KEY',
        'backend-only and bypass RLS',
        'revoke insert on table public.leader_leads from anon',
        'revoke insert on table public.leader_public_lead_audit from anon',
        'Do not store raw IP addresses',
        'Development-branch test matrix',
        'Direct write',
        'Rollback',
        'no production change without explicit approval',
        'no isolated grant/policy change without the matching Edge cutover',
    ]
    for marker in required:
        if marker not in text:
            errors.append(f'Missing intake cutover marker: {marker}')

source_checks = {
    edge: [
        "Deno.env.get('SUPABASE_SECRET_KEYS')",
        "Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')",
        "headers: { apikey: secretKey }",
        "Authorization: 'Bearer ' + legacyServiceRole",
        "supabaseUrl + '/rest/v1/leader_leads'",
        "supabaseUrl + '/rest/v1/leader_public_lead_audit'",
        'isAllowedOrigin(req)',
        'honeypot_filled',
        'request_id_conflict',
    ],
    form: [
        '/functions/v1/leader-public-lead',
        'request_id:rid',
    ],
    retry: [
        "const STORAGE_KEY='leader_public_lead_pending_v1'",
        'payload.request_id=pending.request_id',
    ],
}

for path, markers in source_checks.items():
    if not path.exists():
        errors.append(f'Missing intake source file: {path.relative_to(root)}')
        continue
    text = path.read_text(encoding='utf-8')
    for marker in markers:
        if marker not in text:
            errors.append(f'Missing intake source marker in {path.relative_to(root)}: {marker}')

if edge.exists():
    text = edge.read_text(encoding='utf-8')
    for marker in ["Deno.env.get('SUPABASE_ANON_KEY')", "'apikey': anonKey", 'params.anonKey']:
        if marker in text:
            errors.append(f'Legacy public database credential remains in Edge source: {marker}')

if not candidate_checker.exists():
    errors.append('Missing public intake service-role candidate checker')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

runpy.run_path(str(candidate_checker), run_name='__main__')
print('Protected public intake source candidate and cutover plan are complete; production remains unchanged.')
