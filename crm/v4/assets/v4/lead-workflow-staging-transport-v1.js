const STAGING_PROJECT_REF = 'otulfnouybahfnsycxqn';
const STAGING_HOSTNAME = `${STAGING_PROJECT_REF}.supabase.co`;
const FUNCTION_SLUG = 'leader-crm-leads-staging';
const EDGE_ACTION = 'update';
const PERMISSION = 'leads.update';
const REQUEST_TIMEOUT_MS = 20000;
const VERIFICATION_TIMEOUT_MS = 8000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WORKFLOW_FIELDS = Object.freeze(['status', 'next_contact_at', 'assigned_to']);
const LEAD_STATUSES = new Set([
  'Новая', 'В работе', 'Уточнение деталей', 'Расчёт подготовлен', 'КП отправлено',
  'Ждём ответ', 'Нужно пересчитать', 'Согласовано', 'Отказ', 'Спам', 'Создан заказ'
]);

function text(value) { return String(value ?? '').trim(); }
function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : null; }
function uuid(value) { return UUID_PATTERN.test(text(value)); }
function abortError(code = 'request_timeout') { const error = new Error(code); error.name = 'AbortError'; return error; }

export function projectRefFromLeadWorkflowUrl(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === STAGING_HOSTNAME ? STAGING_PROJECT_REF : '';
  } catch (_) {
    return '';
  }
}

export function isStagingLeadWorkflowEnvironment(supabaseUrl) {
  return projectRefFromLeadWorkflowUrl(supabaseUrl) === STAGING_PROJECT_REF;
}

export function leadWorkflowPersistenceRoute(supabaseUrl = '') {
  if (isStagingLeadWorkflowEnvironment(supabaseUrl)) {
    return Object.freeze({
      mode: 'staging_edge',
      enabled: true,
      atomic: true,
      browserDirectWrite: false,
      functionSlug: FUNCTION_SLUG,
      permission: PERMISSION,
      title: 'Защищённый staging-маршрут',
      description: 'Статус, ответственный и следующий контакт сохраняются одной серверной командой.'
    });
  }
  return Object.freeze({
    mode: 'production_legacy',
    enabled: true,
    atomic: false,
    browserDirectWrite: true,
    functionSlug: '',
    permission: PERMISSION,
    title: 'Рабочий production-маршрут',
    description: 'Production не переключается до отдельного согласованного rollout.'
  });
}

export function createLeadWorkflowIdempotencyKey(leadId, cryptoObject = globalThis.crypto) {
  const id = text(leadId);
  const randomId = cryptoObject?.randomUUID?.();
  if (!uuid(id)) throw new Error('lead_id_invalid');
  if (!uuid(text(randomId))) throw new Error('secure_request_id_unavailable');
  return `lead-workflow:${id}:${randomId}`;
}

function normalizeWorkflowPatch(value) {
  const patch = object(value);
  if (!patch || Object.keys(patch).length === 0) throw new Error('patch_invalid');
  const unknown = Object.keys(patch).filter((key) => !WORKFLOW_FIELDS.includes(key));
  if (unknown.length) throw new Error(`patch_field_not_allowed:${unknown[0]}`);

  const result = {};
  if (Object.prototype.hasOwnProperty.call(patch, 'status')) {
    const status = text(patch.status);
    if (!LEAD_STATUSES.has(status)) throw new Error('status_invalid');
    result.status = status;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'assigned_to')) {
    const assignedTo = text(patch.assigned_to);
    if (!uuid(assignedTo)) throw new Error('assigned_to_invalid');
    result.assigned_to = assignedTo;
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'next_contact_at')) {
    if (patch.next_contact_at === null || text(patch.next_contact_at) === '') {
      result.next_contact_at = null;
    } else if (typeof patch.next_contact_at === 'string' && Number.isFinite(Date.parse(patch.next_contact_at))) {
      result.next_contact_at = new Date(patch.next_contact_at).toISOString();
    } else {
      throw new Error('next_contact_at_invalid');
    }
  }
  if (Object.keys(result).length === 0) throw new Error('patch_invalid');
  return Object.freeze(result);
}

export function buildStagingLeadWorkflowCommand({ lead, patch, requestId, idempotencyKey } = {}) {
  const leadObject = object(lead);
  if (!leadObject || !uuid(leadObject.id)) throw new Error('lead_id_invalid');
  if (!uuid(requestId)) throw new Error('request_id_invalid');
  const expectedUpdatedAt = text(leadObject.updated_at);
  if (!expectedUpdatedAt || !Number.isFinite(Date.parse(expectedUpdatedAt))) throw new Error('expected_updated_at_invalid');
  const key = text(idempotencyKey);
  if (!key || key.length > 160) throw new Error('idempotency_key_invalid');

  return Object.freeze({
    action: EDGE_ACTION,
    id: text(leadObject.id),
    request_id: text(requestId),
    expected_updated_at: expectedUpdatedAt,
    idempotency_key: key,
    ...normalizeWorkflowPatch(patch)
  });
}

function secureRequestId(cryptoObject = globalThis.crypto) {
  const value = cryptoObject?.randomUUID?.();
  if (!uuid(value)) throw new Error('secure_request_id_unavailable');
  return value;
}

function classifyError(code) {
  const key = text(code).toLowerCase() || 'workflow_update_failed';
  if (key === 'wrong_environment') return 'wrong_environment';
  if (key === 'missing_or_invalid_jwt' || key === 'auth_required' || key === 'missing_token' || key === 'bad_token') return 'auth_required';
  if (key === 'forbidden') return 'forbidden';
  if (key === 'not_found') return 'not_found';
  if (key === 'conflict') return 'conflict';
  if (key === 'assignee_required') return 'assignee_required';
  if (key === 'next_contact_required') return 'next_contact_required';
  if (key === 'duplicate_request') return 'duplicate_request';
  if (key === 'no_effect') return 'no_effect';
  if (key === 'workflow_fields_must_be_separate') return 'validation_error';
  if (key === 'validation_error' || key === 'unknown_action') return 'validation_error';
  if (key === 'network_error' || key === 'request_timeout') return 'network_error';
  return 'persistence_failed';
}

export function leadWorkflowResultMessage(kind, replay = false) {
  if (replay) return 'Безопасный повтор: сервер вернул уже сохранённое состояние без дубликата.';
  return ({
    updated: 'Рабочий маршрут заявки сохранён одной серверной командой.',
    verified_after_transport_error: 'Изменение заявки сохранено и подтверждено контрольным чтением после сетевой задержки.',
    wrong_environment: 'Защищённый маршрут заявки разрешён только в staging.',
    auth_required: 'Сессия staging истекла. Войдите снова.',
    forbidden: 'У вашей роли нет права изменять рабочий маршрут заявки.',
    not_found: 'Заявка не найдена в staging.',
    conflict: 'Заявка уже изменилась. Карточка будет перечитана перед повтором.',
    assignee_required: 'Сначала назначьте ответственного за заявку.',
    next_contact_required: 'Для ожидания ответа назначьте будущую дату следующего контакта.',
    duplicate_request: 'Эта команда уже обрабатывается или request_id использован повторно.',
    no_effect: 'В заявке уже установлены эти значения.',
    validation_error: 'Не удалось проверить данные рабочего маршрута.',
    network_error: 'Не удалось связаться со staging Edge Function.',
    persistence_failed: 'Staging не смог атомарно сохранить рабочий маршрут заявки.'
  })[kind] || 'Staging вернул неизвестный результат.';
}

function responseErrorDetails(body, status) {
  const root = object(body) || {};
  const nested = object(root.error);
  return {
    status: Number(status || 0) || 0,
    code: text(nested?.code || root.error || 'workflow_update_failed')
  };
}

function expectedPatchFromCommand(command) {
  return Object.fromEntries(WORKFLOW_FIELDS.filter((key) => Object.prototype.hasOwnProperty.call(command, key)).map((key) => [key, command[key]]));
}

function sameTimestamp(left, right) {
  if (left === null || right === null) return left === right;
  const a = Date.parse(text(left));
  const b = Date.parse(text(right));
  return Number.isFinite(a) && Number.isFinite(b) ? a === b : text(left) === text(right);
}

function leadMatchesPatch(lead, patch) {
  if (!object(lead)) return false;
  return Object.entries(patch).every(([key, expected]) => {
    const actual = lead[key];
    if (key === 'next_contact_at') return sameTimestamp(actual ?? null, expected ?? null);
    return text(actual) === text(expected);
  });
}

async function readLeadWithTimeout(client, leadId, timeoutMs = VERIFICATION_TIMEOUT_MS) {
  let timer = 0;
  const timeoutPromise = new Promise((_, reject) => {
    timer = globalThis.setTimeout(() => reject(abortError('verification_timeout')), timeoutMs);
  });
  try {
    return await Promise.race([
      client
        .from('leader_leads')
        .select('id,status,assigned_to,next_contact_at,updated_at')
        .eq('id', leadId)
        .maybeSingle(),
      timeoutPromise
    ]);
  } finally {
    globalThis.clearTimeout(timer);
  }
}

async function verifyPersistedWorkflow(client, command, timeoutMs = VERIFICATION_TIMEOUT_MS) {
  if (!client?.from || !uuid(command?.id)) return null;
  try {
    const response = await readLeadWithTimeout(client, command.id, timeoutMs);
    if (response?.error || !response?.data) return null;
    const expectedPatch = expectedPatchFromCommand(command);
    return leadMatchesPatch(response.data, expectedPatch) ? response.data : null;
  } catch (_) {
    return null;
  }
}

async function fetchJsonWithTimeout(fetchImpl, url, init, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  let timer = 0;
  const timeoutPromise = new Promise((_, reject) => {
    timer = globalThis.setTimeout(() => {
      controller.abort();
      reject(abortError('request_timeout'));
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      (async () => {
        const response = await fetchImpl(url, { ...init, signal: controller.signal });
        const raw = await response.json();
        return { response, data: object(raw) || {} };
      })(),
      timeoutPromise
    ]);
  } finally {
    globalThis.clearTimeout(timer);
  }
}

export async function invokeStagingLeadWorkflow({
  client,
  supabaseUrl = '',
  publishableKey = '',
  lead = null,
  patch = null,
  idempotencyKey = '',
  cryptoObject = globalThis.crypto,
  fetchImpl = globalThis.fetch,
  requestTimeoutMs = REQUEST_TIMEOUT_MS,
  verificationTimeoutMs = VERIFICATION_TIMEOUT_MS
} = {}) {
  if (!isStagingLeadWorkflowEnvironment(supabaseUrl)) {
    return Object.freeze({ ok: false, status: 503, kind: 'wrong_environment', code: 'wrong_environment', message: leadWorkflowResultMessage('wrong_environment') });
  }
  if (!client?.auth?.getSession || typeof fetchImpl !== 'function') {
    return Object.freeze({ ok: false, status: 500, kind: 'persistence_failed', code: 'client_unavailable', message: leadWorkflowResultMessage('persistence_failed') });
  }

  const publicKey = text(publishableKey);
  if (!publicKey) {
    return Object.freeze({ ok: false, status: 500, kind: 'persistence_failed', code: 'publishable_key_missing', message: leadWorkflowResultMessage('persistence_failed') });
  }

  let sessionResult;
  try { sessionResult = await client.auth.getSession(); }
  catch (_) { return Object.freeze({ ok: false, status: 0, kind: 'network_error', code: 'network_error', message: leadWorkflowResultMessage('network_error') }); }
  const accessToken = text(sessionResult?.data?.session?.access_token);
  if (sessionResult?.error || !accessToken) {
    return Object.freeze({ ok: false, status: 401, kind: 'auth_required', code: 'auth_required', message: leadWorkflowResultMessage('auth_required') });
  }

  let command;
  try {
    command = buildStagingLeadWorkflowCommand({
      lead,
      patch,
      requestId: secureRequestId(cryptoObject),
      idempotencyKey
    });
  } catch (error) {
    return Object.freeze({
      ok: false,
      status: 400,
      kind: 'validation_error',
      code: text(error?.message) || 'validation_error',
      message: leadWorkflowResultMessage('validation_error')
    });
  }

  let transport;
  try {
    transport = await fetchJsonWithTimeout(fetchImpl, `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/${FUNCTION_SLUG}`, {
      method: 'POST',
      headers: {
        apikey: publicKey,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(command)
    }, requestTimeoutMs);
  } catch (error) {
    const verifiedLead = await verifyPersistedWorkflow(client, command, verificationTimeoutMs);
    if (verifiedLead) {
      const kind = 'verified_after_transport_error';
      return Object.freeze({
        ok: true,
        status: 202,
        kind,
        code: kind,
        replay: false,
        message: leadWorkflowResultMessage(kind),
        requestId: command.request_id,
        data: { ok: true, request_id: command.request_id, lead: verifiedLead, transport_recovered: true },
        command
      });
    }
    const timeoutFailure = text(error?.name) === 'AbortError';
    const kind = 'network_error';
    return Object.freeze({
      ok: false,
      status: 0,
      kind,
      code: timeoutFailure ? 'request_timeout' : 'network_error',
      message: leadWorkflowResultMessage(kind),
      requestId: command.request_id,
      command
    });
  }

  const { response, data } = transport;
  if (!response.ok || data.ok !== true) {
    const details = responseErrorDetails(data, response.status);
    const kind = classifyError(details.code);
    return Object.freeze({
      ok: false,
      status: details.status,
      kind,
      code: details.code || kind,
      message: leadWorkflowResultMessage(kind),
      requestId: command.request_id,
      command
    });
  }

  const replay = data.idempotent_replay === true;
  return Object.freeze({
    ok: true,
    status: Number(response.status || 0) || (replay ? 200 : 201),
    kind: replay ? 'replay' : 'updated',
    code: replay ? 'idempotent_replay' : 'updated',
    replay,
    message: leadWorkflowResultMessage('updated', replay),
    requestId: text(data.request_id || command.request_id),
    data,
    command
  });
}
