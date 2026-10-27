import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes, createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createECDH, randomBytes } from 'node:crypto';
const require = createRequire(new URL('../supabase/functions/leader-crm-notifications/package.json', import.meta.url)), webpush = require('web-push');
const actor = '90000000-0000-4000-8000-000000000901';
const job = { id: '90000000-0000-4000-8000-000000000902', lease: '90000000-0000-4000-8000-000000000903' };
const keys = webpush.generateVAPIDKeys(), client = createECDH('prime256v1'); client.generateKeys();
const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/synthetic-only', keys: { p256dh: client.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') } };
const encrypted = webpush.generateRequestDetails(subscription, JSON.stringify({ title: 'Synthetic' }), { vapidDetails: { subject: 'https://www.lider-bsk.ru', ...keys }, TTL: 300 });
assert.ok(Buffer.isBuffer(encrypted.body) && encrypted.body.length > 30);
assert.ok(encrypted.headers.Authorization.startsWith('vapid '));
let handler, denied = false, knownKeys = false, privateEndpoint = false, finished = [], sent = 0, claimed = 0;
const originalFetch = globalThis.fetch, originalSend = webpush.sendNotification;
globalThis.Deno = { env: { get: key => ({ SUPABASE_URL: 'https://otulfnouybahfnsycxqn.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service', SUPABASE_ANON_KEY: 'synthetic-anon' })[key] }, serve: fn => { handler = fn; } };
globalThis.fetch = async (url, init) => {
  assert.ok(init.signal);
  if (url.endsWith('/auth/v1/user')) return init.headers.Authorization === 'Bearer valid-synthetic-user' ? Response.json({ id: actor }) : new Response('', { status: 401 });
  const command = JSON.parse(init.body);
  assert.equal(init.headers.apikey, 'synthetic-service');
  if (url.endsWith('leader_notifications_command_rpc')) {
    assert.equal(command.p_actor_id, actor, 'Actor must come from Auth, never the body');
    if (denied) return Response.json({ ok: false, error: 'forbidden' });
    if (command.p_action === 'keys.ensure') { assert.equal(command.p_data.privateKey.length, 43); knownKeys = true; return Response.json({ ok: true }); }
    return Response.json({ ok: true, enabled: true, public_key: knownKeys ? keys.publicKey : null, devices: [] });
  }
  if (command.p_action === 'claim') { claimed++; return Response.json({ ok: true, deliveries: [job] }); }
  if (command.p_action === 'prepare') return Response.json({ ok: true, delivery: { subscription: privateEndpoint ? { ...subscription, endpoint: 'http://127.0.0.1/private' } : subscription, keys, payload: { actor_id: actor, title: 'Synthetic', body: 'No personal data', url: 'https://www.lider-bsk.ru/crm/v4/' } } });
  if (command.p_action === 'finish') finished.push(command.p_data.status);
  return Response.json({ ok: true });
};
webpush.sendNotification = async (sub, payload, options) => { assert.equal(sub.endpoint, subscription.endpoint); assert.equal(options.timeout, 5000); assert.equal(JSON.parse(payload).actor_id, actor); sent++; return { statusCode: 201 }; };
const source = fs.readFileSync(new URL('../supabase/functions/leader-crm-notifications/index.ts', import.meta.url), 'utf8').replace("'web-push'", JSON.stringify(pathToFileURL(require.resolve('web-push')).href));
await import('data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(source, { mode: 'transform' })).toString('base64'));
async function request(body, headers = {}) { const r = await handler(new Request('https://example.invalid', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })); return { status: r.status, body: await r.json() }; }
try {
  assert.equal((await request({ action: 'status' })).status, 401);
  assert.equal((await request({ action: 'status' }, { Authorization: 'Bearer expired' })).status, 401);
  assert.equal((await request({ action: 'status', actor_id: actor }, { Authorization: 'Bearer valid-synthetic-user' })).status, 400);
  denied = true; assert.equal((await request({ action: 'status' }, { Authorization: 'Bearer valid-synthetic-user' })).status, 403); assert.equal(knownKeys, false);
  denied = false; const status = await request({ action: 'status' }, { Authorization: 'Bearer valid-synthetic-user' });
  assert.equal(status.status, 200); assert.equal(knownKeys, true); assert.equal(status.body.privateKey, undefined);
  assert.equal((await request({ action: 'keys.ensure' }, { Authorization: 'Bearer valid-synthetic-user' })).status, 400);
  assert.equal((await request({ action: 'dispatch' }, { 'x-leader-notification-worker': 'bad' })).status, 403); assert.equal(claimed, 0);
  const ticket = 'a'.repeat(32) + '.' + Math.floor(Date.now()/1000) + '.' + 'b'.repeat(64);
  assert.equal((await request({ action: 'dispatch' }, { 'x-leader-notification-worker': ticket })).status, 202);
  assert.equal(sent, 1); assert.deepEqual(finished, [201]);
  privateEndpoint = true; await request({ action: 'dispatch' }, { 'x-leader-notification-worker': ticket });
  assert.equal(sent, 1); assert.equal(finished.at(-1), 400);
  console.log('Actual notification Edge: fresh Auth, role denial, private VAPID, encrypted request, worker auth, endpoint guard, bounded delivery and receipt status PASS.');
} finally { globalThis.fetch = originalFetch; webpush.sendNotification = originalSend; delete globalThis.Deno; }
