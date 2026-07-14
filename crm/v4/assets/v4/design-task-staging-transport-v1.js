const STAGING_PROJECT_REF = 'otulfnouybahfnsycxqn';
const FUNCTION_SLUG = 'leader-crm-design';
const ACTION = 'design_task.create_from_order';

function text(value) {
  return String(value ?? '').trim();
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function uuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value));
}

export function projectRefFromSupabaseUrl(value) {
  try {
    return new URL(value).hostname.split('.')[0] || '';
  } catch (_) {
    return '';
  }
}

export function isStagingDesignEnvironment(supabaseUrl) {
  return projectRefFromSupabaseUrl(supabaseUrl) === STAGING_PROJECT_REF;
}

export function designStagingTransportAvailability({
  supabaseUrl = '',
  canWrite = false,
  draft = null,
  expectedUpdatedAt = null
} = {}) {
  const staging = isStagingDesignEnvironment(supabaseUrl);
  const hasDraft = Boolean(asObject(draft));
  const hasTimestamp = Boolean(text(expectedUpdatedAt) && Number.isFinite(Date.parse(expectedUpdatedAt)));
  let reason = '';
  if (!staging) reason = 'production_locked';
  else if (!canWrite) reason = 'forbidden';
  else if (!hasDraft) reason = 'draft_missing';
  else if (!hasTimestamp) reason = 'expected_updated_at_missing';

  return Object.freeze({
    enabled: staging && canWrite === true && hasDraft && hasTimestamp,
    staging,
    reason,
    projectRef: projectRefFromSupabaseUrl(supabaseUrl),
    functionSlug: FUNCTION_SLUG
  });
}

export function buildStagingDesignCommand({ draft, expectedUpdatedAt, requestId } = {}) {
  const source = asObject(draft);
  const task = asObject(source?.task);
  const evidence = asObject(source?.evidence);
  const needIds = Array.isArray(evidence?.need_ids)
    ? [...new Set(evidence.need_ids.map(text).filter(uuid))]
    : [];

  if (!source || source.command !== ACTION) throw new Error('design_draft_invalid');
  if (!uuid(source.order_id)) throw new Error('order_id_invalid');
  if (text(source.production_job_id) && !uuid(source.production_job_id)) throw new Error('production_job_id_invalid');
  if (!uuid(requestId)) throw new Error('request_id_invalid');
  if (!text(expectedUpdatedAt) || !Number.isFinite(Date.parse(expectedUpdatedAt))) {
    throw new Error('expected_updated_at_invalid');
  }
  if (!needIds.length) throw new Error('need_ids_invalid');
  if (!task || !text(task.title)) throw new Error('task_title_required');
  if (!text(source.idempotency_key) || text(source.idempotency_key).length > 180) throw new Error('idempotency_key_invalid');

  return Object.freeze({
    action: ACTION,
    request_id: text(requestId),
    expected_updated_at: new Date(expectedUpdatedAt).toISOString(),
    payload: Object.freeze({
      order_id: text(source.order_id),
      production_job_id: uuid(source.production_job_id) ? text(source.production_job_id) : null,
      idempotency_key: text(source.idempotency_key).slice(0, 180),
      need_ids: Object.freeze(needIds),
      task: Object.freeze({
        title: text(task.title).slice(0, 300),
        priority: text(task.priority).slice(0, 80) || null,
        deadline: text(task.deadline) || null,
        task_text: text(task.task_text).slice(0, 6000) || null,
        reference_link: text(task.reference_link).slice(0, 1000) || null
      })
    })
  });
}

function requestId(cryptoObject = globalThis.crypto) {
  const value = cryptoObject?.randomUUID?.();
  if (!uuid(value)) throw new Error('secure_request_id_unavailable');
  return value;
}

function classifyError(code, message) {
  const key = text(code).toLowerCase() || 'persistence_failed';
  const detail = text(message).toLowerCase();
  if (key === 'wrong_environment') return 'wrong_environment';
  if (key === 'auth_required' || key === 'missing_token' || key === 'bad_token' || key === 'bad_user') return 'auth_required';
  if (key === 'forbidden' || key === 'access_denied' || key === 'profile_check_failed') return 'forbidden';
  if (key === 'validation_error' || key === 'unknown_action' || key === 'invalid_json') return 'validation_error';
  if (key === 'not_found') return 'not_found';
  if (key === 'duplicate_request') return 'duplicate_request';
  if (key === 'conflict' && detail.includes('changed after draft')) return 'stale_order';
  if (key === 'conflict' && detail.includes('active design task')) return 'active_task_conflict';
  if (key === 'conflict' && detail.includes('idempotency')) return 'idempotency_conflict';
  if (key === 'conflict') return 'conflict';
  if (key === 'network_error') return 'network_error';
  return 'persistence_failed';
}

export function stagingDesignResultMessage(kind, replay = false) {
  if (replay) return 'Безопасный повтор: существующая дизайн-задача возвращена без дубликата.';
  return ({
    created: 'Тестовая дизайн-задача создана только в staging.',
    wrong_environment: 'Тестовое создание разрешено только в staging.',
    auth_required: 'Нужен вход отдельного тестового пользователя staging.',
    forbidden: 'У staging-профиля нет права design.write или профиль неактивен.',
    validation_error: 'Команда не прошла проверку. Обновите черновик и проверьте обязательные поля.',
    stale_order: 'Заказ изменился после подготовки черновика. Перечитайте заказ и повторите действие.',
    active_task_conflict: 'У заказа уже есть активная дизайн-задача.',
    idempotency_conflict: 'Этот ключ повтора уже использован с другим содержимым.',
    duplicate_request: 'Предыдущий запрос с этим ключом ещё выполняется.',
    not_found: 'Заказ или подтверждающая потребность не найдены в staging.',
    conflict: 'Создание отклонено из-за конфликта актуального состояния.',
    network_error: 'Не удалось связаться со staging Edge Function.',
    persistence_failed: 'Staging не смог атомарно сохранить дизайн-задачу.'
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
    code: text(nested?.code || bodyObject?.error || error?.code || 'persistence_failed'),
    message: text(nested?.message || bodyObject?.message || error?.message)
  };
}

export async function invokeStagingDesignTask({
  client,
  supabaseUrl = '',
  canWrite = false,
  draft = null,
  expectedUpdatedAt = null,
  cryptoObject = globalThis.crypto,
  readAfterSuccess = null
} = {}) {
  const availability = designStagingTransportAvailability({ supabaseUrl, canWrite, draft, expectedUpdatedAt });
  if (!availability.enabled) {
    const kind = availability.reason === 'production_locked' ? 'wrong_environment'
      : availability.reason === 'forbidden' ? 'forbidden'
        : 'validation_error';
    return Object.freeze({ ok: false, status: kind === 'forbidden' ? 403 : kind === 'wrong_environment' ? 503 : 400, kind, code: kind, message: stagingDesignResultMessage(kind) });
  }
  if (!client?.auth?.getSession || !client?.functions?.invoke) {
    return Object.freeze({ ok: false, status: 500, kind: 'persistence_failed', code: 'client_unavailable', message: stagingDesignResultMessage('persistence_failed') });
  }

  let sessionResult;
  try { sessionResult = await client.auth.getSession(); }
  catch (_) {
    return Object.freeze({ ok: false, status: 0, kind: 'network_error', code: 'network_error', message: stagingDesignResultMessage('network_error') });
  }
  if (sessionResult?.error || !sessionResult?.data?.session?.access_token) {
    return Object.freeze({ ok: false, status: 401, kind: 'auth_required', code: 'auth_required', message: stagingDesignResultMessage('auth_required') });
  }

  let command;
  try {
    command = buildStagingDesignCommand({ draft, expectedUpdatedAt, requestId: requestId(cryptoObject) });
  } catch (error) {
    return Object.freeze({ ok: false, status: 400, kind: 'validation_error', code: text(error?.message) || 'validation_error', message: stagingDesignResultMessage('validation_error') });
  }

  let invoked;
  try {
    invoked = await client.functions.invoke(FUNCTION_SLUG, { body: command });
  } catch (_) {
    return Object.freeze({ ok: false, status: 0, kind: 'network_error', code: 'network_error', message: stagingDesignResultMessage('network_error'), command });
  }

  if (invoked?.error || invoked?.data?.ok !== true) {
    const details = invoked?.error
      ? await edgeErrorDetails(invoked.error)
      : {
          status: 0,
          code: text(invoked.data?.error?.code || invoked.data?.error),
          message: text(invoked.data?.error?.message || invoked.data?.message)
        };
    const kind = classifyError(details.code, details.message);
    return Object.freeze({
      ok: false,
      status: details.status,
      kind,
      code: details.code || kind,
      message: stagingDesignResultMessage(kind),
      requestId: command.request_id,
      command
    });
  }

  const data = asObject(invoked?.data) || {};
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
    message: stagingDesignResultMessage('created', replay),
    requestId: text(data.request_id || command.request_id),
    taskId: text(data.task?.id),
    refreshed,
    refreshFailed,
    command
  });
}

export const DESIGN_TASK_STAGING_TRANSPORT = Object.freeze({
  projectRef: STAGING_PROJECT_REF,
  functionSlug: FUNCTION_SLUG,
  action: ACTION
});
