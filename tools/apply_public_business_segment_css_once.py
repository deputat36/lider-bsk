#!/usr/bin/env python3
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
SHARED_LINK = '<link rel="stylesheet" href="assets/public-business-segment.css?v=1">'
PAGES = {
    'reklama-dlya-magazina-borisoglebsk.html': 'page-business-shop',
    'reklama-dlya-kafe-borisoglebsk.html': 'page-business-cafe',
    'reklama-dlya-salona-krasoty-borisoglebsk.html': 'page-business-beauty',
    'reklama-dlya-servisa-masterskoy-borisoglebsk.html': 'page-business-service',
}
REQUIRED_CSS_MARKERS = (
    ':root{--text:#111827;',
    '.hero{background:radial-gradient(',
    '.grid{display:grid;grid-template-columns:repeat(3,1fr)',
    '.steps{display:grid;grid-template-columns:repeat(4,1fr)',
    '.cta{background:linear-gradient(135deg,#111827,#020617)',
    '@media(max-width:900px)',
)
SHOP_NOOP_MARKERS = (
    "document.addEventListener('DOMContentLoaded'",
    'setTimeout(function(){',
    "document.querySelectorAll('[data-scenario=\"shop\"]')",
    "a.addEventListener('click',function(){})",
    '},300);',
)
SHOP_FORBIDDEN_MARKERS = (
    'fetch(',
    'XMLHttpRequest',
    'localStorage',
    'sessionStorage',
    'location.',
    'window.open',
    'navigator.',
    'document.cookie',
)
INLINE_SCRIPT_RE = re.compile(
    r'<script(?![^>]*\bsrc=)(?![^>]*type=["\']application/ld\+json["\'])[^>]*>(.*?)</script>',
    flags=re.I | re.S,
)

changed = []
for page_name, body_class in PAGES.items():
    path = ROOT / page_name
    html = path.read_text(encoding='utf-8')
    before_doctypes = html.lower().count('<!doctype html>')
    if before_doctypes != 1:
        raise SystemExit(f'{page_name}: expected one doctype before migration, found {before_doctypes}')

    if SHARED_LINK not in html:
        matches = list(re.finditer(r'<style>\s*(.*?)\s*</style>', html, flags=re.S | re.I))
        if len(matches) != 1:
            raise SystemExit(f'{page_name}: expected one inline style block, found {len(matches)}')
        inline_css = matches[0].group(1)
        for marker in REQUIRED_CSS_MARKERS:
            if marker not in inline_css:
                raise SystemExit(f'{page_name}: missing expected inline CSS marker {marker}')
        indent_match = re.search(r'(^[ \t]*)<style>', html, flags=re.M | re.I)
        indent = indent_match.group(1) if indent_match else ''
        html = html[:matches[0].start()] + indent + SHARED_LINK + html[matches[0].end():]

    expected_body = f'<body class="{body_class}">'
    if expected_body not in html:
        if html.count('<body>') != 1:
            raise SystemExit(f'{page_name}: expected one plain body tag')
        html = html.replace('<body>', expected_body, 1)

    executable_scripts = list(INLINE_SCRIPT_RE.finditer(html))
    if page_name == 'reklama-dlya-magazina-borisoglebsk.html':
        if len(executable_scripts) != 1:
            raise SystemExit(f'{page_name}: expected one known no-op inline script, found {len(executable_scripts)}')
        script_body = re.sub(r'\s+', '', executable_scripts[0].group(1))
        missing = [marker for marker in SHOP_NOOP_MARKERS if marker not in script_body]
        forbidden = [marker for marker in SHOP_FORBIDDEN_MARKERS if marker in script_body]
        if missing or forbidden:
            raise SystemExit(
                f'{page_name}: inline script is not the known no-op handler; '
                f'missing={missing}, forbidden={forbidden}'
            )
        match = executable_scripts[0]
        html = html[:match.start()] + html[match.end():]
    elif executable_scripts:
        raise SystemExit(f'{page_name}: unexpected executable inline script')

    if html.lower().count('<!doctype html>') != 1:
        raise SystemExit(f'{page_name}: migration changed doctype count')
    if html.count(SHARED_LINK) != 1:
        raise SystemExit(f'{page_name}: shared stylesheet link count mismatch')
    if '<style' in html.lower() or '</style>' in html.lower():
        raise SystemExit(f'{page_name}: inline style remained')

    original = path.read_text(encoding='utf-8')
    if html != original:
        path.write_text(html, encoding='utf-8')
        changed.append(page_name)

print('Updated pages:', ', '.join(changed) if changed else 'none')
