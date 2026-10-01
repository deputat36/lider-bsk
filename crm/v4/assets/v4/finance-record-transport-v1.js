import { orderOperationsAvailable } from './operational-server-contract-v1.js';
import { FINANCE_ACTIONS } from './finance-record-model-v1.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const pending = new Map();
export function financeWriteAvailable(url, allowed) {
  return allowed === true && orderOperationsAvailable(url);
}
export function financeErrorMessage(code) {
  return ({
    source_changed: 'Заказ или запись уже изменились. Обновите карточку перед повторным вводом.',
    forbidden: 'У вашей роли нет права изменять финансы.',
    inactive_profile: 'Доступ профиля отключён. Запись не сохранена.',
    missing_or_invalid_jwt: 'Сессия закончилась. Войдите снова.',
    invalid_payload: 'Проверьте сумму, дату, категорию и способ оплаты.',
    record_not_found: 'Финансовая запись не найдена в этом заказе.',
    record_already_void: 'Запись уже отменена. Обновите карточку.',
    order_unavailable: 'Заказ не найден или находится в архиве.',
    idempotency_conflict: 'Ключ повтора относится к другой операции. Обновите карточку и проверьте историю.',
    production_locked: 'Ввод финансов пока не включён в рабочем контуре.',
    storage_unavailable: 'Не удалось сохранить ключ безопасного повтора. Разрешите хранилище браузера и повторите.',
    network_error: 'Результат пока неизвестен. Повторите сохранение: тот же ключ защитит от дубля.',
  })[code] || 'Не удалось сохранить запись. Повтор использует прежний ключ и не создаст дубль.';
}

// Persist only a digest and technical IDs; comments and amounts stay out of storage.
export async function prepareFinanceCommand({ actorId, action, payload, expectedUpdatedAt, storage = globalThis.sessionStorage, cryptoObject = globalThis.crypto }) {
  if (!UUID.test(actorId) || !FINANCE_ACTIONS.includes(action) || !UUID.test(payload?.order_id) || !Number.isFinite(Date.parse(expectedUpdatedAt))) throw new Error('invalid_payload');
  const bytes = new TextEncoder().encode(JSON.stringify({ actorId, action, payload }));
  const digest = [...new Uint8Array(await cryptoObject.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2, '0')).join('');
  const key = `leader-finance-pending-v1:${actorId}:${payload.order_id}:${digest}`;
  let saved = pending.get(key);
  try { if (!saved) saved = JSON.parse(storage.getItem(key) || 'null'); } catch (_) { throw new Error('storage_unavailable'); }
  if (!saved || !UUID.test(saved.request_id) || !Number.isFinite(Date.parse(saved.expected_updated_at))) {
    saved = { request_id: cryptoObject.randomUUID(), expected_updated_at: expectedUpdatedAt };
  }
  try { storage.setItem(key, JSON.stringify(saved)); } catch (_) { throw new Error('storage_unavailable'); }
  pending.set(key, saved);
  return { key, command: { action, request_id: saved.request_id, expected_updated_at: saved.expected_updated_at, payload: { ...payload } } };
}
export function completeFinanceCommand(key, storage = globalThis.sessionStorage) {
  pending.delete(key);
  try { storage.removeItem(key); } catch (_) { /* A retained key safely replays the existing operation. */ }
}

export async function invokeFinanceCommand({ client, url, allowed, command, timeoutMs = 20000 }) {
  if (!financeWriteAvailable(url, allowed)) return { ok: false, code: 'production_locked', uncertain: false };
  const session = await client.auth.getSession();
  if (session?.error || !session?.data?.session?.access_token) return { ok: false, code: 'missing_or_invalid_jwt', uncertain: false };
  let timer;
  try {
    const result = await Promise.race([
      client.functions.invoke('leader-crm-finance', { body: command }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('network_error')), timeoutMs); })
    ]);
    if (result.error) {
      let body = null;
      try { body = await result.error.context?.clone?.().json(); } catch (_) { /* network failure */ }
      const code = body?.error?.code || body?.error || 'network_error';
      return { ok: false, code, uncertain: !body || Number(result.error.context?.status) >= 500 };
    }
    if (result.data?.ok !== true) return { ok: false, code: result.data?.error?.code || 'finance_write_failed', uncertain: true };
    return result.data;
  } catch (_) { return { ok: false, code: 'network_error', uncertain: true }; }
  finally { clearTimeout(timer); }
}
