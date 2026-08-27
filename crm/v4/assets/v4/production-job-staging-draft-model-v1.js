import { CRM_V4_ACTIONS } from './action-permissions-v1.js';
import { orderStatusUiModel } from './order-status-ui-model-v1.js';
import { statusDefinition } from './status-transitions-v1.js';

const ACTIVE_PRODUCTION_STATUSES = new Set(['not_sent', 'queued', 'in_production', 'stopped', 'ready']);
const APPROVED_DESIGN_STATUSES = new Set(['approved', 'completed']);

function text(value) {
  return String(value ?? '').trim();
}

function safeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function dateIso(value) {
  return safeDate(value)?.toISOString() || null;
}

function priority(value) {
  const normalized = text(value).toLocaleLowerCase('ru-RU');
  if (normalized.includes('сроч')) return 'Срочно';
  if (normalized.includes('высок')) return 'Высокая';
  return 'Обычная';
}

function approvedLayout(value) {
  return statusDefinition('layout', value)?.key === 'approved';
}

function designTaskModel(task = {}) {
  const raw = text(task.task_status);
  const definition = statusDefinition('design_task', raw);
  return Object.freeze({
    id: text(task.id),
    raw,
    known: Boolean(definition),
    key: definition?.key || '',
    approved: APPROVED_DESIGN_STATUSES.has(definition?.key || ''),
    layoutLink: text(task.layout_link),
    updatedAt: safeDate(task.updated_at || task.created_at) ? text(task.updated_at || task.created_at) : null
  });
}

function productionJobModel(job = {}) {
  const raw = text(job.production_status);
  const definition = statusDefinition('production', raw);
  return Object.freeze({
    id: text(job.id),
    raw,
    known: Boolean(definition),
    key: definition?.key || '',
    terminal: definition?.terminal === true,
    active: !definition || ACTIVE_PRODUCTION_STATUSES.has(definition.key)
  });
}

function itemLine(item = {}) {
  const title = text(item.name || item.title || item.category || 'Позиция');
  const quantity = Number(item.quantity ?? item.qty ?? 0);
  const unit = text(item.unit);
  const size = [text(item.width), text(item.height)].filter(Boolean).join(' × ');
  const comment = text(item.comment);
  const parts = [title];
  if (Number.isFinite(quantity) && quantity > 0) parts.push(`${quantity}${unit ? ` ${unit}` : ''}`);
  if (size) parts.push(size);
  if (comment) parts.push(comment.slice(0, 500));
  return parts.join(' · ');
}

function technicalTask(items = []) {
  const lines = items.map(itemLine).filter(Boolean).slice(0, 80);
  return lines.length ? lines.join('\n') : 'Позиции не включены в безопасную проекцию. Уточнить техническое задание перед запуском.';
}

function empty(state, message, access = {}) {
  return Object.freeze({
    state,
    message,
    canRead: access.canRead === true,
    canWrite: access.canWrite === true,
    requiredReadAction: CRM_V4_ACTIONS.PRODUCTION_READ,
    requiredWriteAction: CRM_V4_ACTIONS.PRODUCTION_WRITE,
    order: null,
    designTask: null,
    existingJobs: Object.freeze([]),
    draft: null,
    warnings: Object.freeze([])
  });
}

export function buildProductionJobStagingDraft({
  order = null,
  items = [],
  designTasks = [],
  productionJobs = [],
  canRead = false,
  canWrite = false
} = {}) {
  const access = { canRead, canWrite };
  if (!canRead) return empty('access_denied', 'Нет права production.read для подготовки производственного задания.', access);
  if (!order || !text(order.id)) return empty('order_missing', 'Заказ не найден.', access);

  const orderStatus = orderStatusUiModel(order.status);
  const orderProjection = Object.freeze({
    id: text(order.id),
    number: order.order_number ?? '',
    projectName: text(order.project_name),
    statusRaw: orderStatus.raw,
    statusLabel: orderStatus.label,
    statusKnown: orderStatus.known,
    updatedAt: safeDate(order.updated_at) ? text(order.updated_at) : null,
    deadline: dateIso(order.deadline),
    priority: priority(order.priority),
    layoutStatus: text(order.layout_status),
    layoutLink: text(order.layout_link)
  });

  if (order.is_archived === true || orderStatus.terminal) {
    return Object.freeze({ ...empty('order_unavailable', 'Архивный, закрытый или отменённый заказ нельзя передать в производство.', access), order: orderProjection });
  }

  const jobs = productionJobs
    .filter((job) => text(job.order_id) === orderProjection.id)
    .map(productionJobModel);
  const activeJobs = jobs.filter((job) => job.active);
  if (activeJobs.length) {
    return Object.freeze({
      ...empty('active_job_exists', 'У заказа уже есть активное производственное задание.', access),
      order: orderProjection,
      existingJobs: Object.freeze(jobs),
      warnings: Object.freeze(activeJobs.filter((job) => !job.known).map((job) => `Неизвестный статус «${job.raw}» считается активным и блокирует дубль.`))
    });
  }

  if (!approvedLayout(order.layout_status)) {
    return Object.freeze({
      ...empty('layout_not_approved', 'Перед производством требуется статус «Макет согласован».', access),
      order: orderProjection,
      existingJobs: Object.freeze(jobs)
    });
  }

  const taskModels = designTasks
    .filter((task) => text(task.order_id) === orderProjection.id)
    .map(designTaskModel)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  const designTask = taskModels.find((task) => task.approved) || null;
  const warnings = [];
  if (taskModels.length && !designTask) warnings.push('У заказа есть дизайн-задача, но её статус не подтверждает согласованный макет.');
  if (!orderProjection.layoutLink && !designTask?.layoutLink) warnings.push('Не указана ссылка на согласованный макет.');
  if (!orderProjection.deadline) warnings.push('Не указан срок заказа; срок производственного задания останется пустым.');
  if (!canWrite) warnings.push('У текущей роли нет production.write; доступен только просмотр черновика.');

  const fileUrl = orderProjection.layoutLink || designTask?.layoutLink || null;
  const number = orderProjection.number ? `№${orderProjection.number}` : `#${orderProjection.id.slice(0, 8)}`;
  const draft = Object.freeze({
    command: 'production_job.create_from_order',
    order_id: orderProjection.id,
    design_task_id: designTask?.id || null,
    idempotency_key: `production_job.create_from_order:${orderProjection.id}:v1`,
    job: Object.freeze({
      title: `Производство ${number} — ${orderProjection.projectName || 'заказ'}`,
      priority: orderProjection.priority,
      deadline: orderProjection.deadline,
      layout_status: 'Макет согласован',
      file_url: fileUrl,
      technical_task: technicalTask(items),
      contractor_id: null,
      contractor_cost: null
    })
  });

  return Object.freeze({
    state: canWrite ? 'draft_ready' : 'read_only',
    message: canWrite
      ? 'Черновик готов к безопасной отправке только в staging.'
      : 'Черновик подготовлен без права отправки.',
    canRead: true,
    canWrite: canWrite === true,
    requiredReadAction: CRM_V4_ACTIONS.PRODUCTION_READ,
    requiredWriteAction: CRM_V4_ACTIONS.PRODUCTION_WRITE,
    order: orderProjection,
    designTask,
    existingJobs: Object.freeze(jobs),
    draft,
    warnings: Object.freeze(warnings)
  });
}
