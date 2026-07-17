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
  ['Telegram', ['telegram', 'телеграм']],
  ['MAX', ['max']],
  ['QR-код', ['qr']],
  ['Поиск', ['yandex', 'яндекс', 'google', 'organic']],
  ['Email', ['email', 'e-mail', 'рассылка']],
  ['Ручной ввод', ['вручную', 'звонок', 'офис', 'рекомендация']],
];

function clean(value) {
  return String(value || '').trim();
}

function lower(value) {
  return clean(value).toLowerCase();
}

function matchedCategory(value, rules) {
  const text = lower(value);
  if (!text) return '';
  const matched = rules.find(([, tokens]) => tokens.some((token) => text.includes(token)));
  return matched ? matched[0] : '';
}

function matchCategory(value, rules, emptyLabel = 'Не указано') {
  const text = lower(value);
  if (!text) return emptyLabel;
  return matchedCategory(text, rules) || 'Другое';
}

export function normalizeLeadServiceCategory(service) {
  return matchCategory(service, SERVICE_RULES);
}

export function normalizeLeadSourceCategory(source, pageUrl = '', utmSource = '', referer = '') {
  const explicitCampaignSource = clean(utmSource);
  if (explicitCampaignSource) return matchCategory(explicitCampaignSource, SOURCE_RULES);
  const explicitSourceCategory = matchedCategory(source, SOURCE_RULES);
  if (explicitSourceCategory) return explicitSourceCategory;
  const combined = `${clean(source)} ${clean(pageUrl)} ${clean(referer)}`;
  return matchCategory(combined, SOURCE_RULES);
}

function cleanPath(pathname) {
  const value = clean(pathname).split('#')[0].split('?')[0];
  if (!value) return '/';
  return value.startsWith('/') ? value : `/${value}`;
}

export function normalizeLeadLandingPage(lead = {}) {
  const sourcePath = clean(lead.source_page_path);
  if (sourcePath) return cleanPath(sourcePath);

  const pageUrl = clean(lead.page_url);
  if (!pageUrl) return 'Не указана';
  if (lower(pageUrl).includes('crm v4') || lower(pageUrl).includes('ручное создание')) return 'Ручное создание в CRM';

  try {
    const parsed = new URL(pageUrl, 'https://www.lider-bsk.ru');
    const host = lower(parsed.hostname).replace(/^www\./, '');
    if (host === 'lider-bsk.ru') return cleanPath(parsed.pathname);
    if (host === 'vk.com' || host.endsWith('.vk.com')) return 'ВКонтакте / внешняя ссылка';
    if (host === 'ok.ru' || host.endsWith('.ok.ru')) return 'Одноклассники / внешняя ссылка';
    if (host === 't.me' || host.endsWith('.t.me')) return 'Telegram / внешняя ссылка';
    return 'Внешний источник';
  } catch (_) {
    if (pageUrl.startsWith('/')) return cleanPath(pageUrl);
    return 'Внешний источник';
  }
}

export function deriveLeadAnalytics(lead = {}) {
  return {
    serviceCategory: normalizeLeadServiceCategory(lead.service),
    sourceCategory: normalizeLeadSourceCategory(lead.source, lead.page_url, lead.utm_source, lead.referer),
  };
}

export function leadAnalyticsSearchText(lead = {}) {
  const analytics = deriveLeadAnalytics(lead);
  const landingPage = normalizeLeadLandingPage(lead);
  return [analytics.serviceCategory, analytics.sourceCategory, landingPage === 'Не указана' ? '' : landingPage].filter(Boolean).join(' ');
}
