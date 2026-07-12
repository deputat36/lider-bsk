import assert from 'node:assert/strict';
import {
  boardStatus,
  installationBoardStatus,
  isBoardDateOverdue,
  isBoardDateToday,
  productionBoardMetrics,
  productionBoardStatus
} from '../crm/v4/assets/v4/production-board-status-model-v1.js';

const ready = productionBoardStatus('Готово');
assert.equal(ready.key, 'ready');
assert.equal(ready.done, true);
assert.equal(ready.unknown, false);

const active = productionBoardStatus('В производстве');
assert.equal(active.key, 'in_production');
assert.equal(active.done, false);

const legacyProduction = productionBoardStatus('В работе');
assert.equal(legacyProduction.key, 'in_production');
assert.equal(legacyProduction.legacy, true);
assert.equal(legacyProduction.done, false);

const unknownProduction = productionBoardStatus('Legacy Production State');
assert.equal(unknownProduction.known, false);
assert.equal(unknownProduction.unknown, true);
assert.equal(unknownProduction.done, false);

const nullInstallation = installationBoardStatus(null);
assert.equal(nullInstallation.key, 'unassigned');
assert.equal(nullInstallation.done, false);

const completedInstallation = installationBoardStatus('Выполнен');
assert.equal(completedInstallation.key, 'completed');
assert.equal(completedInstallation.done, true);

const legacyInstallation = installationBoardStatus('Проблема');
assert.equal(legacyInstallation.key, 'postponed');
assert.equal(legacyInstallation.legacy, true);
assert.equal(legacyInstallation.done, false);

const unknownInstallation = boardStatus('installation', 'Legacy Installation State');
assert.equal(unknownInstallation.known, false);
assert.equal(unknownInstallation.done, false);

const now = new Date(2030, 0, 15, 12, 0, 0, 0).getTime();
const yesterday = new Date(2030, 0, 14, 8, 0, 0, 0).toISOString();
const today = new Date(2030, 0, 15, 8, 0, 0, 0).toISOString();
assert.equal(isBoardDateOverdue(yesterday, false, now), true);
assert.equal(isBoardDateOverdue(yesterday, true, now), false);
assert.equal(isBoardDateToday(today, false, now), true);
assert.equal(isBoardDateToday(today, true, now), false);

const metrics = productionBoardMetrics(
  [
    { production_status: 'Готово', deadline: yesterday },
    { production_status: 'В производстве', deadline: yesterday },
    { production_status: 'Legacy Production State', deadline: today }
  ],
  [
    { install_status: 'Выполнен', scheduled_at: yesterday },
    { install_status: 'Запланирован', scheduled_at: today },
    { install_status: 'Legacy Installation State', scheduled_at: yesterday }
  ],
  now
);

assert.equal(metrics.productionOpen, 2);
assert.equal(metrics.installationOpen, 2);
assert.equal(metrics.overdueProduction, 1);
assert.equal(metrics.overdueInstallation, 1);
assert.equal(metrics.todayProduction, 1);
assert.equal(metrics.todayInstallation, 1);
assert.equal(metrics.unknownProduction, 1);
assert.equal(metrics.unknownInstallation, 1);

console.log('CRM production board status registry behavior is valid.');
