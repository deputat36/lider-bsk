#!/usr/bin/env python3
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PUBLIC_FORM = ROOT / 'assets' / 'public-lead-form.js'
PUBLIC_EDGE = ROOT / 'supabase' / 'functions' / 'leader-public-lead' / 'index.ts'
CRM_HELPER = ROOT / 'crm' / 'v4' / 'assets' / 'v4' / 'public-lead-audit-helper-v1.js'
CRM_LOADER = ROOT / 'crm' / 'v4' / 'assets' / 'v4' / 'site-cache-note-v1.js'
CHECKLIST = ROOT / 'docs' / 'CRM_V4_AUDIT_V9_CHECK.md'


def read(path: Path) -> str:
    if not path.is_file():
        raise SystemExit(f'Missing required chain file: {path.relative_to(ROOT)}')
    return path.read_text(encoding='utf-8')


def require(text: str, marker: str, source: Path) -> None:
    if marker not in text:
        raise SystemExit(f'Missing {marker!r} in {source.relative_to(ROOT)}')


def forbid(text: str, marker: str, source: Path) -> None:
    if marker in text:
        raise SystemExit(f'Forbidden {marker!r} in {source.relative_to(ROOT)}')


def main() -> None:
    public_form = read(PUBLIC_FORM)
    public_edge = read(PUBLIC_EDGE)
    crm_helper = read(CRM_HELPER)
    crm_loader = read(CRM_LOADER)
    checklist = read(CHECKLIST)

    for marker in (
        'ofewxuqfjhamgerwzull.supabase.co/functions/v1/leader-public-lead',
        'request_id:rid',
        "website:field(form,'website')",
        'page_path:location.pathname',
        'submitted_at:submittedAt',
        'responseRequestId',
        'form.dataset.lastRequestId=responseRequestId',
        'duplicate=data&&data.duplicate===true',
        "goal('lead_sent',{service,page:location.href,request_id:responseRequestId,duplicate})",
    ):
        require(public_form, marker, PUBLIC_FORM)

    for marker in ('parket-public-lead', 'broker-public-lead', 'nav-v2-deal-api'):
        forbid(public_form, marker, PUBLIC_FORM)

    for marker in (
        "'https://www.lider-bsk.ru'",
        "'https://lider-bsk.ru'",
        'MAX_BODY_BYTES = 25_000',
        "error: 'origin_not_allowed'",
        "result: 'suspicious'",
        "reason: 'honeypot_filled'",
        "result: 'rejected'",
        "reason: 'phone_or_message_required'",
        "result: 'duplicate'",
        "reason: 'request_id_conflict'",
        "result: 'error'",
        "result: 'accepted'",
        "reason: 'lead_insert_created'",
        'leader_leads_request_id_key',
    ):
        require(public_edge, marker, PUBLIC_EDGE)

    for marker in (
        'Проверка v9',
        'Тест CRM v4 audit v9',
        'docs/CRM_V4_AUDIT_V9_CHECK.md',
        "from('leader_request_trace')",
        'data-public-trace-open-lead',
        'openLeadRoute',
    ):
        require(crm_helper, marker, CRM_HELPER)

    require(crm_loader, 'public-lead-audit-helper-v1.js?v=20260710-audit-v9-1', CRM_LOADER)

    for marker in (
        'leader-public-lead v9',
        'request_id_conflict',
        'honeypot_filled',
        'phone_or_message_required',
        'Цепочка полная',
    ):
        require(checklist, marker, CHECKLIST)

    print('Site → CRM public request chain contract is valid.')


if __name__ == '__main__':
    main()
