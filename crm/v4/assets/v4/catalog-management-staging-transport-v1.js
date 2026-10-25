const STAGING_PROJECT_REF = 'otulfnouybahfnsycxqn';
const STAGING_HOSTNAME = `${STAGING_PROJECT_REF}.supabase.co`;
const PRODUCTION_PROJECT_REF = 'ofewxuqfjhamgerwzull';
const accessProofs = new WeakMap();
const accessRequests = new WeakMap();
const FUNCTION_SLUG = 'leader-crm-catalog';
const ACTION = 'catalog.manage';
const PERMISSION = 'catalog.manage';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(value) { return String(value ?? '').trim(); }
function asObject(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : null; }
function uuid(value) { return UUID_PATTERN.test(text(value)); }

export function isStagingCatalogManagementEnvironment(supabaseUrl = '') {
  try { return new URL(supabaseUrl).origin === `https://${STAGING_HOSTNAME}`; }
  catch (_) { return false; }
}

export function isProductionCatalogManagementEnvironment(supabaseUrl = '') {
  try { return new URL(supabaseUrl).origin === `https://${PRODUCTION_PROJECT_REF}.supabase.co`; }
  catch (_) { return false; }
}

export function clearCatalogManagementAccess(client) {
  if (!client || !['object', 'function'].includes(typeof client)) return;
  accessProofs.set(client, null); accessRequests.set(client, null);
}

export function catalogManagementWriteAvailability({ supabaseUrl = '', canManage = false, client, actorId } = {}) {
  const staging = isStagingCatalogManagementEnvironment(supabaseUrl);
  const proof = client && accessProofs.get(client);
  const production = isProductionCatalogManagementEnvironment(supabaseUrl)
    && !!actorId && proof?.actorId === actorId;
  const enabled = (staging || production) && canManage === true;
  return Object.freeze({
    enabled,
    staging,
    reason: !staging && !production ? 'production_locked' : !canManage ? 'forbidden' : '',
    functionSlug: FUNCTION_SLUG,
    permission: PERMISSION
  });
}

export async function checkCatalogManagementAccess({ client, supabaseUrl = '', canManage = false, actorId, force = false } = {}) {
  if (isStagingCatalogManagementEnvironment(supabaseUrl)) return { ok: canManage === true };
  if (!client || !['object', 'function'].includes(typeof client) || !isProductionCatalogManagementEnvironment(supabaseUrl) || !canManage || !uuid(actorId)) {
    if (client) clearCatalogManagementAccess(client);
    return { ok: false };
  }
  if (force) clearCatalogManagementAccess(client);
  if (accessProofs.get(client)?.actorId === actorId) return { ok: true };
  const previous = accessRequests.get(client);
  if (previous?.actorId === actorId) return previous.promise;
  const entry = { actorId, promise: null };
  accessRequests.set(client, entry);
  let timeout;
  const task = (async () => {
    try {
      const session = await client.auth.getSession();
      if (session?.error || session?.data?.session?.user?.id !== actorId || !session.data.session.access_token) return { ok: false };
      const requestId = secureUuid();
      const result = await client.functions.invoke(FUNCTION_SLUG, {
        body: { action: 'catalog.access', request_id: requestId },
        headers: { Authorization: `Bearer ${session.data.session.access_token}` }
      });
      const data = result?.data;
      const latest = await client.auth.getSession();
      if (accessRequests.get(client) !== entry || latest?.error || latest?.data?.session?.user?.id !== actorId
        || result?.error || data?.ok !== true || data.can_manage !== true || data.actor_id !== actorId
        || data.request_id !== requestId || data.project_ref !== PRODUCTION_PROJECT_REF || data.contract !== 'leader-catalog-access-v1') return { ok: false };
      accessProofs.set(client, { actorId });
      return { ok: true };
    } catch (_) { return { ok: false }; }
    finally { if (accessRequests.get(client) === entry) accessRequests.set(client, null); }
  })();
  entry.promise = Promise.race([task, new Promise(resolve => {
    timeout = setTimeout(() => {
      if (accessRequests.get(client) === entry) accessRequests.set(client, null);
      resolve({ ok: false });
    }, 8000);
  })]).finally(() => clearTimeout(timeout));
  return entry.promise;
}

function secureUuid(cryptoObject = globalThis.crypto) {
  const value = cryptoObject?.randomUUID?.();
  if (!uuid(value)) throw new Error('secure_request_id_unavailable');
  return value;
}

export function catalogManagementIdempotencyKey(operation, catalogId = '', cryptoObject = globalThis.crypto) {
  const random = secureUuid(cryptoObject);
  const op = text(operation).toLowerCase();
  if (!['create', 'update'].includes(op)) throw new Error('operation_invalid');
  if (op === 'update' && !uuid(catalogId)) throw new Error('catalog_id_invalid');
  return `catalog:${op}:${op === 'update' ? text(catalogId) : 'new'}:${random}`;
}

export function buildCatalogManagementCommand({ operation, catalogId = null, expectedUpdatedAt = null, idempotencyKey, reason = null, patch = {}, requestId } = {}) {
  const op = text(operation).toLowerCase();
  if (!['create', 'update'].includes(op)) throw new Error('operation_invalid');
  if (!uuid(requestId)) throw new Error('request_id_invalid');
  if (!text(idempotencyKey) || text(idempotencyKey).length > 160) throw new Error('idempotency_key_invalid');
  if (!asObject(patch)) throw new Error('patch_invalid');
  if (op === 'update') {
    if (!uuid(catalogId)) throw new Error('catalog_id_invalid');
    if (!text(expectedUpdatedAt) || !Number.isFinite(Date.parse(expectedUpdatedAt))) throw new Error('expected_updated_at_invalid');
  }
  return Object.freeze({
    action: ACTION,
    request_id: text(requestId),
    expected_updated_at: op === 'update' ? text(expectedUpdatedAt) : null,
    payload: Object.freeze({
      operation: op,
      catalog_id: op === 'update' ? text(catalogId) : null,
      idempotency_key: text(idempotencyKey),
      reason: text(reason).slice(0, 1000) || null,
      patch: Object.freeze({ ...patch })
    })
  });
}

async function edgeErrorDetails(error) {
  const context = error?.context;
  let body = null;
  if (context && typeof context.clone === 'function' && typeof context.json === 'function') {
    try { body = await context.clone().json(); } catch (_) { body = null; }
  } else if (asObject(error?.data)) body = error.data;
  const root = asObject(body);
  const nested = asObject(root?.error);
  return {
    status: Number(context?.status || error?.status || 0) || 0,
    code: text(nested?.code || root?.code || root?.error || error?.code || 'catalog_manage_failed')
  };
}

function classify(code) {
  const key = text(code).toLowerCase();
  if (key === 'missing_or_invalid_jwt' || key === 'auth_required') return 'auth_required';
  if (key === 'forbidden' || key === 'inactive_profile') return 'forbidden';
  if (key === 'catalog_duplicate') return 'duplicate';
  if (key === 'catalog_not_found') return 'not_found';
  if (key === 'source_changed') return 'stale_source';
  if (key === 'idempotency_conflict') return 'idempotency_conflict';
  if (key === 'wrong_environment') return 'wrong_environment';
  if (key === 'invalid_payload' || key === 'unknown_action') return 'validation_error';
  return 'persistence_failed';
}

export function catalogManagementResultMessage(kind, replay = false) {
  if (replay) return 'Безопасный повтор: каталог уже сохранён, дубликат не создан.';
  return ({
    saved: 'Каталог сохранён, история изменения записана.',
    production_locked: 'Сервер ещё не подтвердил доступ к редактированию. Обновите каталог.',
    auth_required: 'Войдите в CRM для редактирования прайса.',
    forbidden: 'Недостаточно прав для изменения прайса.',
    duplicate: 'Позиция с таким названием уже есть в каталоге.',
    not_found: 'Позиция каталога не найдена.',
    stale_source: 'Позиция уже изменилась. Обновите каталог перед сохранением.',
    idempotency_conflict: 'Ключ безопасного повтора уже использован с другим содержимым.',
    validation_error: 'Проверьте заполнение позиции каталога.',
    persistence_failed: 'Не удалось атомарно сохранить каталог и историю.'
  })[kind] || 'Не удалось сохранить каталог.';
}

export async function invokeStagingCatalogManagement({ client, supabaseUrl = '', canManage = false, operation, catalogId = null, expectedUpdatedAt = null, idempotencyKey, reason = null, patch = {}, requestId, actorId, cryptoObject = globalThis.crypto } = {}) {
  const availability = catalogManagementWriteAvailability({ supabaseUrl, canManage, client, actorId });
  if (!availability.enabled) {
    const kind = availability.reason === 'forbidden' ? 'forbidden' : 'production_locked';
    return Object.freeze({ ok: false, status: kind === 'forbidden' ? 403 : 503, kind, message: catalogManagementResultMessage(kind) });
  }
  if (!client?.auth?.getSession || !client?.functions?.invoke) return Object.freeze({ ok: false, status: 500, kind: 'persistence_failed', message: catalogManagementResultMessage('persistence_failed') });
  let session;
  try { session = await client.auth.getSession(); }
  catch (_) { return Object.freeze({ ok: false, status: 0, kind: 'persistence_failed', message: catalogManagementResultMessage('persistence_failed') }); }
  if (session?.error || !session?.data?.session?.access_token) return Object.freeze({ ok: false, status: 401, kind: 'auth_required', message: catalogManagementResultMessage('auth_required') });
  if (actorId && session.data.session.user?.id !== actorId) return Object.freeze({ ok: false, status: 401, kind: 'auth_required', message: catalogManagementResultMessage('auth_required') });

  let command;
  try {
    command = buildCatalogManagementCommand({ operation, catalogId, expectedUpdatedAt, idempotencyKey, reason, patch, requestId: requestId || secureUuid(cryptoObject) });
  } catch (error) {
    return Object.freeze({ ok: false, status: 400, kind: 'validation_error', code: text(error?.message), message: catalogManagementResultMessage('validation_error') });
  }

  let invoked;
  try { invoked = await client.functions.invoke(FUNCTION_SLUG, { body: command, headers: { Authorization: `Bearer ${session.data.session.access_token}` } }); }
  catch (_) { return Object.freeze({ ok: false, status: 0, kind: 'persistence_failed', code: 'network_error', message: catalogManagementResultMessage('persistence_failed'), command }); }

  if (invoked?.error || invoked?.data?.ok !== true) {
    const details = invoked?.error ? await edgeErrorDetails(invoked.error) : { status: 0, code: text(invoked?.data?.error?.code || invoked?.data?.error) };
    const kind = details.status === 401 ? 'auth_required' : details.status === 403 ? 'forbidden' : classify(details.code);
    return Object.freeze({ ok: false, status: details.status, kind, code: details.code, message: catalogManagementResultMessage(kind), command });
  }

  const data = asObject(invoked.data) || {};
  const replay = data.idempotent_replay === true;
  return Object.freeze({
    ok: true,
    status: replay ? 200 : text(data.operation) === 'create' ? 201 : 200,
    replay,
    changed: data.changed === true,
    catalog: Object.freeze({ ...(asObject(data.catalog) || {}) }),
    requestId: text(data.request_id || command.request_id),
    message: catalogManagementResultMessage('saved', replay),
    command
  });
}

export const CATALOG_MANAGEMENT_STAGING_TRANSPORT = Object.freeze({ projectRef: STAGING_PROJECT_REF, hostname: STAGING_HOSTNAME, functionSlug: FUNCTION_SLUG, action: ACTION, permission: PERMISSION });
