function normalizedText(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru-RU');
}

function structuredValue(need, key) {
  return need?.structured_data && typeof need.structured_data === 'object'
    ? need.structured_data[key]
    : '';
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
