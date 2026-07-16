import { isStagingCalculationEnvironment } from './calculation-version-staging-transport-v1.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(value) {
  return String(value ?? '').trim();
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function finiteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function calculationVersionPersistenceRoute(supabaseUrl = '') {
  if (isStagingCalculationEnvironment(supabaseUrl)) {
    return Object.freeze({
      mode: 'staging_edge',
      enabled: true,
      atomic: true,
      browserDirectWrite: false,
      reason: '',
      title: 'Тестовый staging',
      description: 'Новая версия будет сохранена атомарно через защищённый сервер. Исходный расчёт не изменится.',
      buttonPrefix: 'Сохранить тестовую версию'
    });
  }
  return Object.freeze({
    mode: 'production_locked',
    enabled: false,
    atomic: false,
    browserDirectWrite: false,
    reason: 'production_backend_not_deployed',
    title: 'Безопасное сохранение временно отключено',
    description: 'Создание новой версии будет доступно после отдельного production Edge/RPC rollout. Прямое сохранение из браузера отключено, чтобы не получить неполный или повторяющийся расчёт.',
    buttonPrefix: 'Сохранение недоступно'
  });
}

export function createCalculationVersionIdempotencyKey(sourceCalculationId, cryptoObject = globalThis.crypto) {
  const sourceId = text(sourceCalculationId);
  const randomId = cryptoObject?.randomUUID?.();
  if (!UUID_PATTERN.test(sourceId)) throw new Error('source_calculation_id_invalid');
  if (!UUID_PATTERN.test(text(randomId))) throw new Error('secure_request_id_unavailable');
  return `calculation-version:${sourceId}:${randomId}`;
}

export function buildCalculationVersionTransportDraft(draft = {}) {
  const source = asObject(draft);
  if (!source) throw new Error('draft_invalid');
  const idempotencyKey = text(source.idempotencyKey);
  if (!idempotencyKey || idempotencyKey.length > 160) throw new Error('idempotency_key_invalid');
  const items = Array.isArray(source.items) ? source.items : [];
  if (!items.length || items.length > 200) throw new Error('items_invalid');

  return Object.freeze({
    idempotency_key: idempotencyKey,
    title: text(source.title) || null,
    need_id: text(source.needId) || null,
    public_comment: text(source.publicComment) || null,
    internal_comment: text(source.internalComment) || null,
    items: Object.freeze(items.map((item, index) => {
      const row = asObject(item) || {};
      return Object.freeze({
        catalog_id: text(row.catalog_id) || null,
        category: text(row.category) || null,
        item_type: text(row.item_type) || null,
        name: text(row.name),
        unit: text(row.unit) || null,
        qty: finiteNumber(row.qty),
        contractor_price: finiteNumber(row.contractor_price),
        client_price: finiteNumber(row.client_price),
        comment: text(row.comment) || null,
        data: Object.freeze(asObject(row.data) ? { ...row.data } : {}),
        sort_order: Number.isInteger(Number(row.sort_order)) ? Number(row.sort_order) : index
      });
    }))
  });
}
