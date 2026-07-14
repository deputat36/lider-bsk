#!/usr/bin/env python3
from pathlib import Path
import re
import textwrap

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / 'komplekty-reklamy.html'
CSS = ROOT / 'assets' / 'public-ad-packages.css'
LINK = '  <link rel="stylesheet" href="assets/public-ad-packages.css?v=1">'

html = PAGE.read_text(encoding='utf-8')
css = textwrap.dedent(CSS.read_text(encoding='utf-8')).strip()

if LINK in html and '<style>' not in html:
    print('Advertising packages CSS migration already applied.')
    raise SystemExit(0)

matches = re.findall(r'(?s)^  <style>\s*(.*?)\s*</style>$', html, flags=re.M)
if len(matches) != 1:
    raise SystemExit(f'Expected exactly one page style block, found {len(matches)}')

inline_css = textwrap.dedent(matches[0]).strip()
if inline_css != css:
    raise SystemExit('Inline CSS does not match assets/public-ad-packages.css')

before_doctype = html.lower().count('<!doctype html>')
updated, count = re.subn(r'(?s)^  <style>\s*.*?\s*</style>$', LINK, html, count=1, flags=re.M)
if count != 1:
    raise SystemExit('Failed to replace the page style block')
if updated.lower().count('<!doctype html>') != before_doctype:
    raise SystemExit('Document count changed during migration')
if '<style>' in updated or '</style>' in updated:
    raise SystemExit('Inline style block remains after migration')

PAGE.write_text(updated, encoding='utf-8')
print('Advertising packages CSS migration applied.')
