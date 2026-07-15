function versionNumber(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : 1;
}

export function calculationVersionAudit(calculations = []) {
  const versions = (Array.isArray(calculations) ? calculations : []).map((calculation) => versionNumber(calculation?.version_number));
  const counts = new Map();
  versions.forEach((version) => counts.set(version, (counts.get(version) || 0) + 1));
  const duplicateVersions = [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([version]) => version)
    .sort((a, b) => a - b);
  const latestVersion = versions.length ? Math.max(...versions) : 0;
  return {
    calculationCount: versions.length,
    latestVersion,
    nextVersion: latestVersion + 1,
    duplicateVersions,
    hasDuplicates: duplicateVersions.length > 0
  };
}

export function calculationVersionState(calculation = {}, auditOrCalculations = []) {
  const audit = Array.isArray(auditOrCalculations)
    ? calculationVersionAudit(auditOrCalculations)
    : auditOrCalculations;
  const version = versionNumber(calculation.version_number);
  const linkedToOrder = Boolean(calculation.order_id);
  const linkedToOffer = Boolean(calculation.commercial_offer_id);
  const nonDraft = Boolean(calculation.status && calculation.status !== 'Черновик');
  const isDuplicate = Boolean(audit?.duplicateVersions?.includes(version));
  const isLatest = version === Number(audit?.latestVersion || 0);
  const protectedSource = linkedToOrder || linkedToOffer || nonDraft;

  let tone = 'neutral';
  let title = isLatest ? 'Последняя версия' : 'Предыдущая версия';
  let message = isLatest
    ? 'Это последняя сохранённая версия. Новые изменения должны создаваться отдельной версией.'
    : `Это не последняя версия. Следующая версия должна получить номер ${Number(audit?.nextVersion || version + 1)}.`;

  if (nonDraft) {
    tone = 'warn';
    title = 'Зафиксированная версия';
    message = 'Статус версии уже изменён с черновика. Исходную запись нельзя перезаписывать.';
  }
  if (linkedToOffer) {
    tone = 'warn';
    title = 'Версия используется в КП';
    message = 'Коммерческое предложение связано именно с этой версией. Изменения оформляются отдельной новой версией.';
  }
  if (linkedToOrder) {
    tone = 'locked';
    title = 'Версия используется в заказе';
    message = 'Заказ связан именно с этой версией. Исходный расчёт и его строки должны оставаться неизменными.';
  }
  if (isDuplicate) {
    tone = 'error';
    title = 'Повторяющийся номер версии';
    message = `Номер версии ${version} встречается несколько раз. Автоматическое перенумерование без отдельной проверки запрещено.`;
  }

  const badges = [];
  if (isLatest) badges.push('Последняя');
  if (isDuplicate) badges.push('Дубликат номера');
  if (linkedToOffer) badges.push('Связано с КП');
  if (linkedToOrder) badges.push('Связано с заказом');
  if (nonDraft && !linkedToOffer && !linkedToOrder) badges.push('Не черновик');

  return {
    version,
    latestVersion: Number(audit?.latestVersion || version),
    nextVersion: Number(audit?.nextVersion || version + 1),
    isLatest,
    isDuplicate,
    linkedToOffer,
    linkedToOrder,
    nonDraft,
    protectedSource,
    tone,
    title,
    message,
    badges
  };
}

export function calculationVersionIntegrityCopy(calculations = []) {
  const audit = calculationVersionAudit(calculations);
  if (!audit.calculationCount) {
    return {
      tone: 'neutral',
      title: 'Версий пока нет',
      message: 'Первый сохранённый расчёт получит номер 1.'
    };
  }
  if (audit.hasDuplicates) {
    return {
      tone: 'error',
      title: 'Найдены повторяющиеся номера версий',
      message: `Повторяются версии: ${audit.duplicateVersions.join(', ')}. Исходные записи не изменяются автоматически.`
    };
  }
  return {
    tone: 'neutral',
    title: `Следующая версия: ${audit.nextVersion}`,
    message: 'Новая версия должна создаваться отдельной записью, не меняя расчёты, связанные с КП или заказами.'
  };
}