#!/usr/bin/env python3
"""Check shared contact validation and its deployment to all public forms.

Source-only: no production request or customer data is used.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FORM_SCRIPT = 'assets/public-lead-form.js?v=36'
FORM_CSS = 'assets/public-lead-form.css?v=30'


def main() -> None:
    form = (ROOT / 'assets/public-lead-form.js').read_text()
    css = (ROOT / 'assets/public-lead-form.css').read_text()
    doc = (ROOT / 'docs/PUBLIC_REQUEST_CONTACT_METHOD_GUARD_2026-07-13.md').read_text()
    pages = []
    for path in sorted(ROOT.glob('*.html')):
        text = path.read_text()
        if 'assets/public-request-contact-method-v1.js' in text:
            raise SystemExit(f'{path.name}: retired request-only bootstrap remains active')
        if 'assets/public-lead-form.js' not in text:
            continue
        if text.count(FORM_SCRIPT) != 1 or FORM_CSS not in text:
            raise SystemExit(f'{path.name}: shared contact guard cache release is incomplete')
        pages.append(path.name)
    if len(pages) != 64:
        raise SystemExit(f'Expected 64 shared public forms, found {len(pages)}')

    request = (ROOT / 'request.html').read_text()
    ordered = ['assets/public-lead-reference-v1.js?v=1', 'assets/leader-service-catalog.js?v=3', FORM_SCRIPT]
    positions = [request.find(marker) for marker in ordered]
    if min(positions) < 0 or positions != sorted(positions):
        raise SystemExit('request.html: reference, catalog and shared form order changed')

    for marker in (
        'mountContactMethod(form);',
        'const contactError=applyContactMode(form);',
        "detail.addEventListener('invalid'",
        "detail.setCustomValidity?.(error)",
        "detail.setAttribute('aria-required'",
        "detail.setAttribute('aria-invalid'",
        'data-leader-contact-hint',
        'aria-describedby=',
        "goal('contact_detail_missing',params)",
        "reason:'contact_detail_invalid'",
        "form.reset();\n      applyContactMode(form);",
        'Email для ответа',
        'Ссылка на профиль ВКонтакте',
    ):
        if marker not in form:
            raise SystemExit(f'Shared form is missing contact contract: {marker}')
    submit = form[form.index('async function submit(e)'):]
    if submit.index('const contactError=applyContactMode(form)') > submit.index('stableRequestId(payload)'):
        raise SystemExit('Contact validation must precede request ID allocation and HTTP')
    for marker in ('.leader-contact-hint', '.leader-contact-detail-required', '.leader-contact-hint-error'):
        if marker not in css:
            raise SystemExit(f'Shared CSS is missing contact guidance: {marker}')
    for marker in ('64', 'v35', 'HTML5 constraint validation', 'событие '+chr(96)+'invalid'+chr(96), 'production-заявка не создаётся', 'Edge Function и Supabase production не меняются'):
        if marker not in doc:
            raise SystemExit(f'Contact guard document is missing: {marker}')
    print('Shared contact method guard is deployed to all 64 forms with JS v35 / CSS v30.')


if __name__ == '__main__':
    main()
