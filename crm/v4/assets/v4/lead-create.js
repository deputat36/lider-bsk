import { supabaseClient } from './supabase-client.js';
import { timeout, friendlyError } from './api.js';
import { v4State, setState } from './state.js';
import { byId, setStatus, toast } from './ui.js';
import { openLeadRoute } from './router.js';

const LEAD_FIELDS = 'id,created_at,name,phone,source,service,message,status,lead_quality,estimated_amount,next_contact_at,page_url,budget,city,converted_order_id,converted_client_id';
const CLIENT_FIELDS = 'id,name,phone,source';
const CLIENT_LIMIT = 200;

let formReady = false;
let busy = false;
let clientPickerReady = false;
let clientsLoading = false;
let clientsLoaded = false;
const clientsById = new Map();

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}

function parseMoney(value) {
  const number = Number(String(value ?? '').replace(',', '.').replace(/\s+/g, ''));
  return Number.isFinite(number) && number > 0 ? number : null;
}

function localDateTimeToIso(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function defaultNextContactValue() {
  const date = new Date();
  date.setHours(date.getHours() + 1, 0, 0, 0);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function setClientHint(message, tone = '') {
  const hint = byId('manualLeadClientHint');
  if (!hint) return;
  hint.textContent = message;
  hint.dataset.tone = tone;
}

function clientOptionLabel(client) {
  const name = String(client?.name || '').trim() || 'Без имени';
  const phone = String(client?.phone || '').trim();
  return phone ? `${name} · ${phone}` : `${name} · телефон не указан`;
}

function renderClientOptions(clients) {
  const select = byId('manualLeadExistingClient');
  if (!select) return;
  const selected = select.value;
  clientsById.clear();
  (clients || []).forEach((client) => {
    if (client?.id) clientsById.set(String(client.id), client);
  });
  const options = [...clientsById.values()]
    .map((client) => `<option value="${esc(client.id)}">${esc(clientOptionLabel(client))}</option>`)
    .join('');
  select.innerHTML = `<option value="">Новый клиент / не выбирать из списка</option>${options}`;
  select.disabled = false;
  if (selected && clientsById.has(selected)) select.value = selected;
  setClientHint(
    clientsById.size
      ? 'Выберите постоянного клиента — имя и телефон подставятся, а заявка сохранит связь с его карточкой.'
      : 'Список клиентов пока пуст. Заполните данные новой заявки вручную.'
  );
}

async function loadExistingClients(force = false) {
  if (!v4State.crmReady || clientsLoading || (clientsLoaded && !force)) return;
  clientsLoading = true;
  const select = byId('manualLeadExistingClient');
  const refresh = byId('refreshManualLeadClientsBtn');
  if (select) select.disabled = true;
  if (refresh) refresh.disabled = true;
  setClientHint('Загружаю список клиентов...');
  try {
    const response = await timeout(
      supabaseClient
        .from('leader_clients')
        .select(CLIENT_FIELDS)
        .order('name', { ascending: true })
        .limit(CLIENT_LIMIT),
      12000,
      'Список клиентов не загрузился за 12 секунд'
    );
    if (response.error) throw response.error;
    renderClientOptions(response.data || []);
    clientsLoaded = true;
  } catch (error) {
    if (select) select.disabled = !clientsLoaded;
    setClientHint(`Не удалось загрузить клиентов: ${friendlyError(error)}. Заявку можно заполнить вручную.`, 'error');
  } finally {
    clientsLoading = false;
    if (refresh) refresh.disabled = false;
  }
}

function applyExistingClient(clientId) {
  const id = String(clientId || '').trim();
  if (!id) {
    setClientHint('Новый клиент: заполните имя, телефон и источник вручную.');
    return;
  }
  const client = clientsById.get(id);
  if (!client) {
    setClientHint('Выбранный клиент больше не найден. Обновите список или заполните заявку вручную.', 'error');
    return;
  }
  const name = byId('manualLeadName');
  const phone = byId('manualLeadPhone');
  const source = byId('manualLeadSource');
  if (name) name.value = String(client.name || '').trim();
  if (phone) phone.value = String(client.phone || '').trim();
  if (source) source.value = 'Повторный клиент';
  setClientHint(
    client.phone
      ? 'Клиент выбран. Проверьте телефон и укажите, что ему нужно сейчас.'
      : 'Клиент выбран, но телефон не заполнен. Добавьте контакт или пояснение в комментарии.',
    client.phone ? 'good' : 'warn'
  );
}

function leadPayload() {
  const name = byId('manualLeadName')?.value?.trim() || '';
  const phone = byId('manualLeadPhone')?.value?.trim() || '';
  const source = byId('manualLeadSource')?.value?.trim() || 'Вручную';
  const service = byId('manualLeadService')?.value?.trim() || '';
  const city = byId('manualLeadCity')?.value?.trim() || '';
  const contactPreference = byId('manualLeadContact')?.value?.trim() || '';
  const budget = parseMoney(byId('manualLeadBudget')?.value || '');
  const leadQuality = byId('manualLeadQuality')?.value || 'Не оценена';
  const nextContactAt = localDateTimeToIso(byId('manualLeadNextContact')?.value || '');
  const message = byId('manualLeadMessage')?.value?.trim() || '';
  const existingClientId = byId('manualLeadExistingClient')?.value?.trim() || '';

  if (!name && !phone) throw new Error('Укажите имя или телефон клиента');
  if (!phone && !message) throw new Error('Без телефона добавьте хотя бы комментарий, откуда заявка и что нужно клиенту');

  return {
    name: name || 'Без имени',
    phone,
    source,
    service,
    city,
    contact_preference: contactPreference,
    budget,
    estimated_amount: budget || 0,
    lead_quality: leadQuality,
    next_contact_at: nextContactAt,
    converted_client_id: existingClientId || null,
    message,
    status: 'Новая',
    page_url: 'CRM v4 / ручное создание',
    payload: {
      created_from: 'crm_v4_manual',
      created_by: v4State.user?.id || null,
      created_by_email: v4State.user?.email || null,
      created_at: new Date().toISOString(),
      existing_client_id: existingClientId || null
    }
  };
}

function resetForm() {
  ['manualLeadName', 'manualLeadPhone', 'manualLeadService', 'manualLeadBudget', 'manualLeadMessage'].forEach((id) => {
    const element = byId(id);
    if (element) element.value = '';
  });
  if (byId('manualLeadSource')) byId('manualLeadSource').value = 'Вручную';
  if (byId('manualLeadContact')) byId('manualLeadContact').value = 'MAX';
  if (byId('manualLeadQuality')) byId('manualLeadQuality').value = 'Не оценена';
  if (byId('manualLeadNextContact')) byId('manualLeadNextContact').value = defaultNextContactValue();
  if (byId('manualLeadCity')) byId('manualLeadCity').value = 'Борисоглебск';
  if (byId('manualLeadExistingClient')) byId('manualLeadExistingClient').value = '';
  setClientHint('Новый клиент: заполните имя, телефон и источник вручную.');
}

function renderForm() {
  const section = byId('leadsSection');
  if (!section || byId('manualLeadBox')) return;
  const html = `
    <details id="manualLeadBox" class="v4-manual-lead-box">
      <summary>Добавить заявку вручную</summary>
      <form id="manualLeadForm" class="v4-manual-lead-form">
        <div class="v4-existing-client-picker">
          <label>Постоянный клиент <span>(необязательно)</span>
            <select id="manualLeadExistingClient" disabled>
              <option value="">Список загрузится после открытия формы</option>
            </select>
          </label>
          <button id="refreshManualLeadClientsBtn" type="button">Обновить список</button>
          <small id="manualLeadClientHint">Можно выбрать клиента из базы или заполнить новую заявку вручную.</small>
        </div>
        <div class="v4-form-grid">
          <label>Имя клиента
            <input id="manualLeadName" placeholder="Например: Иван">
          </label>
          <label>Телефон
            <input id="manualLeadPhone" inputmode="tel" placeholder="+7 900 000-00-00">
          </label>
          <label>Источник
            <select id="manualLeadSource">
              <option>Вручную</option>
              <option>Телефон</option>
              <option>MAX</option>
              <option>ВКонтакте</option>
              <option>Офис</option>
              <option>Повторный клиент</option>
              <option>Рекомендация</option>
            </select>
          </label>
          <label>Услуга
            <input id="manualLeadService" placeholder="Баннер, вывеска, плёнка, дизайн...">
          </label>
          <label>Город
            <input id="manualLeadCity" value="Борисоглебск">
          </label>
          <label>Как связаться
            <select id="manualLeadContact">
              <option>MAX</option>
              <option>Телефон</option>
              <option>Сообщение ВК</option>
              <option>Любой способ</option>
            </select>
          </label>
          <label>Ориентир по бюджету
            <input id="manualLeadBudget" inputmode="decimal" placeholder="Например: 15000">
          </label>
          <label>Качество заявки
            <select id="manualLeadQuality">
              <option>Не оценена</option>
              <option>Горячая</option>
              <option>Тёплая</option>
              <option>Холодная</option>
            </select>
          </label>
          <label>Следующий контакт
            <input id="manualLeadNextContact" type="datetime-local" value="${esc(defaultNextContactValue())}">
          </label>
        </div>
        <label class="v4-manual-lead-comment">Комментарий / что нужно клиенту
          <textarea id="manualLeadMessage" rows="3" placeholder="Например: клиент написал в MAX, нужен баннер 3×2 м, уточнить материал и сроки"></textarea>
        </label>
        <div class="v4-form-actions">
          <button id="createManualLeadBtn" type="submit" class="v4-primary">Создать заявку</button>
          <button id="resetManualLeadBtn" type="button">Очистить</button>
        </div>
      </form>
    </details>
  `;
  const stats = section.querySelector('.v4-lead-stats');
  if (stats) stats.insertAdjacentHTML('beforebegin', html);
  else section.insertAdjacentHTML('afterbegin', html);
}

function bindClientPicker() {
  if (clientPickerReady) return;
  const details = byId('manualLeadBox');
  if (!details) return;
  clientPickerReady = true;
  details.addEventListener('toggle', async () => {
    if (details.open) await loadExistingClients(false);
  });
}

async function createLead() {
  if (busy) return;
  busy = true;
  const button = byId('createManualLeadBtn');
  if (button) button.disabled = true;
  try {
    const payload = leadPayload();
    setStatus('Создаю заявку вручную...', 'warn');
    const response = await timeout(
      supabaseClient.from('leader_leads').insert(payload).select(LEAD_FIELDS).single(),
      14000,
      'Заявка не создалась за 14 секунд'
    );
    if (response.error) throw response.error;
    const created = response.data;
    setState({ leads: [created, ...(v4State.leads || [])], leadsLoaded: true });
    resetForm();
    setStatus('Заявка создана', 'good');
    toast('Заявка создана');
    openLeadRoute(created.id);
  } catch (error) {
    const message = friendlyError(error);
    setStatus(`Ошибка создания заявки: ${message}`, 'error');
    toast(message);
  } finally {
    busy = false;
    if (button) button.disabled = false;
  }
}

function bindForm() {
  if (formReady) return;
  formReady = true;
  document.addEventListener('submit', async (event) => {
    if (event.target?.id !== 'manualLeadForm') return;
    event.preventDefault();
    await createLead();
  });
  document.addEventListener('click', (event) => {
    if (event.target?.id === 'resetManualLeadBtn') resetForm();
    if (event.target?.id === 'refreshManualLeadClientsBtn') loadExistingClients(true);
  });
  document.addEventListener('change', (event) => {
    if (event.target?.id === 'manualLeadExistingClient') applyExistingClient(event.target.value);
  });
}

function bootManualLead() {
  renderForm();
  bindForm();
  bindClientPicker();
  if (byId('manualLeadBox')?.open) loadExistingClients(false);
}

document.addEventListener('DOMContentLoaded', bootManualLead);
document.addEventListener('leader-v4:crm-ready', bootManualLead);
