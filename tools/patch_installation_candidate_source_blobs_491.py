#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GENERATOR = ROOT / 'tools/generate_crm_installation_production_frontend_candidate.py'
CONTRACT = ROOT / 'contracts/crm-installation-production-frontend-candidate-v1.json'

OLD_LOADER = '43f5e029236199ad7022032a6215c04282f5f40a'
NEW_LOADER = '637e600b9a490dc974a5f7d6f70e08b69396835a'
OLD_INDEX = '971efe7840c3086890c434aa087615023876fab9'
NEW_INDEX = '56e76324c0dc979717d0ac3206ad69ccccbd4b42'

for path in (GENERATOR, CONTRACT):
    text = path.read_text(encoding='utf-8')
    for old, new, label in (
        (OLD_LOADER, NEW_LOADER, 'loader'),
        (OLD_INDEX, NEW_INDEX, 'index'),
    ):
        count = text.count(old)
        if count != 1:
            raise SystemExit(f'{path.relative_to(ROOT)}: expected one {label} blob marker, got {count}')
        text = text.replace(old, new, 1)
    path.write_text(text, encoding='utf-8')

print('Installation candidate source blob guards refreshed for PR #491')
