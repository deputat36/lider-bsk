import assert from 'node:assert/strict';
import {
  isActiveOrderStatus,
  orderStageFlags,
  orderStatusUiModel,
  rawOrderStatus
} from '../crm/v4/assets/v4/order-status-ui-model-v1.js';

assert.equal(rawOrderStatus(null), 'Новый');
assert.equal(rawOrderStatus('  В производстве  '), 'В производстве');

for (const status of ['Новый', 'Макет на согласовании', 'В производстве', 'Выдано']) {
  assert.equal(orderStatusUiModel(status).known, true, status);
}

const fresh = orderStatusUiModel('Новый');
assert.equal(fresh.key, 'new');
assert.equal(fresh.active, true);
assert.deepEqual(fresh.transitions.map((item) => item.label), ['Макет на согласовании', 'В производстве', 'Отменён']);

const production = orderStageFlags('В производстве');
assert.equal(production.productionStarted, true);
assert.equal(production.ready, false);

const issued = orderStatusUiModel('Выдано');
assert.equal(issued.key, 'issued');
assert.equal(issued.active, true);
assert.deepEqual(issued.transitions.map((item) => item.label), ['Закрыт']);
assert.equal(orderStageFlags('Выдано').issued, true);

assert.equal(isActiveOrderStatus('Закрыт'), false);
assert.equal(isActiveOrderStatus('Отменён'), false);
assert.equal(orderStatusUiModel('Отмена').key, 'cancelled');

const unknown = orderStatusUiModel('Legacy Order State');
assert.equal(unknown.known, false);
assert.equal(unknown.raw, 'Legacy Order State');
assert.equal(unknown.active, true);
assert.deepEqual(unknown.transitions, []);
assert.match(unknown.warning, /оставлен в активном контроле/);

console.log('CRM order status UI registry behavior is valid.');
