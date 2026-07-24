#!/usr/bin/env python3
from pathlib import Path

path = Path('crm/v4/assets/v4/management-dashboard-v3.js')
text = path.read_text(encoding='utf-8')
duplicate = "const DASHBOARD_SOURCE_TIMEOUT_MS = 12000;\nconst DASHBOARD_SOURCE_TIMEOUT_MS = 12000;\n"
single = "const DASHBOARD_SOURCE_TIMEOUT_MS = 12000;\n"

if duplicate in text:
    text = text.replace(duplicate, single, 1)
elif text.count(single) == 1:
    pass
else:
    raise SystemExit(f'unexpected timeout constant count: {text.count(single)}')

if text.count(single) != 1:
    raise SystemExit(f'timeout constant must occur once, got {text.count(single)}')

path.write_text(text, encoding='utf-8')
print('dashboard timeout duplicate removed')
