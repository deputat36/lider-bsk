#!/usr/bin/env python3
from pathlib import Path
import json
import re
import sys

root = Path(__file__).resolve().parents[1]
edge = root / 'supabase/functions/leader-public-lead/index.ts'
module = root / 'supabase/functions/leader-public-lead/rate-limit.ts'
migration = root / 'supabase/production-candidates/20260724_02_public_intake_rate_limit_candidate.sql'
rollback = root / 'supabase/production-candidates/rollback/20260724_02_public_intake_rate_limit_candidate_rollback.sql'
contract_path = root / 'contracts/public-intake-rate-limit-candidate-v1.json'
runbook = root / 'docs/PUBLIC_INTAKE_RATE_LIMIT_CANDIDATE_V1_2026-07-24.md'
errors = []

for path in [edge, module, migration, rollback, contract_path, runbook]:
    if not path.exists():
        errors.append(f'missing rate-limit candidate file: {path.relative_to(root)}')

if edge.exists():
    text = edge.read_text(encoding='utf-8')
    for marker in [
        "from './rate-limit.ts'",
        'const RATE_LIMIT_WINDOW_SECONDS = 300',
        'const RATE_LIMIT_IP_MAX = 20',
        'const RATE_LIMIT_PHONE_MAX = 5',
        "Deno.env.get('LEADER_PUBLIC_RATE_LIMIT_SALT')",
        'publicIntakeRateLimitIdentity(req, phoneNormalized, rateLimitSalt)',
        'checkPublicIntakeRateLimit({',
        "error: 'rate_limit_unavailable'",
        "error: 'rate_limited'",
        'retry_after_seconds: rateLimit.retryAfterSeconds',
        "return json(req, 429",
        "return json(req, 503",
    ]:
        if marker not in text:
            errors.append(f'Edge rate-limit marker missing: {marker}')
    for forbidden in ['raw_ip', 'client_ip:', 'ip_address', 'ipHash:', 'phoneHash: rateIdentity.phoneHash,\n      payload']:
        if forbidden in text:
            errors.append(f'Edge may expose private identity: {forbidden}')

if module.exists():
    text = module.read_text(encoding='utf-8')
    for marker in [
        "req.headers.get('x-forwarded-for')",
        "req.headers.get('cf-connecting-ip')",
        "crypto.subtle.digest('SHA-256'",
        '`ip:${normalizedSalt}:${clientIp(req)}`',
        '`phone:${normalizedSalt}:${clean(phoneNormalized, 40)}`',
        '/rest/v1/rpc/leader_public_intake_rate_limit_rpc',
        'p_request_id: params.requestId',
        'p_ip_hash: params.ipHash',
        'p_phone_hash: params.phoneHash',
        "reason: 'rate_limit_unavailable'",
        'idempotentReplay: data.idempotent_replay === true',
    ]:
        if marker not in text:
            errors.append(f'rate-limit module marker missing: {marker}')
    if re.search(r'(console\.|JSON\.stringify\([^)]*)(clientIp|ipHash)', text):
        errors.append('rate-limit module may log raw/private identity')

if migration.exists():
    text = migration.read_text(encoding='utf-8')
    for marker in [
        'leader_private.leader_public_intake_rate_limit_receipts',
        'request_id text primary key',
        "ip_hash ~ '^[0-9a-f]{64}$'",
        "phone_hash is null or phone_hash ~ '^[0-9a-f]{64}$'",
        'enable row level security',
        'revoke all on table leader_private.leader_public_intake_rate_limit_receipts from public, anon, authenticated',
        'security definer',
        'set search_path = pg_catalog, public, leader_private',
        'pg_advisory_xact_lock',
        "'reason', 'rate_limit_ip'",
        "'reason', 'rate_limit_phone'",
        'exception when unique_violation',
        "'reason', 'idempotent_replay'",
        'created_at < v_now - interval \'2 days\'',
        'revoke all on function public.leader_public_intake_rate_limit_rpc',
        'grant execute on function public.leader_public_intake_rate_limit_rpc',
        'to service_role',
        'anon EXECUTE remains',
        'authenticated EXECUTE remains',
    ]:
        if marker not in text:
            errors.append(f'rate-limit SQL marker missing: {marker}')
    for forbidden in ['raw_ip', 'ip_address', 'client_ip', 'delete from public.leader_leads', 'truncate public.leader_leads']:
        if forbidden in text.lower():
            errors.append(f'rate-limit SQL forbidden marker: {forbidden}')

if rollback.exists():
    text = rollback.read_text(encoding='utf-8')
    for marker in [
        'drop function if exists public.leader_public_intake_rate_limit_rpc',
        'drop table if exists leader_private.leader_public_intake_rate_limit_receipts',
        'DO NOT APPLY without explicit owner approval',
    ]:
        if marker not in text:
            errors.append(f'rate-limit rollback marker missing: {marker}')

if contract_path.exists():
    try:
        contract = json.loads(contract_path.read_text(encoding='utf-8'))
    except Exception as exc:
        errors.append(f'invalid rate-limit contract: {exc}')
        contract = {}
    if contract.get('status') != 'source_only_not_applied':
        errors.append('rate-limit contract must remain source_only_not_applied')
    production = contract.get('production') or {}
    if any(production.get(key) is not False for key in ['database_changed', 'edge_deployed', 'data_changed', 'secrets_changed', 'nav_changed']):
        errors.append('rate-limit contract incorrectly claims production changes')
    privacy = contract.get('privacy') or {}
    if privacy.get('raw_ip_stored') is not False or privacy.get('raw_ip_logged') is not False:
        errors.append('rate-limit privacy contract permits raw IP')
    gate = contract.get('approval_gate') or {}
    if gate.get('approved') is not False:
        errors.append('rate-limit production approval must remain false')

if runbook.exists():
    text = runbook.read_text(encoding='utf-8')
    for marker in [
        'Статус: source-only. Production не изменён.',
        'исходный IP не записывается',
        'HTTP 429',
        'HTTP 503',
        'Stop conditions',
        'Rollback',
        'production load test не выполняется без отдельного разрешения',
    ]:
        if marker not in text:
            errors.append(f'rate-limit runbook marker missing: {marker}')

for path in [edge, module, migration, rollback, contract_path, runbook]:
    if path.exists() and re.search(r'(sb_secret_|eyJ[a-zA-Z0-9_-]{20,})', path.read_text(encoding='utf-8')):
        errors.append(f'literal credential-like value in {path.relative_to(root)}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('Public intake rate-limit candidate is complete; production remains unchanged.')
