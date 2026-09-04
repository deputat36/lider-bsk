#!/usr/bin/env python3
from pathlib import Path

path = Path(__file__).resolve().parent / 'patch_composite_offer_visibility_143_145.py'
text = path.read_text(encoding='utf-8')
old = '''calc = replace_once(\n    calc,\n    "  if (mode === 'banner') {",\n    composite_ui + "  if (mode === 'banner') {",\n    'composite mode fields'\n)'''
new = '''if 'calcCompositeTitle' not in calc:\n    render_start = calc.find("function renderModeFields(mode = 'banner') {")\n    marker = calc.find("  if (mode === 'banner') {", render_start)\n    if render_start < 0 or marker < 0:\n        raise SystemExit('composite mode fields: renderModeFields banner marker not found')\n    calc = calc[:marker] + composite_ui + calc[marker:]'''
if old not in text:
    raise SystemExit('Expected composite patcher block not found')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
print('Composite patcher render marker fixed')
