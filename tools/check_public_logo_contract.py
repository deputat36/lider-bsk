#!/usr/bin/env python3
"""Protect the owner's artwork, not a previously reconstructed lookalike."""
import base64
import hashlib
import re
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/brand/source/logo-lider-owner-black-20260717.png'
SOURCE_SHA = '3bf3bb59ac90cdfe535ec2c66339462d5c7d90199b453563226129744bcef833'
NS = '{http://www.w3.org/2000/svg}'
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == SOURCE_SHA, 'Owner source changed'
for name in ('logo-lider-header.svg', 'logo-lider-mark.svg', 'logo-lider-light.svg'):
    path = ROOT / 'assets/brand' / name
    root = ET.fromstring(path.read_text())
    assert root.get('data-source-sha256') == SOURCE_SHA, f'{name}: provenance missing'
    assert not any(root.iter(NS + 'path')), f'{name}: do not retrace the owner logo'
    assert not any(root.iter(NS + 'text')), f'{name}: do not retype the wordmark'
    assert not any(root.iter(NS + 'script')), f'{name}: executable content'
    images = list(root.iter(NS + 'image'))
    assert len(images) == 1
    src = images[0].get('href', '')
    assert src.startswith('data:image/webp;base64,')
    assert base64.b64decode(src.split(',', 1)[1]) == (ROOT / 'assets/brand/source/logo-lider-owner-web-640.webp').read_bytes()
    assert path.stat().st_size < 40000, f'{name}: web logo exceeds 40 KB'
pages = list(ROOT.glob('*.html'))
for page in pages:
    text = page.read_text()
    for brand in re.findall(r'<a\b[^>]*class="brand"[^>]*>(.*?)</a>', text, re.S):
        assert 'class="brand-logo"' in brand and 'logo-lider-header.svg?v=4' in brand, page.name
        assert 'alt="Лидер — рекламное агентство"' in brand, page.name
        assert not re.search(r'<(?:i|svg|strong)\b', brand), f'{page.name}: logo imitation'
    if 'assets/public-lead-form.css?' in text:
        assert 'assets/public-lead-form.css?v=27' in text, f'{page.name}: stale shared form CSS'
        styles = re.findall(r'<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"', text)
        assert styles[-1] == 'assets/public-product-system.css?v=1', f'{page.name}: shared system must load last'
    assert 'logo-lider-light.svg' not in text, f'{page.name}: obsolete asset'
css = (ROOT / 'assets/brand/leader-logo.css').read_text()
assert '108px' in css and '82px' in css and 'object-fit: contain' in css
assert 'logo-lider-header.svg?v=4' in (ROOT / 'crm/v4/index.html').read_text()
printed = (ROOT / 'crm/v4/assets/v4/offer-print-brand-v4.js').read_text()
assert 'logo-lider-header.svg?v=4' in printed and 'logo-mark' not in printed
print(f'Owner logo contract OK: {len(pages)} pages; web/CRM/print; immutable source; no paths or retyped mark')
