#!/usr/bin/env python3
from pathlib import Path
import re
import sys

root = Path(__file__).resolve().parents[1]
lead_create = root / 'crm/v4/assets/v4/lead-create.js'
styles = root / 'crm/v4/assets/v4/lead-create.css'
index = root / 'crm/v4/index.html'
runtime_test = root / 'tools/test_crm_existing_client_prefill.mjs'
workflow = root / '.github/workflows/crm-existing-client-prefill-check.yml'

checks = {
    lead_create: [
        "const CLIENT_FIELDS = 'id,name,phone,source'",
        'const CLIENT_LIMIT = 200',
        ".from('leader_clients')",
        ".order('name', { ascending: true })",
        '.limit(CLIENT_LIMIT)',
        'id="manualLeadExistingClient"',
        'id="refreshManualLeadClientsBtn"',
        "details.addEventListener('toggle'",
        'function applyExistingClient(clientId)',
        "source.value = 'Повторный клиент'",
        'converted_client_id: existingClientId || null',
        'existing_client_id: existingClientId || null',
        "byId('manualLeadCity').value = 'Борисоглебск'",
        "if (byId('manualLeadBox')?.open) loadExistingClients(false)",
    ],
    styles: [
        '.v4-existing-client-picker',
        'font-weight:900',
        '@media(max-width:640px)',
    ],
    index: [
        'lead-create.css?v=20260718-existing-client-1',
        'lead-create.js?v=20260718-existing-client-1',
    ],
    runtime_test: [
        'closed manual form must not load clients during CRM startup',
        'client lookup must request only minimal fields',
        'new lead must keep the selected client link',
        'cached client list must not issue a duplicate read',
        'client labels must be escaped',
    ],
    workflow: [
        'python3 tools/check_crm_existing_client_prefill.py',
        'node tools/test_crm_existing_client_prefill.mjs',
        'node --check crm/v4/assets/v4/lead-create.js',
    ],
}

errors = []
for path, markers in checks.items():
    if not path.exists():
        errors.append(f'Missing existing-client prefill file: {path.relative_to(root)}')
        continue
    text = path.read_text(encoding='utf-8')
    for marker in markers:
        if marker not in text:
            errors.append(f'Missing existing-client prefill marker in {path.relative_to(root)}: {marker}')

if lead_create.exists():
    text = lead_create.read_text(encoding='utf-8')
    fields = re.search(r"const CLIENT_FIELDS = '([^']+)'", text)
    if not fields:
        errors.append('CLIENT_FIELDS contract is missing')
    else:
        requested = {value.strip() for value in fields.group(1).split(',')}
        if requested != {'id', 'name', 'phone', 'source'}:
            errors.append(f'Client picker requests non-minimal fields: {sorted(requested)}')
    if text.count(".from('leader_clients')") != 1:
        errors.append('Client picker must have exactly one lazy read owner')
    for forbidden in [
        ".from('leader_clients').insert",
        ".from('leader_clients').update",
        ".from('leader_clients').delete",
        'loadExistingClients(true);\n}',
    ]:
        if forbidden in text:
            errors.append(f'Existing-client prefill contains forbidden eager/write marker: {forbidden}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('CRM existing-client prefill is lazy, read-only, data-minimized, linked and behavior-tested.')
