#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
PAGE = ROOT / 'reklama-v-soobshchestvah-borisoglebska.html'
CSS = ROOT / 'assets' / 'public-community-ads.css'
JS = ROOT / 'assets' / 'public-community-ads.js'
CSS_LINK = '  <link rel="stylesheet" href="assets/public-community-ads.css?v=1">'
JS_LINK = '<script src="assets/public-community-ads.js?v=1"></script>'


def normalize_css(text: str) -> str:
    return '\n'.join(line.strip() for line in text.strip().splitlines() if line.strip())


html = PAGE.read_text(encoding='utf-8')
if CSS_LINK in html and JS_LINK in html and '<style>' not in html:
    print('Community advertising asset migration already applied.')
    raise SystemExit(0)

style_blocks = re.findall(r'(?s)^  <style>\s*(.*?)\s*</style>$', html, flags=re.M)
if len(style_blocks) != 1:
    raise SystemExit(f'Expected exactly one page style block, found {len(style_blocks)}')
if normalize_css(style_blocks[0]) != normalize_css(CSS.read_text(encoding='utf-8')):
    raise SystemExit('Inline CSS does not match assets/public-community-ads.css')

inline_scripts = re.findall(r'(?s)<script>(.*?)</script>', html)
if len(inline_scripts) != 1:
    raise SystemExit(f'Expected exactly one executable inline script, found {len(inline_scripts)}')
if inline_scripts[0].strip() != JS.read_text(encoding='utf-8').strip():
    raise SystemExit('Inline JavaScript does not match assets/public-community-ads.js')

before_doctype = html.lower().count('<!doctype html>')
updated, css_count = re.subn(r'(?s)^  <style>\s*.*?\s*</style>$', CSS_LINK, html, count=1, flags=re.M)
updated, js_count = re.subn(r'(?s)<script>.*?</script>', JS_LINK, updated, count=1)
if css_count != 1 or js_count != 1:
    raise SystemExit(f'Unexpected replacement counts: css={css_count}, js={js_count}')
if updated.lower().count('<!doctype html>') != before_doctype:
    raise SystemExit('Document count changed during migration')
if '<style>' in updated:
    raise SystemExit('Inline style remains after migration')

PAGE.write_text(updated, encoding='utf-8')
print('Community advertising asset migration applied.')
