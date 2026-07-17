const SITE_ORIGIN = 'https://www.lider-bsk.ru';

export const CAMPAIGN_TARGETS = Object.freeze([
  Object.freeze({ id: 'home', label: 'Главная — все услуги', path: '/' }),
  Object.freeze({ id: 'request', label: 'Короткая заявка', path: '/request.html' }),
  Object.freeze({ id: 'banners', label: 'Баннеры', path: '/bannery-borisoglebsk.html' }),
  Object.freeze({ id: 'signs', label: 'Вывески', path: '/vyveski-borisoglebsk.html' }),
  Object.freeze({ id: 'stickers', label: 'Наклейки и плоттерная резка', path: '/nakleyki-plotternaya-rezka-borisoglebsk.html' }),
  Object.freeze({ id: 'film', label: 'Печать на плёнке', path: '/pechat-na-plenke-borisoglebsk.html' }),
  Object.freeze({ id: 'design', label: 'Дизайн макетов', path: '/dizayn-maketov.html' }),
  Object.freeze({ id: 'maps', label: 'Яндекс Карты и 2ГИС', path: '/yandex-karty-2gis.html' }),
  Object.freeze({ id: 'store', label: 'Реклама для магазина', path: '/reklama-dlya-magazina-borisoglebsk.html' }),
  Object.freeze({ id: 'communities', label: 'Реклама в сообществах', path: '/reklama-v-soobshchestvah-borisoglebska.html' }),
]);

export const CAMPAIGN_CHANNELS = Object.freeze([
  Object.freeze({ id: 'vk_group', label: 'ВК — пост в группе', source: 'vk', medium: 'social', content: 'group_post' }),
  Object.freeze({ id: 'vk_message', label: 'ВК — личное сообщение', source: 'vk', medium: 'message', content: 'personal_message' }),
  Object.freeze({ id: 'ok_group', label: 'Одноклассники', source: 'ok', medium: 'social', content: 'group_post' }),
  Object.freeze({ id: 'telegram', label: 'Telegram', source: 'telegram', medium: 'channel', content: 'channel_post' }),
  Object.freeze({ id: 'max', label: 'MAX / мессенджер', source: 'max', medium: 'messenger', content: 'client_chat' }),
  Object.freeze({ id: 'qr', label: 'QR-код на печатных материалах', source: 'print', medium: 'qr', content: 'qr_code' }),
  Object.freeze({ id: 'classified', label: 'Объявление / Авито', source: 'classified', medium: 'listing', content: 'description_link' }),
  Object.freeze({ id: 'yandex_maps', label: 'Яндекс Карты', source: 'yandex_maps', medium: 'profile', content: 'profile_link' }),
  Object.freeze({ id: 'two_gis', label: '2ГИС', source: 'two_gis', medium: 'profile', content: 'profile_link' }),
]);

const CYRILLIC = Object.freeze({
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f',
  х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
});

function presetById(collection, id, fallbackIndex = 0) {
  return collection.find((item) => item.id === String(id || '').trim()) || collection[fallbackIndex];
}

export function normalizeUtmToken(value, fallback = '') {
  const transliterated = String(value || '')
    .trim()
    .toLocaleLowerCase('ru-RU')
    .split('')
    .map((char) => CYRILLIC[char] ?? char)
    .join('');
  const normalized = transliterated
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_')
    .slice(0, 80);
  if (normalized) return normalized;
  if (fallback && fallback !== value) return normalizeUtmToken(fallback);
  return 'organic';
}

export function currentCampaignTag(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `free_${year}_${month}`;
}

export function buildCampaignUrl({ targetId, channelId, campaign, content } = {}) {
  const target = presetById(CAMPAIGN_TARGETS, targetId);
  const channel = presetById(CAMPAIGN_CHANNELS, channelId);
  const url = new URL(target.path, SITE_ORIGIN);
  url.searchParams.set('utm_source', channel.source);
  url.searchParams.set('utm_medium', channel.medium);
  url.searchParams.set('utm_campaign', normalizeUtmToken(campaign, 'free'));
  url.searchParams.set('utm_content', normalizeUtmToken(content, channel.content));
  return url.toString();
}
