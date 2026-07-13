#!/usr/bin/env python3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HARDENING = ROOT / 'supabase' / 'staging-migrations' / '20260713_02_staging_advisor_hardening.sql'
REPORT = ROOT / 'docs' / 'SUPABASE_STAGING_DESIGN_TASK_VALIDATION_2026-07-13.md'
ENV = ROOT / 'contracts' / 'supabase-environments-v1.json'

PRODUCTION = 'ofewxuqfjhamgerwzull'
STAGING = 'otulfnouybahfnsycxqn'
errors = []


def read(path: Path, label: str) -> str:
    if not path.exists():
        errors.append(f'Missing {label}: {path.relative_to(ROOT)}')
        return ''
    return path.read_text(encoding='utf-8')


def require(text: str, markers, label: str):
    for marker in markers:
        if marker not in text:
            errors.append(f'{label}: missing marker {marker!r}')


hardening = read(HARDENING, 'advisor hardening migration')
report = read(REPORT, 'staging validation report')
env = read(ENV, 'environment contract')

if PRODUCTION in hardening:
    errors.append('Hardening migration must not contain production project ref')
if STAGING not in hardening:
    errors.append('Hardening migration must require exact staging project ref')

require(hardening, [
    'staging_environment_guard_failed',
    'revoke execute on function public.rls_auto_enable() from public',
    'revoke execute on function public.rls_auto_enable() from anon',
    'revoke execute on function public.rls_auto_enable() from authenticated',
    'leader_orders_lead_id_idx',
    'leader_design_tasks_production_job_id_idx',
    'leader_design_task_events_order_id_idx',
], 'advisor hardening migration')

require(report, [
    PRODUCTION,
    STAGING,
    'SECURITY INVOKER',
    'idempotent_replay=true',
    'accountant → `forbidden`',
    'inactive profile → `access_denied`',
    'stale `updated_at` → `conflict`',
    'need_design=false',
    'принудительная ошибка INSERT audit event',
    'принудительная ошибка completion receipt',
    'profiles — 0',
    'design tasks — 0',
    'receipts — 0',
    'WARN/ERROR — 0',
    'unindexed foreign keys — 0',
    'production DDL/DML',
], 'staging validation report')

if 'Production data в staging не переносились' not in report:
    errors.append('Validation report must confirm no production-data copy')
if 'production RPC или Edge deploy' not in report:
    errors.append('Validation report must preserve production deploy boundary')
if STAGING not in env or PRODUCTION not in env:
    errors.append('Environment contract must contain both project refs')

if errors:
    print('Supabase staging validation evidence checks failed:', file=sys.stderr)
    for error in errors:
        print(f'- {error}', file=sys.stderr)
    raise SystemExit(1)

print('Supabase staging design-task validation evidence is complete and production-safe.')
