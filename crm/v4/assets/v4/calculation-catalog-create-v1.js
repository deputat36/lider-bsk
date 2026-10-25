import { normalizeCatalogRow } from './calculation-catalog-source-v1.js';
import { catalogManagementIdempotencyKey, catalogManagementWriteAvailability, invokeStagingCatalogManagement } from './catalog-management-staging-transport-v1.js';

export const CALCULATION_CATALOG_CREATE_V1 = 'calculation-catalog-create-v1-20261022';
const text = (value, fallback = '') => String(value ?? '').trim() || fallback;
function number(value, fallback = 0) {
  const raw = String(value ?? '').trim().replace(',', '.').replace(/\s+/g, '');
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) throw Error('catalog_number_invalid');
  return parsed;
}
export function normalizeCatalogCreateInput(input = {}) {
  const defaultClientPrice = number(input.default_client_price);
  return {
    category: text(input.category), name: text(input.name), unit: text(input.unit, 'шт'),
    contractor_price: number(input.contractor_price), description: text(input.description) || null,
    item_type: text(input.item_type, 'Изготовление'), markup_percent: number(input.markup_percent, 30),
    min_client_price: number(input.min_client_price), default_client_price: defaultClientPrice > 0 ? defaultClientPrice : null,
    calculation_mode: text(input.calculation_mode) || (defaultClientPrice > 0 ? 'fixed' : 'markup'),
    settings: {}, sort_order: number(input.sort_order), is_active: true
  };
}
export function catalogCreateValidation(input = {}) {
  let payload;
  try { payload = normalizeCatalogCreateInput(input); } catch (_) { return { ok: false, code: 'catalog_number_invalid' }; }
  for (const [key, limit] of [['name',500],['category',300],['unit',80],['item_type',200],['description',4000]]) {
    if (!payload[key] && ['name','category','unit'].includes(key)) return { ok: false, code: 'catalog_'+key+'_required', payload };
    if (String(payload[key] || '').length > limit) return { ok: false, code: 'catalog_text_too_long', payload };
  }
  if (payload.contractor_price > 1e9 || payload.min_client_price > 1e9 || payload.default_client_price > 1e9 || payload.markup_percent > 100000 || payload.sort_order > 1e6 || !Number.isInteger(payload.sort_order)) return { ok: false, code: 'catalog_number_invalid', payload };
  if (!['markup','fixed','area','length','quantity'].includes(payload.calculation_mode)) return { ok: false, code: 'catalog_mode_invalid', payload };
  return { ok: true, code: null, payload };
}
export function createCalculationCatalogAttempt({ input, actorId, cryptoObject = globalThis.crypto } = {}) {
  const validation = catalogCreateValidation(input);
  if (!validation.ok) throw Error(validation.code);
  if (!actorId) throw Error('catalog_actor_required');
  return Object.freeze({ actorId, input: Object.freeze({ ...input }), patch: Object.freeze({ ...validation.payload, settings: Object.freeze({}) }), idempotencyKey: catalogManagementIdempotencyKey('create', '', cryptoObject), requestId: cryptoObject.randomUUID(), reason: 'Добавлено из расчёта' });
}
export async function createCalculationCatalogItem({ supabaseClient, supabaseUrl = '', input, allowWrite = false, actorId, attempt } = {}) {
  const availability = catalogManagementWriteAvailability({ supabaseUrl, canManage: allowWrite, client: supabaseClient, actorId });
  if (!availability.enabled) return { ok: false, row: null, error: { code: 'catalog_write_not_allowed', message: 'Добавление позиции в рабочий прайс ещё не включено.' } };
  let snapshot = attempt;
  try { snapshot ||= createCalculationCatalogAttempt({ input, actorId }); }
  catch (_) { return { ok: false, row: null, error: { code: 'catalog_validation_error', message: 'Проверьте название, категорию, единицу и числовые поля.' } }; }
  if (!actorId || snapshot.actorId !== actorId) return { ok: false, row: null, error: { code: 'catalog_actor_changed', message: 'Пользователь изменился. Откройте форму заново.' } };
  const result = await invokeStagingCatalogManagement({ client: supabaseClient, supabaseUrl, canManage: allowWrite, operation: 'create', actorId, requestId: snapshot.requestId, idempotencyKey: snapshot.idempotencyKey, patch: snapshot.patch, reason: snapshot.reason });
  if (!result.ok) return { ok: false, row: null, attempt: snapshot, uncertain: result.kind === 'persistence_failed', error: { code: result.code || result.kind, message: result.message } };
  if (!result.catalog?.id) return { ok: false, row: null, attempt: snapshot, uncertain: true, error: { code: 'catalog_confirmation_incomplete', message: 'Сервер не вернул подтверждённую позицию. Повторите тот же запрос.' } };
  return { ok: true, row: normalizeCatalogRow(result.catalog), replay: result.replay, error: null };
}
