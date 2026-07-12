#!/usr/bin/env python3
from pathlib import Path

PAGE = Path('index.html')
CSS = Path('assets/public-homepage.css')
text = PAGE.read_text(encoding='utf-8')

start_tag = '<style>'
end_tag = '</style>'
start_count = text.count(start_tag)
all_start_count = text.count('<style')
end_count = text.count(end_tag)

if start_count != 1 or end_count != 1:
    raise SystemExit(
        'Expected exactly one homepage style block; '
        f'exact_start={start_count}, all_start={all_start_count}, end={end_count}'
    )
if CSS.exists():
    raise SystemExit('assets/public-homepage.css already exists; guarded extraction stopped')

start = text.index(start_tag)
end = text.index(end_tag, start)
css = text[start + len(start_tag):end].strip()

for marker in (
    ':root{--black:#1a1a1a',
    '.mark{position:relative',
    '.hero__facts{display:grid',
    '.packages{display:grid',
    '.steps{display:grid',
    '.cta{position:relative',
    '.mobile-cta',
    '@media(max-width:1060px)',
    '@media(max-width:720px)',
):
    if marker not in css:
        raise SystemExit(f'Homepage CSS marker missing before extraction: {marker}')

CSS.write_text(
    '/* RA Lider public homepage styles. Extracted from index.html without visual changes. */\n' + css + '\n',
    encoding='utf-8',
)

replacement = '<link rel="stylesheet" href="assets/public-homepage.css?v=1">'
text = text[:start] + replacement + text[end + len(end_tag):]

replacements = (
    ('assets/public-lead-form.css?v=3', 'assets/public-lead-form.css?v=4'),
    ('assets/public-lead-form.js?v=4', 'assets/public-lead-form.js?v=5'),
)
for old, new in replacements:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'Expected exactly one cache marker, found {count}: {old}')
    text = text.replace(old, new, 1)

if start_tag in text or end_tag in text:
    raise SystemExit('Homepage inline style block remains after extraction')
if text.count('assets/public-homepage.css?v=1') != 1:
    raise SystemExit('Homepage stylesheet link must appear exactly once')

PAGE.write_text(text, encoding='utf-8')
print(f'Extracted {len(css)} CSS characters and updated homepage form cache markers.')
