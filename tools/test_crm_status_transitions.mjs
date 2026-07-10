import assert from 'node:assert/strict';
import {
  CRM_STATUS_REGISTRY_VERSION,
  canonicalStatusKey,
  canTransitionStatus,
  statusDefinition,
  statusLabel,
  statusRegistrySummary,
  transitionPermission,
  validateStatusTransition
} from '../crm/v4/assets/v4/status-transitions-v1.js';

assert.equal(CRM_STATUS_REGISTRY_VERSION, 1);

// Production labels and legacy aliases.
assert.equal(canonicalStatusKey('lead', 'Новая'), 'new');
assert.equal(canonicalStatusKey('lead', 'Расчет подготовлен'), 'estimate_ready');
assert.equal(canonicalStatusKey('offer', 'Согласовано'), 'agreed');
assert.equal(canonicalStatusKey('order', 'Макет на согласовании'), 'layout_review');
assert.equal(canonicalStatusKey('layout', 'Макет согласован'), 'approved');
assert.equal(canonicalStatusKey('production', 'Не передано'), 'not_sent');
assert.equal(canonicalStatusKey('installation', null), 'unassigned');
assert.equal(canonicalStatusKey('installation', 'Запланирован'), 'scheduled');
assert.equal(canonicalStatusKey('payment', 'Частично оплачено'), 'partial');
assert.equal(canonicalStatusKey('payment_record', 'Проведен'), 'posted');

// Allowed and forbidden transitions.
assert.equal(canTransitionStatus('lead', 'Новая', 'В работе'), true);
assert.equal(canTransitionStatus('lead', 'Новая', 'Создан заказ'), false);
assert.equal(canTransitionStatus('offer', 'Черновик', 'Отправлено'), true);
assert.equal(canTransitionStatus('order', 'Выдано', 'Закрыт'), true);
assert.equal(canTransitionStatus('order', 'Выдано', 'В производстве'), false);
assert.equal(canTransitionStatus('payment', 'Не оплачено', 'Оплачено'), true);
assert.equal(canTransitionStatus('payment', 'Оплачено', 'Частично оплачено'), false);

// Terminal status guard.
const terminal = validateStatusTransition('lead', 'Создан заказ', 'Новая');
assert.equal(terminal.ok, false);
assert.equal(terminal.reason, 'terminal_status');

// Permission mapping for document lifecycle.
const signed = validateStatusTransition('document', 'Сформирован', 'Подписан');
assert.equal(signed.ok, true);
assert.equal(signed.permission, 'documents.sign');
assert.equal(signed.timestampField, 'signed_at');
assert.equal(signed.auditEvent, 'document.signed');
assert.equal(transitionPermission('document', 'Аннулирован'), 'documents.void');

// Human-readable helpers and unknown values.
assert.equal(statusLabel('production', 'in_production'), 'В производстве');
assert.equal(statusDefinition('unknown', 'Новая'), null);
assert.equal(validateStatusTransition('unknown', 'a', 'b').reason, 'unknown_domain');
assert.equal(validateStatusTransition('lead', 'Неизвестный статус', 'Новая').reason, 'unknown_from_status');

const summary = statusRegistrySummary();
assert.equal(summary.version, 1);
assert.ok(summary.domains.lead.statuses.some((item) => item.label === 'Создан заказ' && item.terminal === true));
assert.ok(summary.domains.document.statuses.some((item) => item.label === 'Подписан' && item.terminal === true));

console.log('CRM status transition registry behavior is valid.');
