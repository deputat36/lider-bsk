import {
  statusDefinition
} from '../crm/v4/assets/v4/status-transitions-v1.js';
import { orderStatusUiModel } from '../crm/v4/assets/v4/order-status-ui-model-v1.js';

const ACTION = 'design_task.create_from_order';
const FORBIDDEN_TASK_FIELDS = new Set([
  'task_status',
  'layout_status',
  'designer_name',
  'layout_link',
  'source',
  'owner_id',
  'created_by',
  'updated_by',
  'client_name',
  'client_phone',
  'client_comment',
  'internal_comment',
  'result_comment'
]);
const ALLOWED_TASK_FIELDS = new Set([
  'title',
  'priority',
  'deadline',
  'task_text',
  'reference_link'
]);
const EXCLUDED_NEED_STATUSES = new Set([
  'архив',
  'архивная',
  'отменена',
  'отменено',
  'отменен',
  'отменён'
]);

function text(value) {
  return String(value ?? '').trim();
}

function normalized(value) {
  return text(value).toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, stableValue(value[key])])
  );
}

export function canonicalRequestFingerprint(request = {}) {
  return JSON.stringify(stableValue({
    action: request?.action,
    expected_updated_at: request?.expected_updated_at,
    payload: request?.payload
  }));
}

function error(code, reason, extra = {}) {
  return Object.freeze({
    ok: false,
    code,
    reason,
    ...extra,
    writes: Object.freeze([])
  });
}

function warningList(needs = [], deadline = null) {
  const warnings = [];
  if (!deadline) warnings.push('design_deadline_missing');
  if (needs.some((need) => !text(need?.design_reason))) warnings.push('design_reason_missing');
  if (needs.some((need) => Number(need?.completeness_score || 0) < 80)) warnings.push('need_completeness_below_80');
  if (needs.some((need) => Array.isArray(need?.missing_fields) && need.missing_fields.length > 0)) warnings.push('need_missing_fields_present');
  return warnings;
}

function earliestDeadline(order, needs) {
  const candidates = [
    ...needs.map((need) => need?.deadline_date),
    order?.deadline
  ]
    .filter(Boolean)
    .map((value) => new Date(value))
    .filter((date) => Number.isFinite(date.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());
  return candidates[0]?.toISOString() || null;
}

function safeTaskTitle(task, order, needs) {
  if (text(task?.title)) return text(task.title).slice(0, 300);
  const subject = text(needs[0]?.title) || `заказ №${order?.order_number || text(order?.id).slice(0, 8)}`;
  return `Дизайн — ${subject}`.slice(0, 300);
}

function safeTaskText(task, needs) {
  if (text(task?.task_text)) return text(task.task_text).slice(0, 10000);
  return needs
    .map((need) => [text(need?.title), text(need?.design_reason)].filter(Boolean).join(': '))
    .filter(Boolean)
    .join('\n')
    .slice(0, 10000);
}

function validateTaskShape(task = {}) {
  const fields = Object.keys(task || {});
  const rejected = fields.filter((field) => FORBIDDEN_TASK_FIELDS.has(field));
  if (rejected.length) return error('validation_error', 'server_owned_task_fields', { fields: Object.freeze(rejected) });
  const unknown = fields.filter((field) => !ALLOWED_TASK_FIELDS.has(field));
  if (unknown.length) return error('validation_error', 'unknown_task_fields', { fields: Object.freeze(unknown) });
  return null;
}

function taskStatusState(task) {
  const raw = text(task?.task_status) || 'Новая';
  const definition = statusDefinition('design_task', raw);
  return {
    raw,
    known: Boolean(definition),
    terminal: definition?.terminal === true,
    key: definition?.key || ''
  };
}

export function buildDesignTaskCreatePlan({
  request = {},
  profileActive = false,
  canWrite = false,
  actorUserId = '',
  order = null,
  needs = [],
  designTasks = [],
  productionJob = null,
  receipt = null
} = {}) {
  if (text(request?.action) !== ACTION) return error('unknown_action', 'action_mismatch');
  if (!profileActive) return error('access_denied', 'active_profile_required');
  if (!canWrite) return error('forbidden', 'design_write_required');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(request?.request_id))) {
    return error('validation_error', 'request_id_invalid');
  }

  const payload = request?.payload && typeof request.payload === 'object' ? request.payload : null;
  if (!payload) return error('validation_error', 'payload_required');
  const orderId = text(payload.order_id);
  const idempotencyKey = text(payload.idempotency_key);
  const needIds = Array.isArray(payload.need_ids) ? payload.need_ids.map(text).filter(Boolean) : [];
  if (!orderId || !idempotencyKey || !needIds.length || !payload.task || typeof payload.task !== 'object') {
    return error('validation_error', 'required_payload_fields');
  }
  if (idempotencyKey.length > 180) return error('validation_error', 'idempotency_key_too_long');
  if (new Set(needIds).size !== needIds.length) return error('validation_error', 'need_ids_not_unique');

  const taskShapeError = validateTaskShape(payload.task);
  if (taskShapeError) return taskShapeError;

  const requestFingerprint = canonicalRequestFingerprint(request);
  if (receipt?.state === 'in_progress') return error('duplicate_request', 'idempotent_request_in_progress');
  if (receipt?.state === 'success') {
    if (receipt.requestFingerprint !== requestFingerprint) return error('conflict', 'idempotency_hash_mismatch');
    return Object.freeze({
      ok: true,
      code: 'ok',
      idempotentReplay: true,
      requestFingerprint,
      response: receipt.response,
      warnings: Object.freeze(receipt.response?.warnings || []),
      writes: Object.freeze([])
    });
  }

  if (!order || text(order?.id) !== orderId) return error('not_found', 'order_not_found');
  if (text(request?.expected_updated_at) !== text(order?.updated_at)) return error('conflict', 'order_stale');
  const orderStatus = orderStatusUiModel(order?.status);
  if (!orderStatus.known) return error('conflict', 'order_status_unknown');
  if (order?.is_archived === true || orderStatus.terminal) return error('conflict', 'order_unavailable');
  if (!text(order?.lead_id)) return error('validation_error', 'order_lead_missing');

  const needMap = new Map(needs.map((need) => [text(need?.id), need]));
  const selectedNeeds = [];
  for (const needId of needIds) {
    const need = needMap.get(needId);
    if (!need) return error('not_found', 'need_not_found', { needId });
    if (text(need?.lead_id) !== text(order?.lead_id)) return error('validation_error', 'need_lead_mismatch', { needId });
    if (need?.need_design !== true) return error('validation_error', 'need_design_not_confirmed', { needId });
    if (EXCLUDED_NEED_STATUSES.has(normalized(need?.status))) return error('validation_error', 'need_unavailable', { needId });
    selectedNeeds.push(need);
  }

  const productionJobId = text(payload.production_job_id);
  if (productionJobId) {
    if (!productionJob || text(productionJob?.id) !== productionJobId) return error('not_found', 'production_job_not_found');
    if (text(productionJob?.order_id) !== orderId) return error('validation_error', 'production_job_order_mismatch');
  }

  const orderTasks = designTasks.filter((task) => text(task?.order_id) === orderId);
  for (const task of orderTasks) {
    const status = taskStatusState(task);
    if (!status.known) return error('conflict', 'existing_task_unknown_status', { taskId: text(task?.id), rawStatus: status.raw });
    if (!status.terminal) return error('conflict', 'existing_active_task', { taskId: text(task?.id), statusKey: status.key });
  }

  const initialStatus = statusDefinition('design_task', 'new');
  if (!initialStatus) return error('persistence_failed', 'canonical_initial_status_missing');
  const deadline = text(payload.task?.deadline) || earliestDeadline(order, selectedNeeds);
  const warnings = warningList(selectedNeeds, deadline);
  const actor = text(actorUserId);
  if (!actor) return error('access_denied', 'actor_user_id_missing');

  const insertTask = Object.freeze({
    order_id: orderId,
    production_job_id: productionJobId || null,
    title: safeTaskTitle(payload.task, order, selectedNeeds),
    task_status: initialStatus.label,
    layout_status: 'Макет не начат',
    priority: text(payload.task?.priority) || text(order?.priority) || 'Обычный',
    designer_name: null,
    deadline: deadline || null,
    source: 'crm_v4_server_action',
    layout_link: null,
    reference_link: text(payload.task?.reference_link) || null,
    task_text: safeTaskText(payload.task, selectedNeeds),
    owner_id: actor,
    created_by: actor
  });
  const insertEvent = Object.freeze({
    order_id: orderId,
    event_type: 'created',
    old_status: null,
    new_status: initialStatus.label,
    body: 'Дизайн-задача создана из заказа.',
    created_by: actor
  });

  return Object.freeze({
    ok: true,
    code: 'ok',
    idempotentReplay: false,
    requestFingerprint,
    warnings: Object.freeze(warnings),
    serverOwned: Object.freeze({
      taskStatus: initialStatus.label,
      layoutStatus: 'Макет не начат',
      source: 'crm_v4_server_action',
      actorUserId: actor
    }),
    writes: Object.freeze([
      Object.freeze({ target: 'leader_command_receipts', operation: 'reserve' }),
      Object.freeze({ target: 'leader_design_tasks', operation: 'insert', payload: insertTask }),
      Object.freeze({ target: 'leader_design_task_events', operation: 'insert', payload: insertEvent }),
      Object.freeze({ target: 'leader_command_receipts', operation: 'complete' })
    ])
  });
}
