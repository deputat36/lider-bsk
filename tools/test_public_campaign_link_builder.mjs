import assert from 'node:assert/strict';
import {
  CAMPAIGN_CHANNELS,
  CAMPAIGN_TARGETS,
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

console.log('Public campaign link builder is deterministic: fixed site targets, channel presets, transliteration and safe fallbacks are valid.');
