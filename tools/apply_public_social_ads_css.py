#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / 'reklama-v-socsetyah-borisoglebsk.html'
CSS = ROOT / 'assets' / 'public-social-ads.css'
LINK = '  <link rel="stylesheet" href="assets/public-social-ads.css?v=1">'


def normalize_css(text: str) -> str:
    return '\n'.join(line.strip() for line in text.strip().splitlines() if line.strip())


html = PAGE.read_text(encoding='utf-8')
if LINK in html and '<style>' not in html:
    print('Social advertising CSS migration already applied.')
    raise SystemExit(0)

style_blocks = re.findall(r'(?s)^  <style>\s*(.*?)\s*</style>$', html, flags=re.M)
if len(style_blocks) != 1:
    raise SystemExit(f'Expected exactly one page style block, found {len(style_blocks)}')
if normalize_css(style_blocks[0]) != normalize_css(CSS.read_text(encoding='utf-8')):
    raise SystemExit('Inline CSS does not match assets/public-social-ads.css')

before_doctype = html.lower().count('<!doctype html>')
updated, count = re.subn(r'(?s)^  <style>\s*.*?\s*</style>$', LINK, html, count=1, flags=re.M)
if count != 1:
    raise SystemExit('Failed to replace the page style block')
if updated.lower().count('<!doctype html>') != before_doctype:
    raise SystemExit('Document count changed during migration')
if '<style>' in updated or '</style>' in updated:
    raise SystemExit('Inline style remains after migration')

PAGE.write_text(updated, encoding='utf-8')
print('Social advertising CSS migration applied.')
