import { supabaseClient } from './supabase-client.js';
import { V4_CONFIG } from './config.js';
import { v4State, subscribeState } from './state.js';

const ROLE = new Set(['owner', 'admin', 'manager']);
let registration, panel, context = '', generation = 0, busy = false, installPrompt, currentStatus, testRequest;
const bounded = (promise, ms = 12000) => {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Время ожидания истекло. Повторите проверку.')), ms); })]).finally(() => clearTimeout(timer));
};
const errors = { disabled: 'Отправка уведомлений ещё не подключена.', forbidden: 'Для вашей роли уведомления недоступны.', auth_required: 'Войдите в CRM и повторите проверку.', device_limit: 'Достигнут предел 10 устройств. Отключите ненужное устройство.', device_owner_conflict: 'Подписка принадлежит другому аккаунту. Отключите её на этом устройстве и включите снова.', rate_limited: 'Проверочное уведомление можно отправлять раз в минуту.', key_changed: 'Настройки уведомлений изменились. Обновите проверку и включите их снова.', notification_service_unavailable: 'Сервис уведомлений временно не отвечает. Повторите проверку.' };
async function worker() {
  if (!registration) registration = bounded(navigator.serviceWorker.register('/crm/v4/sw.js', { scope: '/crm/v4/' }).then(() => navigator.serviceWorker.ready)).catch(error => { registration = null; throw error; });
  return registration;
}
async function actorMessage(actor, ticket) {
  try { const reg = await worker(); if (ticket === generation) reg.active?.postMessage({ type: 'leader:set-actor', actor }); } catch (_) {}
}
async function command(action, payload = {}) {
  const actor = v4State.user?.id, ticket = generation;
  const result = await bounded(supabaseClient.auth.getSession());
  const session = result?.data?.session;
  if (!session?.access_token || session.user?.id !== actor) throw Error(errors.auth_required);
  const response = await fetch(`${V4_CONFIG.supabaseUrl}/functions/v1/leader-crm-notifications`, {
    method: 'POST', headers: { apikey: V4_CONFIG.supabasePublishableKey, Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }), signal: AbortSignal.timeout(12000),
  });
  const body = await response.json();
  if (ticket !== generation || actor !== v4State.user?.id) throw Error('Аккаунт изменился. Повторите действие.');
  if (!response.ok || !body.ok) throw Error(errors[body.error] || 'Не удалось выполнить действие. Повторите проверку.');
  return body;
}
function note(text) { if (panel) panel.querySelector('[data-notification-note]').textContent = text; }
function controls() {
  if (!panel) return;
  panel.querySelector('[data-notification-enable]').disabled = busy || !currentStatus?.enabled || Boolean(currentStatus?.device_id) || Notification.permission === 'denied';
  panel.querySelector('[data-notification-enable]').textContent = currentStatus?.device_id ? 'Уведомления включены' : 'Включить уведомления';
  panel.querySelector('[data-notification-disable]').disabled = busy || !currentStatus?.device_id;
  panel.querySelector('[data-notification-test]').disabled = busy || !currentStatus?.device_id;
  panel.querySelector('[data-notification-refresh]').disabled = busy;
  panel.querySelector('[data-notification-install]').hidden = !installPrompt;
}
async function refresh() {
  const ticket = generation, reg = await worker(), sub = await reg.pushManager.getSubscription();
  if (ticket !== generation) return;
  currentStatus = await command('status', { endpoint: sub?.endpoint || '' });
  if (!currentStatus.enabled) note('Отправка уведомлений ещё не подключена. Установка CRM на главный экран доступна отдельно.');
  else if (Notification.permission === 'denied') note('Уведомления запрещены браузером. Разрешите их в настройках сайта на этом устройстве, затем повторите проверку.');
  else if (currentStatus.device_id) note('Уведомления включены на этом устройстве. Отправьте проверку, чтобы проверить появление сообщения.');
  else note('Включите уведомления о новых заявках. Они смогут приходить при закрытой вкладке CRM.');
  controls();
}
function publicKey(value) { const raw = atob(value.replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, char => char.charCodeAt(0)); }
async function enable() {
  if (Notification.permission !== 'granted' && await Notification.requestPermission() !== 'granted') throw Error('Разрешение не получено. Его можно включить в настройках браузера.');
  const ticket = generation, reg = await worker();
  await refresh();
  if (ticket !== generation || !currentStatus?.enabled || !currentStatus.public_key) throw Error(errors.disabled);
  const sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: publicKey(currentStatus.public_key) });
  if (ticket !== generation) { await sub.unsubscribe(); return; }
  await command('subscribe', { subscription: sub.toJSON(), public_key: currentStatus.public_key, label: /Android/i.test(navigator.userAgent) ? 'Телефон Android' : 'Браузер на устройстве' });
  await actorMessage(v4State.user.id, ticket);
  await refresh();
}
async function disable() {
  const reg = await worker(), id = currentStatus?.device_id;
  if (id) await command('unsubscribe', { id });
  await (await reg.pushManager.getSubscription())?.unsubscribe();
  await refresh();
}
function createPanel() {
  if (panel) return;
  panel = document.createElement('details'); panel.id = 'crmNotifications'; panel.className = 'v4-card';
  panel.style.cssText = 'margin:12px 0;padding:12px;border:1px solid #cbd5e1;border-radius:12px';
  panel.innerHTML = '<summary style="cursor:pointer;min-height:32px;font-weight:700">Уведомления и приложение на телефоне</summary><p data-notification-note role="status" aria-live="polite">Проверяю доступность уведомлений…</p><p>Сообщение на экране не содержит имени, телефона или суммы. Карточка откроется после проверки входа.</p><div style="display:flex;flex-wrap:wrap;gap:8px"><button type="button" class="v4-primary" data-notification-enable>Включить уведомления</button><button type="button" data-notification-test>Отправить проверку</button><button type="button" data-notification-disable>Отключить на устройстве</button><button type="button" data-notification-refresh>Повторить проверку</button><button type="button" data-notification-install hidden>Установить CRM</button></div>';
  for (const button of panel.querySelectorAll('button')) button.style.minHeight = '44px';
  document.getElementById('crmWorkspace')?.prepend(panel);
  panel.addEventListener('click', async event => {
    const button = event.target.closest('button'); if (!button || busy) return;
    if (button.hasAttribute('data-notification-install')) { const prompt = installPrompt; installPrompt = null; controls(); if (prompt) { await prompt.prompt(); await prompt.userChoice; } return; }
    const ticket = generation; busy = true; controls();
    try {
      if (button.hasAttribute('data-notification-enable')) await enable();
      else if (button.hasAttribute('data-notification-disable')) await disable();
      else if (button.hasAttribute('data-notification-test')) {
        testRequest ||= { id: currentStatus.device_id, request_id: crypto.randomUUID() };
        await command('test', testRequest); testRequest = null;
        note('Проверка поставлена в очередь. Если сообщение не появилось, проверьте разрешения уведомлений и ограничения батареи на телефоне.');
      } else await refresh();
    } catch (error) { if (ticket === generation) note(error.message || 'Повторите проверку.'); }
    finally { if (ticket === generation) { busy = false; controls(); } }
  });
}
function update(state) {
  // An unresolved startup session is not a logout. Keep the existing device subscription.
  if (!state.user && state.status !== 'Нужен вход') return;
  const allowed = state.crmReady && state.profile?.is_active === true && ROLE.has(state.profile.role);
  const key = `${state.user?.id || ''}:${state.profile?.role || ''}:${allowed}`;
  if (key === context) return;
  const previousActor = context.split(':')[0]; context = key; const ticket = ++generation;
  busy = false; testRequest = null; currentStatus = null;
  if (!allowed) {
    if (panel) panel.hidden = true;
    void actorMessage(null, ticket);
    if (!state.user || previousActor && previousActor !== state.user.id || state.profileLoaded && (state.profile?.is_active === false || !ROLE.has(state.profile?.role))) {
      void worker().then(async reg => { if (ticket === generation) await (await reg.pushManager.getSubscription())?.unsubscribe(); }).catch(() => null);
    }
    return;
  }
  createPanel(); panel.hidden = false; controls();
  void (async () => {
    if (previousActor && previousActor !== state.user.id) {
      const reg = await worker();
      if (ticket !== generation) return;
      await (await reg.pushManager.getSubscription())?.unsubscribe();
    }
    if (ticket !== generation) return;
    await actorMessage(state.user.id, ticket);
    await refresh();
  })().catch(error => { if (ticket === generation) { note(error.message); controls(); } });
}
export function initNotificationsPwa() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; controls(); });
  subscribeState(update); update(v4State);
}
