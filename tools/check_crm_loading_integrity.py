from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
files = {
    'card': root / 'crm/v4/assets/v4/lead-card.js',
    'saved': root / 'crm/v4/assets/v4/calculations-saved-tools-v2.js',
    'calc': root / 'crm/v4/assets/v4/calculations.js',
    'needs': root / 'crm/v4/assets/v4/needs.js',
    'offers': root / 'crm/v4/assets/v4/offers.js',
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
    'html': [
        'lead-card.js?v=20260717-load-integrity-1',
        'needs.js?v=20260717-load-integrity-1',
        'calculations-saved-tools-v2.js?v=20260717-load-integrity-1',
        'calculations.js?v=20260717-load-integrity-1',
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

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('CRM loading integrity is valid: one calculation query owner, separate render hosts and stale-response guards.')
