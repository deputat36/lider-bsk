import { isActiveOrderStatus, orderStatusUiModel } from './order-status-ui-model-v1.js';

function normalizedId(value) {
  return String(value ?? '').trim();
}

function idSet(rows = [], field) {
  return new Set(rows.map((row) => normalizedId(row?.[field])).filter(Boolean));
}

function dateValue(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function isOverdueOrder(order, nowValue = Date.now()) {
  const deadline = dateValue(order?.deadline);
  if (!deadline) return false;
  deadline.setHours(23, 59, 59, 999);
  return deadline.getTime() < Number(nowValue);
}

function queueOrder(order) {
  const status = orderStatusUiModel(order?.status);
  return Object.freeze({
    id: normalizedId(order?.id),
    orderNumber: order?.order_number ?? '',
    projectName: String(order?.project_name || 'Заказ').trim(),
    statusRaw: status.raw,
    statusLabel: status.label,
    statusKnown: status.known,
    statusWarning: status.warning,
    deadline: order?.deadline || null,
    createdAt: order?.created_at || null
  });
}

function sorted(rows) {
  return [...rows].sort((a, b) => {
    const aDate = dateValue(a?.deadline)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const bDate = dateValue(b?.deadline)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    if (aDate !== bDate) return aDate - bDate;
    return String(a?.order_number ?? '').localeCompare(String(b?.order_number ?? ''), 'ru');
  });
}

export function orderOperationalQualityQueues(
  orders = [],
  expenses = [],
  needs = [],
  designTasks = [],
  nowValue = Date.now()
) {
  const expenseOrderIds = idSet(expenses, 'order_id');
  const designTaskOrderIds = idSet(designTasks, 'order_id');
  const designLeadIds = new Set(
    needs
      .filter((need) => need?.need_design === true)
      .map((need) => normalizedId(need?.lead_id))
      .filter(Boolean)
  );

  const activeOrders = orders.filter((order) => {
    if (order?.is_archived === true) return false;
    return isActiveOrderStatus(order?.status);
  });

  const withoutExpenses = sorted(activeOrders.filter((order) => !expenseOrderIds.has(normalizedId(order?.id))));
  const withoutAssignee = sorted(activeOrders.filter((order) => !normalizedId(order?.assigned_to)));
  const overdue = sorted(activeOrders.filter((order) => isOverdueOrder(order, nowValue)));
  const designWithoutTask = sorted(activeOrders.filter((order) => {
    const orderId = normalizedId(order?.id);
    const leadId = normalizedId(order?.lead_id);
    return Boolean(leadId && designLeadIds.has(leadId) && !designTaskOrderIds.has(orderId));
  }));
  const unknownStatuses = sorted(activeOrders.filter((order) => !orderStatusUiModel(order?.status).known));

  const mapped = (rows) => Object.freeze(rows.map(queueOrder));
  return Object.freeze({
    activeTotal: activeOrders.length,
    withoutExpenses: mapped(withoutExpenses),
    withoutAssignee: mapped(withoutAssignee),
    overdue: mapped(overdue),
    designWithoutTask: mapped(designWithoutTask),
    unknownStatuses: mapped(unknownStatuses)
  });
}
