export const COMPANY_LEGAL_SETTINGS_ENTRY_MODES = Object.freeze({
  DOCUMENT: 'document',
  STANDALONE: 'standalone'
});

const ENTRY_COPY = Object.freeze({
  document: Object.freeze({
    title: 'Проверка реквизитов организации',
    subtitle: 'Проверьте данные и примените их только к открытому несохранённому черновику.',
    note: 'Рабочие реквизиты сохраняются в этой вкладке и применяются к черновику. Общие настройки CRM не изменяются.',
    action: 'Применить к текущему черновику'
  }),
  standalone: Object.freeze({
    title: 'Реквизиты документов',
    subtitle: 'Подготовьте реквизиты для следующих актов и договоров в этой вкладке.',
    note: 'Рабочие реквизиты сохраняются в этой вкладке до завершения сессии. На другом устройстве и у других сотрудников они не появятся.',
    action: 'Использовать в этой вкладке'
  })
});

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function companyLegalSettingsEntryMode({ actOpen = false, contractOpen = false } = {}) {
  return actOpen || contractOpen
    ? COMPANY_LEGAL_SETTINGS_ENTRY_MODES.DOCUMENT
    : COMPANY_LEGAL_SETTINGS_ENTRY_MODES.STANDALONE;
}

export function companyLegalSettingsEntryCopy(mode) {
  return ENTRY_COPY[mode] || ENTRY_COPY.standalone;
}

export function companyLegalSettingsJson(settings = {}) {
  return JSON.stringify(asObject(settings), null, 2);
}
