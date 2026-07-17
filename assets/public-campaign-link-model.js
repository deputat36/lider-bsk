const SITE_ORIGIN = 'https://www.lider-bsk.ru';

export const CAMPAIGN_TARGETS = Object.freeze([
  Object.freeze({
    id: 'home', label: 'Главная — все услуги', path: '/',
    postTitle: 'Реклама для бизнеса в Борисоглебске',
    postBody: 'Баннеры, вывески, наклейки, оформление витрин, дизайн и реклама в городских сообществах — подберём решение под конкретную задачу.',
    postHint: 'Опишите, что нужно изготовить или оформить, и приложите размеры или фото, если они есть.',
  }),
  Object.freeze({
    id: 'request', label: 'Короткая заявка', path: '/request.html',
    postTitle: 'Нужно рассчитать рекламу?',
    postBody: 'Оставьте короткую заявку в РА «Лидер». Можно начать с простого описания — точные материалы и формат уточним после обращения.',
    postHint: 'Укажите задачу, примерный размер или место размещения и удобный способ связи.',
  }),
  Object.freeze({
    id: 'banners', label: 'Баннеры', path: '/bannery-borisoglebsk.html',
    postTitle: 'Баннеры в Борисоглебске',
    postBody: 'Изготовим баннер для фасада, магазина, мероприятия, акции или временной рекламы. Поможем определить подходящий формат и подготовить макет.',
    postHint: 'Для расчёта достаточно сообщить размер, место размещения и нужен ли дизайн.',
  }),
  Object.freeze({
    id: 'signs', label: 'Вывески', path: '/vyveski-borisoglebsk.html',
    postTitle: 'Вывески для бизнеса в Борисоглебске',
    postBody: 'Подготовим вывеску для магазина, офиса, кафе, сервиса или пункта выдачи: от понятного макета до изготовления.',
    postHint: 'Для расчёта пришлите размеры, текст и фото места, где будет размещена вывеска.',
  }),
  Object.freeze({
    id: 'stickers', label: 'Наклейки и плоттерная резка', path: '/nakleyki-plotternaya-rezka-borisoglebsk.html',
    postTitle: 'Наклейки и надписи без фона',
    postBody: 'Изготовим наклейки для витрин, дверей, автомобилей, стен и упаковки. Возможны печать, плоттерная резка и подготовка макета.',
    postHint: 'Для расчёта укажите размер, количество, поверхность и приложите логотип или пример.',
  }),
  Object.freeze({
    id: 'film', label: 'Печать на плёнке', path: '/pechat-na-plenke-borisoglebsk.html',
    postTitle: 'Печать на самоклеящейся плёнке',
    postBody: 'Печатаем изображения и надписи для витрин, окон, стен, табличек и других рекламных задач. При необходимости подготовим макет.',
    postHint: 'Для расчёта укажите размеры, назначение и где будет использоваться плёнка — на улице или в помещении.',
  }),
  Object.freeze({
    id: 'design', label: 'Дизайн макетов', path: '/dizayn-maketov.html',
    postTitle: 'Дизайн рекламных макетов',
    postBody: 'Подготовим макет для баннера, вывески, наклейки, листовки, поста, презентации или коммерческого предложения.',
    postHint: 'Опишите задачу и приложите текст, логотип, фото и примеры, которые вам нравятся.',
  }),
  Object.freeze({
    id: 'maps', label: 'Яндекс Карты и 2ГИС', path: '/yandex-karty-2gis.html',
    postTitle: 'Оформление карточки бизнеса в Яндекс Картах и 2ГИС',
    postBody: 'Поможем привести в порядок описание, услуги, фотографии, контакты и другую информацию, которую видят потенциальные клиенты.',
    postHint: 'Для начала пришлите название организации, город и ссылку на существующую карточку, если она уже создана.',
  }),
  Object.freeze({
    id: 'store', label: 'Реклама для магазина', path: '/reklama-dlya-magazina-borisoglebsk.html',
    postTitle: 'Реклама и оформление магазина',
    postBody: 'Вывеска, баннер, оформление витрины, режим работы, наклейки, карточки на картах и публикации — можно собрать подходящий комплект под одну задачу.',
    postHint: 'Пришлите фото входа или витрины и напишите, что нужно сообщить клиентам.',
  }),
  Object.freeze({
    id: 'communities', label: 'Реклама в сообществах', path: '/reklama-v-soobshchestvah-borisoglebska.html',
    postTitle: 'Реклама в сообществах Борисоглебска',
    postBody: 'Подготовим текст и изображение, поможем выбрать формат публикации для акции, услуги, открытия, мероприятия или объявления.',
    postHint: 'Опишите предложение, аудиторию, сроки и приложите фотографии или готовые материалы.',
  }),
]);

export const CAMPAIGN_CHANNELS = Object.freeze([
  Object.freeze({ id: 'vk_group', label: 'ВК — пост в группе', source: 'vk', medium: 'social', content: 'group_post', format: 'post' }),
  Object.freeze({ id: 'vk_message', label: 'ВК — личное сообщение', source: 'vk', medium: 'message', content: 'personal_message', format: 'message' }),
  Object.freeze({ id: 'ok_group', label: 'Одноклассники', source: 'ok', medium: 'social', content: 'group_post', format: 'post' }),
  Object.freeze({ id: 'telegram', label: 'Telegram', source: 'telegram', medium: 'channel', content: 'channel_post', format: 'post' }),
  Object.freeze({ id: 'max', label: 'MAX / мессенджер', source: 'max', medium: 'messenger', content: 'client_chat', format: 'message' }),
  Object.freeze({ id: 'qr', label: 'QR-код на печатных материалах', source: 'print', medium: 'qr', content: 'qr_code', format: 'qr' }),
  Object.freeze({ id: 'classified', label: 'Объявление / Авито', source: 'classified', medium: 'listing', content: 'description_link', format: 'listing' }),
  Object.freeze({ id: 'yandex_maps', label: 'Яндекс Карты', source: 'yandex_maps', medium: 'profile', content: 'profile_link', format: 'profile' }),
  Object.freeze({ id: 'two_gis', label: '2ГИС', source: 'two_gis', medium: 'profile', content: 'profile_link', format: 'profile' }),
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

export function buildCampaignPost({ targetId, channelId, campaign, content } = {}) {
  const target = presetById(CAMPAIGN_TARGETS, targetId);
  const channel = presetById(CAMPAIGN_CHANNELS, channelId);
  const url = buildCampaignUrl({ targetId: target.id, channelId: channel.id, campaign, content });

  if (channel.format === 'message') {
    return `Здравствуйте!\n\n${target.postTitle}\n\n${target.postBody}\n\n${target.postHint}\n\nПосмотреть варианты и оставить заявку:\n${url}`;
  }
  if (channel.format === 'qr') {
    return `${target.postTitle}\n\nСканируйте QR-код, чтобы посмотреть варианты и оставить заявку.\n\nЕсли камера не распознаёт код, откройте ссылку:\n${url}`;
  }
  if (channel.format === 'listing') {
    return `${target.postTitle}\n\n${target.postBody}\n\n${target.postHint}\n\nПодробности и заявка:\n${url}`;
  }
  if (channel.format === 'profile') {
    return `${target.postTitle}\n\n${target.postBody}\n\nПодробнее и заявка:\n${url}`;
  }
  return `${target.postTitle}\n\n${target.postBody}\n\n${target.postHint}\n\nПосмотреть варианты и оставить заявку:\n${url}`;
}
