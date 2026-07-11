import assert from 'node:assert/strict';
import {
  productionStatusDefinition,
  productionStatusSelectOptions,
  productionStatusTimestampPatch,
  productionStatusUiModel,
  validateProductionStatusTransition
} from '../crm/v4/assets/v4/production-status-ui-model-v1.js';

// Live canonical production values.
assert.equal(productionStatusDefinition('Не передано')?.key, 'not_sent');
assert.equal(productionStatusDefinition('В производстве')?.key, 'in_production');
assert.equal(productionStatusDefinition('Выдано')?.key, 'issued');

// Legacy UI values remain readable without rewriting on render/save.
assert.equal(productionStatusDefinition('Передано в производство')?.key, 'queued');
assert.equal(productionStatusDefinition('В работе')?.key, 'in_production');
assert.equal(productionStatusDefinition('Проблема')?.key, 'stopped');
const legacy = productionStatusUiModel('В работе');
assert.equal(legacy.known, true);
assert.equal(legacy.legacy, true);
assert.equal(legacy.label, 'В производстве');
assert.equal(validateProductionStatusTransition('В работе', 'В работе').storedValue, 'В работе');

// Options contain only the current value and registry-allowed targets.
assert.deepEqual(
  productionStatusSelectOptions('Не передано').map((item) => item.value),
  ['Не передано', 'В очереди', 'В производстве', 'Не требуется']
);
assert.deepEqual(
  productionStatusSelectOptions('В производстве').map((item) => item.value),
  ['В производстве', 'Готово', 'Приостановлено', 'Отменено']
);

// Allowed canonical transitions write canonical labels.
const start = validateProductionStatusTransition('Не передано', 'В производстве');
assert.equal(start.ok, true);
assert.equal(start.storedValue, 'В производстве');
assert.equal(start.timestampField, 'sent_to_contractor_at');

const ready = validateProductionStatusTransition('В производстве', 'Готово');
assert.equal(ready.ok, true);
assert.equal(ready.storedValue, 'Готово');
assert.equal(ready.timestampField, 'ready_at');

const issued = validateProductionStatusTransition('Готово', 'Выдано');
assert.equal(issued.ok, true);
assert.equal(issued.timestampField, 'issued_at');

// Forbidden and terminal transitions fail before any write path.
assert.equal(validateProductionStatusTransition('Не передано', 'Выдано').reason, 'transition_not_allowed');
assert.equal(validateProductionStatusTransition('Выдано', 'В производстве').reason, 'terminal_status');

// Unknown raw status is preserved for unrelated edits but cannot transition.
const unknown = 'Legacy Custom Production';
const unknownModel = productionStatusUiModel(unknown);
assert.equal(unknownModel.known, false);
assert.equal(unknownModel.raw, unknown);
assert.equal(productionStatusSelectOptions(unknown)[0].value, unknown);
assert.equal(validateProductionStatusTransition(unknown, unknown).storedValue, unknown);
assert.equal(validateProductionStatusTransition(unknown, 'В производстве').reason, 'unknown_from_status');

// Timestamp patch uses only columns that exist in leader_production_jobs.
const now = '2026-07-11T12:00:00.000Z';
assert.deepEqual(productionStatusTimestampPatch(start, {}, now), { sent_to_contractor_at: now });
assert.deepEqual(productionStatusTimestampPatch(ready, {}, now), { ready_at: now });
assert.deepEqual(productionStatusTimestampPatch(issued, {}, now), { issued_at: now });
assert.deepEqual(productionStatusTimestampPatch(ready, { ready_at: 'existing' }, now), { ready_at: 'existing' });
assert.deepEqual(productionStatusTimestampPatch(validateProductionStatusTransition('В производстве', 'В производстве'), {}, now), {});
assert.equal('started_at' in productionStatusTimestampPatch(start, {}, now), false);

console.log('CRM production status UI registry behavior is valid.');
