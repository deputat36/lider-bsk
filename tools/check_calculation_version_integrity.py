#!/usr/bin/env python3
import json
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
paths = {
    'html': root / 'crm/v4/index.html',
    'model': root / 'crm/v4/assets/v4/calculation-version-integrity-model-v1.js',
    'ui': root / 'crm/v4/assets/v4/calculations-saved-tools-v2.js',
    'css': root / 'crm/v4/assets/v4/calculation-version-integrity-v1.css',
    'contract': root / 'contracts/calculation-create-version-server-contract-v1.json',
    'audit': root / 'docs/CRM_CALCULATION_VERSION_INTEGRITY_AUDIT_2026-07-15.md',
    'spec': root / 'docs/CRM_CALCULATION_CREATE_VERSION_SERVER_CONTRACT_2026-07-15.md',
    'test': root / 'tools/test_calculation_version_integrity_model.mjs',
}
errors = []
texts = {}
for name, path in paths.items():
    if not path.exists():
        errors.append(f'Missing file: {path.relative_to(root)}')
        continue
    texts[name] = path.read_text(encoding='utf-8')

for marker in [
    'calculationVersionAudit',
    'calculationVersionState',
    'calculationVersionIntegrityCopy',
    'duplicateVersions',
    'max(...versions)',
    'Связано с КП',
    'Связано с заказом',
    'не изменяются автоматически',
]:
    if marker not in texts.get('model', ''):
        errors.append('Missing version model marker: ' + marker)

for marker in [
    'data-version-integrity',
    'data-version-guard',
    'is-version-duplicate',
    'is-version-protected',
    'calculationVersionAudit',
    '→ новая v',
]:
    if marker not in texts.get('ui', ''):
        errors.append('Missing version UI marker: ' + marker)

for marker in [
    '.v4-saved-calc-integrity',
    '.v4-saved-calc-version-guard',
    '.is-version-duplicate',
    '@media(max-width:720px)',
]:
    if marker not in texts.get('css', ''):
        errors.append('Missing version CSS marker: ' + marker)

for marker in [
    'calculation-version-integrity-v1.css?v=20260715-1',
    'calculations-saved-tools-v2.js?v=20260717-offer-next-1',
]:
    if marker not in texts.get('html', ''):
        errors.append('Missing version asset marker: ' + marker)

for forbidden in [
    '.insert(',
    '.update(',
    '.delete(',
    'service_role',
    'supabase/migrations',
    'deploy_edge_function',
]:
    if forbidden in texts.get('ui', '') or forbidden in texts.get('model', ''):
        errors.append('Version integrity browser code must remain read-only: ' + forbidden)

try:
    contract = json.loads(texts.get('contract', '{}'))
except json.JSONDecodeError as exc:
    errors.append(f'Invalid contract JSON: {exc}')
    contract = {}

expected = {
    'action': 'calculation.create_version',
    'status': 'staging_deployed_production_gated',
}
for key, value in expected.items():
    if contract.get(key) != value:
        errors.append(f'Contract {key} must equal {value!r}')

transport = contract.get('transport', {})
if transport.get('verify_jwt') is not True:
    errors.append('Server contract must require verify_jwt=true')
if transport.get('browser_calls_rpc_directly') is not False:
    errors.append('Browser must not call the version RPC directly')
if transport.get('production_ui_enabled') is not False:
    errors.append('Production version action must remain disabled')

authorization = contract.get('authorization', {})
if authorization.get('permission') != 'calculations.write':
    errors.append('Server permission must match CRM_V4_ACTIONS.CALCULATIONS_WRITE')

source_rules = contract.get('source_rules', {})
for marker in ['source_calculation_update', 'source_items_update', 'source_delete']:
    if source_rules.get(marker) != 'forbidden':
        errors.append(f'Source rule must forbid {marker}')
if source_rules.get('preserve_commercial_offer_link') is not True or source_rules.get('preserve_order_link') is not True:
    errors.append('Source КП/order links must be preserved')

new_rules = contract.get('new_version_rules', {})
if new_rules.get('version_assignment') != 'max(version_number for lead_id) + 1 inside transaction':
    errors.append('Version assignment must be max + 1 inside transaction')
if new_rules.get('commercial_offer_id', 'missing') is not None or new_rules.get('order_id', 'missing') is not None:
    errors.append('New version must not inherit КП/order links')

atomicity = contract.get('atomicity', {})
if atomicity.get('all_or_nothing') is not True or atomicity.get('client_side_compensating_delete') is not False:
    errors.append('Version creation must be atomic and must not use browser rollback delete')

for marker in [
    '11', '30', '8', '5',
    'две записи с номером версии 1',
    'leader_has_access()',
    'Supabase не изменялся',
]:
    if marker not in texts.get('audit', ''):
        errors.append('Missing production audit evidence: ' + marker)

for marker in [
    'calculation.create_version',
    'max(version_number)',
    'FOR UPDATE',
    'leader_command_receipts',
    'duplicate_version_inventory',
    'app-first',
    'staging deployed, production gated',
    'Каноническое разрешение: `calculations.write`',
    'Auth-positive HTTP E2E ещё не выполнен',
]:
    if marker not in texts.get('spec', ''):
        errors.append('Missing server specification marker: ' + marker)

for marker in [
    'calculationVersionAudit',
    'duplicateVersions',
    'linkedToOrder',
    'linkedToOffer',
    'Calculation version integrity model tests passed.',
]:
    if marker not in texts.get('test', ''):
        errors.append('Missing version test marker: ' + marker)

if errors:
    print('\n'.join(errors))
    sys.exit(1)
print('Calculation versions are audited in read-only UI; staging create-version is deployed and production remains gated.')
