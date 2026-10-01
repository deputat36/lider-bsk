import { orderStatusUiModel } from './order-status-ui-model-v1.js';
import { orderOperationsAvailable } from './operational-server-contract-v1.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const labels = { production: 'Начать работу', ready: 'Работа готова', issued: 'Передать клиенту', closed: 'Закрыть заказ', cancelled: 'Отменить заказ' };
export const orderOperationErrors = {
  source_changed: 'Заказ уже изменился. Обновите карточку и проверьте его состояние.',
  forbidden: 'У вашей роли нет права выполнить это действие.',
  inactive_profile: 'Профиль отключён. Действие не выполнено.',
  invalid_payload: 'Проверьте дату, комментарий и подтверждения.',
  order_terminal: 'Заказ уже закрыт или отменён.',
  invalid_transition: 'Из текущего состояния этот переход недоступен. Обновите карточку.',
  layout_not_ready: 'Сначала согласуйте макет или укажите, почему дизайн не требуется.',
  design_task_active: 'Сначала завершите или отмените открытую дизайн-задачу.',
  work_not_completed: 'Осталась незавершённая работа по дизайну или производству.',
  installation_not_completed: 'Сначала завершите монтаж.',
  closing_checklist_required: 'Подтвердите выдачу, проверку расходов и документов.',
  unpaid_order: 'Остался долг. Внесите оплату; владелец может закрыть заказ с причиной сохранения долга.',
  overpayment_unresolved: 'Есть переплата. Сначала выполните возврат и сверку с клиентом.',
  idempotency_conflict: 'Этот ключ уже использован для другого действия. Обновите карточку.',
};

export function orderOperationOptions(order) {
  const model = orderStatusUiModel(order.status);
  // Only expose explicit business commands; payment status is derived from money records.
  const next = { new: ['production','cancelled'], layout_review: ['production','cancelled'], production: ['ready','cancelled'], ready: ['issued'], issued: ['closed'] }[model.key] || [];
  return next.filter(key => model.transitions.some(t => t.key === key)).map(key => ({ key, label: labels[key] }));
}

export function renderOrderOperations(order, enabled, canTransition, canUpdate) {
  if (!enabled) return '';
  const terminal = orderStatusUiModel(order.status).terminal;
  const buttons = !terminal && canTransition ? orderOperationOptions(order).map(x => `<button type="button" data-order-operation="${x.key}"${x.key === 'cancelled' ? '' : ' class="v4-primary"'}>${x.label}</button>`).join('') : '';
  const layoutButton = !terminal && canUpdate && ['Новый','Макет на согласовании'].includes(order.status) && order.layout_status !== 'Не требуется' ? '<button type="button" data-order-operation="layout">Дизайн не требуется</button>' : '';
  return `<section class="v4-order-modal-section" data-order-operations><h3>Работа с заказом</h3><p>Выполнение, передача клиенту и оплата учитываются отдельно.</p><div class="v4-order-modal-actions">${buttons}${layoutButton}${!terminal && canUpdate ? '<button type="button" data-order-operation="edit">Изменить срок / комментарий</button>' : ''}</div><div data-order-operation-editor></div><details data-order-history><summary>История действий</summary><div data-order-history-content>История загрузится при открытии.</div></details></section>`;
}

// One pending command survives response loss and reload; no business text in storage.
export async function prepareOrderOperation({ actorId, order, action, payload, storage = globalThis.sessionStorage, crypt = globalThis.crypto }) {
  const digest = [...new Uint8Array(await crypt.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({ actorId, action, payload }))))].map(x => x.toString(16).padStart(2,'0')).join('');
  const key = `leader-order-pending-v1:${actorId}:${order.id}:${digest}`;
  const saved = JSON.parse(storage.getItem(key) || 'null');
  const meta = saved?.request_id && saved?.expected_updated_at ? saved : { request_id: crypt.randomUUID(), expected_updated_at: order.updated_at };
  storage.setItem(key, JSON.stringify(meta));
  return { key, command: { action, ...meta, payload } };
}

export function mountOrderOperations(root, { order, client, url, actorId, role, refresh }) {
  if (!root || !orderOperationsAvailable(url)) return { isBusy: () => false };
  const editor = root.querySelector('[data-order-operation-editor]');
  let inFlight = false, uncertain = false, prepared = null;
  const message = text => { const el = editor.querySelector('[role="status"]'); if (el) el.textContent = text; };
  root.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button || inFlight || uncertain) return;
    if (button.hasAttribute('data-order-operation-reload')) { refresh(''); return; }
    if (button.hasAttribute('data-order-operation-dismiss')) { editor.innerHTML = ''; root.querySelector('[data-order-operation]')?.focus(); return; }
    const target = button.dataset.orderOperation;
    if (!target) return;
    prepared = null;
    const isClose = target === 'closed';
    editor.innerHTML = `<form data-order-operation-form data-target="${target}"><h4>${esc(labels[target] || (target === 'layout' ? 'Дизайн не требуется' : 'Изменить срок / комментарий'))}</h4><fieldset class="v4-finance-fields">
      ${target === 'edit' ? `<label>Срок<input type="date" name="deadline" value="${esc(order.deadline || '')}"></label>` : ''}
      <label class="v4-finance-wide">${target === 'issued' ? 'Кому и как передан результат' : target === 'layout' ? 'Почему дизайн не требуется' : 'Комментарий'}<textarea name="comment" rows="2" maxlength="2000" ${['issued','cancelled','layout'].includes(target) ? 'required minlength="3"' : ''}></textarea></label>
      ${isClose ? '<label class="v4-finance-confirm v4-finance-wide"><input name="expenses_reviewed" type="checkbox" required>Все расходы внесены и проверены</label><label class="v4-finance-confirm v4-finance-wide"><input name="documents_reviewed" type="checkbox" required>Документы и передача результата проверены</label>' : ''}
      ${isClose && Number(order.balance)>0 && ['owner','admin'].includes(role) ? '<label class="v4-finance-wide">Причина закрытия с долгом (если долг нужно сохранить)<textarea name="debt_reason" minlength="5" maxlength="1000" rows="2"></textarea></label><p class="v4-finance-wide">Закрытие не списывает долг и не создаёт оплату.</p>' : ''}
      ${['production','cancelled','closed'].includes(target) ? '<label class="v4-finance-confirm v4-finance-wide"><input type="checkbox" name="confirm" required>Подтверждаю действие</label>' : ''}
      </fieldset><p role="status" aria-live="polite"></p><div class="v4-order-modal-actions"><button class="v4-primary" type="submit">Сохранить</button><button type="button" data-order-operation-dismiss>Не сохранять</button><button type="button" data-order-operation-reload>Обновить карточку</button></div></form>`;
    editor.querySelector('textarea,input')?.focus();
  });
  root.addEventListener('submit', async event => {
    const form = event.target.closest('[data-order-operation-form]');
    if (!form) return;
    event.preventDefault(); if (inFlight || !form.reportValidity()) return;
    try {
      if (!prepared) {
        const data = new FormData(form), target = form.dataset.target;
        const action = target === 'layout' ? 'order.layout_not_required' : target === 'edit' ? 'order.update' : 'order.transition';
        const payload = { order_id: order.id, comment: String(data.get('comment') || '').trim() };
        if (target === 'edit') payload.deadline = data.get('deadline') || null;
        else if (target !== 'layout') payload.target_status = target;
        if (target === 'closed') { payload.expenses_reviewed = data.has('expenses_reviewed'); payload.documents_reviewed = data.has('documents_reviewed'); if (data.get('debt_reason')) payload.debt_reason = String(data.get('debt_reason')).trim(); }
        prepared = await prepareOrderOperation({ actorId, order, action, payload });
      }
      inFlight = true; form.querySelector('fieldset').disabled = true;
      form.querySelector('[type="submit"]').disabled = true;
      message('Сохраняю действие…');
      let timer;
      let response;
      try { response = await Promise.race([client.functions.invoke('leader-crm-orders', { body: prepared.command }), new Promise((_,reject) => { timer=setTimeout(() => reject(new Error('timeout')),20000); })]); }
      finally { clearTimeout(timer); }
      let result = response.data;
      if (response.error) { try { result = await response.error.context?.clone().json(); } catch (_) { result = null; } }
      if (result?.ok === true) {
        sessionStorage.removeItem(prepared.key); inFlight = false; uncertain = false;
        await refresh('Действие сохранено в истории.'); return;
      }
      const code = result?.error?.code || result?.error;
      uncertain = !result || Number(response.error?.context?.status) >= 500;
      message(orderOperationErrors[code] || 'Результат пока неизвестен. Повторите сохранение: прежний ключ защитит от дубля.');
    } catch (_) { uncertain = Boolean(prepared); message(prepared ? 'Результат пока неизвестен. Повторите сохранение с тем же ключом.' : 'Не удалось сохранить ключ повтора. Проверьте доступность хранилища браузера.'); }
    finally {
      inFlight = false;
      const submit = form.querySelector('[type="submit"]'); submit.disabled = false; submit.textContent = uncertain ? 'Проверить / повторить' : 'Сохранить';
      form.querySelector('fieldset').disabled = uncertain;
      if (!uncertain && prepared) { sessionStorage.removeItem(prepared.key); prepared = null; }
    }
  });
  root.querySelector('[data-order-history]').addEventListener('toggle', async event => {
    if (!event.target.open || event.target.dataset.loaded) return;
    const content = root.querySelector('[data-order-history-content]');
    content.textContent = 'Загружаю историю…';
    const { data, error } = await client.functions.invoke('leader-crm-orders', { body: { action: 'events', order_id: order.id } });
    if (error || !Array.isArray(data?.events)) { content.textContent = 'История недоступна. Закройте и откройте блок для повтора.'; return; }
    event.target.dataset.loaded = 'true';
    content.innerHTML = data.events.map(row => `<article class="v4-order-finance-row"><b>${esc(row.action === 'order.layout_not_required' ? 'Дизайн не требуется' : row.action === 'order.update' ? 'Изменены условия заказа' : row.data?.new_status)}</b><small>${esc(new Date(row.created_at).toLocaleString('ru-RU'))} · сотрудник ${esc(String(row.user_id || '').slice(0,8))}</small>${row.data?.comment ? `<p>${esc(row.data.comment)}</p>` : ''}</article>`).join('') || 'Пока нет новых действий.';
  });
  return { isBusy: () => inFlight || uncertain };
}
