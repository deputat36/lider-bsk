#!/usr/bin/env python3
from pathlib import Path

path = Path(__file__).resolve().parents[1] / 'tools/generate_crm_installation_production_frontend_candidate.py'
text = path.read_text(encoding='utf-8')
old = "'blob_sha': '637e600b9a490dc974a5f7d6f70e08b69396835a',"
new = "'blob_sha': '541fab32ba67b6d0d490deddd0ef6aa3729810ec',"
if text.count(old) != 1:
    raise SystemExit(f'expected exactly one old loader blob pin, got {text.count(old)}')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
