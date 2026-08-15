#!/usr/bin/env python3
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
TRANSPORT = ROOT / 'crm/v4/assets/v4/lead-workflow-staging-transport-v1.js'
BOOTSTRAP = ROOT / 'crm/v4/assets/v4/lead-workflow-staging-bootstrap-v1.js'
ROOT_BOOTSTRAP = ROOT / 'crm/v4/assets/v4/auth-session-reset-v1.js'
UI = ROOT / 'crm/v4/assets/v4/lead-workflow-staging-ui-v1.js'
ASSIGNMENT = ROOT / 'crm/v4/assets/v4/lead-assignment-model-v1.js'
EDGE = ROOT / 'supabase/staging-functions/leader-crm-leads-staging/index.ts'
MIGRATION = ROOT / 'supabase/staging-migrations/20260816001000_authenticated_lead_workflow_browser_rpc.sql'
CONTRACT = ROOT / 'contracts/crm-staging-lead-workflow-frontend-v1.json'

for path in (TRANSPORT, BOOTSTRAP, ROOT_BOOTSTRAP, UI, ASSIGNMENT, EDGE, MIGRATION, CONTRACT):
    if not path.exists():
        raise SystemExit(f'missing required file: {path.relative_to(ROOT)}')

transport = TRANSPORT.read_text(encoding='utf-8')
bootstrap = BOOTSTRAP.read_text(encoding='utf-8')
root_bootstrap = ROOT_BOOTSTRAP.read_text(encoding='utf-8')
ui = UI.read_text(encoding='utf-8')
assignment = ASSIGNMENT.read_text(encoding='utf-8')
edge = EDGE.read_text(encoding='utf-8')
migration = MIGRATION.read_text(encoding='utf-8')
contract = json.loads(CONTRACT.read_text(encoding='utf-8'))

required_transport = [
    "const STAGING_PROJECT_REF = 'otulfnouybahfnsycxqn'",
    "const FUNCTION_SLUG = 'leader-crm-leads-staging'",
    "const BROWSER_RPC_SLUG = 'leader_update_lead_workflow_browser_rpc'",
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
    "accessToken = ''",
    "let resolvedAccessToken = text(accessToken);",
    "if (!resolvedAccessToken) {",
    "client.auth.getSession",
    "function deferTransportAbort(edgeTransport)",
    "globalThis.setTimeout(() =>",
    "browserRpcSlug: BROWSER_RPC_SLUG",
    "function browserRpcPayload(command)",
    "action: 'lead_workflow.update'",
    "lead_id: command.id",
    "patch: expectedPatchFromCommand(command)",
    "function createFetchRpcTransport(",
    "response.status === 202 && raw?.pending === true",
    "neverResolveOnVerificationTimeout(verifyPersistedWorkflow({",
    "Promise.race([commandTransport.promise, verificationPromise, deadlinePromise])",
    "deferTransportAbort(commandTransport);",
    "kind = 'verified_after_transport_error'",
    "/rest/v1/rpc/${BROWSER_RPC_SLUG}",
    "/rest/v1/leader_leads",
    "apikey: publicKey",
    "Authorization: `Bearer ${accessToken}`",
]
for marker in required_transport:
    if marker not in transport:
        raise SystemExit(f'transport marker missing: {marker}')

if 'commandTransport.abort();' in transport:
    raise SystemExit('staging transport teardown must not synchronously abort before UI result delivery')
for forbidden_transport in ['new globalThis.Worker(', 'new globalThis.XMLHttpRequest(', '/functions/v1/${FUNCTION_SLUG}']:
    if forbidden_transport in transport:
        raise SystemExit(f'browser transport must use the authenticated RPC adapter: {forbidden_transport}')

required_migration = [
    "project_ref = 'otulfnouybahfnsycxqn'",
    'create or replace function public.leader_update_lead_workflow_browser_rpc(p_request jsonb)',
    'security definer',
    'v_actor_id uuid := (select auth.uid())',
    "'request', p_request",
    'return public.leader_update_lead_workflow_rpc(jsonb_build_object(',
    'revoke all on function public.leader_update_lead_workflow_browser_rpc(jsonb) from public, anon, authenticated',
    'grant execute on function public.leader_update_lead_workflow_browser_rpc(jsonb) to authenticated, service_role',
]
for marker in required_migration:
    if marker not in migration:
        raise SystemExit(f'browser RPC migration marker missing: {marker}')
if "p_request ->> 'actor_id'" in migration or "p_request -> 'actor_id'" in migration:
    raise SystemExit('browser RPC must not accept a caller-supplied actor id')

for forbidden in [
    'client.functions.invoke(FUNCTION_SLUG',
    'ofewxuqfjhamgerwzull.supabase.co/functions/v1/leader-crm-leads-staging',
    'service_role',
    'SUPABASE_SERVICE_ROLE_KEY',
    'crm_e2e_diag_',
    'crm_e2e_transport_',
    '/__crm_e2e_progress',
    'navigator.sendBeacon',
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
    'accessToken: v4State.session?.access_token',
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
