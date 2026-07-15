import { supabaseClient } from './supabase-client.js';
import { timeout, friendlyError } from './api.js';
import { v4State, setState } from './state.js';
import { byId, setStatus, toast } from './ui.js';

const NEED_FIELDS = 'id,lead_id,client_id,need_type,title,description,structured_data,need_design,need_installation,design_reason,installation_reason,deadline_text,deadline_date,files,status,completeness_score,missing_fields,created_by,updated_by,created_at,updated_at';
const NEED_TYPES = ['Баннер', 'Вывеска', 'Пленка / наклейки', 'Полиграфия', 'Табличка', 'Дизайн', 'Монтаж', 'Интернет-реклама', 'Другое'];

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}

function typeOptions(selected = 'Другое') {
  return NEED_TYPES.map((type) => `<option ${type === selected ? 'selected' : ''}>${esc(type)}</option>`).join('');
}

function emitNeedsLoaded(leadId = v4State.route.leadId) {
  document.dispatchEvent(new CustomEvent('leader-v4:needs-loaded', { detail: { leadId, needs: v4State.leadNeeds || [] } }));
}

function calculateCompleteness(payload) {
  let score = 20;
  const missing = [];
  if (payload.title) score += 20; else missing.push('Название');
  if (payload.description) score += 15; else missing.push('Описание');
  if (payload.need_type && payload.need_type !== 'Другое') score += 10;
  const structured = payload.structured_data || {};
  if (structured.width || structured.height || structured.print_run || structured.quantity) score += 15; else missing.push('Размер / формат / количество');
  if (structured.material) score += 10; else missing.push('Материал');
  if (payload.deadline_text || payload.deadline_date) score += 10; else missing.push('Срок');
  if (payload.need_installation && !structured.installation_address) missing.push('Адрес монтажа');
  if (payload.need_design && !payload.design_reason) missing.push('Комментарий по дизайну');
  return { score: Math.min(score, 100), missing };
}

function renderNeedCard(need) {
  const data = need.structured_data || {};
  const flags = [need.need_design ? 'Нужен дизайн' : '', need.need_installation ? 'Нужен монтаж' : ''].filter(Boolean);
  const missing = Array.isArray(need.missing_fields) ? need.missing_fields : [];
  return `<article class="v4-need-card" data-id="${esc(need.id)}"><div><div class="v4-need-title-row"><h4>${esc(need.title || need.need_type || 'Потребность')}</h4><span>${esc(need.status || 'Черновик')} · ${Number(need.completeness_score || 0)}%</span></div><p>${esc(need.description || 'Описание пока не заполнено.')}</p><div class="v4-need-meta"><span>${esc(need.need_type || 'Другое')}</span>${data.width || data.height ? `<span>Размер: ${esc(data.width || '—')} × ${esc(data.height || '—')}</span>` : ''}${data.quantity ? `<span>Количество: ${esc(data.quantity)}</span>` : ''}${data.print_run ? `<span>Тираж: ${esc(data.print_run)}</span>` : ''}${data.material ? `<span>Материал: ${esc(data.material)}</span>` : ''}${need.deadline_text ? `<span>Срок: ${esc(need.deadline_text)}</span>` : ''}${flags.map((flag) => `<span>${esc(flag)}</span>`).join('')}</div>${data.installation_address ? `<div class="v4-need-note"><b>Адрес монтажа:</b> ${esc(data.installation_address)}</div>` : ''}${missing.length ? `<div class="v4-need-missing">Не хватает: ${missing.map(esc).join(', ')}</div>` : ''}</div><div class="v4-need-actions"><button type="button" class="v4-primary" data-action="calculate-need">Перейти к расчёту</button><button type="button" data-action="archive-need">В архив</button></div></article>`;
}

function renderNeedForm() {
  return `<form id="needForm" class="v4-need-form"><div class="v4-need-form-intro"><b>Короткий бриф</b><span>Сначала зафиксируйте главное. Дополнительные параметры нужны только для точного расчёта.</span></div><div class="v4-form-grid"><label>Что нужно клиенту<select id="needType">${typeOptions()}</select></label><label>Краткое название<input id="needTitle" placeholder="Например: баннер 3×2 на фасад"></label><label>Количество<input id="needQuantity" placeholder="Например: 1 шт"></label><label>Срок<input id="needDeadline" placeholder="Например: до пятницы"></label><label class="wide">Пожелания клиента<textarea id="needDescription" rows="3" placeholder="Что изготовить, где использовать, важные пожелания"></textarea></label></div><details class="v4-need-extra"><summary>Размер, материал и тираж</summary><div class="v4-form-grid"><label>Ширина<input id="needWidth" placeholder="Например: 3 м"></label><label>Высота<input id="needHeight" placeholder="Например: 2 м"></label><label>Тираж / формат<input id="needPrintRun" placeholder="Например: 1000 шт / A5"></label><label>Материал<input id="needMaterial" placeholder="Баннер, плёнка, бумага, пластик"></label></div></details><div class="v4-option-row"><label><input id="needDesign" type="checkbox"> Нужен дизайн / макет</label><label><input id="needInstallation" type="checkbox"> Нужен монтаж</label></div><div class="v4-form-grid v4-need-conditional"><label class="wide" data-need-design-details hidden>Что нужно по дизайну<input id="needDesignReason" placeholder="Макета нет, нужна адаптация или разработка"></label><label class="wide" data-need-installation-details hidden>Адрес монтажа<input id="needInstallAddress" placeholder="Адрес и место установки"></label><label class="wide" data-need-installation-details hidden>Особенности монтажа<input id="needInstallationReason" placeholder="Высота, доступ, поверхность, крепление"></label></div><div class="v4-form-actions"><button class="v4-primary" type="submit">Сохранить потребность</button><button id="cancelNeedBtn" type="button">Очистить</button></div></form>`;
}

function syncNeedConditionalFields() {
  document.querySelectorAll('[data-need-design-details]').forEach((element) => { element.hidden = !byId('needDesign')?.checked; });
  document.querySelectorAll('[data-need-installation-details]').forEach((element) => { element.hidden = !byId('needInstallation')?.checked; });
}

export function renderNeeds() {
  const list = byId('needsList');
  const formBox = byId('needFormBox');
  const counter = byId('needsCounter');
  if (!list || !formBox) return;
  if (counter) counter.textContent = v4State.leadNeedsBusy ? 'Загружаю...' : `Потребностей: ${(v4State.leadNeeds || []).length}`;
  if (v4State.leadNeedsBusy) list.innerHTML = '<div class="v4-empty">Загружаю потребности...</div>';
  else if (v4State.leadNeedsError) list.innerHTML = `<div class="v4-empty is-error">${esc(v4State.leadNeedsError)}</div>`;
  else if (!(v4State.leadNeeds || []).length) list.innerHTML = '<div class="v4-empty">Потребности пока не добавлены. Зафиксируйте, что именно нужно клиенту.</div>';
  else list.innerHTML = (v4State.leadNeeds || []).filter((need) => need.status !== 'Архив').map(renderNeedCard).join('') || '<div class="v4-empty">Все потребности отправлены в архив.</div>';
  if (!formBox.dataset.ready) {
    formBox.innerHTML = renderNeedForm();
    formBox.dataset.ready = '1';
  }
  syncNeedConditionalFields();
}

export async function loadNeeds(leadId = v4State.route.leadId) {
  if (!leadId || !v4State.crmReady) {
    setState({ leadNeeds: [], leadNeedsBusy: false, leadNeedsError: null });
    renderNeeds();
    emitNeedsLoaded(leadId);
    return [];
  }
  setState({ leadNeedsBusy: true, leadNeedsError: null });
  renderNeeds();
  try {
    const response = await timeout(
      supabaseClient
        .from('leader_lead_needs')
        .select(NEED_FIELDS)
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(60),
      12000,
      'Потребности не загрузились за 12 секунд'
    );
    if (response.error) throw response.error;
    setState({ leadNeeds: response.data || [], leadNeedsBusy: false, leadNeedsError: null });
    renderNeeds();
    emitNeedsLoaded(leadId);
    return response.data || [];
  } catch (error) {
    const message = friendlyError(error);
    setState({ leadNeeds: [], leadNeedsBusy: false, leadNeedsError: message });
    renderNeeds();
    emitNeedsLoaded(leadId);
    setStatus(`Ошибка потребностей: ${message}`, 'error');
    return [];
  }
}

function readNeedForm() {
  const structured_data = {
    width: byId('needWidth')?.value.trim() || '',
    height: byId('needHeight')?.value.trim() || '',
    quantity: byId('needQuantity')?.value.trim() || '',
    print_run: byId('needPrintRun')?.value.trim() || '',
    material: byId('needMaterial')?.value.trim() || '',
    installation_address: byId('needInstallAddress')?.value.trim() || ''
  };
  const payload = {
    lead_id: v4State.route.leadId,
    client_id: v4State.currentLead?.converted_client_id || null,
    need_type: byId('needType')?.value || 'Другое',
    title: byId('needTitle')?.value.trim() || '',
    description: byId('needDescription')?.value.trim() || '',
    structured_data,
    need_design: !!byId('needDesign')?.checked,
    need_installation: !!byId('needInstallation')?.checked,
    design_reason: byId('needDesignReason')?.value.trim() || null,
    installation_reason: byId('needInstallationReason')?.value.trim() || null,
    deadline_text: byId('needDeadline')?.value.trim() || null,
    files: [],
    status: 'Черновик',
    created_by: v4State.user?.id || null,
    updated_by: v4State.user?.id || null
  };
  const completeness = calculateCompleteness(payload);
  payload.completeness_score = completeness.score;
  payload.missing_fields = completeness.missing;
  return payload;
}

function resetNeedForm() { byId('needForm')?.reset(); syncNeedConditionalFields(); }

async function createNeed() {
  if (!v4State.route.leadId) { toast('Сначала откройте карточку заявки'); return; }
  const payload = readNeedForm();
  if (!payload.title && !payload.description) { toast('Заполните название или описание потребности'); return; }
  setStatus('Сохраняю потребность...', 'warn');
  const response = await timeout(
    supabaseClient.from('leader_lead_needs').insert(payload).select(NEED_FIELDS).single(),
    12000,
    'Потребность не сохранилась за 12 секунд'
  );
  if (response.error) throw response.error;
  setState({ leadNeeds: [response.data, ...(v4State.leadNeeds || [])] });
  resetNeedForm();
  renderNeeds();
  emitNeedsLoaded(v4State.route.leadId);
  setStatus('Потребность сохранена', 'good');
}

async function archiveNeed(id) {
  const response = await timeout(
    supabaseClient.from('leader_lead_needs').update({ status: 'Архив', updated_by: v4State.user?.id || null, updated_at: new Date().toISOString() }).eq('id', id).select(NEED_FIELDS).single(),
    12000,
    'Потребность не обновилась за 12 секунд'
  );
  if (response.error) throw response.error;
  setState({ leadNeeds: (v4State.leadNeeds || []).map((need) => (need.id === id ? response.data : need)) });
  renderNeeds();
  emitNeedsLoaded(v4State.route.leadId);
}

function bindNeedsEvents() {
  byId('leadCardSection')?.addEventListener('submit', async (event) => {
    if (event.target?.id !== 'needForm') return;
    event.preventDefault();
    try {
      await createNeed();
      toast('Потребность добавлена');
    } catch (error) {
      toast(friendlyError(error));
      setStatus(`Ошибка сохранения потребности: ${friendlyError(error)}`, 'error');
    }
  });
  byId('leadCardSection')?.addEventListener('click', async (event) => {
    if (event.target?.id === 'cancelNeedBtn') { resetNeedForm(); return; }
    const calculate = event.target.closest('button[data-action="calculate-need"]');
    if (calculate) {
      const need = (v4State.leadNeeds || []).find((item) => item.id === calculate.closest('.v4-need-card')?.dataset.id);
      if (need) document.dispatchEvent(new CustomEvent('leader-v4:calculate-need', { detail: { need } }));
      return;
    }
    const button = event.target.closest('button[data-action="archive-need"]');
    if (!button) return;
    const card = button.closest('.v4-need-card');
    const id = card?.dataset.id;
    if (!id) return;
    button.disabled = true;
    try {
      await archiveNeed(id);
      toast('Потребность отправлена в архив');
    } catch (error) {
      toast(friendlyError(error));
    } finally {
      button.disabled = false;
    }
  });
  byId('leadCardSection')?.addEventListener('change', (event) => {
    if (event.target?.id === 'needDesign' || event.target?.id === 'needInstallation') syncNeedConditionalFields();
  });
  document.addEventListener('leader-v4:lead-card-rendered', () => renderNeeds());
  document.addEventListener('leader-v4:route-change', (event) => {
    const id = event.detail?.leadId || null;
    if (id) loadNeeds(id);
    else {
      setState({ leadNeeds: [], leadNeedsBusy: false, leadNeedsError: null });
      renderNeeds();
      emitNeedsLoaded(null);
    }
  });
  document.addEventListener('leader-v4:crm-ready', () => { if (v4State.route.leadId) loadNeeds(v4State.route.leadId); });
}

export function bootNeeds() {
  bindNeedsEvents();
  renderNeeds();
  if (v4State.crmReady && v4State.route.leadId) loadNeeds(v4State.route.leadId);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootNeeds);
else bootNeeds();
