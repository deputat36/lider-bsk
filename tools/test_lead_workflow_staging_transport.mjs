import assert from 'node:assert/strict';
import {
  buildStagingLeadWorkflowCommand,
  createLeadWorkflowIdempotencyKey,
  invokeStagingLeadWorkflow,
  leadWorkflowPersistenceRoute,
  projectRefFromLeadWorkflowUrl
} from '../crm/v4/assets/v4/lead-workflow-staging-transport-v1.js';

const STAGING_URL = 'https://otulfnouybahfnsycxqn.supabase.co';
const PRODUCTION_URL = 'https://ofewxuqfjhamgerwzull.supabase.co';
const leadId = '11111111-1111-4111-8111-111111111111';
const actorId = '22222222-2222-4222-8222-222222222222';
const requestId = '33333333-3333-4333-8333-333333333333';
const randomId = '44444444-4444-4444-8444-444444444444';
const expectedUpdatedAt = '2026-07-23T18:00:00.000Z';

assert.equal(projectRefFromLeadWorkflowUrl(STAGING_URL), 'otulfnouybahfnsycxqn');
assert.equal(projectRefFromLeadWorkflowUrl(`https://evil.otulfnouybahfnsycxqn.supabase.co`), '');
assert.equal(leadWorkflowPersistenceRoute(STAGING_URL).mode, 'staging_edge');
assert.equal(leadWorkflowPersistenceRoute(STAGING_URL).browserDirectWrite, false);
assert.equal(leadWorkflowPersistenceRoute(PRODUCTION_URL).mode, 'production_legacy');
assert.equal(leadWorkflowPersistenceRoute(PRODUCTION_URL).browserDirectWrite, true);

assert.equal(
  createLeadWorkflowIdempotencyKey(leadId, { randomUUID: () => randomId }),
  `lead-workflow:${leadId}:${randomId}`
);
assert.throws(() => createLeadWorkflowIdempotencyKey('bad', { randomUUID: () => randomId }), /lead_id_invalid/);

const command = buildStagingLeadWorkflowCommand({
  lead: { id: leadId, updated_at: expectedUpdatedAt },
  patch: { assigned_to: actorId, status: 'В работе', next_contact_at: '2026-07-24T08:00:00+03:00' },
  requestId,
  idempotencyKey: `lead-workflow:${leadId}:${randomId}`
});
assert.deepEqual(command, {
  action: 'update',
  id: leadId,
  request_id: requestId,
  expected_updated_at: expectedUpdatedAt,
  idempotency_key: `lead-workflow:${leadId}:${randomId}`,
  status: 'В работе',
  next_contact_at: '2026-07-24T05:00:00.000Z',
  assigned_to: actorId
});
assert.throws(() => buildStagingLeadWorkflowCommand({
  lead: { id: leadId, updated_at: expectedUpdatedAt }, patch: { message: 'forbidden' }, requestId, idempotencyKey: 'key'
}), /patch_field_not_allowed:message/);

let invokedSlug = '';
let invokedBody = null;
const client = {
  auth: { getSession: async () => ({ data: { session: { access_token: 'test-jwt' } }, error: null }) },
  functions: {
    invoke: async (slug, options) => {
      invokedSlug = slug;
      invokedBody = options.body;
      return {
        data: {
          ok: true,
          request_id: options.body.request_id,
          idempotent_replay: false,
          lead: { id: leadId, status: 'В работе', assigned_to: actorId, updated_at: '2026-07-23T18:01:00.000Z' }
        },
        error: null
      };
    }
  }
};
const result = await invokeStagingLeadWorkflow({
  client,
  supabaseUrl: STAGING_URL,
  lead: { id: leadId, updated_at: expectedUpdatedAt },
  patch: { assigned_to: actorId, status: 'В работе' },
  idempotencyKey: `lead-workflow:${leadId}:${randomId}`,
  cryptoObject: { randomUUID: () => requestId }
});
assert.equal(result.ok, true);
assert.equal(result.kind, 'updated');
assert.equal(invokedSlug, 'leader-crm-leads-staging');
assert.equal(invokedBody.action, 'update');
assert.equal(invokedBody.assigned_to, actorId);
assert.equal(invokedBody.expected_updated_at, expectedUpdatedAt);

const unauthenticated = await invokeStagingLeadWorkflow({
  client: {
    auth: { getSession: async () => ({ data: { session: null }, error: null }) },
    functions: { invoke: async () => { throw new Error('must not invoke'); } }
  },
  supabaseUrl: STAGING_URL,
  lead: { id: leadId, updated_at: expectedUpdatedAt },
  patch: { status: 'В работе' },
  idempotencyKey: 'key',
  cryptoObject: { randomUUID: () => requestId }
});
assert.equal(unauthenticated.kind, 'auth_required');

const rejected = await invokeStagingLeadWorkflow({
  client: {
    auth: { getSession: async () => ({ data: { session: { access_token: 'test-jwt' } }, error: null }) },
    functions: { invoke: async () => ({ data: { ok: false, error: { code: 'assignee_required' } }, error: null }) }
  },
  supabaseUrl: STAGING_URL,
  lead: { id: leadId, updated_at: expectedUpdatedAt },
  patch: { status: 'В работе' },
  idempotencyKey: 'key',
  cryptoObject: { randomUUID: () => requestId }
});
assert.equal(rejected.kind, 'assignee_required');
assert.match(rejected.message, /ответственного/i);

const wrongEnvironment = await invokeStagingLeadWorkflow({
  client,
  supabaseUrl: PRODUCTION_URL,
  lead: { id: leadId, updated_at: expectedUpdatedAt },
  patch: { status: 'В работе' },
  idempotencyKey: 'key',
  cryptoObject: { randomUUID: () => requestId }
});
assert.equal(wrongEnvironment.kind, 'wrong_environment');

console.log('Lead workflow staging transport tests passed.');
