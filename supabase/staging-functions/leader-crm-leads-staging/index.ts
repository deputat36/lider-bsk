// STAGING ONLY.
// Canonical database action gate in front of the preserved leads implementation.
// Guarded workflow fields use an atomic RPC; legacy non-workflow fields stay delegated.
import { leadsActionPlan } from '../_shared/crm-canonical-action-map-v1.js'
import { runCanonicalEdgeWrapper } from '../_shared/canonical-edge-wrapper-v1.js'

const WORKFLOW_FIELDS = Object.freeze(['status', 'next_contact_at', 'assigned_to'])
const WORKFLOW_ENVELOPE_FIELDS = Object.freeze([
  'action', 'id', 'request_id', 'expected_updated_at', 'idempotency_key',
  ...WORKFLOW_FIELDS,
])

function hasOwn(value: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(value || {}, key)
}

function workflowFieldNames(body: Record<string, unknown>) {
  return WORKFLOW_FIELDS.filter((field) => hasOwn(body, field))
}

function workflowErrorStatus(code: string) {
  if (code === 'forbidden') return 403
  if (code === 'not_found') return 404
  if (['conflict', 'duplicate_request', 'assignee_required', 'next_contact_required', 'no_effect'].includes(code)) return 409
  if (['validation_error', 'unknown_action'].includes(code)) return 400
  return 500
}

async function executeLeadWorkflow({ body, plan, auth, env, helpers }: any) {
  if (plan?.action !== 'update') return null
  const fields = workflowFieldNames(body)
  if (!fields.length) return null

  const mixed = Object.keys(body).filter((key) => !WORKFLOW_ENVELOPE_FIELDS.includes(key))
  if (mixed.length) {
    return helpers.json(400, {
      error: 'workflow_fields_must_be_separate',
      fields,
      mixed_fields: mixed.slice(0, 12),
    }, { 'X-CRM-Implementation': 'leader_update_lead_workflow_rpc' })
  }

  const patch: Record<string, unknown> = {}
  for (const field of fields) patch[field] = body[field]

  const rpcResponse = await fetch(`${env.supabaseUrl}/rest/v1/rpc/leader_update_lead_workflow_rpc`, {
    method: 'POST',
    headers: {
      apikey: env.serviceRole,
      Authorization: `Bearer ${env.serviceRole}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      p_payload: {
        actor_id: auth.actorId,
        actor_email: helpers.clean(auth.user?.email, 320),
        request: {
          action: 'lead_workflow.update',
          request_id: body.request_id,
          expected_updated_at: body.expected_updated_at,
          payload: {
            lead_id: body.id,
            idempotency_key: body.idempotency_key,
            patch,
          },
        },
      },
    }),
  })

  if (!rpcResponse.ok) {
    return helpers.json(500, {
      error: 'lead_workflow_rpc_transport_failed',
      status: rpcResponse.status,
    }, { 'X-CRM-Implementation': 'leader_update_lead_workflow_rpc' })
  }

  const result = await rpcResponse.json()
  if (result?.ok === true) {
    return helpers.json(result.idempotent_replay === true ? 200 : 201, result, {
      'X-CRM-Implementation': 'leader_update_lead_workflow_rpc',
    })
  }

  const code = helpers.clean(result?.error?.code || 'workflow_update_failed', 120)
  return helpers.json(workflowErrorStatus(code), result, {
    'X-CRM-Implementation': 'leader_update_lead_workflow_rpc',
  })
}

Deno.serve((req: Request) => runCanonicalEdgeWrapper(req, {
  implementationSlug: 'leader-crm-leads-staging-impl',
  plan: (body: Record<string, unknown>, url: URL) => leadsActionPlan(
    body,
    url.searchParams.get('action') || '',
  ),
  execute: executeLeadWorkflow,
}))
