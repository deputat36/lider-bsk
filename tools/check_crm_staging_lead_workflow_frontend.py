#!/usr/bin/env python3
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
TRANSPORT = ROOT / 'crm/v4/assets/v4/lead-workflow-staging-transport-v1.js'
BOOTSTRAP = ROOT / 'crm/v4/assets/v4/lead-workflow-staging-bootstrap-v1.js'
UI = ROOT / 'crm/v4/assets/v4/lead-workflow-staging-ui-v1.js'
ASSIGNMENT = ROOT / 'crm/v4/assets/v4/lead-assignment-model-v1.js'
EDGE = ROOT / 'supabase/staging-functions/leader-crm-leads-staging/index.ts'
CONTRACT = ROOT / 'contracts/crm-staging-lead-workflow-frontend-v1.json'

for path in (TRANSPORT, BOOTSTRAP, UI, ASSIGNMENT, EDGE, CONTRACT):
    if not path.exists():
        raise SystemExit(f'missing required file: {path.relative_to(ROOT)}')

transport = TRANSPORT.read_text(encoding='utf-8')
bootstrap = BOOTSTRAP.read_text(encoding='utf-8')
ui = UI.read_text(encoding='utf-8')
assignment = ASSIGNMENT.read_text(encoding='utf-8')
edge = EDGE.read_text(encoding='utf-8')
contract = json.loads(CONTRACT.read_text(encoding='utf-8'))

required_transport = [
    "const STAGING_PROJECT_REF = 'otulfnouybahfnsycxqn'",
    "const FUNCTION_SLUG = 'leader-crm-leads-staging'",
    "const REQUEST_TIMEOUT_MS = 20000",
    "const VERIFICATION_TIMEOUT_MS = 8000",
    "const WORKFLOW_FIELDS = Object.freeze(['status', 'next_contact_at', 'assigned_to'])",
    "mode: 'staging_edge'",
    "browserDirectWrite: false",
    "mode: 'production_legacy'",
    "browserDirectWrite: true",
    "expected_updated_at: expectedUpdatedAt",
    "idempotency_key: key",
    "client.auth.getSession",
    "fetchJsonWithTimeout(fetchImpl",
    "verifyPersistedWorkflow(client, command",
    "kind = 'verified_after_transport_error'",
    "/functions/v1/${FUNCTION_SLUG}",
    "apikey: publicKey",
    "Authorization: `Bearer ${accessToken}`",
]
for marker in required_transport:
    if marker not in transport:
        raise SystemExit(f'transport marker missing: {marker}')

for forbidden in [
    'client.functions.invoke(FUNCTION_SLUG',
    'ofewxuqfjhamgerwzull.supabase.co/functions/v1/leader-crm-leads-staging',
    'service_role',
    'SUPABASE_SERVICE_ROLE_KEY',
]:
    if forbidden in transport or forbidden in ui or forbidden in bootstrap:
        raise SystemExit(f'forbidden frontend marker: {forbidden}')

required_ui = [
    "route.mode !== 'staging_edge'",
    "document.addEventListener('click', interceptStagingWorkflow, true)",
    'event.stopImmediatePropagation()',
    'createLeadWorkflowIdempotencyKey(lead.id)',
    'invokeStagingLeadWorkflow({',
    'publishableKey: V4_CONFIG.supabasePublishableKey',
    "assigned_to: userId",
    "status: currentStatus === 'Новая' ? 'Ждём ответ' : currentStatus",
    "document.dispatchEvent(new CustomEvent('leader-v4:lead-workflow-updated'",
    'dispatchWorkflowUpdated({ lead: serverLead, result, action })',
    'reconcileSuccessfulWorkflow({ serverLead, result, action, fallbackLead: lead })',
    'lead workflow persisted but local reconciliation failed',
]
for marker in required_ui:
    if marker not in ui:
        raise SystemExit(f'ui marker missing: {marker}')

ack_position = ui.find('dispatchWorkflowUpdated({ lead: serverLead, result, action })')
reconcile_position = ui.find('reconcileSuccessfulWorkflow({ serverLead, result, action, fallbackLead: lead })')
if ack_position < 0 or reconcile_position < 0 or ack_position >= reconcile_position:
    raise SystemExit('authoritative server acknowledgement must precede local UI reconciliation')

if 'leaderAddLeadEvent' in ui:
    raise SystemExit('staging sidecar must not create a second browser lead event')
if "import('./lead-workflow-staging-ui-v1.js')" not in bootstrap:
    raise SystemExit('browser-only dynamic import missing')
if 'await import(' not in bootstrap:
    raise SystemExit('staging bootstrap import must be awaited to avoid first-click race')
if not assignment.startswith("import './lead-workflow-staging-bootstrap-v1.js';"):
    raise SystemExit('lead card dependency does not load staging bootstrap')

for marker in [
    "const WORKFLOW_FIELDS = Object.freeze(['status', 'next_contact_at', 'assigned_to'])",
    "'X-CRM-Implementation': 'leader_update_lead_workflow_rpc'",
    "action: 'lead_workflow.update'",
]:
    if marker not in edge:
        raise SystemExit(f'edge contract drift: {marker}')

if contract.get('project_ref') != 'otulfnouybahfnsycxqn':
    raise SystemExit('contract project_ref mismatch')
if contract.get('production_boundary', {}).get('frontend_behavior_changed') is not False:
    raise SystemExit('production frontend boundary must remain unchanged')
if contract.get('frontend', {}).get('staging_card_wired') is not True:
    raise SystemExit('staging card wiring not recorded')
if contract.get('frontend', {}).get('browser_manual_event_on_staging') is not False:
    raise SystemExit('staging browser event duplication guard missing')

print('CRM staging lead workflow frontend check passed.')
