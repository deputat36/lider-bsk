import { supabaseClient } from './supabase-client.js';
import { timeout, friendlyError } from './api.js';
import { v4State, setState } from './state.js';
import { byId, setStatus, toast } from './ui.js';
import { clearLeadUrl } from './router.js';

const FULL_LEAD_FIELDS = 'id,name,phone,source,message,page_url,status,payload,created_at,updated_at,service,contact_preference,city,budget,utm_source,utm_medium,utm_campaign,utm_content,utm_term,assigned_to,converted_order_id,converted_client_id,last_contact_at,next_contact_at,converted_at,reject_reason,lead_quality,estimated_amount';
const QUICK_STATUSES = ['В работе', 'Уточнение деталей', 'Расчёт подготовлен', 'КП отправлено', 'Ждём ответ', 'Нужно пересчитать', 'Согласовано', 'Отказ', 'Спам'];
const DANGER_STATUSES = new Set(['Отказ', 'Спам']);

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}

function formatDate(value) {
  if (!value) return '—';
  try { return new Date(value).toLocaleString('ru-RU'); } catch (_) { return String(value); }
}

function formatInputDateTime(value) {
  if (!value) return '';
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const offsetDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return offsetDate.toISOString().slice(0, 16);
  } catch (_) { return ''; }
}

function money(value) {
  const number = Number(value || 0);
  return number ? `${Math.round(number).toLocaleString('ru-RU')} ₽` : '—';
}

function phoneHref(phone) {
  const cleaned = String(phone || '').replace(/[^\d+]/g, '');
  return cleaned ? `tel:${cleaned}` : '';
}

function payloadRows(payload) {
  if (!payload || typeof payload !== 'object') return '';
  return Object.entries(payload)
    .slice(0, 12)
    .map(([key, value]) => `<div><dt>${esc(key)}</dt><dd>${esc(typeof value === 'object' ? JSON.stringify(value) : value)}</dd></div>`)
    .join('');
}

function statusHint(lead) {
  const status = lead.status || 'Новая';
  if (lead.converted_order_id || status === 'Создан заказ') return 'Заказ уже создан. Дальше контролируйте производство, оплату и выдачу результата.';
  if (status === 'Новая') return 'Начните с звонка или сообщения в MAX, уточните задачу и переведите заявку в работу.';
  if (status === 'В работе') return 'Зафиксируйте потребность клиента и подготовьте расчёт.';
  if (status === 'Уточнение деталей') return 'Заполните размеры, материал, сроки, монтаж и всё, что влияет на цену.';
  if (status === 'КП отправлено') return 'Поставьте следующий контакт и вернитесь к клиенту, если он не ответит.';
  if (status === 'Ждём ответ') return 'Не оставляйте заявку без даты следующего контакта.';
  if (status === 'Согласовано') return 'Откройте карточку согласованного КП и создайте заказ из него.';
  if (['Отказ', 'Спам'].includes(status)) return 'Заявка закрыта. При необходимости верните её в работу одной кнопкой.';
  return 'Следуйте цепочке: потребность → расчёт → КП → согласование → заказ.';
}

function quickStatusButtons(lead) {
  const current = lead.status || 'Новая';
  return QUICK_STATUSES.map((status) => {
    const active = status === current ? ' is-active' : '';
    const danger = DANGER_STATUSES.has(status) ? ' is-danger' : '';
    return `<button type="button" class="v4-chip-button${active}${danger}" data-lead-status="${esc(status)}">${esc(status)}</button>`;
  }).join('');
}

function nextContactState(lead) {
  if (!lead.next_contact_at) return { className: 'is-warn', text: 'Следующий контакт не назначен' };
  const time = new Date(lead.next_contact_at).getTime();
  if (Number.isFinite(time) && time < Date.now()) return { className: 'is-error', text: 'Следующий контакт просрочен' };
  return { className: 'is-good', text: 'Следующий контакт назначен' };
}

function nextContactDate(kind) {
  const date = new Date();
  if (kind === 'today17') date.setHours(17, 0, 0, 0);
  if (kind === 'tomorrow') { date.setDate(date.getDate() + 1); date.setHours(10, 0, 0, 0); }
  if (kind === 'plus3d') { date.setDate(date.getDate() + 3); date.setHours(10, 0, 0, 0); }
  if (kind === 'plus7d') { date.setDate(date.getDate() + 7); date.setHours(10, 0, 0, 0); }
  return date;
}

function renderLeadDetails(lead) {
  const phone = phoneHref(lead.phone);
  const payloadHtml = payloadRows(lead.payload);
  const nextContactValue = formatInputDateTime(lead.next_contact_at);
  const contactState = nextContactState(lead);
  return `
    <div class="v4-lead-card-view">
      <div class="v4-card-view-head">
        <div>
          <p class="v4-kicker">Карточка заявки</p>
          <h2>${esc(lead.name || 'Без имени')}</h2>
          <p>${esc(lead.service || 'Услуга не указана')}</p>
        </div>
        <div class="v4-card-view-actions">
          <button id="backToLeadsBtn" type="button">Назад к списку</button>
          <button id="refreshLeadBtn" type="button" class="v4-primary">Обновить</button>
          ${phone ? `<a href="${esc(phone)}">Позвонить</a>` : ''}
        </div>
      </div>

      <section class="v4-subcard v4-action-panel">
        <div>
          <h3>Что сделать сейчас</h3>
          <p>${esc(statusHint(lead))}</p>
        </div>
        <div class="v4-quick-actions" aria-label="Быстрая смена статуса">${quickStatusButtons(lead)}</div>
        <div class="v4-next-contact-box">
          <div class="v4-next-contact-head">
            <div>
              <h4>Следующий контакт</h4>
              <p class="v4-next-contact-state ${contactState.className}">${esc(contactState.text)} · ${formatDate(lead.next_contact_at)}</p>
            </div>
            <button type="button" data-next-contact="clear">Очистить дату</button>
          </div>
          <div class="v4-next-contact-row">
            <label>Дата и время
              <input id="leadNextContactInput" type="datetime-local" value="${esc(nextContactValue)}">
            </label>
            <button type="button" data-next-contact="save" class="v4-primary">Сохранить дату</button>
            <button type="button" data-next-contact="today17">Сегодня 17:00</button>
            <button type="button" data-next-contact="tomorrow">Завтра 10:00</button>
            <button type="button" data-next-contact="plus3d">Через 3 дня</button>
            <button type="button" data-next-contact="plus7d">Через неделю</button>
          </div>
        </div>
      </section>

      <div class="v4-detail-grid">
        <div><dt>Статус</dt><dd>${esc(lead.status || 'Новая')}</dd></div>
        <div><dt>Телефон</dt><dd>${esc(lead.phone || '—')}</dd></div>
        <div><dt>Источник</dt><dd>${esc(lead.source || '—')}</dd></div>
        <div><dt>Связь</dt><dd>${esc(lead.contact_preference || 'MAX / телефон')}</dd></div>
        <div><dt>Город</dt><dd>${esc(lead.city || '—')}</dd></div>
        <div><dt>Бюджет</dt><dd>${money(lead.budget || lead.estimated_amount)}</dd></div>
        <div><dt>Качество</dt><dd>${esc(lead.lead_quality || '—')}</dd></div>
        <div><dt>Дата заявки</dt><dd>${formatDate(lead.created_at)}</dd></div>
        <div><dt>Следующий контакт</dt><dd>${formatDate(lead.next_contact_at)}</dd></div>
      </div>

      <section class="v4-subcard"><h3>Сообщение клиента</h3><p>${esc(lead.message || 'Сообщение не заполнено.')}</p></section>

      <section class="v4-subcard v4-needs-section">
        <div class="v4-subcard-head">
          <div><h3>Потребности клиента</h3><p>Зафиксируйте, что именно нужно клиенту: размеры, материал, сроки, монтаж, дизайн и особые условия.</p></div>
          <span id="needsCounter" class="v4-muted">Потребностей: 0</span>
        </div>
        <div id="needsList" class="v4-needs-list"><div class="v4-empty">Потребности пока не загружены.</div></div>
        <div class="v4-need-form-card"><h4>Добавить потребность</h4><div id="needFormBox"></div></div>
      </section>

      <section id="calculationsBox" class="v4-calculations-host"><div class="v4-empty">Расчёты загрузятся после открытия карточки.</div></section>
      <section id="offersBox" class="v4-offers-host"><div class="v4-empty">Коммерческие предложения загрузятся после открытия карточки.</div></section>

      <section class="v4-subcard">
        <h3>Ссылки и источник</h3>
        <dl class="v4-detail-grid">
          <div><dt>Страница</dt><dd>${lead.page_url ? `<a href="${esc(lead.page_url)}" target="_blank" rel="noopener">Открыть</a>` : '—'}</dd></div>
          <div><dt>UTM source</dt><dd>${esc(lead.utm_source || '—')}</dd></div>
          <div><dt>UTM medium</dt><dd>${esc(lead.utm_medium || '—')}</dd></div>
          <div><dt>UTM campaign</dt><dd>${esc(lead.utm_campaign || '—')}</dd></div>
        </dl>
      </section>

      ${payloadHtml ? `<section class="v4-subcard"><h3>Технические данные формы</h3><dl class="v4-detail-grid">${payloadHtml}</dl></section>` : ''}
    </div>
  `;
}

function showLeadCard() {
  const listSection = byId('leadsSection');
  const cardSection = byId('leadCardSection');
  if (listSection) listSection.classList.add('hidden');
  if (cardSection) cardSection.classList.remove('hidden');
  if (typeof window.v4SetTab === 'function') window.v4SetTab('card');
}

function showLeadList(updateUrl = false) {
  const listSection = byId('leadsSection');
  const cardSection = byId('leadCardSection');
  if (listSection) listSection.classList.remove('hidden');
  if (cardSection) cardSection.classList.add('hidden');
  if (updateUrl) clearLeadUrl();
  if (typeof window.v4SetTab === 'function') window.v4SetTab('leads');
}

function renderLoading() {
  const box = byId('leadCardContent');
  if (box) box.innerHTML = '<div class="v4-empty">Загружаю карточку заявки...</div>';
  showLeadCard();
}

function renderError(message) {
  const box = byId('leadCardContent');
  if (box) box.innerHTML = `<div class="v4-empty is-error">${esc(message)}</div>`;
  showLeadCard();
}

function renderLead(lead) {
  const box = byId('leadCardContent');
  if (!box) return;
  box.innerHTML = renderLeadDetails(lead);
  showLeadCard();
  document.dispatchEvent(new CustomEvent('leader-v4:lead-card-rendered', { detail: { lead } }));
}

async function loadLead(id) {
  if (!id || !v4State.crmReady) return;
  setState({ currentLeadBusy: true, currentLeadError: null });
  renderLoading();
  try {
    const response = await timeout(
      supabaseClient.from('leader_leads').select(FULL_LEAD_FIELDS).eq('id', id).single(),
      16000,
      'Карточка заявки не загрузилась за 16 секунд'
    );
    if (response.error) throw response.error;
    setState({ currentLead: response.data, currentLeadBusy: false, currentLeadError: null });
    renderLead(response.data);
    setStatus('Карточка заявки загружена', 'good');
  } catch (error) {
    const message = friendlyError(error);
    setState({ currentLead: null, currentLeadBusy: false, currentLeadError: message });
    renderError(message);
    setStatus(`Ошибка карточки: ${message}`, 'error');
  }
}

async function updateCurrentLead(patch) {
  const id = v4State.currentLead?.id || v4State.route.leadId;
  if (!id) return;
  const response = await timeout(
    supabaseClient
      .from('leader_leads')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select(FULL_LEAD_FIELDS)
      .single(),
    16000,
    'Заявка не обновилась за 16 секунд'
  );
  if (response.error) throw response.error;
  setState({
    currentLead: response.data,
    leads: (v4State.leads || []).map((lead) => (lead.id === id ? { ...lead, ...response.data } : lead))
  });
  renderLead(response.data);
}

async function handleStatus(status, button) {
  if (button) button.disabled = true;
  try {
    setStatus('Обновляю статус...', 'warn');
    await updateCurrentLead({ status });
    toast('Статус обновлён');
    setStatus('Статус обновлён', 'good');
  } catch (error) {
    toast(friendlyError(error));
    setStatus(`Ошибка статуса: ${friendlyError(error)}`, 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

async function handleNextContact(kind, button) {
  if (button) button.disabled = true;
  try {
    let value = null;
    if (kind === 'save') {
      const inputValue = byId('leadNextContactInput')?.value || '';
      value = inputValue ? new Date(inputValue).toISOString() : null;
    } else if (kind !== 'clear') {
      value = nextContactDate(kind).toISOString();
    }
    setStatus('Сохраняю следующий контакт...', 'warn');
    await updateCurrentLead({ next_contact_at: value, status: v4State.currentLead?.status === 'Новая' ? 'Ждём ответ' : v4State.currentLead?.status });
    toast('Следующий контакт сохранён');
    setStatus('Следующий контакт сохранён', 'good');
  } catch (error) {
    toast(friendlyError(error));
    setStatus(`Ошибка контакта: ${friendlyError(error)}`, 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

function bindLeadCardEvents() {
  byId('leadCardSection')?.addEventListener('click', (event) => {
    if (event.target.closest('#backToLeadsBtn')) { showLeadList(true); return; }
    if (event.target.closest('#refreshLeadBtn')) { loadLead(v4State.route.leadId); return; }
    const statusButton = event.target.closest('[data-lead-status]');
    if (statusButton) { handleStatus(statusButton.dataset.leadStatus, statusButton); return; }
    const contactButton = event.target.closest('[data-next-contact]');
    if (contactButton) { handleNextContact(contactButton.dataset.nextContact, contactButton); }
  });
  document.addEventListener('leader-v4:route-change', (event) => {
    const id = event.detail?.leadId || null;
    if (id) loadLead(id);
    else showLeadList(false);
  });
  document.addEventListener('leader-v4:crm-ready', () => {
    if (v4State.route.leadId) loadLead(v4State.route.leadId);
  });
}

function bootLeadCard() {
  bindLeadCardEvents();
  if (v4State.crmReady && v4State.route.leadId) loadLead(v4State.route.leadId);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootLeadCard);
else bootLeadCard();
