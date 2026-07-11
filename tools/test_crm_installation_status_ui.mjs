import assert from 'node:assert/strict';
import {
  installationStatusDefinition,
  installationStatusSelectOptions,
  installationStatusTimestampPatch,
  installationStatusUiModel,
  validateInstallationStatusTransition
} from '../crm/v4/assets/v4/installation-status-ui-model-v1.js';

// Live canonical values and NULL normalization.
assert.equal(installationStatusDefinition(null)?.key, 'unassigned');
assert.equal(installationStatusDefinition('Не назначен')?.key, 'unassigned');
assert.equal(installationStatusDefinition('Запланирован')?.key, 'scheduled');
assert.equal(installationStatusDefinition('Не требуется')?.key, 'not_required');

const nullModel = installationStatusUiModel(null);
assert.equal(nullModel.known, true);
assert.equal(nullModel.original, null);
assert.equal(nullModel.key, 'unassigned');
assert.equal(installationStatusSelectOptions(null)[0].label, 'Не назначен (raw: NULL)');
assert.equal(validateInstallationStatusTransition(null, 'Не назначен').storedValue, null);

// Legacy UI values remain readable without rewriting on unrelated save.
assert.equal(installationStatusDefinition('Нужно назначить')?.key, 'unassigned');
assert.equal(installationStatusDefinition('Проблема')?.key, 'postponed');
const legacy = installationStatusUiModel('Проблема');
assert.equal(legacy.known, true);
assert.equal(legacy.legacy, true);
assert.equal(legacy.label, 'Перенесён');
assert.equal(validateInstallationStatusTransition('Проблема', 'Проблема').storedValue, 'Проблема');

// Select options contain only current value and registry-allowed targets.
assert.deepEqual(
  installationStatusSelectOptions(null).map((item) => item.value),
  ['Не назначен', 'Запланирован', 'Не требуется', 'Отменён']
);
assert.deepEqual(
  installationStatusSelectOptions('Запланирован').map((item) => item.value),
  ['Запланирован', 'В работе', 'Перенесён', 'Отменён']
);
assert.deepEqual(
  installationStatusSelectOptions('В работе').map((item) => item.value),
  ['В работе', 'Выполнен', 'Перенесён', 'Отменён']
);

// Allowed transitions write canonical labels.
const scheduled = validateInstallationStatusTransition(null, 'Запланирован');
assert.equal(scheduled.ok, true);
assert.equal(scheduled.storedValue, 'Запланирован');
assert.equal(scheduled.timestampField, '');

const started = validateInstallationStatusTransition('Запланирован', 'В работе');
assert.equal(started.ok, true);
assert.equal(started.storedValue, 'В работе');
assert.equal(started.timestampField, 'started_at');

const completed = validateInstallationStatusTransition('В работе', 'Выполнен');
assert.equal(completed.ok, true);
assert.equal(completed.storedValue, 'Выполнен');
assert.equal(completed.timestampField, 'completed_at');

// Forbidden and terminal transitions fail before writes.
assert.equal(validateInstallationStatusTransition(null, 'Выполнен').reason, 'transition_not_allowed');
assert.equal(validateInstallationStatusTransition('Выполнен', 'В работе').reason, 'terminal_status');
assert.equal(validateInstallationStatusTransition('Не требуется', 'Запланирован').reason, 'terminal_status');

// Unknown raw status can be preserved for unrelated edits but cannot transition.
const unknown = 'Legacy Custom Installation';
const unknownModel = installationStatusUiModel(unknown);
assert.equal(unknownModel.known, false);
assert.equal(unknownModel.raw, unknown);
assert.equal(installationStatusSelectOptions(unknown)[0].value, unknown);
assert.equal(validateInstallationStatusTransition(unknown, unknown).storedValue, unknown);
assert.equal(validateInstallationStatusTransition(unknown, 'Запланирован').reason, 'unknown_from_status');

// Timestamp patch uses only columns that exist in leader_installation_jobs.
const now = '2026-07-11T12:00:00.000Z';
assert.deepEqual(installationStatusTimestampPatch(started, {}, now), { started_at: now });
assert.deepEqual(installationStatusTimestampPatch(completed, {}, now), { completed_at: now });
assert.deepEqual(installationStatusTimestampPatch(completed, { completed_at: 'existing' }, now), { completed_at: 'existing' });
assert.deepEqual(installationStatusTimestampPatch(scheduled, {}, now), {});
assert.equal('postponed_at' in installationStatusTimestampPatch(started, {}, now), false);
assert.equal('cancelled_at' in installationStatusTimestampPatch(started, {}, now), false);

console.log('CRM installation status UI registry behavior is valid.');
