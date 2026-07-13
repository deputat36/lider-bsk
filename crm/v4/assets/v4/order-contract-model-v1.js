export const ORDER_CONTRACT_MODEL_VERSION = 1;

export const ORDER_CONTRACT_PAYMENT_MODES = Object.freeze([
  Object.freeze({ id: 'prepayment_100', label: '100% предоплата' }),
  Object.freeze({ id: 'split_50_50', label: '50% аванс / 50% после акта' }),
  Object.freeze({ id: 'postpayment_act', label: '100% после подписания акта' })
]);

export const ORDER_CONTRACT_TEMPLATES = Object.freeze([
  Object.freeze({
    id: 'general_services',
    label: 'Услуги и изготовление',
    subject: 'Исполнитель обязуется по заданию Заказчика выполнить работы и оказать услуги согласно Спецификации (Приложение № 1), а Заказчик обязуется принять результат и оплатить его на условиях настоящего Договора.',
    paymentMode: 'prepayment_100',
    deadlineDays: 10,
    acceptanceDays: 5,
    warrantyMonths: 0,
    penaltyPercent: 0.1
  }),
  Object.freeze({
    id: 'advertising_installation',
    label: 'Рекламная конструкция и монтаж',
    subject: 'Исполнитель обязуется изготовить рекламную продукцию или рекламную конструкцию, при необходимости выполнить демонтаж и монтаж согласно утверждённому макету и Спецификации (Приложение № 1), а Заказчик обязуется предоставить исходные данные, согласовать макет, принять и оплатить результат.',
    paymentMode: 'split_50_50',
    deadlineDays: 15,
    acceptanceDays: 5,
    warrantyMonths: 12,
    penaltyPercent: 0.1
  }),
  Object.freeze({
    id: 'repair_maintenance',
    label: 'Ремонт и обслуживание',
    subject: 'Исполнитель обязуется выполнить ремонтные или сервисные работы в объёме, указанном в Спецификации (Приложение № 1), а Заказчик обязуется обеспечить доступ к объекту, принять результат и оплатить работы.',
    paymentMode: 'prepayment_100',
    deadlineDays: 10,
    acceptanceDays: 5,
    warrantyMonths: 3,
    penaltyPercent: 0.1
  })
]);

const MAX = Object.freeze({
  number: 120,
  city: 120,
  subject: 1600,
  party: 500,
  details: 3000,
  representative: 300,
  authority: 300,
  address: 800,
  deadlineBasis: 600,
  additionalTerms: 2500,
  itemName: 700,
  itemUnit: 50
});

const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);
const numeric = (value, fallback = 0) => {
  const source = String(value ?? '').trim();
  if (!source) return fallback;
  const parsed = Number(source.replace(',', '.').replace(/\s+/g, ''));
  return Number.isFinite(parsed) ? parsed : fallback;
};
const positive = (value, fallback, maximum) => {
  const parsed = Math.max(0, numeric(value, fallback));
  return Math.min(parsed, maximum);
};

export function orderContractTemplate(templateId = '') {
  const id = clean(templateId, 80);
  return ORDER_CONTRACT_TEMPLATES.find((template) => template.id === id) || ORDER_CONTRACT_TEMPLATES[0];
}

export function suggestedOrderContractTemplate(projectName = '') {
  const value = clean(projectName, 700).toLowerCase();
  if (/ремонт|замен|обслуж|восстанов/.test(value)) return 'repair_maintenance';
  if (/вывес|баннер|стенд|таблич|реклам|букв|монтаж|бэклит|светов/.test(value)) return 'advertising_installation';
  return 'general_services';
}

export function orderContractDraftNumber(order = {}, now = new Date()) {
  const year = Number(now?.getFullYear?.()) || new Date().getFullYear();
  const orderPart = clean(order.order_number || order.id || '', 12) || 'БЕЗ-НОМЕРА';
  return `ДОГ-${year}-ЧЕРНОВИК-${orderPart}`;
}

export function normalizeOrderContractItems(rawItems = []) {
  const source = Array.isArray(rawItems) ? rawItems : [];
  return source.slice(0, 160).map((item) => {
    const quantity = positive(item?.quantity, 1, 1000000) || 1;
    const rawSum = numeric(item?.sum ?? item?.client_sum, 0);
    const rawPrice = numeric(item?.price, quantity ? rawSum / quantity : rawSum);
    const price = Math.max(0, rawPrice);
    const sum = Math.max(0, rawSum || quantity * price);
    return Object.freeze({
      name: clean(item?.name || 'Работы по заказу', MAX.itemName),
      quantity,
      unit: clean(item?.unit || 'шт.', MAX.itemUnit),
      price: Math.round(price * 100) / 100,
      sum: Math.round(sum * 100) / 100
    });
  }).filter((item) => item.name);
}

export function normalizeOrderContractDraft(raw = {}) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const template = orderContractTemplate(source.templateId);
  const paymentMode = ORDER_CONTRACT_PAYMENT_MODES.some((mode) => mode.id === source.paymentMode)
    ? source.paymentMode
    : template.paymentMode;
  return Object.freeze({
    schemaVersion: ORDER_CONTRACT_MODEL_VERSION,
    templateId: template.id,
    number: clean(source.number, MAX.number),
    date: clean(source.date, 20),
    city: clean(source.city || 'Борисоглебск', MAX.city),
    executor: clean(source.executor, MAX.party),
    executorDetails: clean(source.executorDetails, MAX.details),
    executorRepresentative: clean(source.executorRepresentative, MAX.representative),
    executorRole: clean(source.executorRole || 'Исполнитель', MAX.representative),
    customer: clean(source.customer, MAX.party),
    customerDetails: clean(source.customerDetails, MAX.details),
    customerRepresentative: clean(source.customerRepresentative, MAX.representative),
    customerAuthority: clean(source.customerAuthority || 'Устава / доверенности', MAX.authority),
    subject: clean(source.subject || template.subject, MAX.subject),
    workAddress: clean(source.workAddress, MAX.address),
    paymentMode,
    paymentDays: positive(source.paymentDays, 5, 365) || 5,
    deadlineDays: positive(source.deadlineDays, template.deadlineDays, 730) || template.deadlineDays,
    deadlineBasis: clean(source.deadlineBasis || 'с даты получения предусмотренной предоплаты, исходных данных и согласования макета или технического задания', MAX.deadlineBasis),
    acceptanceDays: positive(source.acceptanceDays, template.acceptanceDays, 60) || template.acceptanceDays,
    warrantyMonths: positive(source.warrantyMonths, template.warrantyMonths, 120),
    penaltyPercent: positive(source.penaltyPercent, template.penaltyPercent, 10),
    taxMode: clean(source.taxMode || 'Без НДС', 80),
    additionalTerms: clean(source.additionalTerms, MAX.additionalTerms),
    items: Object.freeze(normalizeOrderContractItems(source.items))
  });
}

export function orderContractTotal(raw = {}) {
  const draft = normalizeOrderContractDraft(raw);
  return Math.round(draft.items.reduce((sum, item) => sum + item.sum, 0) * 100) / 100;
}

export function orderContractPaymentText(raw = {}) {
  const draft = normalizeOrderContractDraft(raw);
  if (draft.paymentMode === 'split_50_50') {
    return `Заказчик перечисляет 50% стоимости в качестве предоплаты в течение ${draft.paymentDays} рабочих дней после получения счёта. Оставшиеся 50% перечисляются в течение ${draft.paymentDays} рабочих дней после подписания Акта сдачи-приёмки.`;
  }
  if (draft.paymentMode === 'postpayment_act') {
    return `Заказчик перечисляет 100% стоимости в течение ${draft.paymentDays} рабочих дней после подписания Акта сдачи-приёмки и получения счёта.`;
  }
  return `Заказчик перечисляет 100% стоимости в качестве предоплаты в течение ${draft.paymentDays} рабочих дней после получения счёта.`;
}

export function orderContractSections(raw = {}) {
  const draft = normalizeOrderContractDraft(raw);
  const payment = orderContractPaymentText(draft);
  const result = [
    Object.freeze({
      title: '1. Предмет договора',
      paragraphs: Object.freeze([
        draft.subject,
        'Наименование, количество, цена, адрес и иные характеристики результата определяются Спецификацией. Согласованный Сторонами макет или техническое задание является частью задания Заказчика.'
      ])
    }),
    Object.freeze({
      title: '2. Стоимость и порядок расчётов',
      paragraphs: Object.freeze([
        'Общая стоимость определяется Спецификацией (Приложение № 1).',
        payment,
        `Стоимость указана в рублях. Налоговый режим Исполнителя: ${draft.taxMode}. Исполнитель, применяющий налог на профессиональный доход, после получения оплаты формирует и передаёт Заказчику чек.`
      ])
    }),
    Object.freeze({
      title: '3. Сроки и обязанности сторон',
      paragraphs: Object.freeze([
        `Срок выполнения — ${draft.deadlineDays} рабочих дней ${draft.deadlineBasis}.`,
        'Исполнитель выполняет работы по согласованному заданию, сообщает о препятствиях и вправе привлекать третьих лиц, оставаясь ответственным перед Заказчиком за результат.',
        'Заказчик своевременно предоставляет достоверные исходные данные, согласовывает макет или техническое задание, обеспечивает доступ к месту выполнения работ и получает необходимые согласования собственника объекта, если они требуются.'
      ])
    }),
    Object.freeze({
      title: '4. Сдача и приёмка',
      paragraphs: Object.freeze([
        `После завершения Исполнитель передаёт результат и Акт сдачи-приёмки. Заказчик в течение ${draft.acceptanceDays} рабочих дней подписывает Акт либо направляет мотивированный письменный отказ с перечнем недостатков.`,
        'Выявленные и подтверждённые недостатки устраняются в согласованный Сторонами срок, после чего результат предъявляется повторно.'
      ])
    })
  ];

  if (draft.warrantyMonths > 0) {
    result.push(Object.freeze({
      title: '5. Гарантийные обязательства',
      paragraphs: Object.freeze([
        `Гарантийный срок на результат работ составляет ${draft.warrantyMonths} месяцев с даты подписания Акта, если иной срок прямо не указан в Спецификации.`,
        'Гарантия не распространяется на повреждения из-за действий третьих лиц, нарушения правил эксплуатации, вмешательства Заказчика, аварийных режимов электросети, естественного износа и обстоятельств непреодолимой силы.'
      ])
    }));
  }

  const responsibilityNumber = draft.warrantyMonths > 0 ? 6 : 5;
  result.push(Object.freeze({
    title: `${responsibilityNumber}. Ответственность сторон`,
    paragraphs: Object.freeze([
      `За нарушение срока оплаты или выполнения обязательств виновная Сторона по письменному требованию другой Стороны уплачивает пеню ${draft.penaltyPercent}% от просроченной суммы за каждый день просрочки, но не более стоимости соответствующего обязательства.`,
      'Уплата пени не освобождает Стороны от исполнения обязательств. Стороны не отвечают за нарушение, вызванное документально подтверждёнными обстоятельствами непреодолимой силы.'
    ])
  }));
  result.push(Object.freeze({
    title: `${responsibilityNumber + 1}. Заключительные положения`,
    paragraphs: Object.freeze([
      'Договор вступает в силу с даты подписания и действует до полного исполнения обязательств. Изменения оформляются письменно и подписываются обеими Сторонами.',
      'Споры разрешаются переговорами, а при недостижении соглашения — в порядке, установленном законодательством Российской Федерации.',
      'Договор составлен в двух экземплярах равной юридической силы, по одному для каждой Стороны.',
      draft.additionalTerms
    ].filter(Boolean))
  }));
  return Object.freeze(result);
}

export function orderContractWarnings(raw = {}) {
  const draft = normalizeOrderContractDraft(raw);
  const warnings = [];
  if (!draft.number) warnings.push('Не указан номер договора.');
  if (!draft.date) warnings.push('Не указана дата договора.');
  if (!draft.executor) warnings.push('Не указан Исполнитель.');
  if (!draft.executorDetails) warnings.push('Не заполнены реквизиты Исполнителя.');
  if (!draft.customer) warnings.push('Не указан Заказчик.');
  if (!draft.customerDetails) warnings.push('Не заполнены реквизиты Заказчика.');
  if (!draft.items.length) warnings.push('В Спецификации нет позиций.');
  if (orderContractTotal(draft) <= 0) warnings.push('Общая стоимость должна быть больше нуля.');
  if (!draft.subject) warnings.push('Не заполнен предмет договора.');
  if (draft.templateId === 'advertising_installation' && !draft.workAddress) warnings.push('Для монтажных работ укажите адрес объекта.');
  warnings.push('Это несохранённый черновик: проверьте реквизиты и юридические условия перед подписанием.');
  return Object.freeze(warnings);
}
