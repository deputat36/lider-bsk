import assert from 'node:assert/strict';
import {
  buildManagementAttentionQueue,
  buildManagementWorkSummary,
  managementUrgentCount
} from '../crm/v4/assets/v4/management-attention-model-v1.js';

const now = new Date('2026-07-15T10:00:00Z').getTime();
const source = {
  leads: [
    { id: 'lead-1', name: 'Клиент 1', status: 'Новая', phone: '', next_contact_at: '2026-07-14T10:00:00Z', assigned_to: null },
    { id: 'lead-2', service: 'Баннер', status: 'Уточнение деталей', phone: '+7000', next_contact_at: null, assigned_to: 'manager-1' },
    { id: 'lead-3', name: 'Расчёт без КП', status: 'Расчёт подготовлен', phone: '+7001', next_contact_at: '2026-07-18T10:00:00Z', assigned_to: 'manager-1' },
    { id: 'lead-4', name: 'КП отправлено', status: 'КП отправлено', phone: '+7002', next_contact_at: '2026-07-18T10:00:00Z', assigned_to: 'manager-1' },
    { id: 'lead-orphan', name: 'Потерянный заказ', status: 'Создан заказ', phone: '+7003', next_contact_at: null, converted_order_id: null },
    { id: 'lead-converted', status: 'Создан заказ', phone: '+7004', converted_order_id: 'order-valid' }
  ],
  needs: [
    { id: 'need-2', lead_id: 'lead-2', status: 'Активна' },
    { id: 'need-3', lead_id: 'lead-3', status: 'Активна' },
    { id: 'need-4', lead_id: 'lead-4', status: 'Активна' }
  ],
  calculations: [
    { id: 'calc-3', lead_id: 'lead-3', is_current_revision: true },
    { id: 'calc-4', lead_id: 'lead-4', is_current_revision: true }
  ],
  orders: [
    { id: 'order-1', project_name: 'Вывеска', status: 'В производстве', deadline: '2026-07-14', payment_status: 'Не оплачено' },
    { id: 'order-2', project_name: 'Таблички', status: 'Новый', deadline: '2026-07-17', payment_status: 'Оплачено' },
    { id: 'order-today', project_name: 'Заказ сегодня', status: 'Новый', deadline: '2026-07-15', payment_status: 'Оплачено' }
  ],
  production: [{ id: 'job-1', order_id: 'order-1', title: 'Печать', production_status: 'В производстве', deadline: '2026-07-14T12:00:00Z' }],
  installation: [{ id: 'install-1', order_id: 'order-2', title: 'Монтаж вывески', install_status: 'Запланирован', scheduled_at: '2026-07-16T12:00:00Z' }],
  offers: [{ id: 'offer-1', lead_id: 'lead-4', title: 'КП на вывеску', status: 'Отправлено', valid_until: '2026-07-18' }]
};

const queue = buildManagementAttentionQueue(source, now);
const keys = queue.map((item) => item.key);

assert.equal(new Set(keys).size, keys.length);
assert.equal(queue.filter((item) => item.key === 'lead:lead-1').length, 1);
assert.equal(queue.find((item) => item.key === 'lead:lead-1').reason, 'Нет телефона для связи');
assert.equal(queue.find((item) => item.key === 'lead:lead-orphan').reason, 'Статус «Создан заказ», но связанная запись не найдена');
assert.equal(queue.some((item) => item.key === 'lead:lead-converted'), false);
assert.equal(queue.filter((item) => item.key === 'order:order-1').length, 1);
assert.equal(queue.find((item) => item.key === 'order:order-1').reason, 'Срок заказа просрочен');
assert.equal(queue.find((item) => item.key === 'lead:lead-2').reason, 'Не назначен следующий контакт');
assert.equal(queue.find((item) => item.key === 'lead:lead-3').reason, 'Расчёт готов, но КП ещё не создано');
assert.equal(queue.find((item) => item.key === 'lead:lead-4').reason, 'КП отправлено и ждёт результата');
assert.equal(queue.find((item) => item.key === 'order:order-today').reason, 'Срок заказа наступит в ближайшие 3 дня');
assert.equal(queue[0].key, 'lead:lead-1');
assert.equal(managementUrgentCount(queue), 4);
assert.equal(managementUrgentCount([{ priority: 69 }, { priority: 70 }]), 1);

assert.deepEqual(buildManagementWorkSummary(source, queue, now), {
  urgent: 4,
  newLeads: 1,
  calculations: 3,
  offers: 1,
  problemOrders: 2,
  totalQueue: 8
});

console.log('Management workspace prioritizes unique clients and orders, including needs, calculations, offers and broken links.');
