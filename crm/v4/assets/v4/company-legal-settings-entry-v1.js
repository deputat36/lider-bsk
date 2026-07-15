export const COMPANY_LEGAL_SETTINGS_ENTRY_MODES = Object.freeze({
  DOCUMENT: 'document',
  STANDALONE: 'standalone'
});

const ENTRY_COPY = Object.freeze({
  document: Object.freeze({
    title: 'Проверка реквизитов организации',
    subtitle: 'Проверьте данные и примените их только к открытому несохранённому черновику.',
    note: 'Данные не записываются в leader_settings. Изменения применяются только к открытому черновику документа.',
    action: 'Применить к текущему черновику'
  }),
  standalone: Object.freeze({
    title: 'Реквизиты документов',
    subtitle: 'Проверьте состав и формат реквизитов до включения безопасного сохранения.',
    note: 'Сохранение в CRM отключено. Проверенные значения можно использовать как подготовленный JSON для будущей настройки.',
    action: 'Проверка завершена'
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
