import { EXPENSE_CATEGORIES, FINANCE_METHODS, PAYMENT_CATEGORIES, financeCreatePayload } from './finance-record-model-v1.js';
import { completeFinanceCommand, financeErrorMessage, financeWriteAvailable, invokeFinanceCommand, prepareFinanceCommand } from './finance-record-transport-v1.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const options = values => values.map(value => `<option>${esc(value)}</option>`).join('');
const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow' }).format(new Date());
const money = value => `${Number(value).toLocaleString('ru-RU', { maximumFractionDigits: 2 })} ₽`;

export function financeVoidButton(kind, row, enabled) {
  const status = String(kind === 'payment' ? row.payment_status : row.status).trim().toLowerCase();
  return enabled && row.updated_at && ['проведён', 'проведен', 'posted'].includes(status)
    ? `<button type="button" data-finance-void="${esc(row.id)}" data-finance-kind="${kind}">Отменить запись</button>` : '';
}

// Listeners belong to this section and disappear with the card. Nothing runs at CRM boot.
export function mountFinanceWriter(root, { order, payments, expenses, client, url, actorId, canWrite, refresh }) {
  if (!root || !financeWriteAvailable(url, canWrite())) return { isBusy: () => false };
  const editor = root.querySelector('[data-finance-editor]');
  let inFlight = false;
  let prepared = null;
  let uncertain = false;
  let saved = false;
  const setMessage = (message, error = false) => {
    const node = editor.querySelector('[data-finance-message]');
    if (node) { node.textContent = message; node.dataset.error = String(error); }
  };
  function openForm(kind, record) {
    if (inFlight || uncertain) return;
    prepared = null;
    const isVoid = Boolean(record);
    editor.innerHTML = `<form data-finance-form data-kind="${kind}"${isVoid ? ` data-record-id="${esc(record.id)}"` : ''}>
      <h4 tabindex="-1">${isVoid ? 'Отменить ' + (kind === 'payment' ? 'оплату' : 'расход') : kind === 'payment' ? 'Внести оплату' : 'Внести расход'}</h4>
      <fieldset class="v4-finance-fields">
      ${isVoid ? `<p class="v4-finance-wide">${money(record.amount)}. Запись останется в истории со статусом «Отменён». Итоги заказа будут пересчитаны.</p><label class="v4-finance-wide">Причина отмены<textarea name="reason" required minlength="3" maxlength="1000" rows="2"></textarea></label><label class="v4-finance-confirm v4-finance-wide"><input type="checkbox" name="confirm" required>Подтверждаю отмену этой записи</label>` : `
      <label>Сумма, ₽<input name="amount" inputmode="decimal" type="text" required autocomplete="off" placeholder="0,00"></label>
      <label>Дата фактической операции<input name="date" type="date" min="2000-01-01" max="${today()}" value="${today()}" required></label>
      <label>Способ оплаты<select name="method" required><option value="">Выберите способ</option>${options(FINANCE_METHODS)}</select></label>
      <label>Категория<select name="category" required>${options(kind === 'payment' ? PAYMENT_CATEGORIES : EXPENSE_CATEGORIES)}</select></label>
      <label class="v4-finance-wide">Комментарий <span>(необязательно)</span><textarea name="comment" maxlength="2000" rows="2"></textarea></label>`}
      </fieldset>
      <p data-finance-message role="status" aria-live="polite"></p>
      <div class="v4-order-modal-actions"><button type="submit" class="v4-primary">${isVoid ? 'Подтвердить отмену' : 'Сохранить'}</button><button type="button" data-finance-dismiss>Не сохранять</button></div>
    </form>`;
    editor.querySelector(isVoid ? '[name="reason"]' : '[name="amount"]').focus();
  }
  root.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-finance-new')) openForm(button.dataset.financeNew);
    if (button.hasAttribute('data-finance-void')) {
      const kind = button.dataset.financeKind;
      const record = (kind === 'payment' ? payments : expenses).find(row => row.id === button.dataset.financeVoid);
      if (record) openForm(kind, record);
    }
    if (button.hasAttribute('data-finance-dismiss') && !inFlight && !uncertain) {
      editor.innerHTML = '';
      root.querySelector('[data-finance-new]')?.focus();
    }
  });
  root.addEventListener('submit', async event => {
    const form = event.target.closest('[data-finance-form]');
    if (!form) return;
    event.preventDefault();
    if (inFlight) return;
    const fieldset = form.querySelector('fieldset');
    const submit = form.querySelector('[type="submit"]');
    const dismiss = form.querySelector('[data-finance-dismiss]');
    inFlight = true;
    try {
      if (!canWrite()) { setMessage(financeErrorMessage('forbidden'), true); return; }
      if (!prepared) {
        const data = new FormData(form);
        const kind = form.dataset.kind;
        const recordId = form.dataset.recordId;
        let payload;
        if (recordId) {
          const record = (kind === 'payment' ? payments : expenses).find(row => row.id === recordId);
          const reason = String(data.get('reason') || '').trim();
          if (!record || !data.get('confirm') || reason.length < 3 || reason.length > 1000) throw new Error('Укажите причину и подтвердите отмену.');
          payload = { order_id: order.id, kind, record_id: record.id, expected_record_updated_at: record.updated_at, reason };
        } else payload = financeCreatePayload({ orderId: order.id, kind, ...Object.fromEntries(data) });
        prepared = await prepareFinanceCommand({ actorId, action: recordId ? 'finance.record.void' : `finance.${kind}.create`, payload, expectedUpdatedAt: order.updated_at });
      }
      inFlight = true;
      fieldset.disabled = true; submit.disabled = true; dismiss.disabled = true;
      root.querySelectorAll('[data-finance-new],[data-finance-void]').forEach(button => { button.disabled = true; });
      setMessage('Сохраняем…');
      const result = await invokeFinanceCommand({ client, url, allowed: canWrite(), command: prepared.command });
      if (result.ok) {
        saved = true;
        completeFinanceCommand(prepared.key);
        setMessage('Сохранено. Обновляем итоги заказа…');
        inFlight = false;
        await refresh('Финансовая запись сохранена. Итоги обновлены.');
        return;
      }
      uncertain = result.uncertain === true;
      if (!uncertain) { completeFinanceCommand(prepared.key); prepared = null; }
      const request = prepared?.command.request_id;
      setMessage(financeErrorMessage(result.code) + (request ? ` Номер операции: ${request}.` : ''), true);
      submit.textContent = uncertain ? 'Повторить сохранение' : 'Сохранить';
      if (['source_changed', 'record_already_void', 'idempotency_conflict'].includes(result.code)) {
        submit.disabled = true;
        const button = document.createElement('button');
        button.type = 'button'; button.textContent = 'Обновить карточку'; button.dataset.financeReload = '';
        button.addEventListener('click', () => refresh());
        form.querySelector('.v4-order-modal-actions').append(button);
      } else submit.disabled = false;
    } catch (error) {
      setMessage(financeErrorMessage(error.message) === financeErrorMessage('unknown') ? error.message : financeErrorMessage(error.message), true);
      submit.disabled = saved;
    } finally {
      inFlight = false;
      if (!saved && root.isConnected && !form.querySelector('[data-finance-reload]')) {
        fieldset.disabled = uncertain; dismiss.disabled = uncertain;
        root.querySelectorAll('[data-finance-new],[data-finance-void]').forEach(button => { button.disabled = uncertain; });
      }
    }
  });
  return { isBusy: () => inFlight };
}
