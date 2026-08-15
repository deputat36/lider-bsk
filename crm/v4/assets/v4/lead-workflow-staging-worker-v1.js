function text(value) {
  return String(value ?? '').trim();
}

function safeBody(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function e2eProgress(stage) {
  const hostname = text(self.location?.hostname).toLowerCase();
  if (!['127.0.0.1', 'localhost'].includes(hostname)) return;
  const safeStage = text(stage).toLowerCase().replace(/[^a-z0-9_:-]/g, '_').slice(0, 80);
  if (!safeStage) return;
  fetch(new URL('/__crm_e2e_progress', self.location.origin), {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: safeStage,
    cache: 'no-store'
  }).then((response) => response.arrayBuffer()).catch(() => undefined);
}

function sameTimestamp(left, right) {
  if (left === null || right === null) return left === right;
  const a = Date.parse(text(left));
  const b = Date.parse(text(right));
  return Number.isFinite(a) && Number.isFinite(b) ? a === b : text(left) === text(right);
}

function expectedPatch(command) {
  const result = {};
  for (const key of ['status', 'assigned_to', 'next_contact_at']) {
    if (Object.prototype.hasOwnProperty.call(command, key)) result[key] = command[key];
  }
  return result;
}

function leadMatchesCommand(lead, command) {
  if (!lead || typeof lead !== 'object') return false;
  for (const [key, expected] of Object.entries(expectedPatch(command))) {
    const actual = lead[key];
    if (key === 'next_contact_at') {
      if (!sameTimestamp(actual ?? null, expected ?? null)) return false;
    } else if (text(actual) !== text(expected)) {
      return false;
    }
  }

  const before = Date.parse(text(command.expected_updated_at));
  const after = Date.parse(text(lead.updated_at));
  return Number.isFinite(before) && Number.isFinite(after) && after !== before;
}

async function readLead({ baseUrl, publicKey, accessToken, leadId, timeoutMs }) {
  e2eProgress('worker_verification_read_start');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const endpoint = new URL(`${baseUrl}/rest/v1/leader_leads`);
    endpoint.searchParams.set('select', 'id,status,assigned_to,next_contact_at,updated_at');
    endpoint.searchParams.set('id', `eq.${leadId}`);
    endpoint.searchParams.set('limit', '1');

    const response = await fetch(endpoint.toString(), {
      method: 'GET',
      headers: {
        apikey: publicKey,
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json'
      },
      signal: controller.signal
    });
    e2eProgress(`worker_verification_headers_${response.status}`);
    if (!response.ok) return null;
    const rows = await response.json();
    e2eProgress('worker_verification_json_done');
    return Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
  } catch (error) {
    e2eProgress(error?.name === 'AbortError' ? 'worker_verification_read_timeout' : 'worker_verification_read_error');
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function verifyPersisted({ baseUrl, publicKey, accessToken, command, timeoutMs, onVerified }) {
  e2eProgress('worker_verification_started');
  const started = Date.now();
  await delay(Math.min(600, Math.max(80, Math.floor(timeoutMs / 5))));
  e2eProgress('worker_verification_delay_done');

  while (Date.now() - started < timeoutMs) {
    const remaining = Math.max(200, timeoutMs - (Date.now() - started));
    const lead = await readLead({
      baseUrl,
      publicKey,
      accessToken,
      leadId: text(command.id),
      timeoutMs: Math.min(2000, remaining)
    });
    if (leadMatchesCommand(lead, command)) {
      e2eProgress('worker_verification_matched');
      onVerified(lead);
      return;
    }
    e2eProgress('worker_verification_not_matched');
    await delay(Math.min(450, Math.max(80, Math.floor(timeoutMs / 6))));
  }

  e2eProgress('worker_verification_timeout');
}

self.onmessage = (event) => {
  e2eProgress('worker_message_received');
  const payload = safeBody(event?.data);
  const url = text(payload.url);
  const publicKey = text(payload.publicKey);
  const accessToken = text(payload.accessToken);
  const command = safeBody(payload.command);
  const timeoutMs = Math.max(1000, Math.min(30000, Number(payload.timeoutMs) || 20000));
  const verificationTimeoutMs = Math.max(1000, Math.min(timeoutMs, Number(payload.verificationTimeoutMs) || 8000));

  if (!url || !publicKey || !accessToken || !command.action || !command.id) {
    self.postMessage({ type: 'transport_error', code: 'worker_payload_invalid' });
    setTimeout(() => e2eProgress('worker_payload_invalid'), 0);
    return;
  }

  let baseUrl = '';
  try {
    baseUrl = new URL(url).origin;
  } catch (_) {
    self.postMessage({ type: 'transport_error', code: 'worker_url_invalid' });
    setTimeout(() => e2eProgress('worker_url_invalid'), 0);
    return;
  }
  e2eProgress('worker_payload_valid');

  const controller = new AbortController();
  let settled = false;
  let deadlineTimer = 0;

  const postOnce = (message, stage) => {
    if (settled) return false;
    settled = true;
    if (deadlineTimer) clearTimeout(deadlineTimer);
    // The authoritative handoff must be the first potentially observable side
    // effect. Local E2E diagnostics and cancellation are deliberately deferred:
    // either can stall in headless Chrome while an Edge response body is open.
    self.postMessage(message);
    setTimeout(() => {
      if (stage) e2eProgress(stage);
      try { controller.abort(); } catch (_) { /* noop */ }
    }, 0);
    return true;
  };

  deadlineTimer = setTimeout(() => {
    postOnce({ type: 'transport_error', code: 'request_timeout' }, 'worker_post_timeout');
  }, timeoutMs);

  // Exact RLS verification is authoritative when the browser cannot reliably
  // consume the Edge response body. It posts success immediately when the
  // committed patch is observed and cannot be pre-empted by a transport error.
  verifyPersisted({
    baseUrl,
    publicKey,
    accessToken,
    command,
    timeoutMs: verificationTimeoutMs,
    onVerified: (lead) => {
      postOnce({
        type: 'transport',
        status: 202,
        ok: true,
        data: {
          ok: true,
          request_id: text(command.request_id),
          lead,
          transport_recovered: true
        }
      }, 'worker_post_verified_transport');
    }
  }).catch(() => undefined);

  (async () => {
    try {
      e2eProgress('worker_edge_fetch_start');
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          apikey: publicKey,
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify(command),
        signal: controller.signal
      });
      e2eProgress(`worker_edge_headers_${response.status}`);

      const parsed = await response.json();
      e2eProgress('worker_edge_json_done');
      postOnce({
        type: 'transport',
        status: Number(response.status || 0),
        ok: response.ok === true,
        data: safeBody(parsed)
      }, 'worker_post_http_transport');
    } catch (error) {
      const code = error?.name === 'AbortError' ? 'request_timeout' : 'worker_network_error';
      e2eProgress(`worker_edge_error_${code}`);
      // Ambiguous browser transport errors do not complete the operation. The
      // verifier still has a bounded chance to prove the server-side commit.
    }
  })();
};