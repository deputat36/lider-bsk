// Production is enabled only after database and Edge postflight.
export const CLIENT_REGISTRY_PRODUCTION_ENABLED = true;
export function clientRegistryAvailable(url) {
  return url === 'https://otulfnouybahfnsycxqn.supabase.co' ||
    (CLIENT_REGISTRY_PRODUCTION_ENABLED && url === 'https://ofewxuqfjhamgerwzull.supabase.co');
}
export function clientError(code) {
  return ({ duplicate_phone: 'Этот телефон уже есть в базе. Откройте существующего клиента.',
    source_changed: 'Данные уже изменены другим сотрудником. Загрузите актуальную карточку и повторите правки.',
    forbidden: 'Нет права работать с клиентами.', inactive_profile: 'Доступ профиля отключён.',
    invalid_payload: 'Проверьте имя и телефон. Номер должен содержать от 10 до 15 цифр.',
    client_not_found: 'Клиент не найден. Обновите список.',
    missing_or_invalid_jwt: 'Сессия закончилась. Войдите в CRM снова.',
    storage_unavailable: 'Не удалось сохранить ключ повтора. Разрешите хранилище браузера.',
    production_locked: 'Реестр клиентов ещё не включён в этом окружении.' })[code] ||
    'Не удалось получить подтверждение. Повторите сохранение с теми же данными: ключ повтора защищает от дубля.';
}
export async function prepareClientCommand(actorId, action, payload, revision, storage = sessionStorage) {
  const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({ actorId, action, payload }))))].map(x=>x.toString(16).padStart(2,'0')).join('');
  const key = `leader-client-pending-v1:${actorId}:${digest}`;
  let saved;
  try { saved = JSON.parse(storage.getItem(key) || 'null'); } catch (_) { throw new Error('storage_unavailable'); }
  if (!saved?.request_id) saved = { request_id: crypto.randomUUID(), ...(revision ? { expected_updated_at: revision } : {}) };
  try { storage.setItem(key, JSON.stringify(saved)); } catch (_) { throw new Error('storage_unavailable'); }
  return { key, command: { action, ...saved, payload: { ...payload } } };
}
export function completeClientCommand(key, storage = sessionStorage) { try { storage.removeItem(key); } catch (_) { /* retained receipt remains safe */ } }
export async function invokeClientCommand(client, url, command, timeoutMs = 20000) {
  if (!clientRegistryAvailable(url)) return { ok:false, code:'production_locked', uncertain:false };
  let timer;
  try {
    const result = await Promise.race([client.functions.invoke('leader-crm-clients', { body:command }),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('timeout')),timeoutMs);})]);
    if (result.error) {
      let body; try { body=await result.error.context?.clone?.().json(); } catch (_) { /* transport error */ }
      return { ok:false, code:body?.error?.code || body?.error || 'network_error', existing_client_id:body?.existing_client_id, uncertain:!body || result.error.context?.status>=500 };
    }
    return result.data?.ok === true ? result.data : { ok:false, code:result.data?.error?.code || 'network_error', uncertain:true };
  } catch (_) { return { ok:false, code:'network_error', uncertain:true }; }
  finally { clearTimeout(timer); }
}
