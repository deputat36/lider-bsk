#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OLD = 'fd9c73b5b01f7a606e0bf3d12967fb100716b792'
NEW = '4b855aac457d03d0a95aca6fbe0e7bc25d4105c7'
PATHS = [
    ROOT / 'tools/generate_crm_installation_production_frontend_candidate.py',
    ROOT / 'contracts/crm-installation-production-frontend-candidate-v1.json',
]

for path in PATHS:
    text = path.read_text(encoding='utf-8')
    count = text.count(OLD)
    if count != 1:
        raise RuntimeError(f'{path.relative_to(ROOT)}: expected one old loader SHA, got {count}')
    path.write_text(text.replace(OLD, NEW, 1), encoding='utf-8')

print('issue 518 shared loader candidate guard synchronized')
