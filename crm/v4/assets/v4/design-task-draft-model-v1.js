import { CRM_V4_ACTIONS } from './action-permissions-v1.js';
import { orderStatusUiModel } from './order-status-ui-model-v1.js';
import {
  allowedStatusTransitions,
  statusDefinition,
  statusDomain
} from './status-transitions-v1.js';

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

function safeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function dateIso(value) {
  const date = safeDate(value);
  return date ? date.toISOString() : null;
}

function uniqueText(values = []) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function relevantDesignNeeds(needs = [], leadId = '') {
  const targetLead = text(leadId);
  return needs.filter((need) => {
    if (need?.need_design !== true) return false;
    if (targetLead && text(need?.lead_id) !== targetLead) return false;
    return !EXCLUDED_NEED_STATUSES.has(normalized(need?.status));
  });
}

function taskStatusModel(task = {}) {
  const raw = text(task?.task_status) || 'Новая';
  const definition = statusDefinition('design_task', raw);
  return Object.freeze({
    id: text(task?.id),
    raw,
    known: Boolean(definition),
    key: definition?.key || '',
    label: definition?.label || raw,
    terminal: definition?.terminal === true,
    designerName: text(task?.designer_name),
    deadline: dateIso(task?.deadline),
    layoutStatus: text(task?.layout_status),
    layoutLinkPresent: Boolean(text(task?.layout_link)),
    createdAt: dateIso(task?.created_at)
  });
}

function earliestDeadline(order = {}, needs = []) {
  const candidates = [
    ...needs.map((need) => ({ value: need?.deadline_date, source: 'need.deadline_date' })),
    { value: order?.deadline, source: 'order.deadline' }
  ]
    .map((candidate) => ({ ...candidate, date: safeDate(candidate.value) }))
    .filter((candidate) => candidate.date)
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  const first = candidates[0];
  return Object.freeze({
    value: first ? first.date.toISOString() : null,
    source: first?.source || ''
  });
}

function orderLabel(order = {}) {
  const number = order?.order_number ?? '';
  return number ? `№${number}` : `#${text(order?.id).slice(0, 8)}`;
}

function draftTitle(order = {}, needs = []) {
  const needTitles = uniqueText(needs.map((need) => need?.title));
  const subject = needTitles[0] || text(order?.project_name) || 'макет по заказу';
  return `Дизайн ${orderLabel(order)} — ${subject}`;
}

function draftTaskText(needs = []) {
  const lines = [];
  const titles = uniqueText(needs.map((need) => need?.title));
  const reasons = uniqueText(needs.map((need) => need?.design_reason));
  const types = uniqueText(needs.map((need) => need?.need_type));

  if (titles.length) lines.push(`Потребность: ${titles.join('; ')}`);
  if (types.length) lines.push(`Тип: ${types.join('; ')}`);
  if (reasons.length) lines.push(`Зачем нужен дизайн: ${reasons.join('; ')}`);
  lines.push('Перед началом работы уточнить размеры, материалы, текст, референсы и способ согласования.');
  return lines.join('\n');
}

function statusFlow() {
  const domain = statusDomain('design_task');
  const initial = statusDefinition('design_task', 'new');
  const allowed = allowedStatusTransitions('design_task', 'new')
    .map((key) => domain?.statuses?.[key])
    .filter(Boolean)
    .map((item) => Object.freeze({ key: item.key, label: item.label }));

  return Object.freeze({
    domain: domain?.key || 'design_task',
    initial: Object.freeze({ key: initial?.key || 'new', label: initial?.label || 'Новая' }),
    allowedFromInitial: Object.freeze(allowed)
  });
}

function emptyResult(state, message, access = {}) {
  return Object.freeze({
    state,
    message,
    canRead: access.canRead === true,
    canWrite: access.canWrite === true,
    productionCreateEnabled: false,
    requiredReadAction: CRM_V4_ACTIONS.DESIGN_READ,
    requiredWriteAction: CRM_V4_ACTIONS.DESIGN_WRITE,
    order: null,
    needs: Object.freeze([]),
    existingTasks: Object.freeze([]),
    draft: null,
    warnings: Object.freeze([]),
    statusFlow: statusFlow()
  });
}

export function buildDesignTaskDraftPreview({
  order = null,
  needs = [],
  designTasks = [],
  canRead = false,
  canWrite = false
} = {}) {
  const access = { canRead, canWrite };
  if (!canRead) return emptyResult('access_denied', 'Нет права design.read для просмотра черновика.', access);
  if (!order || !text(order?.id)) return emptyResult('order_missing', 'Заказ не найден.', access);

  const orderStatus = orderStatusUiModel(order?.status);
  if (order?.is_archived === true || orderStatus.terminal) {
    return Object.freeze({
      ...emptyResult('order_unavailable', 'Архивный или завершённый заказ не используется для нового черновика.', access),
      order: Object.freeze({
        id: text(order?.id),
        orderNumber: order?.order_number ?? '',
        statusRaw: orderStatus.raw,
        statusLabel: orderStatus.label,
        statusKnown: orderStatus.known
      })
    });
  }

  const orderId = text(order?.id);
  const leadId = text(order?.lead_id);
  const selectedNeeds = relevantDesignNeeds(needs, leadId);
  const taskModels = designTasks
    .filter((task) => text(task?.order_id) === orderId)
    .map(taskStatusModel);
  const activeTasks = taskModels.filter((task) => !task.terminal);

  const orderProjection = Object.freeze({
    id: orderId,
    orderNumber: order?.order_number ?? '',
    projectName: text(order?.project_name),
    statusRaw: orderStatus.raw,
    statusLabel: orderStatus.label,
    statusKnown: orderStatus.known,
    priority: text(order?.priority) || 'Обычный',
    deadline: dateIso(order?.deadline),
    updatedAt: safeDate(order?.updated_at) ? text(order.updated_at) : null,
    layoutStatus: text(order?.layout_status),
    layoutLinkPresent: Boolean(text(order?.layout_link)),
    leadId
  });

  const needProjection = Object.freeze(selectedNeeds.map((need) => Object.freeze({
    id: text(need?.id),
    leadId: text(need?.lead_id),
    type: text(need?.need_type),
    title: text(need?.title),
    designReason: text(need?.design_reason),
    deadline: dateIso(need?.deadline_date),
    status: text(need?.status),
    completenessScore: Number.isFinite(Number(need?.completeness_score)) ? Number(need.completeness_score) : null
  })));

  if (activeTasks.length) {
    const unknown = activeTasks.filter((task) => !task.known);
    return Object.freeze({
      state: 'existing_active_task',
      message: unknown.length
        ? 'У заказа уже есть активная дизайн-задача с неизвестным raw-статусом. Статус сохранён без автоматической замены.'
        : 'У заказа уже есть активная дизайн-задача. Новый черновик не формируется.',
      canRead: true,
      canWrite: canWrite === true,
      productionCreateEnabled: false,
      requiredReadAction: CRM_V4_ACTIONS.DESIGN_READ,
      requiredWriteAction: CRM_V4_ACTIONS.DESIGN_WRITE,
      order: orderProjection,
      needs: needProjection,
      existingTasks: Object.freeze(taskModels),
      draft: null,
      warnings: Object.freeze(unknown.map((task) => `Неизвестный статус «${task.raw}» сохранён как есть.`)),
      statusFlow: statusFlow()
    });
  }

  if (!selectedNeeds.length) {
    return Object.freeze({
      state: 'design_not_proven',
      message: 'В активных потребностях заказа не найдено подтверждение need_design=true.',
      canRead: true,
      canWrite: canWrite === true,
      productionCreateEnabled: false,
      requiredReadAction: CRM_V4_ACTIONS.DESIGN_READ,
      requiredWriteAction: CRM_V4_ACTIONS.DESIGN_WRITE,
      order: orderProjection,
      needs: needProjection,
      existingTasks: Object.freeze(taskModels),
      draft: null,
      warnings: Object.freeze(['Не создавайте дизайн-задачу только по предположению: сначала подтвердите потребность.']),
      statusFlow: statusFlow()
    });
  }

  const deadline = earliestDeadline(order, selectedNeeds);
  const reasons = uniqueText(selectedNeeds.map((need) => need?.design_reason));
  const warnings = [];
  if (!deadline.value) warnings.push('Не указан дедлайн дизайна.');
  if (!reasons.length) warnings.push('Не заполнена причина, зачем нужен дизайн.');
  if (selectedNeeds.some((need) => Number(need?.completeness_score || 0) < 80)) {
    warnings.push('Есть потребность с полнотой ниже 80%. Техническое задание может быть неполным.');
  }
  if (orderProjection.layoutLinkPresent) {
    warnings.push('В заказе уже есть ссылка на макет. Проверьте, нужна ли новая задача или только согласование существующего макета.');
  }
  if (!canWrite) warnings.push('У текущей роли нет design.write; доступен только просмотр черновика.');

  const idempotencyKey = `design_task.create_from_order:${orderId}:v1`;
  const payload = Object.freeze({
    command: 'design_task.create_from_order',
    order_id: orderId,
    production_job_id: null,
    idempotency_key: idempotencyKey,
    task: Object.freeze({
      title: draftTitle(order, selectedNeeds),
      task_status: statusDefinition('design_task', 'new')?.label || 'Новая',
      layout_status: 'Макет не начат',
      priority: orderProjection.priority,
      designer_name: null,
      deadline: deadline.value,
      source: 'crm_v4_local_draft_preview',
      task_text: draftTaskText(selectedNeeds),
      reference_link: null,
      layout_link: null
    }),
    evidence: Object.freeze({
      need_ids: Object.freeze(selectedNeeds.map((need) => text(need?.id)).filter(Boolean)),
      need_design: true,
      deadline_source: deadline.source || null
    })
  });

  return Object.freeze({
    state: warnings.length ? 'draft_incomplete' : 'draft_ready',
    message: warnings.length
      ? 'Черновик подготовлен локально, но перед созданием нужно устранить предупреждения.'
      : 'Черновик подготовлен локально и готов к будущей server-side команде.',
    canRead: true,
    canWrite: canWrite === true,
    productionCreateEnabled: false,
    requiredReadAction: CRM_V4_ACTIONS.DESIGN_READ,
    requiredWriteAction: CRM_V4_ACTIONS.DESIGN_WRITE,
    order: orderProjection,
    needs: needProjection,
    existingTasks: Object.freeze(taskModels),
    draft: payload,
    warnings: Object.freeze(warnings),
    statusFlow: statusFlow()
  });
}
