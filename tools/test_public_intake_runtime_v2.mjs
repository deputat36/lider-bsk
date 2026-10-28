import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { pathToFileURL } from 'node:url';

let handler;
const env = { SUPABASE_URL: 'https://ofewxuqfjhamgerwzull.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-credential' };
globalThis.Deno = { env: { get: name => env[name] }, serve: fn => { handler = fn; } };
const originalFetch = globalThis.fetch;
let calls = [], leads = new Map(), unavailable = false, loseResponse = false;
globalThis.fetch = async (url, init) => {
  assert.equal(init.headers.apikey, env.SUPABASE_SERVICE_ROLE_KEY);
  assert.ok(init.signal, 'Every backend call has a deadline');
  calls.push({ url, ...init });
  if (url.endsWith('leader_public_intake_config_rpc')) return Response.json({ salt: 'synthetic-private-pepper-for-test' });
  if (url.endsWith('leader_public_intake_rate_limit_rpc')) return unavailable ? new Response('', { status: 503 }) : Response.json({ allowed: true });
  if (url.endsWith('/leader_leads')) {
    const lead = JSON.parse(init.body);
    if (leads.has(lead.request_id)) return new Response('23505 duplicate key leader_leads_request_id_key', { status: 409 });
    leads.set(lead.request_id, lead);
    if (loseResponse) { loseResponse = false; throw Error('lost response after commit'); }
  }
  return new Response(null, { status: 204 });
};
const moduleUrl = pathToFileURL(new URL('../supabase/functions/leader-public-lead/rate-limit.ts', import.meta.url).pathname).href;
const source = fs.readFileSync(new URL('../supabase/functions/leader-public-lead/index.ts', import.meta.url), 'utf8').replace("'./rate-limit.ts'", JSON.stringify(moduleUrl));
await import('data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(source, { mode: 'transform' })).toString('base64'));
async function submit(message, id, origin = 'https://www.lider-bsk.ru') {
  const response = await handler(new Request('https://example.invalid', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ message, request_id: id }) }));
  return { status: response.status, body: await response.json() };
}
try {
  for (const length of [2000, 2001, 3000]) {
    const id = `runtime-boundary-${length}`;
    const result = await submit('я'.repeat(length), id);
    assert.equal(result.status, 200);
    assert.equal(leads.get(id).message.length, length);
  }
  calls = [];
  assert.equal((await submit('я'.repeat(3001), 'runtime-boundary-3001')).body.error, 'message_too_long');
  assert.equal(calls.length, 0, 'Invalid input must not write audit/quota/lead');
  assert.equal((await submit('valid', 'runtime-wrong-origin', 'https://wrong.invalid')).status, 403);
  assert.equal(calls.length, 0);
  const invalid = await handler(new Request('https://example.invalid', { method: 'POST', body: 'null' }));
  assert.equal(invalid.status, 400);
  loseResponse = true;
  assert.equal((await submit('Preserve after lost response', 'runtime-lost-response')).body.error, 'insert_unconfirmed');
  assert.equal((await submit('Preserve after lost response', 'runtime-lost-response')).body.duplicate, true);
  assert.equal([...leads.keys()].filter(x => x === 'runtime-lost-response').length, 1);
  unavailable = true;
  assert.equal((await submit('Never bypass the limiter', 'runtime-limiter-down')).status, 503);
  assert.equal(leads.has('runtime-limiter-down'), false);
  console.log('Actual Edge: 2000/2001/3000 retained, 3001 rejected; origin, null body, private salt, deadlines, lost-response replay and fail-closed limiter passed.');
} finally { globalThis.fetch = originalFetch; delete globalThis.Deno; }
