import webpush from 'web-push';
declare const EdgeRuntime: { waitUntil(work: Promise<unknown>): void } | undefined;

const ORIGINS = ['https://www.lider-bsk.ru', 'https://lider-bsk.ru'];
const PROJECTS = ['https://ofewxuqfjhamgerwzull.supabase.co', 'https://otulfnouybahfnsycxqn.supabase.co'];
const ACTIONS = new Set(['status', 'subscribe', 'unsubscribe', 'test']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ENDPOINT = /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)\/[^\s#@]+$/;

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin') || '';
  const headers = { 'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0], 'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-client-info', 'Access-Control-Allow-Methods': 'POST,OPTIONS', 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin' };
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === 'OPTIONS') return reply(200, {});
  if (req.method !== 'POST') return reply(405, { ok: false, error: 'method_not_allowed' });
  if (origin && !ORIGINS.includes(origin)) return reply(403, { ok: false, error: 'origin_not_allowed' });
  const url = Deno.env.get('SUPABASE_URL') || '', service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '', anon = Deno.env.get('SUPABASE_ANON_KEY') || '';
  if (!PROJECTS.includes(url) || !service || !anon) return reply(503, { ok: false, error: 'not_configured' });
  const rpc = async (name: string, payload: unknown) => {
    const response = await fetch(`${url}/rest/v1/rpc/${name}`, { method: 'POST', headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw Error('notification_service_unavailable');
    return await response.json();
  };
  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).length > 8192) return reply(413, { ok: false, error: 'payload_too_large' });
    let body;
    try { body = JSON.parse(raw); } catch (_) { return reply(400, { ok: false, error: 'invalid_payload' }); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return reply(400, { ok: false, error: 'invalid_payload' });
    const token = req.headers.get('x-leader-notification-worker');
    if (token) {
      if (body.action !== 'dispatch' || !/^[0-9a-f]{32}\.[0-9]{10}\.[0-9a-f]{64}$/.test(token)) return reply(403, { ok: false, error: 'worker_denied' });
      const worker = (action: string, data: unknown = {}) => rpc('leader_notification_worker_rpc', { p_token: token, p_action: action, p_data: data });
      const claimed = await worker('claim');
      if (claimed.ok !== true) return reply(403, { ok: false, error: 'worker_denied' });
      const jobs = Array.isArray(claimed.deliveries) ? claimed.deliveries.slice(0, 8) : [];
      const process = async () => {
        await Promise.all(jobs.map(async (job: { id: string; lease: string }) => {
          if (!UUID.test(job.id) || !UUID.test(job.lease)) return;
          try {
            const result = await worker('prepare', job), delivery = result.delivery;
            if (result.ok !== true || !delivery) return;
            let status = 400, retryAfter = 0;
            if (ENDPOINT.test(delivery.subscription?.endpoint || '')) {
              try {
                const sent = await webpush.sendNotification(delivery.subscription, JSON.stringify(delivery.payload), { vapidDetails: { subject: 'https://www.lider-bsk.ru', publicKey: delivery.keys.publicKey, privateKey: delivery.keys.privateKey }, TTL: 300, urgency: 'high', timeout: 5000 });
                status = Number(sent.statusCode) || 201;
              } catch (error) {
                const failure = error as { statusCode?: number; headers?: Record<string, string> };
                status = Number(failure?.statusCode) || 0;
                retryAfter = Math.min(3600, Math.max(0, Number(failure?.headers?.['retry-after']) || 0));
              }
            }
            await worker('finish', { ...job, status, retry_after: retryAfter });
          } catch (_) { /* The durable lease is recovered by the retry job. No endpoint or key is logged. */ }
        }));
        await worker('continue').catch(() => null);
      };
      if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(process());
      else await process();
      return reply(202, { ok: true, claimed: jobs.length });
    }
    if (!ACTIONS.has(body.action) || Object.keys(body).some(key => !['action', 'payload'].includes(key))) return reply(400, { ok: false, error: 'invalid_action' });
    if (body.payload !== undefined && (!body.payload || typeof body.payload !== 'object' || Array.isArray(body.payload))) return reply(400, { ok: false, error: 'invalid_payload' });
    const authorization = req.headers.get('authorization') || '';
    if (!/^Bearer\s+\S+$/i.test(authorization)) return reply(401, { ok: false, error: 'auth_required' });
    const userResponse = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anon, Authorization: authorization }, signal: AbortSignal.timeout(8000) });
    if (!userResponse.ok) return reply(401, { ok: false, error: 'auth_required' });
    const actor = await userResponse.json();
    if (!UUID.test(actor?.id || '')) return reply(401, { ok: false, error: 'auth_required' });
    const command = (action: string, data: unknown = {}) => rpc('leader_notifications_command_rpc', { p_actor_id: actor.id, p_action: action, p_data: data });
    if (body.action === 'status') {
      const status = await command('status', body.payload || {});
      if (status.ok !== true) return reply(403, { ok: false, error: 'forbidden' });
      if (!status.public_key) {
        const initialized = await command('keys.ensure', webpush.generateVAPIDKeys());
        if (initialized.ok !== true) return reply(503, { ok: false, error: 'key_initialization_failed' });
      }
    }
    const result = await command(body.action, body.payload || {});
    return reply(result.ok === true ? 200 : result.error === 'forbidden' ? 403 : 400, result);
  } catch (_) { return reply(503, { ok: false, error: 'notification_service_unavailable' }); }
});
