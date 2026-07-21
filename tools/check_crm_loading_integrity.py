from pathlib import Path
import json
import re
import sys

root = Path(__file__).resolve().parents[1]
files = {
    'card': root / 'crm/v4/assets/v4/lead-card.js',
    'saved': root / 'crm/v4/assets/v4/calculations-saved-tools-v2.js',
    'calc': root / 'crm/v4/assets/v4/calculations.js',
    'needs': root / 'crm/v4/assets/v4/needs.js',
    'offers': root / 'crm/v4/assets/v4/offers.js',
    'router': root / 'crm/v4/assets/v4/router.js',
    'leads': root / 'crm/v4/assets/v4/leads.js',
    'quality': root / 'crm/v4/assets/v4/lead-operational-quality-v1.js',
    'attribution': root / 'crm/v4/assets/v4/lead-attribution-funnel-panel-v1.js',
    'html': root / 'crm/v4/index.html',
}
errors = []
texts = {}

for name, path in files.items():
    if not path.exists():
        errors.append(f'Missing file: {path.relative_to(root)}')
        continue
    texts[name] = path.read_text(encoding='utf-8')

required = {
    'card': [
        'id="savedCalculationsBox"',
        'id="calculationsBox"',
        "#savedCalculationsBox [data-v2-calc-create-offer]",
        'leadLoadSequence',
        'v4State.route.leadId !== id',
    ],
    'saved': [
        "return byId('savedCalculationsBox')",
        'previousCalculations',
        "new CustomEvent('leader-v4:refresh-calculations')",
    ],
    'calc': [
        'const calculationLoads = new Map()',
        'calculationLoads.has(key)',
        'v4State.route.leadId !== leadId',
        "document.addEventListener('leader-v4:refresh-calculations'",
    ],
    'needs': ['needsLoadSequence', 'v4State.route.leadId !== leadId'],
    'offers': ['offersLoadSequence', 'v4State.route.leadId !== leadId'],
    'router': ['window.LeaderV4RouterBooted'],
    'leads': ['window.LeaderV4LeadsBooted'],
    'quality': [
        'const DEFERRED_QUALITY_DELAY_MS = 900',
        'function scheduleQuality(',
        'window.requestIdleCallback(run, { timeout: 1500 })',
    ],
    'attribution': [
        'const DEFERRED_ATTRIBUTION_DELAY_MS = 2200',
        'function scheduleAttribution(',
        'window.requestIdleCallback(run, { timeout: 1800 })',
    ],
    'html': [
        'lead-card.js?v=20260721-assignment-1',
        'needs.js?v=20260717-load-integrity-1',
        'calculations-saved-tools-v2.js?v=20260717-load-integrity-1',
        'router.js?v=20260717-module-singleton-1',
        'leads.js?v=20260721-followup-1',
        'calculations.js?v=20260717-module-singleton-1',
        'site-cache-note-v1.js?v=20260718-deferred-1',
        'offers.js?v=20260717-load-integrity-1',
    ],
}

for name, markers in required.items():
    text = texts.get(name, '')
    for marker in markers:
        if marker not in text:
            errors.append(f'{name} missing marker: {marker}')

saved = texts.get('saved', '')
if "from('leader_lead_calculations')" in saved:
    errors.append('Saved calculation presentation must not own the canonical calculation list query')
if "return byId('calculationsBox')" in saved:
    errors.append('Saved calculations and the unified constructor must not render into the same host')

card = texts.get('card', '')
if card.find('id="savedCalculationsBox"') > card.find('id="calculationsBox"'):
    errors.append('Saved calculations must render before the unified calculation constructor')

calculations = texts.get('calc', '')
if 'window.LeaderV4CalculationsBooted' not in calculations:
    errors.append('Calculation event bindings must be protected by a global singleton guard')

html = texts.get('html', '')
match = re.search(r'<script type="importmap">\s*(\{.*?\})\s*</script>', html, re.S)
if not match:
    errors.append('Missing CRM module singleton import map')
else:
    try:
        imports = json.loads(match.group(1)).get('imports', {})
    except json.JSONDecodeError as error:
        errors.append(f'CRM module singleton import map is invalid JSON: {error}')
        imports = {}
    expected_singletons = {
        './assets/v4/router.js': './assets/v4/router.js?v=20260717-module-singleton-1',
        './assets/v4/leads.js': './assets/v4/leads.js?v=20260721-followup-1',
        './assets/v4/calculations.js': './assets/v4/calculations.js?v=20260717-module-singleton-1',
        './assets/v4/site-cache-note-v1.js': './assets/v4/site-cache-note-v1.js?v=20260718-deferred-1',
        './assets/v4/site-cache-note-v1.js?v=20260621-1': './assets/v4/site-cache-note-v1.js?v=20260718-deferred-1',
    }
    for source, target in expected_singletons.items():
        if imports.get(source) != target:
            errors.append(f'CRM module singleton mapping mismatch: {source} -> {imports.get(source)!r}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('CRM loading integrity is valid: one calculation query owner, separate render hosts and stale-response guards.')
