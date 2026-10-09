const STAGING_PROJECT_REF = 'otulfnouybahfnsycxqn';
const STAGING_HOSTNAME = `${STAGING_PROJECT_REF}.supabase.co`;
const FUNCTION_SLUG = 'leader-crm-installation';
const ACTION = 'installation_job.read';
const PERMISSION = 'installation.read';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(value) { return String(value ?? '').trim(); }
function asObject(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : null; }
function uuid(value) { return UUID_PATTERN.test(text(value)); }

export function isExactInstallationStagingUrl(value) {
  try { return new URL(value).hostname.toLowerCase() === STAGING_HOSTNAME; }
  catch (_) { return false; }
}

export function installationStagingReadAvailability({ supabaseUrl = '', canRead = false, jobId = '' } = {}) {
  const staging = isExactInstallationStagingUrl(supabaseUrl);
  let reason = '';
  if (!staging) reason = 'production_locked';
  else if (!canRead) reason = 'forbidden';
  else if (!uuid(jobId)) reason = 'job_id_invalid';
  return Object.freeze({
    enabled: staging && canRead === true && uuid(jobId),
    staging,
    reason,
    functionSlug: FUNCTION_SLUG,
    action: ACTION,
    permission: PERMISSION
  });
}

function secureRequestId(cryptoObject = globalThis.crypto) {
  const value = cryptoObject?.randomUUID?.();
  if (!uuid(value)) throw new Error('secure_request_id_unavailable');
  return value;
}

function classifyError(code) {
  const key = text(code).toLowerCase() || 'installation_read_failed';
  if (key === 'wrong_environment') return 'wrong_environment';
  if (key === 'missing_or_invalid_jwt' || key === 'auth_required') return 'auth_required';
  if (key === 'forbidden') return 'forbidden';
  if (key === 'not_found') return 'not_found';
  if (key === 'validation_error' || key === 'unknown_action') return 'validation_error';
  if (key === 'network_error') return 'network_error';
  return 'read_failed';
}

export function installationStagingReadMessage(kind) {
  return ({
    loaded: 'Монтажное задание загружено через защищённый staging Edge.',
    wrong_environment: 'Серверное чтение монтажа разрешено только в staging.',
    auth_required: 'Нужен вход отдельного staging-пользователя.',
    forbidden: 'У staging-профиля нет права installation.read.',
    not_found: 'Монтажное задание не найдено в staging.',
    validation_error: 'Запрос чтения монтажа не прошёл проверку.',
    network_error: 'Не удалось связаться со staging Edge Function.',
    read_failed: 'Staging не смог безопасно загрузить монтажное задание.'
  })[kind] || 'Staging вернул неизвестный результат чтения.';
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
    code: text(nested?.code || root?.error || error?.code || 'installation_read_failed')
  };
}

function safeArray(value) { return Array.isArray(value) ? value : []; }

export function installationReadBundle(value) {
  const source = asObject(value);
  const job = asObject(source?.entity);
  if (source?.ok !== true || !job || !uuid(job.id)) throw new Error('read_bundle_invalid');
  return Object.freeze({
    job: Object.freeze({ ...job }),
    order: asObject(source.order) ? Object.freeze({ ...source.order }) : null,
    production: asObject(source.production) ? Object.freeze({ ...source.production }) : null,
    items: Object.freeze(safeArray(source.items).map((item) => Object.freeze({ ...(asObject(item) || {}) }))),
    events: Object.freeze(safeArray(source.events).map((item) => Object.freeze({ ...(asObject(item) || {}) }))),
    comments: Object.freeze(safeArray(source.comments).map((item) => Object.freeze({ ...(asObject(item) || {}) })))
  });
}

export async function invokeStagingInstallationJobRead({
  client, supabaseUrl = '', canRead = false, jobId = '', cryptoObject = globalThis.crypto
} = {}) {
  const availability = installationStagingReadAvailability({ supabaseUrl, canRead, jobId });
  if (!availability.enabled) {
    const kind = availability.reason === 'production_locked' ? 'wrong_environment'
      : availability.reason === 'forbidden' ? 'forbidden' : 'validation_error';
    return Object.freeze({ ok: false, status: kind === 'forbidden' ? 403 : kind === 'wrong_environment' ? 503 : 400, kind, code: kind, message: installationStagingReadMessage(kind) });
  }
  if (!client?.auth?.getSession || !client?.functions?.invoke) {
    return Object.freeze({ ok: false, status: 500, kind: 'read_failed', code: 'client_unavailable', message: installationStagingReadMessage('read_failed') });
  }

  let sessionResult;
  try { sessionResult = await client.auth.getSession(); }
  catch (_) { return Object.freeze({ ok: false, status: 0, kind: 'network_error', code: 'network_error', message: installationStagingReadMessage('network_error') }); }
  if (sessionResult?.error || !sessionResult?.data?.session?.access_token) {
    return Object.freeze({ ok: false, status: 401, kind: 'auth_required', code: 'auth_required', message: installationStagingReadMessage('auth_required') });
  }

  const command = Object.freeze({
    action: ACTION,
    request_id: secureRequestId(cryptoObject),
    payload: Object.freeze({ job_id: text(jobId) })
  });

  let invoked;
  try { invoked = await client.functions.invoke(FUNCTION_SLUG, { body: command }); }
  catch (_) { return Object.freeze({ ok: false, status: 0, kind: 'network_error', code: 'network_error', message: installationStagingReadMessage('network_error'), command }); }

  if (invoked?.error || invoked?.data?.ok !== true) {
    const details = invoked?.error ? await edgeErrorDetails(invoked.error) : {
      status: 0,
      code: text(invoked?.data?.error?.code || invoked?.data?.error)
    };
    const kind = classifyError(details.code);
    return Object.freeze({ ok: false, status: details.status, kind, code: details.code || kind, message: installationStagingReadMessage(kind), requestId: command.request_id, command });
  }

  try {
    return Object.freeze({
      ok: true,
      status: 200,
      kind: 'loaded',
      code: 'loaded',
      message: installationStagingReadMessage('loaded'),
      requestId: text(invoked.data.request_id || command.request_id),
      bundle: installationReadBundle(invoked.data),
      command
    });
  } catch (_) {
    return Object.freeze({ ok: false, status: 500, kind: 'read_failed', code: 'read_bundle_invalid', message: installationStagingReadMessage('read_failed'), requestId: command.request_id, command });
  }
}
