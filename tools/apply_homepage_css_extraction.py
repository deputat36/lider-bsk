#!/usr/bin/env python3
from pathlib import Path

PAGE = Path('index.html')
CSS = Path('assets/public-homepage.css')
text = PAGE.read_text(encoding='utf-8')

start_marker = '  <style>\n'
end_marker = '  </style>\n'

if text.count(start_marker) != 1 or text.count(end_marker) != 1:
    raise SystemExit('Expected exactly one homepage style block')
if CSS.exists():
    raise SystemExit('assets/public-homepage.css already exists; guarded extraction stopped')

start = text.index(start_marker)
end = text.index(end_marker, start)
css = text[start + len(start_marker):end].strip()

for marker in (
    ':root{--black:#1a1a1a',
    '.mark{position:relative',
    '.hero__facts{display:grid',
    '.packages{display:grid',
    '.steps{display:grid',
    '.cta{position:relative',
    '.mobile-cta',
    '@media(max-width:1024px)',
):
    if marker not in css:
        raise SystemExit(f'Homepage CSS marker missing before extraction: {marker}')

CSS.write_text(
    '/* RA Lider public homepage styles. Extracted from index.html without visual changes. */\n' + css + '\n',
    encoding='utf-8',
)

replacement = '  <link rel="stylesheet" href="assets/public-homepage.css?v=1">\n'
text = text[:start] + replacement + text[end + len(end_marker):]

replacements = (
    ('assets/public-lead-form.css?v=3', 'assets/public-lead-form.css?v=4'),
    ('assets/public-lead-form.js?v=4', 'assets/public-lead-form.js?v=5'),
)
for old, new in replacements:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'Expected exactly one cache marker, found {count}: {old}')
    text = text.replace(old, new, 1)

if '<style>' in text or '</style>' in text:
    raise SystemExit('Homepage inline style block remains after extraction')
if text.count('assets/public-homepage.css?v=1') != 1:
    raise SystemExit('Homepage stylesheet link must appear exactly once')

PAGE.write_text(text, encoding='utf-8')
print(f'Extracted {len(css)} CSS characters and updated homepage form cache markers.')
