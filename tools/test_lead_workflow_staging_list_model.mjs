#!/usr/bin/env node

import assert from 'node:assert/strict';
import { buildStagingLeadListWorkflowAction } from '../crm/v4/assets/v4/lead-workflow-staging-list-model-v1.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';
const LEAD_ID = '33333333-3333-4333-8333-333333333333';

function lead(patch = {}) {
  return {
    id: LEAD_ID,
    status: 'Новая',
    assigned_to: null,
    ...patch
  };
}

assert.equal(buildStagingLeadListWorkflowAction({ action: 'open', lead: lead(), userId: USER_ID }), null);

assert.match(
  buildStagingLeadListWorkflowAction({ action: 'take', lead: null, userId: USER_ID }).error,
  /не найдена/i
);

assert.match(
  buildStagingLeadListWorkflowAction({ action: 'take', lead: lead(), userId: '' }).error,
  /пользователь/i
);

const takeNew = buildStagingLeadListWorkflowAction({ action: 'take', lead: lead(), userId: USER_ID });
assert.deepEqual(takeNew.patch, { assigned_to: USER_ID, status: 'В работе' });
assert.equal(takeNew.lead.id, LEAD_ID);
assert.equal(takeNew.lead.updated_at, undefined, 'model must not require list version before UI hydration');

const takeExistingStatus = buildStagingLeadListWorkflowAction({
  action: 'take',
  lead: lead({ status: 'Уточнение деталей' }),
  userId: USER_ID
});
assert.deepEqual(takeExistingStatus.patch, { assigned_to: USER_ID, status: 'Уточнение деталей' });

assert.match(
  buildStagingLeadListWorkflowAction({
    action: 'take',
    lead: lead({ assigned_to: OTHER_ID }),
    userId: USER_ID
  }).error,
  /уже назначена/i
);

assert.match(
  buildStagingLeadListWorkflowAction({
    action: 'work',
    lead: lead({ assigned_to: OTHER_ID, status: 'Уточнение деталей' }),
    userId: USER_ID
  }).error,
  /назначьте себя/i
);

const workMine = buildStagingLeadListWorkflowAction({
  action: 'work',
  lead: lead({ assigned_to: USER_ID, status: 'Уточнение деталей' }),
  userId: USER_ID
});
assert.deepEqual(workMine.patch, { status: 'В работе' });

assert.match(
  buildStagingLeadListWorkflowAction({
    action: 'work',
    lead: lead({ assigned_to: USER_ID, status: 'В работе' }),
    userId: USER_ID
  }).error,
  /уже находится в работе/i
);

console.log('lead workflow staging list model: ok');
