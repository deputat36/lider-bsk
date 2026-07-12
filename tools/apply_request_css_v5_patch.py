#!/usr/bin/env python3
from pathlib import Path

PAGE = Path('request.html')
CSS = Path('assets/public-request.css')
page = PAGE.read_text(encoding='utf-8')

start_tag = '<style>'
end_tag = '</style>'
if page.count(start_tag) != 1 or page.count(end_tag) != 1:
    raise SystemExit('Expected exactly one request page style block')
if CSS.exists():
    raise SystemExit('assets/public-request.css already exists; guarded patch stopped')

start = page.index(start_tag)
end = page.index(end_tag, start)
css = page[start + len(start_tag):end].strip()
for marker in (
    ':root{--black:#1a1a1a',
    '.header__inner{min-height:76px',
    '.hero__grid{display:grid',
    '.scenario-grid{display:grid',
    '.info-grid{display:grid',
    '.after-submit{background:#fff}',
    '@media(max-width:900px)',
    '@media(max-width:560px)',
):
    if marker not in css:
        raise SystemExit(f'Request CSS marker missing before extraction: {marker}')

page = page[:start] + '<link rel="stylesheet" href="assets/public-request.css?v=1">' + page[end + len(end_tag):]
replacements = (
    (
        'Оставьте заявку на баннер, табличку, наклейки, печать на пленке, дизайн, соцсети или оформление бизнеса. Заявка попадет в CRM РА Лидер.',
        'Оставьте заявку на баннер, табличку, наклейки, печать на пленке, дизайн, соцсети или оформление бизнеса. После отправки вы получите номер обращения для быстрой проверки.',
    ),
    ('Заявка сразу попадёт в CRM', 'Номер обращения после отправки'),
    ('assets/public-lead-form.js?v=4', 'assets/public-lead-form.js?v=5'),
)
for old, new in replacements:
    count = page.count(old)
    if count != 1:
        raise SystemExit(f'Expected exactly one request marker, found {count}: {old}')
    page = page.replace(old, new, 1)

for marker in ('Заявка попадет в CRM', 'Заявка сразу попадёт в CRM', 'assets/public-lead-form.js?v=4', '<style>', '</style>'):
    if marker in page:
        raise SystemExit(f'Stale request marker remains: {marker}')
if page.count('assets/public-request.css?v=1') != 1:
    raise SystemExit('Request stylesheet link must appear exactly once')

CSS.write_text('/* RA Lider public request page styles. Extracted without visual changes. */\n' + css + '\n', encoding='utf-8')
PAGE.write_text(page, encoding='utf-8')
print(f'Extracted {len(css)} request CSS characters, removed CRM copy and updated form to v5.')
