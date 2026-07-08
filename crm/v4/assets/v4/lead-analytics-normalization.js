const SERVICE_RULES = [
  ['Баннеры', ['баннер']],
  ['Наклейки', ['наклейк', 'афиш']],
  ['Таблички', ['табличк']],
  ['Вывески', ['вывеск']],
  ['ПВХ изделия', ['пвх']],
];

const SOURCE_RULES = [
  ['Сайт', ['сайт', 'site', 'lider-bsk.ru', 'форма сайта']],
  ['ВКонтакте', ['vk', 'вконтакте']],
  ['Одноклассники', ['одноклассники']],
  ['MAX', ['max']],
  ['Ручной ввод', ['вручную', 'звонок', 'офис', 'рекомендация']],
];

function clean(value) {
  return String(value || '').trim();
}

function lower(value) {
  return clean(value).toLowerCase();
}

function matchCategory(value, rules, emptyLabel = 'Не указано') {
  const text = lower(value);
  if (!text) return emptyLabel;
  const matched = rules.find(([, tokens]) => tokens.some((token) => text.includes(token)));
  return matched ? matched[0] : 'Другое';
}

export function normalizeLeadServiceCategory(service) {
  return matchCategory(service, SERVICE_RULES);
}

export function normalizeLeadSourceCategory(source, pageUrl = '') {
  const combined = `${clean(source)} ${clean(pageUrl)}`;
  return matchCategory(combined, SOURCE_RULES);
}

export function deriveLeadAnalytics(lead = {}) {
  return {
    serviceCategory: normalizeLeadServiceCategory(lead.service),
    sourceCategory: normalizeLeadSourceCategory(lead.source, lead.page_url),
  };
}

export function leadAnalyticsSearchText(lead = {}) {
  const analytics = deriveLeadAnalytics(lead);
  return [analytics.serviceCategory, analytics.sourceCategory].join(' ');
}
