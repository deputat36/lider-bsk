const STAGING_PROJECT_REF = 'otulfnouybahfnsycxqn';
const STAGING_HOSTNAME = `${STAGING_PROJECT_REF}.supabase.co`;
const FUNCTION_SLUG = 'leader-crm-installation';
const ACTION = 'installation_job.update';
const PERMISSION = 'installation.write';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PATCH_FIELDS = Object.freeze([
  'title', 'install_status', 'installer_name', 'installer_phone', 'address',
  'scheduled_at', 'before_photo_url', 'after_photo_url', 'technical_task',
  'tools_required', 'installer_comment'
]);

function text(value) { return String(value ?? '').trim(); }
function asObject(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : null; }
function uuid(value) { return UUID_PATTERN.test(text(value)); }

export function projectRefFromInstallationSupabaseUrl(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === STAGING_HOSTNAME ? STAGING_PROJECT_REF : '';
  } catch (_) {
    return '';
  }
}

export function isStagingInstallationEnvironment(supabaseUrl) {
  return projectRefFromInstallationSupabaseUrl(supabaseUrl) === STAGING_PROJECT_REF;
}

export function installationStagingTransportAvailability({
  supabaseUrl = '', canWrite = false, job = null, patch = null, expectedUpdatedAt = null
} = {}) {
  const staging = isStagingInstallationEnvironment(supabaseUrl);
  const jobObject = asObject(job);
  const patchObject = asObject(patch);
  const hasTimestamp = Boolean(text(expectedUpdatedAt) && Number.isFinite(Date.parse(expectedUpdatedAt)));
  let reason = '';
  if (!staging) reason = 'production_locked';
  else if (!canWrite) reason = 'forbidden';
  else if (!jobObject || !uuid(jobObject.id)) reason = 'job_missing';
  else if (!patchObject || Object.keys(patchObject).length === 0) reason = 'patch_missing';
  else if (!hasTimestamp) reason = 'expected_updated_at_missing';

  return Object.freeze({
    enabled: staging && canWrite === true && Boolean(jobObject && uuid(jobObject.id)) && Boolean(patchObject && Object.keys(patchObject).length) && hasTimestamp,
    staging,
    reason,
    projectRef: projectRefFromInstallationSupabaseUrl(supabaseUrl),
    functionSlug: FUNCTION_SLUG,
    permission: PERMISSION
  });
}

function normalizePatch(value) {
  const patch = asObject(value);
  if (!patch || Object.keys(patch).length === 0) throw new Error('patch_invalid');
  const unknown = Object.keys(patch).filter((key) => !PATCH_FIELDS.includes(key));
  if (unknown.length) throw new Error(`patch_field_not_allowed:${unknown[0]}`);
  const result = {};
  for (const key of PATCH_FIELDS) {
    if (!(key in patch)) continue;
    const raw = patch[key];
    if (key === 'scheduled_at') {
      if (raw === null) result[key] = null;
      else if (typeof raw === 'string' && Number.isFinite(Date.parse(raw))) result[key] = new Date(raw).toISOString();
      else throw new Error('scheduled_at_invalid');
      continue;
    }
    if (raw !== null && typeof raw !== 'string') throw new Error(`${key}_invalid`);
    const cleaned = typeof raw === 'string' ? raw.trim() : '';
    result[key] = cleaned || null;
  }
  return Object.freeze(result);
}

export function buildStagingInstallationJobCommand({ job, patch, expectedUpdatedAt, requestId, idempotencyKey } = {}) {
  const jobObject = asObject(job);
  const exactExpectedUpdatedAt = text(expectedUpdatedAt);
  if (!jobObject || !uuid(jobObject.id)) throw new Error('job_id_invalid');
  if (!uuid(requestId)) throw new Error('request_id_invalid');
  if (!exactExpectedUpdatedAt || !Number.isFinite(Date.parse(exactExpectedUpdatedAt))) throw new Error('expected_updated_at_invalid');
  const key = text(idempotencyKey);
  if (!key || key.length > 160) throw new Error('idempotency_key_invalid');

  return Object.freeze({
    action: ACTION,
    request_id: text(requestId),
    expected_updated_at: exactExpectedUpdatedAt,
    payload: Object.freeze({
      job_id: text(jobObject.id),
      idempotency_key: key,
      patch: normalizePatch(patch)
    })
  });
}

function secureRequestId(cryptoObject = globalThis.crypto) {
  const value = cryptoObject?.randomUUID?.();
  if (!uuid(value)) throw new Error('secure_request_id_unavailable');
  return value;
}

function classifyError(code) {
  const key = text(code).toLowerCase() || 'installation_update_failed';
  if (key === 'wrong_environment') return 'wrong_environment';
  if (key === 'missing_or_invalid_jwt' || key === 'auth_required') return 'auth_required';
  if (key === 'forbidden') return 'forbidden';
  if (key === 'not_found') return 'not_found';
  if (key === 'conflict') return 'conflict';
  if (key === 'invalid_transition') return 'invalid_transition';
  if (key === 'duplicate_request') return 'duplicate_request';
  if (key === 'validation_error' || key === 'unknown_action') return 'validation_error';
  if (key === 'network_error') return 'network_error';
  return 'persistence_failed';
}

export function installationStagingResultMessage(kind, replay = false) {
  if (replay) return 'Безопасный повтор: сервер вернул уже сохранённое состояние без дубликата.';
  return ({
    updated: 'Монтажное задание сохранено одной командой только в staging.',
    wrong_environment: 'Серверное сохранение монтажа разрешено только в staging.',
    auth_required: 'Нужен вход отдельного staging-пользователя.',
    forbidden: 'У staging-профиля нет права installation.write.',
    not_found: 'Монтажное задание не найдено в staging.',
    conflict: 'Задание изменилось. Перечитайте карточку и повторите.',
    invalid_transition: 'Переход статуса запрещён серверным registry.',
    duplicate_request: 'Команда с этим request_id уже обработана с другим содержимым.',
    validation_error: 'Команда не прошла проверку полей.',
    network_error: 'Не удалось связаться со staging Edge Function.',
    persistence_failed: 'Staging не смог атомарно сохранить монтажное задание.'
  })[kind] || 'Staging вернул неизвестный результат.';
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
    code: text(nested?.code || root?.error || error?.code || 'installation_update_failed')
  };
}

export async function invokeStagingInstallationJob({
  client, supabaseUrl = '', canWrite = false, job = null, patch = null,
  expectedUpdatedAt = null, idempotencyKey = '', cryptoObject = globalThis.crypto,
  readAfterSuccess = null
} = {}) {
  const availability = installationStagingTransportAvailability({ supabaseUrl, canWrite, job, patch, expectedUpdatedAt });
  if (!availability.enabled) {
    const kind = availability.reason === 'production_locked' ? 'wrong_environment'
      : availability.reason === 'forbidden' ? 'forbidden' : 'validation_error';
    return Object.freeze({ ok: false, status: kind === 'forbidden' ? 403 : kind === 'wrong_environment' ? 503 : 400, kind, code: kind, message: installationStagingResultMessage(kind) });
  }
  if (!client?.auth?.getSession || !client?.functions?.invoke) {
    return Object.freeze({ ok: false, status: 500, kind: 'persistence_failed', code: 'client_unavailable', message: installationStagingResultMessage('persistence_failed') });
  }

  let sessionResult;
  try { sessionResult = await client.auth.getSession(); }
  catch (_) { return Object.freeze({ ok: false, status: 0, kind: 'network_error', code: 'network_error', message: installationStagingResultMessage('network_error') }); }
  if (sessionResult?.error || !sessionResult?.data?.session?.access_token) {
    return Object.freeze({ ok: false, status: 401, kind: 'auth_required', code: 'auth_required', message: installationStagingResultMessage('auth_required') });
  }

  let command;
  try {
    command = buildStagingInstallationJobCommand({ job, patch, expectedUpdatedAt, idempotencyKey, requestId: secureRequestId(cryptoObject) });
  } catch (error) {
    return Object.freeze({ ok: false, status: 400, kind: 'validation_error', code: text(error?.message) || 'validation_error', message: installationStagingResultMessage('validation_error') });
  }

  let invoked;
  try { invoked = await client.functions.invoke(FUNCTION_SLUG, { body: command }); }
  catch (_) { return Object.freeze({ ok: false, status: 0, kind: 'network_error', code: 'network_error', message: installationStagingResultMessage('network_error'), command }); }

  if (invoked?.error || invoked?.data?.ok !== true) {
    const details = invoked?.error ? await edgeErrorDetails(invoked.error) : {
      status: 0,
      code: text(invoked?.data?.error?.code || invoked?.data?.error)
    };
    const kind = classifyError(details.code);
    return Object.freeze({ ok: false, status: details.status, kind, code: details.code || kind, message: installationStagingResultMessage(kind), requestId: command.request_id, command });
  }

  const data = asObject(invoked.data) || {};
  const replay = data.idempotent_replay === true;
  let refreshed = null;
  let refreshFailed = false;
  if (typeof readAfterSuccess === 'function') {
    try { refreshed = await readAfterSuccess(data); } catch (_) { refreshFailed = true; }
  }
  return Object.freeze({
    ok: true,
    status: replay ? 200 : 201,
    kind: replay ? 'replay' : 'updated',
    code: replay ? 'idempotent_replay' : 'updated',
    replay,
    message: installationStagingResultMessage(replay ? 'updated' : 'updated', replay),
    requestId: text(data.request_id || command.request_id),
    data,
    refreshed,
    refreshFailed,
    command
  });
}
