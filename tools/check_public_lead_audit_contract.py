#!/usr/bin/env python3
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / 'supabase/migrations/20260621_leader_public_lead_audit.sql'
FUNCTION = ROOT / 'supabase/functions/leader-public-lead/index.ts'
SNAPSHOT = ROOT / 'docs/PUBLIC_LEAD_AUDIT_READONLY_2026-07-11.md'

EXPECTED_COLUMNS = (
    'created_at',
    'request_id',
    'phone_normalized',
    'source_page_path',
    'page_url',
    'user_agent',
    'referer',
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'result',
    'reason',
    'payload',
)

RESULT_REASONS = {
    'accepted': 'lead_insert_created',
    'duplicate': 'request_id_conflict',
    'suspicious': 'honeypot_filled',
    'rejected': 'phone_or_message_required',
    'error': 'insert_failed',
}

AUDIT_FIELD_MARKERS = (
    'request_id: params.requestId || null',
    'phone_normalized: params.phoneNormalized || null',
    'source_page_path: params.sourcePagePath || null',
    'page_url: params.pageUrl || null',
    'user_agent: params.userAgent || null',
    'referer: params.referer || null',
    'utm_source: params.utmSource || null',
    'utm_medium: params.utmMedium || null',
    'utm_campaign: params.utmCampaign || null',
    'result: params.result',
    'reason: params.reason || null',
    'payload: params.payload || {}',
)


def require_file(path: Path, errors: list[str]) -> str:
    if not path.is_file():
        errors.append(f'Missing file: {path.relative_to(ROOT)}')
        return ''
    return path.read_text(encoding='utf-8')


def main() -> None:
    errors: list[str] = []
    migration = require_file(MIGRATION, errors)
    function = require_file(FUNCTION, errors)
    snapshot = require_file(SNAPSHOT, errors)

    if migration:
        table_match = re.search(
            r'create table if not exists public\.leader_public_lead_audit\s*\((.*?)\n\);',
            migration,
            flags=re.S | re.I,
        )
        if not table_match:
            errors.append('Audit table create block is missing')
        else:
            table_block = table_match.group(1)
            columns = {
                match.group(1)
                for match in re.finditer(r'^\s*([a-z_][a-z0-9_]*)\s+', table_block, flags=re.M)
            }
            missing = [column for column in EXPECTED_COLUMNS if column not in columns]
            if missing:
                errors.append('Audit migration missing columns: ' + ', '.join(missing))

        required_migration_markers = (
            "result text not null default 'accepted'",
            "payload jsonb not null default '{}'::jsonb",
            "accepted, duplicate, rejected, suspicious, error",
        )
        for marker in required_migration_markers:
            if marker not in migration:
                errors.append(f'Audit migration missing marker: {marker}')

    if function:
        for marker in AUDIT_FIELD_MARKERS:
            if marker not in function:
                errors.append(f'Edge Function audit mapping missing: {marker}')

        for result, reason in RESULT_REASONS.items():
            pair_pattern = re.compile(
                rf"result:\s*'{re.escape(result)}'.*?reason:\s*'{re.escape(reason)}'",
                flags=re.S,
            )
            if not pair_pattern.search(function):
                errors.append(f'Edge Function missing audit outcome: {result} / {reason}')

        for marker in (
            'leader_public_lead_audit_insert_failed',
            'leader_public_lead_audit_request_failed',
            "return json(req, 200, { ok: true, request_id: requestId, duplicate: true })",
        ):
            if marker not in function:
                errors.append(f'Edge Function missing diagnostic/response marker: {marker}')

    if snapshot:
        for marker in (
            '2026-07-11',
            'только чтением',
            'leader-public-lead v9',
            'result = accepted',
            'reason = lead_insert_created',
            'количество: `1`',
            'duplicate / request_id_conflict',
            'suspicious / honeypot_filled',
            'rejected / phone_or_message_required',
            'error / insert_failed',
            'Поля `event_type` в live-схеме нет',
            'DDL, DML, RLS, grants и данные не менялись',
        ):
            if marker not in snapshot:
                errors.append(f'Read-only audit snapshot missing marker: {marker}')

    if errors:
        print('\n'.join(errors))
        sys.exit(1)

    print('Public lead audit schema and Edge Function contract are valid.')


if __name__ == '__main__':
    main()
