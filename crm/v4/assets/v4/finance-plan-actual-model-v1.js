const CANCELLED_TOKENS = ['отмен', 'аннулир', 'сторнир'];
const PENDING_TOKENS = ['чернов', 'ожид', 'не провед', 'не подтверж', 'на соглас'];
const CONFIRMED_EXPENSE_TOKENS = ['провед', 'оплачен', 'подтверж', 'выплачен', 'заверш', 'исполнен'];
const OUTGOING_PAYMENT_TOKENS = ['возврат', 'расход', 'исход'];

function text(value) {
  return String(value ?? '').trim().toLowerCase();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function includesAny(value, tokens) {
  const normalized = text(value);
  return tokens.some((token) => normalized.includes(token));
}

function explicitProfit(order, plannedRevenue, plannedCost) {
  const raw = Number(order?.profit);
  return Number.isFinite(raw) ? raw : plannedRevenue - plannedCost;
}

export function confirmedPaymentEffect(payment = {}) {
  const amount = Math.abs(number(payment.amount));
  if (!amount) return Object.freeze({ included: false, signedAmount: 0, direction: 'none', reason: 'empty_amount' });
  if (payment.is_confirmed !== true) return Object.freeze({ included: false, signedAmount: 0, direction: 'none', reason: 'not_confirmed' });
  if (includesAny(payment.payment_status, CANCELLED_TOKENS)) return Object.freeze({ included: false, signedAmount: 0, direction: 'none', reason: 'cancelled' });
  const outgoing = includesAny(payment.payment_type, OUTGOING_PAYMENT_TOKENS);
  return Object.freeze({
    included: true,
    signedAmount: outgoing ? -amount : amount,
    direction: outgoing ? 'outgoing' : 'incoming',
    reason: 'confirmed'
  });
}

export function confirmedExpenseEffect(expense = {}) {
  const amount = Math.abs(number(expense.amount));
  if (!amount) return Object.freeze({ included: false, amount: 0, reason: 'empty_amount' });
  const status = text(expense.status);
  if (includesAny(status, CANCELLED_TOKENS)) return Object.freeze({ included: false, amount: 0, reason: 'cancelled' });
  if (!status || includesAny(status, PENDING_TOKENS)) return Object.freeze({ included: false, amount: 0, reason: 'not_confirmed' });
  if (!includesAny(status, CONFIRMED_EXPENSE_TOKENS)) return Object.freeze({ included: false, amount: 0, reason: 'unknown_status' });
  return Object.freeze({ included: true, amount, reason: 'confirmed' });
}

export function buildOrderFinanceSnapshot(order = {}, payments = [], expenses = [], options = {}) {
  const plannedRevenue = number(order.client_total);
  const plannedCost = number(order.contractor_cost);
  const plannedProfit = explicitProfit(order, plannedRevenue, plannedCost);
  const paymentEffects = (payments || []).map((payment) => ({ payment, effect: confirmedPaymentEffect(payment) }));
  const expenseEffects = (expenses || []).map((expense) => ({ expense, effect: confirmedExpenseEffect(expense) }));

  const confirmedIncoming = paymentEffects
    .filter(({ effect }) => effect.included && effect.direction === 'incoming')
    .reduce((sum, { effect }) => sum + effect.signedAmount, 0);
  const confirmedPaymentOutflow = paymentEffects
    .filter(({ effect }) => effect.included && effect.direction === 'outgoing')
    .reduce((sum, { effect }) => sum + Math.abs(effect.signedAmount), 0);
  const confirmedNetReceipts = confirmedIncoming - confirmedPaymentOutflow;
  const confirmedExpenses = expenseEffects
    .filter(({ effect }) => effect.included)
    .reduce((sum, { effect }) => sum + effect.amount, 0);
  const confirmedExpenseRows = expenseEffects.filter(({ effect }) => effect.included).length;
  const ignoredPaymentRows = paymentEffects.filter(({ effect }) => !effect.included).length;
  const ignoredExpenseRows = expenseEffects.filter(({ effect }) => !effect.included).length;
  const cashResult = confirmedNetReceipts - confirmedExpenses;
  const debt = Math.max(plannedRevenue - confirmedNetReceipts, 0);
  const expenseEvidenceCompleteEnough = plannedCost <= 0 || confirmedExpenseRows > 0;
  const terminal = options.terminal === true;
  const statusKnown = options.statusKnown !== false;

  let actualProfitState = 'unknown';
  if (expenseEvidenceCompleteEnough) actualProfitState = terminal ? 'provisional' : 'partial';
  const actualProfit = actualProfitState === 'unknown' ? null : cashResult;
  const planFactDiff = actualProfit === null ? null : actualProfit - plannedProfit;
  const warnings = [];
  if (!statusKnown) warnings.push('Статус заказа не сопоставлен с canonical registry.');
  if (plannedCost > 0 && confirmedExpenseRows === 0) warnings.push('Нет подтверждённых расходов: фактическая прибыль не рассчитана.');
  if (ignoredPaymentRows > 0) warnings.push(`Не учтено неподтверждённых или отменённых платежей: ${ignoredPaymentRows}.`);
  if (ignoredExpenseRows > 0) warnings.push(`Не учтено неподтверждённых, неизвестных или отменённых расходов: ${ignoredExpenseRows}.`);
  if (!terminal && actualProfitState !== 'unknown') warnings.push('Заказ не закрыт: финансовый результат предварительный.');

  return Object.freeze({
    orderId: String(order.id || ''),
    orderNumber: order.order_number ?? null,
    projectName: String(order.project_name || 'Заказ'),
    status: String(order.status || 'Новый'),
    terminal,
    statusKnown,
    plannedRevenue,
    plannedCost,
    plannedProfit,
    confirmedIncoming,
    confirmedPaymentOutflow,
    confirmedNetReceipts,
    confirmedExpenses,
    confirmedExpenseRows,
    ignoredPaymentRows,
    ignoredExpenseRows,
    cashResult,
    debt,
    paymentCoveragePercent: plannedRevenue > 0 ? Math.round((confirmedNetReceipts / plannedRevenue) * 100) : 100,
    expenseEvidenceCompleteEnough,
    actualProfitState,
    actualProfit,
    planFactDiff,
    warnings: Object.freeze(warnings)
  });
}

export function buildFinancePortfolioSnapshot(orders = [], payments = [], expenses = [], options = {}) {
  const statusResolver = typeof options.statusResolver === 'function'
    ? options.statusResolver
    : () => ({ known: true, terminal: false });
  const activeOrders = (orders || []).filter((order) => order?.is_archived !== true);
  const orderIds = new Set(activeOrders.map((order) => String(order.id || '')).filter(Boolean));
  const paymentsByOrder = new Map();
  const expensesByOrder = new Map();

  (payments || []).forEach((payment) => {
    const key = String(payment?.order_id || '');
    if (!paymentsByOrder.has(key)) paymentsByOrder.set(key, []);
    paymentsByOrder.get(key).push(payment);
  });
  (expenses || []).forEach((expense) => {
    const key = String(expense?.order_id || '');
    if (!expensesByOrder.has(key)) expensesByOrder.set(key, []);
    expensesByOrder.get(key).push(expense);
  });

  const orderSnapshots = activeOrders.map((order) => {
    const status = statusResolver(order.status) || {};
    return buildOrderFinanceSnapshot(
      order,
      paymentsByOrder.get(String(order.id || '')) || [],
      expensesByOrder.get(String(order.id || '')) || [],
      { terminal: status.terminal === true, statusKnown: status.known !== false }
    );
  });

  const confirmedUnattributedPayments = (payments || [])
    .filter((payment) => !orderIds.has(String(payment?.order_id || '')))
    .map(confirmedPaymentEffect)
    .filter((effect) => effect.included)
    .reduce((sum, effect) => sum + effect.signedAmount, 0);
  const confirmedUnattributedExpenses = (expenses || [])
    .filter((expense) => !orderIds.has(String(expense?.order_id || '')))
    .map(confirmedExpenseEffect)
    .filter((effect) => effect.included)
    .reduce((sum, effect) => sum + effect.amount, 0);

  const totals = orderSnapshots.reduce((acc, item) => {
    acc.plannedRevenue += item.plannedRevenue;
    acc.plannedCost += item.plannedCost;
    acc.plannedProfit += item.plannedProfit;
    acc.confirmedIncoming += item.confirmedIncoming;
    acc.confirmedPaymentOutflow += item.confirmedPaymentOutflow;
    acc.confirmedNetReceipts += item.confirmedNetReceipts;
    acc.confirmedExpenses += item.confirmedExpenses;
    acc.cashResult += item.cashResult;
    acc.debt += item.debt;
    acc.ignoredPaymentRows += item.ignoredPaymentRows;
    acc.ignoredExpenseRows += item.ignoredExpenseRows;
    if (item.plannedCost > 0) acc.costBearingOrders += 1;
    if (item.plannedCost > 0 && item.confirmedExpenseRows > 0) acc.ordersWithExpenseEvidence += 1;
    if (item.actualProfitState === 'unknown') acc.unknownActualProfitOrders += 1;
    if (item.actualProfitState === 'partial') acc.partialActualProfitOrders += 1;
    return acc;
  }, {
    plannedRevenue: 0,
    plannedCost: 0,
    plannedProfit: 0,
    confirmedIncoming: 0,
    confirmedPaymentOutflow: 0,
    confirmedNetReceipts: 0,
    confirmedExpenses: 0,
    cashResult: 0,
    debt: 0,
    ignoredPaymentRows: 0,
    ignoredExpenseRows: 0,
    costBearingOrders: 0,
    ordersWithExpenseEvidence: 0,
    unknownActualProfitOrders: 0,
    partialActualProfitOrders: 0
  });

  const actualProfitState = totals.unknownActualProfitOrders > 0
    ? 'unknown'
    : totals.partialActualProfitOrders > 0
      ? 'partial'
      : 'provisional';
  const actualProfit = actualProfitState === 'unknown' ? null : totals.cashResult;
  const riskRank = { unknown: 0, partial: 1, provisional: 2 };
  const sortedOrders = [...orderSnapshots].sort((a, b) => {
    const stateDiff = riskRank[a.actualProfitState] - riskRank[b.actualProfitState];
    if (stateDiff) return stateDiff;
    return b.debt - a.debt || b.plannedRevenue - a.plannedRevenue;
  });

  return Object.freeze({
    orderCount: orderSnapshots.length,
    orders: Object.freeze(sortedOrders),
    ...totals,
    confirmedUnattributedPayments,
    confirmedUnattributedExpenses,
    expenseCoveragePercent: totals.costBearingOrders > 0
      ? Math.round((totals.ordersWithExpenseEvidence / totals.costBearingOrders) * 100)
      : 100,
    paymentCoveragePercent: totals.plannedRevenue > 0
      ? Math.round((totals.confirmedNetReceipts / totals.plannedRevenue) * 100)
      : 100,
    actualProfitState,
    actualProfit,
    planFactDiff: actualProfit === null ? null : actualProfit - totals.plannedProfit
  });
}

export function actualProfitStateLabel(state) {
  if (state === 'provisional') return 'Предварительная факт. прибыль';
  if (state === 'partial') return 'Предварительный результат';
  return 'Фактическая прибыль не рассчитана';
}
