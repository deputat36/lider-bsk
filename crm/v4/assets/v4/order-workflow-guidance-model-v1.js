function text(value) {
  return String(value ?? '').trim().toLowerCase();
}

function freezePlan(plan) {
  return plan ? Object.freeze({ ...plan, steps: Object.freeze([...(plan.steps || [])]) }) : null;
}

function orderLabel(order = {}) {
  const number = order.order_number || String(order.id || '').slice(0, 8) || 'без номера';
  const title = order.project_name || 'Заказ';
  return `Заказ №${number} — ${title}`;
}

function deadlineState(order = {}, statusModel = {}, now = new Date()) {
  if (!order.deadline) return 'missing';
  const deadline = new Date(order.deadline);
  const current = now instanceof Date ? new Date(now.getTime()) : new Date(now);
  if (!Number.isFinite(deadline.getTime()) || !Number.isFinite(current.getTime())) return 'unknown';
  deadline.setHours(23, 59, 59, 999);
  if (statusModel.terminal === true) return 'finished';
  return deadline.getTime() < current.getTime() ? 'overdue' : 'scheduled';
}

function layoutApproved(order = {}) {
  const value = text(order.layout_status || order.data?.layout_status || order.data?.layoutStatus);
  if (!value) return false;
  if (value.includes('не требуется')) return true;

  const incompleteMarkers = [
    'на согласовании',
    'согласование',
    'правк',
    'в работе',
    'нужен',
    'нет макета',
    'не готов',
    'ожид'
  ];
  if (incompleteMarkers.some((marker) => value.includes(marker))) return false;

  return value.includes('согласован')
    || value.includes('утвержд')
    || value === 'готов'
    || value.includes('готовый макет');
}

function paymentSettled(order = {}) {
  const value = text(order.payment_status);
  const balance = Number(order.balance || 0);
  if (Number.isFinite(balance) && balance > 0.01) return false;
  if (!value) return false;
  if (value.includes('не оплат') || value.includes('част') || value.includes('ожид') || value.includes('долг')) return false;
  return value.includes('оплачен') || value.includes('оплачено') || value.includes('закрыт');
}

function expensesNeedAttention(order = {}, expenses = []) {
  const plannedCost = Number(order.contractor_cost || 0);
  if (!Number.isFinite(plannedCost) || plannedCost <= 0) return false;
  return !Array.isArray(expenses) || expenses.length === 0;
}

function productionHasProblem(order = {}) {
  const value = text(order.production_status || order.data?.production_status || order.data?.productionStatus);
  return ['проблем', 'срыв', 'задерж', 'приост', 'передел', 'брак'].some((marker) => value.includes(marker));
}

export function buildOrderPrimaryAction({ order = {}, statusModel = {}, expenses = [], now = new Date() } = {}) {
  const statusKey = String(statusModel.key || '').trim();
  const known = statusModel.known === true && Boolean(statusKey);
  const deadline = deadlineState(order, statusModel, now);
  const paid = paymentSettled(order);
  const missingExpenses = expensesNeedAttention(order, expenses);

  if (!known) {
    return freezePlan({
      key: 'review_unknown_status',
      label: 'Проверить заказ вручную',
      hint: 'Статус не сопоставлен с рабочим маршрутом. Заказ оставлен под контролем и не изменяется автоматически.',
      target: 'order_control',
      tone: 'warn'
    });
  }

  if (deadline === 'overdue') {
    return freezePlan({
      key: 'resolve_overdue',
      label: 'Разобраться со сроком',
      hint: 'Срок уже прошёл. Сначала выясните фактическое состояние, новую дату и кого нужно уведомить.',
      target: productionHasProblem(order) ? 'production' : 'order_control',
      tone: 'danger'
    });
  }

  if (statusKey === 'cancelled') {
    return freezePlan({
      key: 'settle_cancelled_order',
      label: 'Проверить расчёты по отмене',
      hint: 'Нужно сверить выполненные работы, понесённые расходы, предоплату, возврат и остаток задолженности.',
      target: 'finance_control',
      tone: 'danger'
    });
  }

  if (statusKey === 'closed') {
    if (!paid || missingExpenses) {
      return freezePlan({
        key: 'verify_closed_finance',
        label: 'Проверить финансы заказа',
        hint: 'Заказ закрыт по работе, но оплата или фактические расходы ещё требуют проверки.',
        target: 'finance_control',
        tone: 'warn'
      });
    }
    return freezePlan({
      key: 'complete',
      label: 'Заказ завершён',
      hint: 'Работа, оплата и подтверждённые расходы не требуют срочного действия.',
      target: 'none',
      tone: 'good'
    });
  }

  if (deadline === 'missing') {
    return freezePlan({
      key: 'set_deadline',
      label: 'Уточнить срок заказа',
      hint: 'Без срока CRM не сможет вовремя предупредить о задержке и следующем действии.',
      target: 'order_control',
      tone: 'warn'
    });
  }

  if (productionHasProblem(order)) {
    return freezePlan({
      key: 'resolve_production_problem',
      label: 'Разобраться с производством',
      hint: 'В производстве отмечена проблема, задержка, приостановка, брак или переделка.',
      target: 'production',
      tone: 'danger'
    });
  }

  if (['new', 'layout_review'].includes(statusKey) && !layoutApproved(order)) {
    return freezePlan({
      key: 'approve_layout',
      label: 'Проверить макет и согласование',
      hint: 'До запуска производства нужно получить или подготовить макет и зафиксировать согласование клиента.',
      target: order.lead_id ? 'lead' : 'order_control',
      tone: 'warn'
    });
  }

  if (['new', 'layout_review'].includes(statusKey) && !paid) {
    return freezePlan({
      key: 'verify_payment_before_start',
      label: 'Проверить оплату и запуск',
      hint: 'Макет готов, но оплата не закрыта. Проверьте условия старта и только после этого передавайте заказ дальше.',
      target: 'finance_control',
      tone: 'warn'
    });
  }

  if (['new', 'layout_review'].includes(statusKey)) {
    return freezePlan({
      key: 'start_production',
      label: 'Передать в производство',
      hint: 'Макет и оплата не блокируют следующий шаг. Проверьте исполнителя, стоимость и срок производства.',
      target: 'production',
      tone: 'good'
    });
  }

  if (statusKey === 'production') {
    return freezePlan({
      key: 'control_production',
      label: 'Проверить производство',
      hint: 'Уточните фактическую готовность, срок и наличие отклонений у исполнителя.',
      target: 'production',
      tone: 'warn'
    });
  }

  if (statusKey === 'ready') {
    if (!paid || missingExpenses) {
      return freezePlan({
        key: 'ready_finance_check',
        label: 'Проверить оплату и расходы',
        hint: 'Заказ готов, но перед выдачей или закрытием нужно сверить оплату и фактическую себестоимость.',
        target: 'finance_control',
        tone: 'warn'
      });
    }
    return freezePlan({
      key: 'arrange_handover',
      label: 'Организовать выдачу или монтаж',
      hint: 'Заказ готов. Зафиксируйте передачу клиенту либо завершите связанный монтаж.',
      target: 'production',
      tone: 'good'
    });
  }

  if (statusKey === 'issued') {
    if (!paid || missingExpenses) {
      return freezePlan({
        key: 'issued_finance_check',
        label: 'Закрыть финансовые вопросы',
        hint: 'Заказ выдан, но остались оплата, расходы или проверка фактической прибыли.',
        target: 'finance_control',
        tone: 'warn'
      });
    }
    return freezePlan({
      key: 'close_order',
      label: 'Проверить и закрыть заказ',
      hint: 'Заказ выдан и оплачен. Проверьте расходы, документы и завершите заказ штатным переходом.',
      target: 'order_control',
      tone: 'good'
    });
  }

  return freezePlan({
    key: 'review_order',
    label: 'Проверить состояние заказа',
    hint: 'Откройте контроль заказов и уточните ближайшее обязательное действие.',
    target: 'order_control',
    tone: 'warn'
  });
}

export const ORDER_EXCEPTION_SCENARIOS = Object.freeze([
  {
    key: 'scope_changed',
    label: 'Клиент изменил состав или параметры',
    target: 'lead',
    actionLabel: 'Открыть заявку и пересчёт',
    impact: 'Могут измениться цена, срок, макет, производство и монтаж.',
    consequence: 'Не изменяйте незаметно согласованный заказ. Сначала создайте новую версию потребности и расчёта, затем согласуйте разницу.',
    steps: ['Зафиксировать новые параметры', 'Сохранить прежнюю согласованную версию', 'Пересчитать цену и срок', 'Получить подтверждение клиента']
  },
  {
    key: 'extra_work',
    label: 'Добавилась новая работа',
    target: 'lead',
    actionLabel: 'Открыть заявку и добавить работу',
    impact: 'Изменятся сумма, задолженность и состав исполнительских задач.',
    consequence: 'Дополнительная работа должна быть отдельно рассчитана и согласована до выполнения.',
    steps: ['Добавить отдельную позицию или допработу', 'Рассчитать стоимость', 'Зафиксировать согласование', 'Создать только необходимые задачи']
  },
  {
    key: 'contractor_price_changed',
    label: 'Подрядчик изменил цену',
    target: 'finance_control',
    actionLabel: 'Открыть финансы',
    impact: 'Меняются плановая себестоимость, прибыль и, возможно, цена клиенту.',
    consequence: 'Сохраните первоначальную цену подрядчика и не меняйте клиентскую сумму без отдельного согласования.',
    steps: ['Записать новую цену и причину', 'Пересчитать прибыль', 'Проверить альтернативного подрядчика', 'Решить, требуется ли согласование клиента']
  },
  {
    key: 'contractor_delay',
    label: 'Подрядчик задерживает работу',
    target: 'production',
    actionLabel: 'Открыть производство',
    impact: 'Меняется ожидаемая готовность и может быть сорван срок клиента.',
    consequence: 'Старый обещанный срок должен остаться в истории, а клиенту нужно сообщить подтверждённую новую дату.',
    steps: ['Получить фактическое состояние', 'Зафиксировать причину задержки', 'Установить новую ожидаемую дату', 'Связаться с клиентом']
  },
  {
    key: 'defect_rework',
    label: 'Обнаружен брак или нужна переделка',
    target: 'production',
    actionLabel: 'Открыть производство',
    impact: 'Появляются новый срок, дополнительные расходы и риск снижения прибыли.',
    consequence: 'Не закрывайте исходную работу как успешно выполненную. Зафиксируйте проблему, виновную сторону и план исправления.',
    steps: ['Сохранить описание и фото', 'Определить ответственную сторону', 'Назначить переделку и новый срок', 'Учесть дополнительный расход или компенсацию']
  },
  {
    key: 'partial_ready',
    label: 'Заказ готов частично',
    target: 'production',
    actionLabel: 'Открыть производство',
    impact: 'Часть позиций можно выдать или смонтировать, остальные остаются в работе.',
    consequence: 'Не переводите весь заказ в готовый или закрытый статус, пока не завершены оставшиеся позиции.',
    steps: ['Отметить готовые позиции', 'Зафиксировать оставшиеся позиции', 'Согласовать частичную выдачу или монтаж', 'Проверить частичную оплату']
  },
  {
    key: 'client_postponed',
    label: 'Клиент переносит срок',
    target: 'order_control',
    actionLabel: 'Открыть контроль заказов',
    impact: 'Меняются сроки связанных задач и загрузка исполнителей.',
    consequence: 'Сохраните прежнюю дату и причину переноса, чтобы отличать решение клиента от просрочки агентства.',
    steps: ['Зафиксировать старый и новый срок', 'Записать причину', 'Проверить производство и монтаж', 'Уведомить исполнителей']
  },
  {
    key: 'cancelled',
    label: 'Клиент отменяет заказ',
    target: 'finance_control',
    actionLabel: 'Проверить отмену и расчёты',
    impact: 'Нужно учесть выполненные работы, расходы, предоплату, возврат и задолженность.',
    consequence: 'Не сводите отмену к одному статусу. Сначала определите финансовые и производственные последствия.',
    steps: ['Проверить текущий этап', 'Собрать понесённые расходы', 'Рассчитать возврат или долг', 'Только после этого подтвердить отмену']
  }
].map((scenario) => freezePlan(scenario)));

export function buildOrderExceptionPlan(key, order = {}) {
  const scenario = ORDER_EXCEPTION_SCENARIOS.find((item) => item.key === String(key || '').trim());
  if (!scenario) return null;
  return freezePlan({
    ...scenario,
    note: `${orderLabel(order)}. Ситуация: ${scenario.label}. ${scenario.impact} Следующие действия: ${scenario.steps.join('; ')}.`
  });
}
