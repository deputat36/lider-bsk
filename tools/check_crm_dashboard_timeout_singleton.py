#!/usr/bin/env python3
from pathlib import Path

path = Path('crm/v4/assets/v4/management-dashboard-v3.js')
text = path.read_text(encoding='utf-8')
constant = 'const DASHBOARD_SOURCE_TIMEOUT_MS = 12000;'
count = text.count(constant)

if count != 1:
    raise SystemExit(f'DASHBOARD_SOURCE_TIMEOUT_MS must occur exactly once, got {count}')

required = [
    "import { timeout, friendlyError } from './api.js';",
    'const response = await timeout(',
    'DASHBOARD_SOURCE_TIMEOUT_MS,',
    'sourceErrors.push(`${label} — ${friendlyError(error)}`)',
]
missing = [fragment for fragment in required if fragment not in text]
if missing:
    raise SystemExit('missing startup resilience fragments:\n' + '\n'.join(missing))

print('crm dashboard timeout singleton: ok')
