import assert from 'node:assert/strict';
import {
  CAMPAIGN_CHANNELS,
  CAMPAIGN_TARGETS,
  buildCampaignPost,
  buildCampaignUrl,
  currentCampaignTag,
  normalizeUtmToken,
} from '../assets/public-campaign-link-model.js';

assert.equal(CAMPAIGN_TARGETS.length, 10);
assert.equal(CAMPAIGN_CHANNELS.length, 9);
assert.equal(normalizeUtmToken('Баннеры — июль 2026'), 'bannery_iyul_2026');
assert.equal(normalizeUtmToken('  Пост № 1  '), 'post_1');
assert.equal(normalizeUtmToken('', 'group_post'), 'group_post');
assert.equal(currentCampaignTag(new Date(2026, 6, 17)), 'free_2026_07');

const vkBanner = new URL(buildCampaignUrl({
  targetId: 'banners',
  channelId: 'vk_group',
  campaign: 'Баннеры июль',
  content: 'Пост 1',
}));
assert.equal(vkBanner.origin, 'https://www.lider-bsk.ru');
assert.equal(vkBanner.pathname, '/bannery-borisoglebsk.html');
assert.deepEqual(Object.fromEntries(vkBanner.searchParams), {
  utm_source: 'vk',
  utm_medium: 'social',
  utm_campaign: 'bannery_iyul',
  utm_content: 'post_1',
});

const qrRequest = new URL(buildCampaignUrl({
  targetId: 'request',
  channelId: 'qr',
  campaign: '',
  content: '',
}));
assert.equal(qrRequest.pathname, '/request.html');
assert.equal(qrRequest.searchParams.get('utm_source'), 'print');
assert.equal(qrRequest.searchParams.get('utm_medium'), 'qr');
assert.equal(qrRequest.searchParams.get('utm_campaign'), 'free');
assert.equal(qrRequest.searchParams.get('utm_content'), 'qr_code');

const safeFallback = new URL(buildCampaignUrl({ targetId: 'unknown', channelId: 'unknown' }));
assert.equal(safeFallback.pathname, '/');
assert.equal(safeFallback.searchParams.get('utm_source'), 'vk');
assert.equal(safeFallback.searchParams.get('utm_medium'), 'social');

const publicPost = buildCampaignPost({
  targetId: 'banners', channelId: 'vk_group', campaign: 'Баннеры июль', content: 'Пост 1',
});
assert.match(publicPost, /^Баннеры в Борисоглебске/);
assert.match(publicPost, /Для расчёта достаточно сообщить размер/);
assert.match(publicPost, /utm_source=vk/);
assert.match(publicPost, /utm_campaign=bannery_iyul/);
assert.doesNotMatch(publicPost, /undefined|null/);

const directMessage = buildCampaignPost({ targetId: 'signs', channelId: 'max' });
assert.match(directMessage, /^Здравствуйте!/);
assert.match(directMessage, /utm_source=max/);
assert.match(directMessage, /utm_medium=messenger/);

const qrText = buildCampaignPost({ targetId: 'stickers', channelId: 'qr' });
assert.match(qrText, /Сканируйте QR-код/);
assert.match(qrText, /utm_medium=qr/);
assert.doesNotMatch(qrText, /цена|гарант|за \d/iu);

CAMPAIGN_TARGETS.forEach((target) => {
  CAMPAIGN_CHANNELS.forEach((channel) => {
    const post = buildCampaignPost({ targetId: target.id, channelId: channel.id });
    assert.ok(post.length >= 140 && post.length <= 900, `${target.id}/${channel.id} has an unexpected length`);
    assert.match(post, /^.+\n\n/u);
    assert.match(post, /https:\/\/www\.lider-bsk\.ru\//);
    assert.doesNotMatch(post, /undefined|null/);
  });
});

console.log('Public campaign builder is deterministic: tracked links and channel-specific post copy are safe for every preset combination.');
