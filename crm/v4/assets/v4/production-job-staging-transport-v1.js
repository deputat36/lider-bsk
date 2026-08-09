const STAGING_PROJECT_REF = 'otulfnouybahfnsycxqn';
const STAGING_HOSTNAME = `${STAGING_PROJECT_REF}.supabase.co`;
const FUNCTION_SLUG = 'leader-crm-production-create';
const ACTION = 'production_job.create_from_order';
const PERMISSION = 'production.write';
const PRIORITIES = new Set(['Обычная', 'Высокая', 'Срочно']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(value) {
  return String(value ?? '').trim();
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function uuid(value) {
  return UUID_PATTERN.test(text(value));
}

function pick(source, fields) {
  const value = asObject(source);
  if (!value) return null;
  return Object.freeze(Object.fromEntries(fields.filter((key) => key in value).map((key) => [key, value[key]])));
}

function safeServerProjection(value) {
  const source = asObject(value) || {};
  return Object.freeze({
    ok: source.ok === true,
    request_id: text(source.request_id),
    idempotent_replay: source.idempotent_replay === true,
    job: pick(source.job, [
      'id', 'order_id', 'title', 'production_status', 'priority', 'deadline',
      'layout_status', 'file_url', 'technical_task', 'sent_to_contractor_at',
      'created_at', 'updated_at'
    ]),
    order: pick(source.order, [
      'id', 'production_status', 'layout_status', 'layout_link', 'current_stage',
      'next_action', 'updated_at', 'stage_updated_at'
    ]),
    design_task: pick(source.design_task, ['id', 'production_job_id', 'updated_at']),
    events: Object.freeze((Array.isArray(source.events) ? source.events : [])
      .map((event) => pick(event, ['id', 'event_type', 'old_status', 'new_status', 'created_at']))
      .filter(Boolean)),
    warnings: Object.freeze((Array.isArray(source.warnings) ? source.warnings : []).map(text).filter(Boolean))
  });
}

function optionalText(value, max, code) {
  if (value !== null && value !== undefined && typeof value !== 'string') throw new Error(code);
  const normalized = text(value);
  if (normalized.length > max) throw new Error(code);
  return normalized || null;
}

function optionalUuid(value, code) {
  if (value === null || value === undefined || text(value) === '') return null;
  if (!uuid(value)) throw new Error(code);
  return text(value);
}

function optionalIso(value, code) {
  if (value === null || value === undefined || text(value) === '') return null;
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new Error(code);
  return new Date(value).toISOString();
}

export function projectRefFromProductionSupabaseUrl(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === STAGING_HOSTNAME ? STAGING_PROJECT_REF : '';
  } catch (_) {
    return '';
  }
}

export function isStagingProductionEnvironment(supabaseUrl) {
  return projectRefFromProductionSupabaseUrl(supabaseUrl) === STAGING_PROJECT_REF;
}

export function productionStagingTransportAvailability({
  supabaseUrl = '',
  canWrite = false,
  draft = null,
  expectedUpdatedAt = null
} = {}) {
  const staging = isStagingProductionEnvironment(supabaseUrl);
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
    projectRef: projectRefFromProductionSupabaseUrl(supabaseUrl),
    functionSlug: FUNCTION_SLUG,
    permission: PERMISSION
  });
}

export function buildStagingProductionCommand({ draft, expectedUpdatedAt, requestId } = {}) {
  const source = asObject(draft);
  const job = asObject(source?.job);
  if (!source || source.command !== ACTION) throw new Error('production_draft_invalid');
  if (!uuid(source.order_id)) throw new Error('order_id_invalid');
  if (!uuid(requestId)) throw new Error('request_id_invalid');
  if (!text(expectedUpdatedAt) || !Number.isFinite(Date.parse(expectedUpdatedAt))) throw new Error('expected_updated_at_invalid');
  if (!text(source.idempotency_key) || text(source.idempotency_key).length > 180) throw new Error('idempotency_key_invalid');
  if (!job || !text(job.title) || text(job.title).length > 500) throw new Error('job_title_invalid');
  if (!PRIORITIES.has(text(job.priority))) throw new Error('job_priority_invalid');
  if (text(job.layout_status) !== 'Макет согласован') throw new Error('job_layout_status_invalid');
  const contractorCost = job.contractor_cost;
  if (contractorCost !== null && contractorCost !== undefined && (
    typeof contractorCost !== 'number' || !Number.isFinite(contractorCost) || contractorCost < 0
  )) throw new Error('contractor_cost_invalid');

  return Object.freeze({
    action: ACTION,
    request_id: text(requestId),
    expected_updated_at: new Date(expectedUpdatedAt).toISOString(),
    payload: Object.freeze({
      order_id: text(source.order_id),
      design_task_id: optionalUuid(source.design_task_id, 'design_task_id_invalid'),
      idempotency_key: text(source.idempotency_key),
      job: Object.freeze({
        title: text(job.title),
        priority: text(job.priority),
        deadline: optionalIso(job.deadline, 'deadline_invalid'),
        layout_status: 'Макет согласован',
        file_url: optionalText(job.file_url, 2000, 'file_url_invalid'),
        technical_task: optionalText(job.technical_task, 12000, 'technical_task_invalid'),
        contractor_id: optionalUuid(job.contractor_id, 'contractor_id_invalid'),
        contractor_cost: contractorCost == null ? null : contractorCost
      })
    })
  });
}

function secureRequestId(cryptoObject = globalThis.crypto) {
  const value = cryptoObject?.randomUUID?.();
  if (!uuid(value)) throw new Error('secure_request_id_unavailable');
  return value;
}

function classifyError(code, message) {
  const key = text(code).toLowerCase() || 'persistence_failed';
  const detail = text(message).toLowerCase();
  if (key === 'wrong_environment') return 'wrong_environment';
  if (['auth_required', 'missing_token', 'bad_token', 'bad_user', 'missing_or_invalid_jwt'].includes(key)) return 'auth_required';
  if (['forbidden', 'access_denied', 'profile_check_failed'].includes(key)) return 'forbidden';
  if (['validation_error', 'unknown_action', 'invalid_json'].includes(key)) {
    return detail.includes('layout') ? 'layout_conflict' : 'validation_error';
  }
  if (key === 'not_found') return 'not_found';
  if (key === 'duplicate_request') return 'duplicate_request';
  if (key === 'conflict' && detail.includes('changed after')) return 'stale_order';
  if (key === 'conflict' && detail.includes('active production job')) return 'active_job_conflict';
  if (key === 'conflict' && detail.includes('idempotency')) return 'idempotency_conflict';
  if (key === 'conflict' && detail.includes('layout')) return 'layout_conflict';
  if (key === 'conflict') return 'conflict';
  if (key === 'network_error') return 'network_error';
  return 'persistence_failed';
}

export function productionStagingResultMessage(kind, replay = false) {
  if (replay) return 'Безопасный повтор: существующее производственное задание возвращено без дубликата.';
  return ({
    created: 'Тестовое производственное задание создано только в staging.',
    wrong_environment: 'Создание производственного задания разрешено только в staging.',
    auth_required: 'Нужен вход отдельного тестового пользователя staging.',
    forbidden: 'У staging-профиля нет права production.write или профиль неактивен.',
    validation_error: 'Команда не прошла проверку обязательных полей.',
    stale_order: 'Заказ изменился после подготовки черновика. Перечитайте заказ и повторите.',
    active_job_conflict: 'У заказа уже есть активное производственное задание.',
    layout_conflict: 'Согласованный макет не подтверждён актуальным состоянием staging.',
    idempotency_conflict: 'Этот ключ повтора уже использован с другим содержимым.',
    duplicate_request: 'Предыдущий запрос с этим идентификатором ещё выполняется.',
    not_found: 'Заказ или выбранная дизайн-задача не найдены в staging.',
    conflict: 'Создание отклонено из-за конфликта актуального состояния.',
    network_error: 'Не удалось связаться со staging Edge Function.',
    persistence_failed: 'Staging не смог атомарно сохранить производственное задание.'
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
    code: text(nested?.code || root?.error || error?.code || 'persistence_failed'),
    message: text(nested?.message || root?.message || error?.message)
  };
}

export async function invokeStagingProductionJob({
  client,
  supabaseUrl = '',
  canWrite = false,
  draft = null,
  expectedUpdatedAt = null,
  cryptoObject = globalThis.crypto,
  readAfterSuccess = null
} = {}) {
  const availability = productionStagingTransportAvailability({ supabaseUrl, canWrite, draft, expectedUpdatedAt });
  if (!availability.enabled) {
    const kind = availability.reason === 'production_locked' ? 'wrong_environment'
      : availability.reason === 'forbidden' ? 'forbidden'
        : 'validation_error';
    return Object.freeze({
      ok: false,
      status: kind === 'forbidden' ? 403 : kind === 'wrong_environment' ? 503 : 400,
      kind,
      code: kind,
      message: productionStagingResultMessage(kind)
    });
  }
  if (!client?.auth?.getSession || !client?.functions?.invoke) {
    return Object.freeze({ ok: false, status: 500, kind: 'persistence_failed', code: 'client_unavailable', message: productionStagingResultMessage('persistence_failed') });
  }

  let sessionResult;
  try { sessionResult = await client.auth.getSession(); }
  catch (_) {
    return Object.freeze({ ok: false, status: 0, kind: 'network_error', code: 'network_error', message: productionStagingResultMessage('network_error') });
  }
  if (sessionResult?.error || !sessionResult?.data?.session?.access_token) {
    return Object.freeze({ ok: false, status: 401, kind: 'auth_required', code: 'auth_required', message: productionStagingResultMessage('auth_required') });
  }

  let command;
  try {
    command = buildStagingProductionCommand({ draft, expectedUpdatedAt, requestId: secureRequestId(cryptoObject) });
  } catch (error) {
    return Object.freeze({ ok: false, status: 400, kind: 'validation_error', code: text(error?.message) || 'validation_error', message: productionStagingResultMessage('validation_error') });
  }

  let invoked;
  try { invoked = await client.functions.invoke(FUNCTION_SLUG, { body: command }); }
  catch (_) {
    return Object.freeze({ ok: false, status: 0, kind: 'network_error', code: 'network_error', message: productionStagingResultMessage('network_error'), command });
  }

  if (invoked?.error || invoked?.data?.ok !== true) {
    const details = invoked?.error ? await edgeErrorDetails(invoked.error) : {
      status: 0,
      code: text(invoked?.data?.error?.code || invoked?.data?.error),
      message: text(invoked?.data?.error?.message || invoked?.data?.message)
    };
    const kind = classifyError(details.code, details.message);
    return Object.freeze({
      ok: false,
      status: details.status,
      kind,
      code: details.code || kind,
      message: productionStagingResultMessage(kind),
      requestId: command.request_id,
      command
    });
  }

  const data = safeServerProjection(invoked.data);
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
    message: productionStagingResultMessage('created', replay),
    requestId: text(data.request_id || command.request_id),
    jobId: text(data.job?.id),
    data,
    refreshed,
    refreshFailed,
    command
  });
}

export const PRODUCTION_JOB_STAGING_TRANSPORT = Object.freeze({
  projectRef: STAGING_PROJECT_REF,
  functionSlug: FUNCTION_SLUG,
  action: ACTION,
  permission: PERMISSION
});
