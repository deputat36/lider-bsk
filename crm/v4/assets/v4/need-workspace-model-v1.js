function normalizedText(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru-RU');
}

function structuredValue(need, key) {
  return need?.structured_data && typeof need.structured_data === 'object'
    ? need.structured_data[key]
    : '';
}

function parsedTime(value, fallback = Number.POSITIVE_INFINITY) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? time : fallback;
}

function dependencyNeedId(dependency = {}) {
  return String(dependency.need_id ?? '').trim();
}

function dependencyCountsByNeed(dependencies = []) {
  const result = new Map();
  for (const dependency of Array.isArray(dependencies) ? dependencies : []) {
    const needId = dependencyNeedId(dependency);
    if (!needId) continue;
    const current = result.get(needId) || {
      calculationCount: 0,
      currentCalculationCount: 0,
      offerLinkCount: 0,
      orderLinkCount: 0
    };
    current.calculationCount += 1;
    if (dependency.is_current_revision === true) current.currentCalculationCount += 1;
    if (dependency.commercial_offer_id) current.offerLinkCount += 1;
    if (dependency.order_id) current.orderLinkCount += 1;
    result.set(needId, current);
  }
  return result;
}

export function activeNeeds(needs = []) {
  return (Array.isArray(needs) ? needs : []).filter((need) => need?.status !== 'Архив');
}

export function needFingerprint(need = {}) {
  const values = [
    need.lead_id,
    need.need_type || 'Другое',
    need.title,
    need.description,
    structuredValue(need, 'width'),
    structuredValue(need, 'height'),
    structuredValue(need, 'quantity'),
    structuredValue(need, 'print_run'),
    structuredValue(need, 'material'),
    structuredValue(need, 'installation_address'),
    need.need_design ? '1' : '0',
    need.need_installation ? '1' : '0',
    need.design_reason,
    need.installation_reason,
    need.deadline_text,
    need.deadline_date
  ];
  return values.map(normalizedText).join('|');
}

export function findDuplicateNeed(needle, needs = [], excludeId = null) {
  const fingerprint = needFingerprint(needle);
  return activeNeeds(needs).find((need) => need?.id !== excludeId && needFingerprint(need) === fingerprint) || null;
}

export function duplicateNeedGroups(needs = [], dependencies = []) {
  const grouped = new Map();
  for (const need of activeNeeds(needs)) {
    const fingerprint = needFingerprint(need);
    if (!grouped.has(fingerprint)) grouped.set(fingerprint, []);
    grouped.get(fingerprint).push(need);
  }

  const dependencyCounts = dependencyCountsByNeed(dependencies);
  const result = [];
  for (const [fingerprint, records] of grouped.entries()) {
    if (records.length < 2) continue;
    const sorted = [...records].sort((left, right) => {
      const leftCount = dependencyCounts.get(String(left?.id || ''))?.calculationCount || 0;
      const rightCount = dependencyCounts.get(String(right?.id || ''))?.calculationCount || 0;
      if (leftCount !== rightCount) return rightCount - leftCount;
      const byCreated = parsedTime(left?.created_at) - parsedTime(right?.created_at);
      if (byCreated !== 0) return byCreated;
      return String(left?.id || '').localeCompare(String(right?.id || ''));
    });
    const keeper = sorted[0];
    const decoratedRecords = sorted.map((record, index) => {
      const counts = dependencyCounts.get(String(record?.id || '')) || {
        calculationCount: 0,
        currentCalculationCount: 0,
        offerLinkCount: 0,
        orderLinkCount: 0
      };
      return Object.freeze({
        need: record,
        index,
        isKeeper: index === 0,
        ...counts
      });
    });
    result.push(Object.freeze({
      key: `need-duplicate-${String(keeper?.id || result.length + 1)}`,
      fingerprint,
      title: keeper?.title || keeper?.need_type || 'Потребность',
      keeperId: keeper?.id || null,
      rowCount: sorted.length,
      extraCount: sorted.length - 1,
      records: Object.freeze(decoratedRecords),
      duplicateIds: Object.freeze(sorted.slice(1).map((record) => record?.id).filter(Boolean)),
      linkedCalculationCount: decoratedRecords.reduce((sum, item) => sum + item.calculationCount, 0),
      linkedOfferCount: decoratedRecords.reduce((sum, item) => sum + item.offerLinkCount, 0),
      linkedOrderCount: decoratedRecords.reduce((sum, item) => sum + item.orderLinkCount, 0)
    }));
  }

  return result.sort((left, right) => right.extraCount - left.extraCount || left.title.localeCompare(right.title, 'ru-RU'));
}

export function needDuplicateSummary(needs = [], dependencies = []) {
  const groups = duplicateNeedGroups(needs, dependencies);
  return Object.freeze({
    groupCount: groups.length,
    affectedRecordCount: groups.reduce((sum, group) => sum + group.rowCount, 0),
    extraRecordCount: groups.reduce((sum, group) => sum + group.extraCount, 0),
    groups
  });
}

export function needDuplicateMeta(needId, needs = [], dependencies = []) {
  const id = String(needId ?? '').trim();
  if (!id) return null;
  for (const group of duplicateNeedGroups(needs, dependencies)) {
    const record = group.records.find((item) => String(item.need?.id || '') === id);
    if (!record) continue;
    return Object.freeze({
      groupKey: group.key,
      groupTitle: group.title,
      rowCount: group.rowCount,
      extraCount: group.extraCount,
      keeperId: group.keeperId,
      isKeeper: record.isKeeper,
      position: record.index + 1,
      calculationCount: record.calculationCount,
      offerLinkCount: record.offerLinkCount,
      orderLinkCount: record.orderLinkCount
    });
  }
  return null;
}

export function needArchiveDecision(need = {}, needs = [], dependencies = []) {
  const needId = String(need?.id ?? '').trim();
  if (!needId || need?.status === 'Архив') {
    return Object.freeze({ allowed: false, code: 'unavailable', message: 'Потребность уже в архиве или не найдена.' });
  }

  const group = duplicateNeedGroups(needs, dependencies).find((item) => item.records.some((record) => String(record.need?.id || '') === needId)) || null;
  const record = group?.records.find((item) => String(item.need?.id || '') === needId) || null;
  const ownDependencies = (Array.isArray(dependencies) ? dependencies : []).filter((dependency) => dependencyNeedId(dependency) === needId);
  const calculationCount = ownDependencies.length;
  const offerLinkCount = ownDependencies.filter((dependency) => dependency.commercial_offer_id).length;
  const orderLinkCount = ownDependencies.filter((dependency) => dependency.order_id).length;

  if (calculationCount > 0) {
    const details = [
      `${calculationCount} расчёт${calculationCount === 1 ? '' : 'а'}`,
      offerLinkCount ? `${offerLinkCount} КП` : '',
      orderLinkCount ? `${orderLinkCount} заказ${orderLinkCount === 1 ? '' : 'а'}` : ''
    ].filter(Boolean).join(', ');
    return Object.freeze({
      allowed: false,
      code: 'linked',
      calculationCount,
      offerLinkCount,
      orderLinkCount,
      message: `Архивирование заблокировано: с потребностью связано ${details}. Сначала проверьте расчёт, КП или заказ.`
    });
  }

  if (group && record?.isKeeper && group.extraCount > 0) {
    return Object.freeze({
      allowed: false,
      code: 'keeper',
      message: 'Это рекомендуемая основная запись группы. Сначала архивируйте более поздний дубль.'
    });
  }

  if (group) {
    return Object.freeze({
      allowed: true,
      code: 'duplicate',
      message: 'Вероятный дубль можно архивировать: связанных расчётов, КП и заказов не найдено.',
      confirmMessage: `Архивировать только выбранный дубль «${need.title || need.need_type || 'Потребность'}»? Основная запись останется активной.`
    });
  }

  return Object.freeze({
    allowed: true,
    code: 'regular',
    message: 'Связанных расчётов, КП и заказов не найдено.',
    confirmMessage: `Архивировать потребность «${need.title || need.need_type || 'Потребность'}»? Она исчезнет из активного списка.`
  });
}

export function needDraftFromRecord(need = {}) {
  return {
    needType: need.need_type || 'Другое',
    title: need.title || '',
    quantity: structuredValue(need, 'quantity') || '',
    deadline: need.deadline_text || '',
    description: need.description || '',
    width: structuredValue(need, 'width') || '',
    height: structuredValue(need, 'height') || '',
    printRun: structuredValue(need, 'print_run') || '',
    material: structuredValue(need, 'material') || '',
    needDesign: !!need.need_design,
    needInstallation: !!need.need_installation,
    designReason: need.design_reason || '',
    installAddress: structuredValue(need, 'installation_address') || '',
    installationReason: need.installation_reason || ''
  };
}

export function needFormPresentation(mode = 'create') {
  if (mode === 'edit') {
    return {
      kicker: 'Редактирование сохранённой потребности',
      title: 'Изменить потребность',
      submitLabel: 'Сохранить изменения',
      cancelLabel: 'Отменить изменения'
    };
  }
  if (mode === 'copy') {
    return {
      kicker: 'Новая позиция на основе сохранённой',
      title: 'Создать копию потребности',
      submitLabel: 'Сохранить копию',
      cancelLabel: 'Отменить копирование'
    };
  }
  return {
    kicker: 'Новая позиция заявки',
    title: 'Добавить потребность',
    submitLabel: 'Сохранить потребность',
    cancelLabel: 'Отменить добавление'
  };
}
