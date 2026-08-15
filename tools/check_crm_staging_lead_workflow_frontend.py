#!/usr/bin/env python3
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
TRANSPORT = ROOT / 'crm/v4/assets/v4/lead-workflow-staging-transport-v1.js'
WORKER = ROOT / 'crm/v4/assets/v4/lead-workflow-staging-worker-v1.js'
BOOTSTRAP = ROOT / 'crm/v4/assets/v4/lead-workflow-staging-bootstrap-v1.js'
ROOT_BOOTSTRAP = ROOT / 'crm/v4/assets/v4/auth-session-reset-v1.js'
UI = ROOT / 'crm/v4/assets/v4/lead-workflow-staging-ui-v1.js'
ASSIGNMENT = ROOT / 'crm/v4/assets/v4/lead-assignment-model-v1.js'
EDGE = ROOT / 'supabase/staging-functions/leader-crm-leads-staging/index.ts'
CONTRACT = ROOT / 'contracts/crm-staging-lead-workflow-frontend-v1.json'

for path in (TRANSPORT, WORKER, BOOTSTRAP, ROOT_BOOTSTRAP, UI, ASSIGNMENT, EDGE, CONTRACT):
    if not path.exists():
        raise SystemExit(f'missing required file: {path.relative_to(ROOT)}')

transport = TRANSPORT.read_text(encoding='utf-8')
worker = WORKER.read_text(encoding='utf-8')
bootstrap = BOOTSTRAP.read_text(encoding='utf-8')
root_bootstrap = ROOT_BOOTSTRAP.read_text(encoding='utf-8')
ui = UI.read_text(encoding='utf-8')
assignment = ASSIGNMENT.read_text(encoding='utf-8')
edge = EDGE.read_text(encoding='utf-8')
contract = json.loads(CONTRACT.read_text(encoding='utf-8'))

required_transport = [
    "const STAGING_PROJECT_REF = 'otulfnouybahfnsycxqn'",
    "const FUNCTION_SLUG = 'leader-crm-leads-staging'",
    "const REQUEST_TIMEOUT_MS = 20000",
    "const VERIFICATION_TIMEOUT_MS = 8000",
    "const VERIFICATION_READ_TIMEOUT_MS = 2500",
    "const WORKFLOW_FIELDS = Object.freeze(['status', 'next_contact_at', 'assigned_to'])",
    "mode: 'staging_edge'",
    "browserDirectWrite: false",
    "mode: 'production_legacy'",
    "browserDirectWrite: true",
    "expected_updated_at: expectedUpdatedAt",
    "idempotency_key: key",
    "client.auth.getSession",
    "function deferTransportAbort(edgeTransport)",
    "globalThis.setTimeout(() =>",
    "function createWorkerEdgeTransport(",
    "new URL('./lead-workflow-staging-worker-v1.js', import.meta.url)",
    "typeof globalThis.Worker === 'function'",
    "worker.postMessage({ url, publicKey, accessToken, command, timeoutMs })",
    "function createXhrEdgeTransport(",
    "createFetchEdgeTransport({ fetchImpl",
    "neverResolveOnVerificationTimeout(verifyPersistedWorkflow({",
    "Promise.race([edgeTransport.promise, verificationPromise, deadlinePromise])",
    "deferTransportAbort(edgeTransport);",
    "kind = 'verified_after_transport_error'",
    "/functions/v1/${FUNCTION_SLUG}",
    "/rest/v1/leader_leads",
    "apikey: publicKey",
    "Authorization: `Bearer ${accessToken}`",
]
for marker in required_transport:
    if marker not in transport:
        raise SystemExit(f'transport marker missing: {marker}')

if 'edgeTransport.abort();' in transport:
    raise SystemExit('staging transport teardown must not synchronously abort before UI result delivery')

required_worker = [
    'self.onmessage = (event) =>',
    "Authorization: `Bearer ${accessToken}`",
    "'Content-Type': 'application/json'",
    'body: JSON.stringify(command)',
    "self.postMessage({ type: 'transport_error', code: 'worker_payload_invalid' })",
    "self.postMessage(message);",
    "worker_post_verified_transport",
    "type: 'transport_error'",
]
for marker in required_worker:
    if marker not in worker:
        raise SystemExit(f'worker marker missing: {marker}')

post_position = worker.find('self.postMessage(message);')
abort_position = worker.find('try { controller.abort();', post_position)
if post_position < 0 or abort_position < 0 or post_position >= abort_position:
    raise SystemExit('Worker authoritative result must be posted before cancelling ambiguous Edge fetch')

for forbidden in [
    'client.functions.invoke(FUNCTION_SLUG',
    'ofewxuqfjhamgerwzull.supabase.co/functions/v1/leader-crm-leads-staging',
    'service_role',
    'SUPABASE_SERVICE_ROLE_KEY',
    'crm_e2e_diag_',
    'crm_e2e_transport_',
]:
    if forbidden in transport or forbidden in worker or forbidden in ui or forbidden in bootstrap:
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
if "import './lead-workflow-staging-bootstrap-v1.js';" in assignment:
    raise SystemExit('assignment model must stay pure and must not import staging bootstrap')
if not root_bootstrap.startswith("import './lead-workflow-staging-bootstrap-v1.js';"):
    raise SystemExit('independent root bootstrap entry is missing')
if 'isStagingEnvironment(V4_CONFIG.supabaseUrl)' not in bootstrap:
    raise SystemExit('production no-op guard missing from staging bootstrap')

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