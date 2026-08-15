const STAGING_PROJECT_REF = 'otulfnouybahfnsycxqn';
const STAGING_HOSTNAME = `${STAGING_PROJECT_REF}.supabase.co`;
const FUNCTION_SLUG = 'leader-crm-leads-staging';
const BROWSER_RPC_SLUG = 'leader_update_lead_workflow_browser_rpc';
const EDGE_ACTION = 'update';
const PERMISSION = 'leads.update';
const REQUEST_TIMEOUT_MS = 20000;
const VERIFICATION_TIMEOUT_MS = 8000;
const VERIFICATION_READ_TIMEOUT_MS = 2500;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const WORKFLOW_FIELDS = Object.freeze(['status', 'next_contact_at', 'assigned_to']);
const LEAD_STATUSES = new Set([
  'Новая', 'В работе', 'Уточнение деталей', 'Расчёт подготовлен', 'КП отправлено',
  'Ждём ответ', 'Нужно пересчитать', 'Согласовано', 'Отказ', 'Спам', 'Создан заказ'
]);

function text(value) { return String(value ?? '').trim(); }
function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : null; }
function uuid(value) { return UUID_PATTERN.test(text(value)); }
function delay(ms) { return new Promise((resolve) => globalThis.setTimeout(resolve, ms)); }
function transportError(code, name = 'Error') { const error = new Error(code); error.name = name; return error; }
function deferTransportAbort(edgeTransport) {
  globalThis.setTimeout(() => {
    try { edgeTransport?.abort?.(); } catch (_) { /* noop */ }
  }, 0);
}

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
      browserRpcSlug: BROWSER_RPC_SLUG,
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
  if (['missing_or_invalid_jwt', 'auth_required', 'missing_token', 'bad_token'].includes(key)) return 'auth_required';
  if (key === 'forbidden') return 'forbidden';
  if (key === 'not_found') return 'not_found';
  if (key === 'conflict') return 'conflict';
  if (key === 'assignee_required') return 'assignee_required';
  if (key === 'next_contact_required') return 'next_contact_required';
  if (key === 'duplicate_request') return 'duplicate_request';
  if (key === 'no_effect') return 'no_effect';
  if (['workflow_fields_must_be_separate', 'validation_error', 'unknown_action'].includes(key)) return 'validation_error';
  if (['network_error', 'request_timeout'].includes(key)) return 'network_error';
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
  return Object.fromEntries(
    WORKFLOW_FIELDS
      .filter((key) => Object.prototype.hasOwnProperty.call(command, key))
      .map((key) => [key, command[key]])
  );
}

function sameTimestamp(left, right) {
  if (left === null || right === null) return left === right;
  const a = Date.parse(text(left));
  const b = Date.parse(text(right));
  return Number.isFinite(a) && Number.isFinite(b) ? a === b : text(left) === text(right);
}

function leadMatchesCommand(lead, command) {
  if (!object(lead)) return false;
  const expectedPatch = expectedPatchFromCommand(command);
  const patchMatches = Object.entries(expectedPatch).every(([key, expected]) => {
    const actual = lead[key];
    if (key === 'next_contact_at') return sameTimestamp(actual ?? null, expected ?? null);
    return text(actual) === text(expected);
  });
  if (!patchMatches) return false;
  const before = Date.parse(text(command.expected_updated_at));
  const after = Date.parse(text(lead.updated_at));
  return Number.isFinite(before) && Number.isFinite(after) && after !== before;
}

async function readLeadViaRest({ fetchImpl, supabaseUrl, publicKey, accessToken, leadId, timeoutMs = VERIFICATION_READ_TIMEOUT_MS }) {
  const controller = new AbortController();
  let timer = 0;
  const timeoutPromise = new Promise((_, reject) => {
    timer = globalThis.setTimeout(() => {
      controller.abort();
      reject(transportError('verification_read_timeout', 'AbortError'));
    }, timeoutMs);
  });

  const endpoint = new URL(`${supabaseUrl.replace(/\/+$/, '')}/rest/v1/leader_leads`);
  endpoint.searchParams.set('select', 'id,status,assigned_to,next_contact_at,updated_at');
  endpoint.searchParams.set('id', `eq.${leadId}`);
  endpoint.searchParams.set('limit', '1');

  try {
    return await Promise.race([
      (async () => {
        const response = await fetchImpl(endpoint.toString(), {
          method: 'GET',
          headers: {
            apikey: publicKey,
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json'
          },
          signal: controller.signal
        });
        if (!response.ok) return null;
        const rows = await response.json();
        return Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
      })(),
      timeoutPromise
    ]);
  } catch (_) {
    return null;
  } finally {
    globalThis.clearTimeout(timer);
  }
}

async function verifyPersistedWorkflow({
  fetchImpl,
  supabaseUrl,
  publicKey,
  accessToken,
  command,
  timeoutMs = VERIFICATION_TIMEOUT_MS,
  cancelled = () => false
}) {
  if (!uuid(command?.id)) return { type: 'verification_timeout' };
  const started = Date.now();
  const initialDelay = Math.min(700, Math.max(50, Math.floor(timeoutMs / 5)));
  await delay(initialDelay);

  while (!cancelled() && Date.now() - started < timeoutMs) {
    const remaining = Math.max(200, timeoutMs - (Date.now() - started));
    const lead = await readLeadViaRest({
      fetchImpl,
      supabaseUrl,
      publicKey,
      accessToken,
      leadId: command.id,
      timeoutMs: Math.min(VERIFICATION_READ_TIMEOUT_MS, remaining)
    });
    if (leadMatchesCommand(lead, command)) return { type: 'verified', lead };
    await delay(Math.min(500, Math.max(50, Math.floor(timeoutMs / 6))));
  }

  return { type: 'verification_timeout' };
}

function browserRpcPayload(command) {
  return {
    p_request: {
      action: 'lead_workflow.update',
      request_id: command.request_id,
      expected_updated_at: command.expected_updated_at,
      payload: {
        lead_id: command.id,
        idempotency_key: command.idempotency_key,
        patch: expectedPatchFromCommand(command)
      }
    }
  };
}

function createFetchRpcTransport({ fetchImpl, url, publicKey, accessToken, command }) {
  const controller = new AbortController();
  const promise = (async () => {
    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          apikey: publicKey,
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify(browserRpcPayload(command)),
        signal: controller.signal
      });
      if (response.status === 202) {
        try { response.body?.cancel?.(); } catch (_) { /* noop */ }
        return new Promise(() => {});
      }
      const raw = await response.json();
      return { type: 'transport', response, data: object(raw) || {} };
    } catch (error) {
      return { type: 'transport_error', error };
    }
  })();
  return { promise, abort: () => controller.abort() };
}

function neverResolveOnVerificationTimeout(promise) {
  return promise.then((result) => (
    result?.type === 'verified' ? result : new Promise(() => {})
  ));
}

export async function invokeStagingLeadWorkflow({
  client,
  supabaseUrl = '',
  publishableKey = '',
  accessToken = '',
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
  if (typeof fetchImpl !== 'function') {
    return Object.freeze({ ok: false, status: 500, kind: 'persistence_failed', code: 'client_unavailable', message: leadWorkflowResultMessage('persistence_failed') });
  }

  const publicKey = text(publishableKey);
  if (!publicKey) {
    return Object.freeze({ ok: false, status: 500, kind: 'persistence_failed', code: 'publishable_key_missing', message: leadWorkflowResultMessage('persistence_failed') });
  }

  let resolvedAccessToken = text(accessToken);
  if (!resolvedAccessToken) {
    if (!client?.auth?.getSession) {
      return Object.freeze({ ok: false, status: 500, kind: 'persistence_failed', code: 'client_unavailable', message: leadWorkflowResultMessage('persistence_failed') });
    }
    let sessionResult;
    try { sessionResult = await client.auth.getSession(); }
    catch (_) { return Object.freeze({ ok: false, status: 0, kind: 'network_error', code: 'network_error', message: leadWorkflowResultMessage('network_error') }); }
    resolvedAccessToken = text(sessionResult?.data?.session?.access_token);
    if (sessionResult?.error || !resolvedAccessToken) {
      return Object.freeze({ ok: false, status: 401, kind: 'auth_required', code: 'auth_required', message: leadWorkflowResultMessage('auth_required') });
    }
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

  let finished = false;
  const rpcEndpoint = `${supabaseUrl.replace(/\/+$/, '')}/rest/v1/rpc/${BROWSER_RPC_SLUG}`;
  const commandTransport = createFetchRpcTransport({
    fetchImpl,
    url: rpcEndpoint,
    publicKey,
    accessToken: resolvedAccessToken,
    command
  });

  const verificationPromise = neverResolveOnVerificationTimeout(verifyPersistedWorkflow({
    fetchImpl,
    supabaseUrl,
    publicKey,
    accessToken: resolvedAccessToken,
    command,
    timeoutMs: Math.min(verificationTimeoutMs, requestTimeoutMs),
    cancelled: () => finished
  }));

  const deadlinePromise = (async () => {
    await delay(requestTimeoutMs);
    return { type: 'deadline' };
  })();

  const winner = await Promise.race([commandTransport.promise, verificationPromise, deadlinePromise]);
  finished = true;
  deferTransportAbort(commandTransport);

  if (winner.type === 'verified') {
    const kind = 'verified_after_transport_error';
    return Object.freeze({
      ok: true,
      status: 202,
      kind,
      code: kind,
      replay: false,
      message: leadWorkflowResultMessage(kind),
      requestId: command.request_id,
      data: { ok: true, request_id: command.request_id, lead: winner.lead, transport_recovered: true },
      command
    });
  }

  if (winner.type === 'deadline' || winner.type === 'transport_error') {
    const kind = 'network_error';
    const timeoutFailure = winner.type !== 'transport_error' || text(winner.error?.name) === 'AbortError';
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

  const { response, data } = winner;
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
