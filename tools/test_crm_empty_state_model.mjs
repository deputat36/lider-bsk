import assert from 'node:assert/strict';
import {
  CRM_EMPTY_STATE_CONTEXTS,
  crmEmptyStateContext,
  crmEmptyStateKind,
  crmEmptyStateModel
} from '../crm/v4/assets/v4/crm-empty-state-model-v1.js';

assert.deepEqual(CRM_EMPTY_STATE_CONTEXTS, ['leads', 'orders', 'finance', 'audit']);
assert.equal(crmEmptyStateContext({ containerId: 'leadsList' }), 'leads');
assert.equal(crmEmptyStateContext({ containerId: 'ordersBox' }), 'orders');
assert.equal(crmEmptyStateContext({ containerId: 'financeControlContent' }), 'finance');
assert.equal(crmEmptyStateContext({ containerId: 'publicLeadAuditContent' }), 'audit');
assert.equal(crmEmptyStateContext({ containerId: 'unknown' }), '');

assert.equal(crmEmptyStateKind({ context: 'leads', text: 'Загружаю заявки...' }), 'loading');
assert.equal(crmEmptyStateKind({ context: 'leads', text: 'Заявки не загрузились: timeout' }), 'error');
assert.equal(crmEmptyStateKind({ context: 'leads', text: 'Заявки загрузятся автоматически после входа.' }), 'initial');
assert.equal(crmEmptyStateKind({ context: 'leads', text: 'По выбранным условиям заявок нет.' }), 'filtered');
assert.equal(crmEmptyStateKind({ context: 'leads', text: 'В базе пока нет заявок.' }), 'empty');
assert.equal(crmEmptyStateKind({ context: 'finance', text: 'Нет заказов в этой группе.', financeColumn: true }), 'filtered');
assert.equal(crmEmptyStateKind({ context: 'audit', text: 'По этому номеру обращения событий не найдено.' }), 'filtered');
assert.equal(crmEmptyStateKind({ context: 'orders', text: 'Для создания заказа сначала согласуйте КП.' }), 'filtered');

const leadError = crmEmptyStateModel({ context: 'leads', text: 'Заявки не загрузились: сеть недоступна', isError: true });
assert.equal(leadError.kind, 'error');
assert.equal(leadError.tone, 'error');
assert.equal(leadError.action.attribute, 'data-retry-leads');
assert.match(leadError.detail, /сеть недоступна/);

const leadFiltered = crmEmptyStateModel({ context: 'leads', text: 'По выбранным условиям заявок нет.' });
assert.equal(leadFiltered.action.attribute, 'data-reset-lead-filters');
assert.match(leadFiltered.title, /условиям/);

const financePositive = crmEmptyStateModel({
  context: 'finance',
  text: 'Нет заказов в этой группе.',
  financeColumn: true,
  columnTitle: 'Низкая маржа'
});
assert.equal(financePositive.kind, 'filtered');
assert.equal(financePositive.tone, 'positive');
assert.equal(financePositive.compact, true);
assert.equal(financePositive.title, 'Нет: низкая маржа');
assert.equal(financePositive.action, null);

const auditFiltered = crmEmptyStateModel({ context: 'audit', text: 'По этому номеру обращения событий не найдено.' });
assert.equal(auditFiltered.action.attribute, 'data-public-lead-audit-clear-empty');
assert.equal(auditFiltered.tone, 'neutral');

const orderEmpty = crmEmptyStateModel({ context: 'orders', text: 'Связанный заказ пока не создан.' });
assert.equal(orderEmpty.kind, 'empty');
assert.equal(orderEmpty.action, null);
assert.match(orderEmpty.description, /КП/);

assert.equal(crmEmptyStateModel({ context: 'unknown', text: 'Нет данных' }), null);

console.log('CRM empty-state model explains loading, errors, empty data and filtered results without touching business data.');
