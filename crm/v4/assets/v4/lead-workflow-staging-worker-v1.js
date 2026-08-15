function text(value) {
  return String(value ?? '').trim();
}

function safeBody(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    if (!response.ok) return null;
    const rows = await response.json();
    return Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
  } catch (_) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function verifyPersisted({ baseUrl, publicKey, accessToken, command, timeoutMs }) {
  const started = Date.now();
  await delay(Math.min(600, Math.max(80, Math.floor(timeoutMs / 5))));

  while (Date.now() - started < timeoutMs) {
    const remaining = Math.max(200, timeoutMs - (Date.now() - started));
    const lead = await readLead({
      baseUrl,
      publicKey,
      accessToken,
      leadId: text(command.id),
      timeoutMs: Math.min(2000, remaining)
    });
    if (leadMatchesCommand(lead, command)) return { type: 'verified', lead };
    await delay(Math.min(450, Math.max(80, Math.floor(timeoutMs / 6))));
  }

  return { type: 'verification_timeout' };
}

function onlyVerified(promise) {
  return promise.then((result) => (
    result?.type === 'verified' ? result : new Promise(() => {})
  ));
}

function onlyHttpTransport(promise) {
  return promise.then((result) => (
    result?.type === 'transport' ? result : new Promise(() => {})
  ));
}

self.onmessage = async (event) => {
  const payload = safeBody(event?.data);
  const url = text(payload.url);
  const publicKey = text(payload.publicKey);
  const accessToken = text(payload.accessToken);
  const command = safeBody(payload.command);
  const timeoutMs = Math.max(1000, Math.min(30000, Number(payload.timeoutMs) || 20000));
  const verificationTimeoutMs = Math.max(1000, Math.min(timeoutMs, Number(payload.verificationTimeoutMs) || 8000));

  if (!url || !publicKey || !accessToken || !command.action || !command.id) {
    self.postMessage({ type: 'transport_error', code: 'worker_payload_invalid' });
    return;
  }

  let baseUrl = '';
  try {
    baseUrl = new URL(url).origin;
  } catch (_) {
    self.postMessage({ type: 'transport_error', code: 'worker_url_invalid' });
    return;
  }

  const controller = new AbortController();
  const edgeAttempt = (async () => {
    try {
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

      const parsed = await response.json();
      return {
        type: 'transport',
        status: Number(response.status || 0),
        ok: response.ok === true,
        data: safeBody(parsed)
      };
    } catch (error) {
      return {
        type: 'transport_error',
        code: error?.name === 'AbortError' ? 'request_timeout' : 'worker_network_error'
      };
    }
  })();

  // A browser/network error after the POST was sent is ambiguous: the server may
  // already have committed the command. Only a readable HTTP response may win
  // immediately; transport errors wait for exact RLS verification or the deadline.
  const edgePromise = onlyHttpTransport(edgeAttempt);

  const verificationPromise = onlyVerified(verifyPersisted({
    baseUrl,
    publicKey,
    accessToken,
    command,
    timeoutMs: verificationTimeoutMs
  }));

  const deadlinePromise = (async () => {
    await delay(timeoutMs);
    return { type: 'deadline' };
  })();

  const winner = await Promise.race([edgePromise, verificationPromise, deadlinePromise]);

  if (winner.type === 'verified') {
    controller.abort();
    self.postMessage({
      type: 'transport',
      status: 202,
      ok: true,
      data: {
        ok: true,
        request_id: text(command.request_id),
        lead: winner.lead,
        transport_recovered: true
      }
    });
    return;
  }

  if (winner.type === 'transport') {
    self.postMessage(winner);
    return;
  }

  controller.abort();
  self.postMessage({
    type: 'transport_error',
    code: 'request_timeout'
  });
};
