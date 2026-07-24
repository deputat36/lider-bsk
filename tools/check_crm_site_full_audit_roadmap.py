#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
doc = root / 'docs/CRM_SITE_FULL_AUDIT_AND_ROADMAP_2026-07-10.md'
profile_manual = root / 'docs/CRM_PROFILE_FIRST_BOOT_MANUAL_TEST_2026-07-10.md'
helper = root / 'assets/public-lead-reference-v1.js'
form = root / 'assets/public-lead-form.js'
auth = root / 'crm/v4/assets/v4/auth.js'
menu = root / 'crm/v4/assets/v4/crm-v4-expanded-menu-v1.js'
calculations = root / 'crm/v4/assets/v4/calculations.js'
public_edge = root / 'supabase/functions/leader-public-lead/index.ts'
public_candidate = root / 'contracts/public-intake-service-role-cutover-candidate-v1.json'

errors = []

if not doc.exists():
    errors.append('Missing full CRM/site audit roadmap')
else:
    text = doc.read_text(encoding='utf-8')
    required = [
        'сайт → заявка → ответственный → потребность → расчёт → КП → заказ → дизайн → производство → монтаж → оплата → расходы → прибыль → повторный контакт',
        'P0 — публичный intake можно обойти через прямой REST insert',
        'SUPABASE_SERVICE_ROLE_KEY',
        'anon INSERT',
        'P0 — роли существуют, но не являются server-side источником истины',
        'profile-first boot',
        'два backend-контракта CRM',
        '7 активных лидов не имеют `assigned_to`',
        '9 из 14 потребностей заполнены менее чем на 80%',
        'В базе 5 заказов, 3 платежа и 0 расходов',
        '`leader_design_tasks` содержит 0 строк',
        '`catalog_id: raw.catalog_id || null`',
        'Retry idempotency public form — выполнено в source',
        'Manual browser verification остаётся обязательной',
        'no Supabase DDL was executed',
        'no Supabase DML was executed',
        'no `nav_*` object was modified',
    ]
    for marker in required:
        if marker not in text:
            errors.append(f'Missing audit marker: {marker}')

source_checks = [
    (helper, [
        "const STORAGE_KEY='leader_public_lead_pending_v1'",
        'payload.request_id=pending.request_id',
        'const duplicate=params.duplicate===true',
    ]),
    (form, [
        "const ENDPOINT='https://ofewxuqfjhamgerwzull.supabase.co/functions/v1/leader-public-lead'",
        'request_id:rid',
        "goal('lead_sent',{service,page:location.href,page_path:location.pathname,request_id:responseRequestId,duplicate})",
    ]),
    (auth, [
        'function beginProfileCheck(session)',
        'async function resolveProfile(user)',
        'async function prepareCrm(session, statusText',
        'if (profile.is_active !== true)',
        'activateCrm(session, profile, statusText)',
        'crmReady: false',
        'Рабочие данные пока не загружаются',
    ]),
    (menu, [
        "{ tab: 'finance_control', label: 'Финансы' }",
        "{ tab: 'user_admin', label: 'Доступ и роли' }",
    ]),
    (calculations, [
        'function calcItem(raw, index)',
        "category: raw.category || 'Расчёт по позиции'",
    ]),
    (public_edge, [
        "Deno.env.get('SUPABASE_SECRET_KEYS')",
        "Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')",
        "headers: { apikey: secretKey }",
        "Authorization: 'Bearer ' + legacyServiceRole",
        "supabaseUrl + '/rest/v1/leader_leads'",
        "supabaseUrl + '/rest/v1/leader_public_lead_audit'",
        "error: 'server_not_configured'",
    ]),
    (profile_manual, [
        'no inactive or unverified profile reaches `crmReady=true`',
        'does not alter Supabase Auth, RLS, grants, policies, database data or Edge Functions',
    ]),
    (public_candidate, [
        '"status": "source_only_not_applied"',
        '"database_changed": false',
        '"edge_deployed": false',
        '"approved": false',
    ]),
]

for path, markers in source_checks:
    if not path.exists():
        errors.append(f'Missing audited source file: {path.relative_to(root)}')
        continue
    text = path.read_text(encoding='utf-8')
    for marker in markers:
        if marker not in text:
            errors.append(f'Missing source marker in {path.relative_to(root)}: {marker}')

if public_edge.exists():
    text = public_edge.read_text(encoding='utf-8')
    for marker in ["Deno.env.get('SUPABASE_ANON_KEY')", "'apikey': anonKey", 'params.anonKey']:
        if marker in text:
            errors.append(f'Legacy anonymous database write marker remains: {marker}')
    for marker in ['type BackendCredential = {', 'function backendCredential(): BackendCredential | null']:
        if text.count(marker) != 1:
            errors.append(f'Public Edge helper must be singleton: {marker}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('Full CRM/site audit roadmap and protected public intake source evidence are present.')
