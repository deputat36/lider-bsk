const STAGING_PROJECT_REF = 'otulfnouybahfnsycxqn';
const FUNCTION_SLUG = 'leader-crm-calculations';
const ACTION = 'calculation.create_version';
const PERMISSION = 'calculations.write';
const MAX_ITEMS = 200;

function text(value) {
  return String(value ?? '').trim();
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function uuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value));
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function safeData(value) {
  return asObject(value) ? { ...value } : {};
}

export function projectRefFromCalculationSupabaseUrl(value) {
  try {
    return new URL(value).hostname.split('.')[0] || '';
  } catch (_) {
    return '';
  }
}

export function isStagingCalculationEnvironment(supabaseUrl) {
  return projectRefFromCalculationSupabaseUrl(supabaseUrl) === STAGING_PROJECT_REF;
}

export function calculationStagingTransportAvailability({
  supabaseUrl = '',
  canWrite = false,
  sourceCalculation = null,
  draft = null,
  expectedUpdatedAt = null
} = {}) {
  const staging = isStagingCalculationEnvironment(supabaseUrl);
  const source = asObject(sourceCalculation);
  const draftObject = asObject(draft);
  const items = Array.isArray(draftObject?.items) ? draftObject.items : [];
  const hasTimestamp = Boolean(text(expectedUpdatedAt) && Number.isFinite(Date.parse(expectedUpdatedAt)));
  let reason = '';
  if (!staging) reason = 'production_locked';
  else if (!canWrite) reason = 'forbidden';
  else if (!source || !uuid(source.id)) reason = 'source_missing';
  else if (!draftObject) reason = 'draft_missing';
  else if (!items.length || items.length > MAX_ITEMS) reason = 'items_invalid';
  else if (!hasTimestamp) reason = 'expected_updated_at_missing';

  return Object.freeze({
    enabled: staging && canWrite === true && Boolean(source && uuid(source.id)) && Boolean(draftObject) && items.length > 0 && items.length <= MAX_ITEMS && hasTimestamp,
    staging,
    reason,
    projectRef: projectRefFromCalculationSupabaseUrl(supabaseUrl),
    functionSlug: FUNCTION_SLUG,
    permission: PERMISSION
  });
}

function normalizeItem(value, index) {
  const item = asObject(value);
  if (!item) throw new Error(`item_${index + 1}_invalid`);

  const name = text(item.name).slice(0, 500);
  const qty = finiteNumber(item.qty);
  const contractorPrice = finiteNumber(item.contractor_price);
  const clientPrice = finiteNumber(item.client_price);
  const sortOrder = finiteNumber(item.sort_order ?? index);
  const catalogId = text(item.catalog_id);

  if (!name) throw new Error(`item_${index + 1}_name_required`);
  if (catalogId && !uuid(catalogId)) throw new Error(`item_${index + 1}_catalog_id_invalid`);
  if (qty === null || qty <= 0 || qty > 1_000_000) throw new Error(`item_${index + 1}_qty_invalid`);
  if (contractorPrice === null || contractorPrice < 0 || contractorPrice > 1_000_000_000) throw new Error(`item_${index + 1}_contractor_price_invalid`);
  if (clientPrice === null || clientPrice < 0 || clientPrice > 1_000_000_000) throw new Error(`item_${index + 1}_client_price_invalid`);
  if (sortOrder === null || !Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 1_000_000) throw new Error(`item_${index + 1}_sort_order_invalid`);
  if (item.data !== undefined && !asObject(item.data)) throw new Error(`item_${index + 1}_data_invalid`);

  return Object.freeze({
    catalog_id: catalogId || null,
    category: text(item.category).slice(0, 300) || null,
    item_type: text(item.item_type).slice(0, 200) || null,
    name,
    unit: text(item.unit).slice(0, 80) || null,
    qty,
    contractor_price: contractorPrice,
    client_price: clientPrice,
    comment: text(item.comment).slice(0, 2000) || null,
    data: Object.freeze(safeData(item.data)),
    sort_order: sortOrder
  });
}

export function buildStagingCalculationVersionCommand({
  sourceCalculation,
  draft,
  expectedUpdatedAt,
  requestId
} = {}) {
  const source = asObject(sourceCalculation);
  const draftObject = asObject(draft);
  if (!source || !uuid(source.id)) throw new Error('source_calculation_id_invalid');
  if (!uuid(requestId)) throw new Error('request_id_invalid');
  if (!text(expectedUpdatedAt) || !Number.isFinite(Date.parse(expectedUpdatedAt))) throw new Error('expected_updated_at_invalid');
  if (!draftObject) throw new Error('draft_invalid');

  const key = text(draftObject.idempotency_key);
  if (!key || key.length > 160) throw new Error('idempotency_key_invalid');
  if (text(draftObject.need_id) && !uuid(draftObject.need_id)) throw new Error('need_id_invalid');
  if (!Array.isArray(draftObject.items) || !draftObject.items.length || draftObject.items.length > MAX_ITEMS) throw new Error('items_invalid');

  const items = draftObject.items.map((item, index) => normalizeItem(item, index));

  return Object.freeze({
    action: ACTION,
    request_id: text(requestId),
    expected_updated_at: new Date(expectedUpdatedAt).toISOString(),
    payload: Object.freeze({
      source_calculation_id: text(source.id),
      idempotency_key: key,
      title: text(draftObject.title).slice(0, 500) || null,
      need_id: text(draftObject.need_id) || null,
      public_comment: text(draftObject.public_comment).slice(0, 4000) || null,
      internal_comment: text(draftObject.internal_comment).slice(0, 8000) || null,
      items: Object.freeze(items)
    })
  });
}

function secureRequestId(cryptoObject = globalThis.crypto) {
  const value = cryptoObject?.randomUUID?.();
  if (!uuid(value)) throw new Error('secure_request_id_unavailable');
  return value;
}

function classifyError(code) {
  const key = text(code).toLowerCase() || 'calculation_version_create_failed';
  if (key === 'wrong_environment') return 'wrong_environment';
  if (key === 'missing_or_invalid_jwt' || key === 'auth_required') return 'auth_required';
  if (key === 'inactive_profile' || key === 'forbidden') return 'forbidden';
  if (key === 'source_changed') return 'stale_source';
  if (key === 'source_calculation_not_found') return 'not_found';
  if (key === 'idempotency_conflict') return 'idempotency_conflict';
  if (key === 'duplicate_version_inventory') return 'duplicate_inventory';
  if (key === 'version_conflict') return 'version_conflict';
  if (['invalid_payload', 'unknown_action', 'empty_items', 'invalid_item', 'invalid_totals'].includes(key)) return 'validation_error';
  if (key === 'network_error') return 'network_error';
  return 'persistence_failed';
}

export function stagingCalculationResultMessage(kind, replay = false) {
  if (replay) return 'Безопасный повтор: существующая версия расчёта возвращена без дубликата.';
  return ({
    created: 'Тестовая версия расчёта создана только в staging.',
    wrong_environment: 'Тестовое создание версии разрешено только в staging.',
    auth_required: 'Нужен вход отдельного тестового пользователя staging.',
    forbidden: 'У staging-профиля нет права calculations.write или профиль неактивен.',
    validation_error: 'Команда не прошла проверку. Проверьте источник, строки и цены.',
    stale_source: 'Исходный расчёт изменился. Перечитайте его перед созданием новой версии.',
    not_found: 'Исходный расчёт не найден в staging.',
    idempotency_conflict: 'Этот ключ повтора уже использован с другим содержимым.',
    duplicate_inventory: 'У заявки есть повторяющиеся номера версий. Автоматическое создание заблокировано.',
    version_conflict: 'Номер новой версии занят параллельной операцией. Обновите список и повторите.',
    network_error: 'Не удалось связаться со staging Edge Function.',
    persistence_failed: 'Staging не смог атомарно сохранить новую версию расчёта.'
  })[kind] || 'Staging вернул неизвестный результат.';
}

async function edgeErrorDetails(error) {
  const context = error?.context;
  let body = null;
  if (context && typeof context.clone === 'function' && typeof context.json === 'function') {
    try { body = await context.clone().json(); } catch (_) { body = null; }
  } else if (asObject(error?.data)) {
    body = error.data;
  }
  const bodyObject = asObject(body);
  const nested = asObject(bodyObject?.error);
  return {
    status: Number(context?.status || error?.status || 0) || 0,
    code: text(nested?.code || bodyObject?.error || error?.code || 'calculation_version_create_failed'),
    message: text(nested?.message || bodyObject?.message || error?.message)
  };
}

export async function invokeStagingCalculationVersion({
  client,
  supabaseUrl = '',
  canWrite = false,
  sourceCalculation = null,
  draft = null,
  expectedUpdatedAt = null,
  cryptoObject = globalThis.crypto,
  readAfterSuccess = null
} = {}) {
  const availability = calculationStagingTransportAvailability({ supabaseUrl, canWrite, sourceCalculation, draft, expectedUpdatedAt });
  if (!availability.enabled) {
    const kind = availability.reason === 'production_locked' ? 'wrong_environment'
      : availability.reason === 'forbidden' ? 'forbidden'
        : 'validation_error';
    return Object.freeze({ ok: false, status: kind === 'forbidden' ? 403 : kind === 'wrong_environment' ? 503 : 400, kind, code: kind, message: stagingCalculationResultMessage(kind) });
  }
  if (!client?.auth?.getSession || !client?.functions?.invoke) {
    return Object.freeze({ ok: false, status: 500, kind: 'persistence_failed', code: 'client_unavailable', message: stagingCalculationResultMessage('persistence_failed') });
  }

  let sessionResult;
  try { sessionResult = await client.auth.getSession(); }
  catch (_) {
    return Object.freeze({ ok: false, status: 0, kind: 'network_error', code: 'network_error', message: stagingCalculationResultMessage('network_error') });
  }
  if (sessionResult?.error || !sessionResult?.data?.session?.access_token) {
    return Object.freeze({ ok: false, status: 401, kind: 'auth_required', code: 'auth_required', message: stagingCalculationResultMessage('auth_required') });
  }

  let command;
  try {
    command = buildStagingCalculationVersionCommand({ sourceCalculation, draft, expectedUpdatedAt, requestId: secureRequestId(cryptoObject) });
  } catch (error) {
    return Object.freeze({ ok: false, status: 400, kind: 'validation_error', code: text(error?.message) || 'validation_error', message: stagingCalculationResultMessage('validation_error') });
  }

  let invoked;
  try {
    invoked = await client.functions.invoke(FUNCTION_SLUG, { body: command });
  } catch (_) {
    return Object.freeze({ ok: false, status: 0, kind: 'network_error', code: 'network_error', message: stagingCalculationResultMessage('network_error'), command });
  }

  if (invoked?.error || invoked?.data?.ok !== true) {
    const details = invoked?.error
      ? await edgeErrorDetails(invoked.error)
      : {
          status: 0,
          code: text(invoked.data?.error?.code || invoked.data?.error),
          message: text(invoked.data?.error?.message || invoked.data?.message)
        };
    const kind = classifyError(details.code);
    return Object.freeze({
      ok: false,
      status: details.status,
      kind,
      code: details.code || kind,
      message: stagingCalculationResultMessage(kind),
      requestId: command.request_id,
      command
    });
  }

  const data = asObject(invoked.data) || {};
  const calculation = asObject(data.calculation);
  const replay = data.idempotent_replay === true;
  let refreshed = null;
  let refreshFailed = false;
  if (typeof readAfterSuccess === 'function') {
    try { refreshed = await readAfterSuccess(data); }
    catch (_) { refreshFailed = true; }
  }

  return Object.freeze({
    ok: true,
    status: replay ? 200 : 201,
    kind: replay ? 'replay' : 'created',
    code: replay ? 'idempotent_replay' : 'created',
    replay,
    message: stagingCalculationResultMessage('created', replay),
    requestId: text(data.request_id || command.request_id),
    calculationId: text(calculation?.id),
    calculation: calculation ? Object.freeze({ ...calculation }) : null,
    items: Object.freeze(Array.isArray(data.items) ? data.items.map((item) => Object.freeze({ ...(asObject(item) || {}) })) : []),
    refreshed,
    refreshFailed,
    command
  });
}

export const CALCULATION_VERSION_STAGING_TRANSPORT = Object.freeze({
  projectRef: STAGING_PROJECT_REF,
  functionSlug: FUNCTION_SLUG,
  action: ACTION,
  permission: PERMISSION,
  maxItems: MAX_ITEMS
});
