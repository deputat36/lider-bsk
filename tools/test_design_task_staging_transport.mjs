import assert from 'node:assert/strict';
import {
  DESIGN_TASK_STAGING_TRANSPORT,
  buildStagingDesignCommand,
  designStagingTransportAvailability,
  invokeStagingDesignTask
} from '../crm/v4/assets/v4/design-task-staging-transport-v1.js';

const ids = Object.freeze({
  request: '11111111-1111-4111-8111-111111111111',
  order: '22222222-2222-4222-8222-222222222222',
  need: '33333333-3333-4333-8333-333333333333',
  task: '44444444-4444-4444-8444-444444444444'
});

const stagingUrl = `https://${DESIGN_TASK_STAGING_TRANSPORT.projectRef}.supabase.co`;
const productionUrl = 'https://ofewxuqfjhamgerwzull.supabase.co';
const expectedUpdatedAt = '2026-07-14T08:00:00.000Z';
const draft = {
  command: DESIGN_TASK_STAGING_TRANSPORT.action,
  order_id: ids.order,
  production_job_id: null,
  idempotency_key: `design_task.create_from_order:${ids.order}:v1`,
  task: {
    title: 'Макет тестовой вывески',
    priority: 'Высокий',
    deadline: null,
    task_text: 'Только синтетическое техническое задание.',
    reference_link: 'https://example.invalid/reference',
    task_status: 'Завершено',
    created_by: ids.request,
    client_phone: '+70000000000',
    profit: 999999
  },
  evidence: {
    need_ids: [ids.need, ids.need],
    need_design: true
  }
};

const production = designStagingTransportAvailability({
  supabaseUrl: productionUrl,
  canWrite: true,
  draft,
  expectedUpdatedAt
});
assert.equal(production.enabled, false);
assert.equal(production.reason, 'production_locked');

const command = buildStagingDesignCommand({ draft, expectedUpdatedAt, requestId: ids.request });
assert.deepEqual(Object.keys(command).sort(), ['action', 'expected_updated_at', 'payload', 'request_id']);
assert.deepEqual(Object.keys(command.payload).sort(), ['idempotency_key', 'need_ids', 'order_id', 'production_job_id', 'task']);
assert.deepEqual(Object.keys(command.payload.task).sort(), ['deadline', 'priority', 'reference_link', 'task_text', 'title']);
assert.deepEqual(command.payload.need_ids, [ids.need]);
for (const forbidden of ['actor_id', 'author', 'task_status', 'created_by', 'client_phone', 'profit', 'payment', 'designer_name']) {
  assert.equal(JSON.stringify(command).includes(forbidden), false, `forbidden field leaked: ${forbidden}`);
}

function clientWith(result) {
  const calls = [];
  return {
    calls,
    auth: {
      async getSession() {
        return { data: { session: { access_token: 'test-session-token-not-a-real-jwt' } }, error: null };
      }
    },
    functions: {
      async invoke(slug, options) {
        calls.push({ slug, options });
        return typeof result === 'function' ? result(slug, options) : result;
      }
    }
  };
}

const createdClient = clientWith({
  data: { ok: true, request_id: ids.request, idempotent_replay: false, task: { id: ids.task, status: 'Новая' } },
  error: null
});
let readCount = 0;
const created = await invokeStagingDesignTask({
  client: createdClient,
  supabaseUrl: stagingUrl,
  canWrite: true,
  draft,
  expectedUpdatedAt,
  cryptoObject: { randomUUID: () => ids.request },
  readAfterSuccess: async () => {
    readCount += 1;
    return [{ id: ids.task, task_status: 'Новая' }];
  }
});
assert.equal(created.ok, true);
assert.equal(created.status, 201);
assert.equal(created.replay, false);
assert.equal(readCount, 1);
assert.equal(createdClient.calls.length, 1);
assert.equal(createdClient.calls[0].slug, 'leader-crm-design');
assert.equal(createdClient.calls[0].options.body.payload.order_id, ids.order);
assert.equal(created.refreshed[0].id, ids.task);

const replay = await invokeStagingDesignTask({
  client: clientWith({ data: { ok: true, request_id: ids.request, idempotent_replay: true, task: { id: ids.task } }, error: null }),
  supabaseUrl: stagingUrl,
  canWrite: true,
  draft,
  expectedUpdatedAt,
  cryptoObject: { randomUUID: () => ids.request }
});
assert.equal(replay.ok, true);
assert.equal(replay.status, 200);
assert.equal(replay.replay, true);
assert.match(replay.message, /без дубликата/i);

const staleError = {
  context: new Response(JSON.stringify({
    ok: false,
    error: { code: 'conflict', message: 'Order changed after draft preparation' }
  }), { status: 409 }),
  message: 'Edge Function returned a non-2xx status code'
};
const stale = await invokeStagingDesignTask({
  client: clientWith({ data: null, error: staleError }),
  supabaseUrl: stagingUrl,
  canWrite: true,
  draft,
  expectedUpdatedAt,
  cryptoObject: { randomUUID: () => ids.request }
});
assert.equal(stale.ok, false);
assert.equal(stale.status, 409);
assert.equal(stale.kind, 'stale_order');

const active = await invokeStagingDesignTask({
  client: clientWith({
    data: { ok: false, error: { code: 'conflict', message: 'Active design task already exists' } },
    error: null
  }),
  supabaseUrl: stagingUrl,
  canWrite: true,
  draft,
  expectedUpdatedAt,
  cryptoObject: { randomUUID: () => ids.request }
});
assert.equal(active.kind, 'active_task_conflict');

const denied = await invokeStagingDesignTask({
  client: clientWith({ data: null, error: null }),
  supabaseUrl: stagingUrl,
  canWrite: false,
  draft,
  expectedUpdatedAt
});
assert.equal(denied.kind, 'forbidden');

const noSessionClient = clientWith({ data: null, error: null });
noSessionClient.auth.getSession = async () => ({ data: { session: null }, error: null });
const noSession = await invokeStagingDesignTask({
  client: noSessionClient,
  supabaseUrl: stagingUrl,
  canWrite: true,
  draft,
  expectedUpdatedAt
});
assert.equal(noSession.kind, 'auth_required');
assert.equal(noSessionClient.calls.length, 0);

const lockedClient = clientWith({ data: null, error: null });
const locked = await invokeStagingDesignTask({
  client: lockedClient,
  supabaseUrl: productionUrl,
  canWrite: true,
  draft,
  expectedUpdatedAt
});
assert.equal(locked.kind, 'wrong_environment');
assert.equal(lockedClient.calls.length, 0);

console.log('CRM design task staging transport is environment-locked, minimized and replay-safe.');
