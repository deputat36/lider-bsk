#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
model = (root / 'crm/v4/assets/v4/lead-exception-scenarios-v1.js').read_text(encoding='utf-8')
assistant = (root / 'crm/v4/assets/v4/lead-exception-assistant-v1.js').read_text(encoding='utf-8')
controller = (root / 'crm/v4/assets/v4/lead-exception-apply-v2.js').read_text(encoding='utf-8')
timeline = (root / 'crm/v4/assets/v4/lead-timeline.js').read_text(encoding='utf-8')
manual = (root / 'docs/CRM_LEAD_EXCEPTION_ASSISTANT_MANUAL_TEST_2026-07-20.md').read_text(encoding='utf-8')
staging_report = (root / 'docs/CRM_LEAD_EXCEPTION_ONE_ACTION_STAGING_2026-07-21.md').read_text(encoding='utf-8')
staging_sql_path = root / 'supabase/staging/20260721051000_staging_lead_exception_core.sql'
staging_sql = staging_sql_path.read_text(encoding='utf-8')
production_migration_path = root / 'supabase/migrations/20260721051000_staging_lead_exception_core.sql'

errors = []

for marker in [
    'client_changed',
    'additional_work',
    'client_thinks',
    'no_contact',
    'too_expensive',
    'deadline_shift',
    'buildLeadExceptionPlan',
    'buildLeadExceptionApplication',
    'leadExceptionApplyOutcome',
    'одним действием',
]:
    if marker not in model:
        errors.append('Missing exception model marker: ' + marker)

for source_name, source in [('model', model), ('assistant', assistant)]:
    for forbidden in ['supabaseClient', ".from('", '.insert(', '.update(', '.delete(', 'fetch(']:
        if forbidden in source:
            errors.append(f'{source_name} must remain without a network/write path: {forbidden}')

for marker in [
    'Ситуация изменилась',
    'data-lead-exception-apply',
    'Применить изменения',
    'data-lead-exception-prepare',
    'Подготовить вручную',
    'data-lead-exception-retry-history',
    'leader-v4:lead-exception-apply-requested',
    'leader-v4:lead-exception-history-retry-requested',
    'leader-v4:lead-exception-apply-state',
    'partial',
]:
    if marker not in assistant:
        errors.append('Missing assistant marker: ' + marker)

for forbidden in ['.click()', '.submit()', 'requestSubmit()', 'leaderAddLeadEvent(']:
    if forbidden in assistant:
        errors.append('Assistant UI must not bypass the dedicated apply controller: ' + forbidden)

for marker in [
    ".from('leader_lead_events')",
    'window.leaderUpdateLeadForException',
    'window.leaderAddLeadEvent',
    'if (busy) return',
    'DEDUPE_WINDOW_MS',
    'checkDuplicate: true',
    'leader-v4:route-change',
    'leadExceptionApplyOutcome',
]:
    if marker not in controller:
        errors.append('Missing apply controller marker: ' + marker)

for forbidden in ['.insert(', '.update(', '.delete(', '.upsert(', '.rpc(', 'service_role']:
    if forbidden in controller:
        errors.append('Apply controller must coordinate existing write modules without a direct write: ' + forbidden)

for marker in [
    "import './lead-exception-assistant-v1.js?v=20260721-one-action-1';",
    'export async function updateLeadForException',
    ".from('leader_leads')",
    '.update({ status, next_contact_at: nextContactAt',
    'window.leaderUpdateLeadForException = updateLeadForException',
    'window.leaderAddLeadEvent = addLeadTimelineEvent',
]:
    if marker not in timeline:
        errors.append('Missing classified timeline write-module marker: ' + marker)

for marker in [
    'Desktop',
    'Mobile',
    'Одно действие',
    'Частичный результат',
    'Повтор только истории',
    'Двойной клик',
    'Ручной запасной путь',
    'Production boundary',
]:
    if marker not in manual:
        errors.append('Missing manual test marker: ' + marker)

for marker in [
    'staging_lead_exception_core_20260721',
    'service_role',
    'anon',
    'authenticated',
    'синтетический',
    'production migration не требуется',
]:
    if marker.lower() not in staging_report.lower():
        errors.append('Missing staging report marker: ' + marker)

for marker in [
    'Staging-only',
    'Never apply this file to production',
    'add column if not exists next_contact_at',
    'create table if not exists public.leader_lead_events',
    'enable row level security',
    'revoke all on table public.leader_leads from public, anon, authenticated',
    'revoke all on table public.leader_lead_events from public, anon, authenticated',
    'grant select, insert, update, delete on table public.leader_lead_events to service_role',
]:
    if marker.lower() not in staging_sql.lower():
        errors.append('Missing staging SQL safety marker: ' + marker)

if production_migration_path.exists():
    errors.append('Staging-only SQL must never exist under supabase/migrations')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('CRM lead exception assistant one-action contract is valid.')
