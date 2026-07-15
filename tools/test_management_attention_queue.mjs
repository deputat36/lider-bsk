import assert from 'node:assert/strict';
import { buildManagementAttentionQueue, managementUrgentCount } from '../crm/v4/assets/v4/management-attention-model-v1.js';

const now = new Date('2026-07-15T10:00:00Z').getTime();
const queue = buildManagementAttentionQueue({
  leads: [
    { id: 'lead-1', name: 'Клиент 1', status: 'Новая', phone: '', next_contact_at: '2026-07-14T10:00:00Z' },
    { id: 'lead-2', service: 'Баннер', status: 'Уточнение деталей', phone: '+7000', next_contact_at: null },
    { id: 'lead-closed', status: 'Создан заказ', phone: '', next_contact_at: null }
  ],
  orders: [
    { id: 'order-1', project_name: 'Вывеска', status: 'В производстве', deadline: '2026-07-14T10:00:00Z', payment_status: 'Не оплачено' },
    { id: 'order-2', project_name: 'Таблички', status: 'Новый', deadline: '2026-07-17T10:00:00Z', payment_status: 'Оплачено' }
  ],
  production: [{ id: 'job-1', order_id: 'order-1', title: 'Печать', production_status: 'В производстве', deadline: '2026-07-14T12:00:00Z' }],
  installation: [{ id: 'install-1', order_id: 'order-2', title: 'Монтаж вывески', install_status: 'Запланирован', scheduled_at: '2026-07-16T12:00:00Z' }],
  offers: [{ id: 'offer-1', lead_id: 'lead-2', title: 'КП на баннер', status: 'Отправлено', valid_until: '2026-07-14T00:00:00Z' }]
}, now);

assert.equal(queue.filter((item) => item.key === 'lead:lead-1').length, 1);
assert.equal(queue.find((item) => item.key === 'lead:lead-1').reason, 'Нет телефона для связи');
assert.equal(queue.filter((item) => item.key === 'order:order-1').length, 1);
assert.equal(queue.find((item) => item.key === 'order:order-1').reason, 'Срок заказа просрочен');
assert.equal(queue.some((item) => item.key === 'lead:lead-closed'), false);
assert.equal(queue[0].key, 'lead:lead-1');
assert.equal(managementUrgentCount(queue), 5);
assert.equal(managementUrgentCount([{ priority: 69 }, { priority: 70 }]), 1);

console.log('Management attention queue prioritizes unique actionable entities.');
