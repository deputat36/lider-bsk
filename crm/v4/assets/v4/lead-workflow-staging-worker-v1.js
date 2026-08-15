function text(value) {
  return String(value ?? '').trim();
}

function safeBody(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

self.onmessage = async (event) => {
  const payload = safeBody(event?.data);
  const url = text(payload.url);
  const publicKey = text(payload.publicKey);
  const accessToken = text(payload.accessToken);
  const command = safeBody(payload.command);
  const timeoutMs = Math.max(1000, Math.min(30000, Number(payload.timeoutMs) || 20000));

  if (!url || !publicKey || !accessToken || !command.action) {
    self.postMessage({ type: 'transport_error', code: 'worker_payload_invalid' });
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

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

    let data = {};
    try {
      const parsed = await response.json();
      data = safeBody(parsed);
    } catch (_) {
      data = {};
    }

    self.postMessage({
      type: 'transport',
      status: Number(response.status || 0),
      ok: response.ok === true,
      data
    });
  } catch (error) {
    self.postMessage({
      type: 'transport_error',
      code: error?.name === 'AbortError' ? 'request_timeout' : 'worker_network_error'
    });
  } finally {
    clearTimeout(timer);
  }
};
