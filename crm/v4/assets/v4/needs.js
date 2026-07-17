import { supabaseClient } from './supabase-client.js';
import { timeout, friendlyError } from './api.js';
import { v4State, setState } from './state.js';
import { byId, setStatus, toast } from './ui.js';
import { CRM_V4_ACTIONS, canPerformV4Action, requireV4Action } from './action-permissions-v1.js';
import {
  activeNeeds,
  findDuplicateNeed,
  needDraftFromRecord,
  needFingerprint,
  needFormPresentation
} from './need-workspace-model-v1.js';

const NEED_FIELDS = 'id,lead_id,client_id,need_type,title,description,structured_data,need_design,need_installation,design_reason,installation_reason,deadline_text,deadline_date,files,status,completeness_score,missing_fields,created_by,updated_by,created_at,updated_at';
const NEED_TYPES = ['Баннер', 'Вывеска', 'Пленка / наклейки', 'Полиграфия', 'Табличка', 'Дизайн', 'Монтаж', 'Интернет-реклама', 'Другое'];

let saveBusy = false;
let workspace = {
  leadId: null,
  mode: 'create',
  editingId: null,
  draftId: null,
  seed: null,
  copySourceFingerprint: null
};

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}

function typeOptions(selected = 'Другое') {
  return NEED_TYPES.map((type) => `<option ${type === selected ? 'selected' : ''}>${esc(type)}</option>`).join('');
}

function createUuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  globalThis.crypto?.getRandomValues?.(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
}

function resetWorkspace(leadId, mode = 'loading') {
  saveBusy = false;
  workspace = {
    leadId: leadId || null,
    mode,
    editingId: null,
    draftId: null,
    seed: null,
    copySourceFingerprint: null
  };
}

function settleWorkspaceAfterLoad(leadId, needs) {
  if (workspace.leadId !== leadId || workspace.mode === 'loading') {
    resetWorkspace(leadId, activeNeeds(needs).length ? 'view' : 'create');
  }
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
  const canWrite = canPerformV4Action(CRM_V4_ACTIONS.NEEDS_WRITE);
  const canCalculate = canPerformV4Action(CRM_V4_ACTIONS.CALCULATIONS_WRITE);
  return `
    <article class="v4-need-card" data-id="${esc(need.id)}">
      <div>
        <div class="v4-need-title-row">
          <h4>${esc(need.title || need.need_type || 'Потребность')}</h4>
          <span>${esc(need.status || 'Черновик')} · ${Number(need.completeness_score || 0)}%</span>
        </div>
        <p>${esc(need.description || 'Описание пока не заполнено.')}</p>
        <div class="v4-need-meta">
          <span>${esc(need.need_type || 'Другое')}</span>
          ${data.width || data.height ? `<span>Размер: ${esc(data.width || '—')} × ${esc(data.height || '—')}</span>` : ''}
          ${data.quantity ? `<span>Количество: ${esc(data.quantity)}</span>` : ''}
          ${data.print_run ? `<span>Тираж: ${esc(data.print_run)}</span>` : ''}
          ${data.material ? `<span>Материал: ${esc(data.material)}</span>` : ''}
          ${need.deadline_text ? `<span>Срок: ${esc(need.deadline_text)}</span>` : ''}
          ${flags.map((flag) => `<span>${esc(flag)}</span>`).join('')}
        </div>
        ${data.installation_address ? `<div class="v4-need-note"><b>Адрес монтажа:</b> ${esc(data.installation_address)}</div>` : ''}
        ${missing.length ? `<div class="v4-need-missing">Не хватает: ${missing.map(esc).join(', ')}</div>` : ''}
      </div>
      <div class="v4-need-actions">
        ${canCalculate ? '<button type="button" class="v4-primary" data-action="calculate-need">Перейти к расчёту</button>' : ''}
        ${canWrite ? '<button type="button" data-action="edit-need">Изменить</button><button type="button" data-action="copy-need">Создать копию</button><button type="button" data-action="archive-need">Архивировать</button>' : ''}
      </div>
    </article>`;
}

function renderNeedForm(seed = {}, mode = 'create') {
  const view = needFormPresentation(mode);
  const detailsOpen = seed.width || seed.height || seed.printRun || seed.material;
  return `
    <div class="v4-need-form-card" data-need-form-mode="${esc(mode)}">
      <div class="v4-need-form-head">
        <div><span>${esc(view.kicker)}</span><h4>${esc(view.title)}</h4></div>
        <button id="cancelNeedTopBtn" type="button">Закрыть</button>
      </div>
      <form id="needForm" class="v4-need-form">
        <div class="v4-need-form-intro"><b>Короткий бриф</b><span>Сначала зафиксируйте главное. Дополнительные параметры нужны только для точного расчёта.</span></div>
        <div class="v4-form-grid">
          <label>Что нужно клиенту<select id="needType">${typeOptions(seed.needType || 'Другое')}</select></label>
          <label>Краткое название<input id="needTitle" value="${esc(seed.title || '')}" placeholder="Например: баннер 3×2 на фасад"></label>
          <label>Количество<input id="needQuantity" value="${esc(seed.quantity || '')}" placeholder="Например: 1 шт"></label>
          <label>Срок<input id="needDeadline" value="${esc(seed.deadline || '')}" placeholder="Например: до пятницы"></label>
          <label class="wide">Пожелания клиента<textarea id="needDescription" rows="3" placeholder="Что изготовить, где использовать, важные пожелания">${esc(seed.description || '')}</textarea></label>
        </div>
        <details class="v4-need-extra" ${detailsOpen ? 'open' : ''}>
          <summary>Размер, материал и тираж</summary>
          <div class="v4-form-grid">
            <label>Ширина<input id="needWidth" value="${esc(seed.width || '')}" placeholder="Например: 3 м"></label>
            <label>Высота<input id="needHeight" value="${esc(seed.height || '')}" placeholder="Например: 2 м"></label>
            <label>Тираж / формат<input id="needPrintRun" value="${esc(seed.printRun || '')}" placeholder="Например: 1000 шт / A5"></label>
            <label>Материал<input id="needMaterial" value="${esc(seed.material || '')}" placeholder="Баннер, плёнка, бумага, пластик"></label>
          </div>
        </details>
        <div class="v4-option-row">
          <label><input id="needDesign" type="checkbox" ${seed.needDesign ? 'checked' : ''}> Нужен дизайн / макет</label>
          <label><input id="needInstallation" type="checkbox" ${seed.needInstallation ? 'checked' : ''}> Нужен монтаж</label>
        </div>
        <div class="v4-form-grid v4-need-conditional">
          <label class="wide" data-need-design-details ${seed.needDesign ? '' : 'hidden'}>Что нужно по дизайну<input id="needDesignReason" value="${esc(seed.designReason || '')}" placeholder="Макета нет, нужна адаптация или разработка"></label>
          <label class="wide" data-need-installation-details ${seed.needInstallation ? '' : 'hidden'}>Адрес монтажа<input id="needInstallAddress" value="${esc(seed.installAddress || '')}" placeholder="Адрес и место установки"></label>
          <label class="wide" data-need-installation-details ${seed.needInstallation ? '' : 'hidden'}>Особенности монтажа<input id="needInstallationReason" value="${esc(seed.installationReason || '')}" placeholder="Высота, доступ, поверхность, крепление"></label>
        </div>
        <div class="v4-form-actions">
          <button id="saveNeedBtn" class="v4-primary" type="submit" ${saveBusy ? 'disabled' : ''}>${saveBusy ? 'Сохраняю...' : esc(view.submitLabel)}</button>
          <button id="cancelNeedBtn" type="button">${esc(view.cancelLabel)}</button>
        </div>
      </form>
    </div>`;
}

function renderClosedWorkspace(count) {
  const hasNeeds = count > 0;
  const canWrite = canPerformV4Action(CRM_V4_ACTIONS.NEEDS_WRITE);
  return `
    <div class="v4-need-workspace-summary" role="status">
      <div>
        <b>${hasNeeds ? 'Потребность сохранена' : 'Потребность ещё не создана'}</b>
        <span>${hasNeeds ? 'Карточки выше находятся в режиме просмотра. Изменения не создают новую запись.' : 'Откройте короткий бриф и зафиксируйте, что нужно клиенту.'}</span>
      </div>
      ${canWrite ? `<button type="button" data-action="open-create-need" class="${hasNeeds ? '' : 'v4-primary'}">${hasNeeds ? 'Добавить ещё одну позицию' : 'Добавить потребность'}</button>` : ''}
    </div>`;
}

function syncNeedConditionalFields() {
  document.querySelectorAll('[data-need-design-details]').forEach((element) => { element.hidden = !byId('needDesign')?.checked; });
  document.querySelectorAll('[data-need-installation-details]').forEach((element) => { element.hidden = !byId('needInstallation')?.checked; });
}

export function renderNeeds() {
  const list = byId('needsList');
  const formBox = byId('needFormBox');
  const counter = byId('needsCounter');
  const headerAddButton = document.querySelector('.v4-needs-head-actions [data-action="open-create-need"]');
  if (!list || !formBox) return;
  const canRead = canPerformV4Action(CRM_V4_ACTIONS.NEEDS_READ);
  if (!canRead) {
    if (counter) counter.textContent = 'Нет доступа';
    if (headerAddButton) headerAddButton.hidden = true;
    list.innerHTML = '<div class="v4-empty">У вашей роли нет доступа к потребностям заявки.</div>';
    formBox.innerHTML = '';
    return;
  }
  if (headerAddButton) headerAddButton.hidden = false;
  const visibleNeeds = activeNeeds(v4State.leadNeeds || []);
  if (counter) counter.textContent = v4State.leadNeedsBusy ? 'Загружаю...' : `Потребностей: ${visibleNeeds.length}`;
  if (headerAddButton) {
    const formOpen = ['create', 'edit', 'copy'].includes(workspace.mode);
    headerAddButton.disabled = formOpen || v4State.leadNeedsBusy;
    headerAddButton.textContent = formOpen ? 'Бриф уже открыт' : visibleNeeds.length ? 'Добавить ещё одну позицию' : 'Добавить потребность';
  }
  if (v4State.leadNeedsBusy) list.innerHTML = '<div class="v4-empty">Загружаю потребности...</div>';
  else if (v4State.leadNeedsError) list.innerHTML = `<div class="v4-empty is-error">${esc(v4State.leadNeedsError)}</div>`;
  else if (!visibleNeeds.length) list.innerHTML = '<div class="v4-empty">Активных потребностей пока нет.</div>';
  else list.innerHTML = visibleNeeds.map(renderNeedCard).join('');

  if (workspace.mode === 'loading') {
    formBox.innerHTML = '';
    return;
  }
  if (['create', 'edit', 'copy'].includes(workspace.mode)) {
    formBox.innerHTML = renderNeedForm(workspace.seed || {}, workspace.mode);
    syncNeedConditionalFields();
    return;
  }
  formBox.innerHTML = renderClosedWorkspace(visibleNeeds.length);
}

export async function loadNeeds(leadId = v4State.route.leadId) {
  if (!canPerformV4Action(CRM_V4_ACTIONS.NEEDS_READ)) {
    resetWorkspace(leadId, 'view');
    setState({ leadNeeds: [], leadNeedsBusy: false, leadNeedsError: null });
    renderNeeds();
    emitNeedsLoaded(leadId);
    return [];
  }
  if (!leadId || !v4State.crmReady) {
    resetWorkspace(null, 'view');
    setState({ leadNeeds: [], leadNeedsBusy: false, leadNeedsError: null });
    renderNeeds();
    emitNeedsLoaded(leadId);
    return [];
  }
  if (workspace.leadId !== leadId) resetWorkspace(leadId, 'loading');
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
    const needs = response.data || [];
    settleWorkspaceAfterLoad(leadId, needs);
    setState({ leadNeeds: needs, leadNeedsBusy: false, leadNeedsError: null });
    renderNeeds();
    emitNeedsLoaded(leadId);
    return needs;
  } catch (error) {
    const message = friendlyError(error);
    settleWorkspaceAfterLoad(leadId, []);
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
    updated_by: v4State.user?.id || null
  };
  const completeness = calculateCompleteness(payload);
  payload.completeness_score = completeness.score;
  payload.missing_fields = completeness.missing;
  return payload;
}

function focusNeedForm() {
  requestAnimationFrame(() => {
    byId('needTitle')?.focus();
    byId('needFormBox')?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  });
}

function openNeedForm(mode, need = null) {
  workspace = {
    leadId: v4State.route.leadId || null,
    mode,
    editingId: mode === 'edit' ? need?.id || null : null,
    draftId: mode === 'edit' ? null : createUuid(),
    seed: need ? needDraftFromRecord(need) : null,
    copySourceFingerprint: mode === 'copy' && need ? needFingerprint(need) : null
  };
  renderNeeds();
  focusNeedForm();
}

function closeNeedForm() {
  workspace = {
    leadId: v4State.route.leadId || null,
    mode: 'view',
    editingId: null,
    draftId: null,
    seed: null,
    copySourceFingerprint: null
  };
  renderNeeds();
}

async function insertNeedIdempotently(payload) {
  let insertError = null;
  try {
    const response = await timeout(
      supabaseClient.from('leader_lead_needs').insert(payload).select(NEED_FIELDS).single(),
      12000,
      'Потребность не сохранилась за 12 секунд'
    );
    if (!response.error) return { need: response.data, replayed: false };
    insertError = response.error;
  } catch (error) {
    insertError = error;
  }

  try {
    const replay = await timeout(
      supabaseClient.from('leader_lead_needs').select(NEED_FIELDS).eq('id', payload.id).eq('lead_id', payload.lead_id).maybeSingle(),
      8000,
      'Не удалось проверить результат повторного сохранения'
    );
    if (!replay.error && replay.data && needFingerprint(replay.data) === needFingerprint(payload)) {
      return { need: replay.data, replayed: true };
    }
  } catch (_) {
    // Возвращаем исходную ошибку INSERT: она точнее объясняет, что не сохранилось.
  }
  throw insertError || new Error('Потребность не сохранилась');
}

async function updateNeed(id, payload) {
  const patch = {
    ...payload,
    updated_at: new Date().toISOString()
  };
  delete patch.lead_id;
  delete patch.client_id;
  delete patch.files;
  delete patch.status;
  const response = await timeout(
    supabaseClient
      .from('leader_lead_needs')
      .update(patch)
      .eq('id', id)
      .eq('lead_id', v4State.route.leadId)
      .select(NEED_FIELDS)
      .single(),
    12000,
    'Изменения потребности не сохранились за 12 секунд'
  );
  if (response.error) throw response.error;
  return response.data;
}

async function saveNeed() {
  if (!v4State.route.leadId) { toast('Сначала откройте карточку заявки'); return; }
  if (!requireV4Action(CRM_V4_ACTIONS.NEEDS_WRITE)) { toast('У вашей роли нет права изменять потребности'); return; }
  if (saveBusy) return;
  const payload = readNeedForm();
  if (!payload.title && !payload.description) { toast('Заполните название или описание потребности'); return; }

  const duplicate = findDuplicateNeed(payload, v4State.leadNeeds || [], workspace.editingId);
  const explicitCopy = workspace.mode === 'copy' && workspace.copySourceFingerprint === needFingerprint(payload);
  if (duplicate && !explicitCopy) {
    toast('Такая потребность уже сохранена. Откройте её через «Изменить» или используйте явное действие «Создать копию».');
    setStatus('Дубль потребности не создан', 'warn');
    return;
  }

  saveBusy = true;
  renderNeeds();
  try {
    setStatus(workspace.mode === 'edit' ? 'Сохраняю изменения потребности...' : 'Сохраняю потребность...', 'warn');
    if (workspace.mode === 'edit') {
      const updated = await updateNeed(workspace.editingId, payload);
      setState({ leadNeeds: (v4State.leadNeeds || []).map((need) => need.id === updated.id ? updated : need) });
      toast('Изменения сохранены');
      setStatus('Потребность обновлена', 'good');
    } else {
      const result = await insertNeedIdempotently({
        ...payload,
        id: workspace.draftId || createUuid(),
        created_by: v4State.user?.id || null
      });
      if (!(v4State.leadNeeds || []).some((need) => need.id === result.need.id)) {
        setState({ leadNeeds: [result.need, ...(v4State.leadNeeds || [])] });
      }
      toast(result.replayed ? 'Потребность уже была сохранена — повтор не создан' : workspace.mode === 'copy' ? 'Копия потребности сохранена' : 'Потребность сохранена');
      setStatus(result.replayed ? 'Повторное сохранение безопасно восстановлено' : 'Потребность сохранена', 'good');
    }
    closeNeedForm();
    emitNeedsLoaded(v4State.route.leadId);
  } finally {
    saveBusy = false;
    renderNeeds();
  }
}

async function archiveNeed(id) {
  if (!requireV4Action(CRM_V4_ACTIONS.NEEDS_WRITE)) throw new Error('У вашей роли нет права архивировать потребности');
  const response = await timeout(
    supabaseClient.from('leader_lead_needs').update({ status: 'Архив', updated_by: v4State.user?.id || null, updated_at: new Date().toISOString() }).eq('id', id).eq('lead_id', v4State.route.leadId).select(NEED_FIELDS).single(),
    12000,
    'Потребность не обновилась за 12 секунд'
  );
  if (response.error) throw response.error;
  setState({ leadNeeds: (v4State.leadNeeds || []).map((need) => need.id === id ? response.data : need) });
  renderNeeds();
  emitNeedsLoaded(v4State.route.leadId);
}

function needFromAction(target) {
  const id = target.closest('.v4-need-card')?.dataset.id;
  return (v4State.leadNeeds || []).find((need) => need.id === id) || null;
}

function bindNeedsEvents() {
  byId('leadCardSection')?.addEventListener('submit', async (event) => {
    if (event.target?.id !== 'needForm') return;
    event.preventDefault();
    try {
      await saveNeed();
    } catch (error) {
      toast(friendlyError(error));
      setStatus(`Ошибка сохранения потребности: ${friendlyError(error)}`, 'error');
    }
  });
  byId('leadCardSection')?.addEventListener('click', async (event) => {
    if (event.target?.id === 'cancelNeedBtn' || event.target?.id === 'cancelNeedTopBtn') { closeNeedForm(); return; }
    const openCreate = event.target.closest('button[data-action="open-create-need"]');
    if (openCreate) {
      if (requireV4Action(CRM_V4_ACTIONS.NEEDS_WRITE)) openNeedForm('create');
      else toast('У вашей роли нет права добавлять потребности');
      return;
    }

    const edit = event.target.closest('button[data-action="edit-need"]');
    if (edit) { const need = needFromAction(edit); if (need && requireV4Action(CRM_V4_ACTIONS.NEEDS_WRITE)) openNeedForm('edit', need); return; }
    const copy = event.target.closest('button[data-action="copy-need"]');
    if (copy) { const need = needFromAction(copy); if (need && requireV4Action(CRM_V4_ACTIONS.NEEDS_WRITE)) openNeedForm('copy', need); return; }
    const calculate = event.target.closest('button[data-action="calculate-need"]');
    if (calculate) {
      const need = needFromAction(calculate);
      if (need && requireV4Action(CRM_V4_ACTIONS.CALCULATIONS_WRITE)) document.dispatchEvent(new CustomEvent('leader-v4:calculate-need', { detail: { need } }));
      return;
    }
    const archive = event.target.closest('button[data-action="archive-need"]');
    if (!archive) return;
    const need = needFromAction(archive);
    if (!need) return;
    archive.disabled = true;
    try {
      await archiveNeed(need.id);
      toast('Потребность отправлена в архив');
    } catch (error) {
      toast(friendlyError(error));
    } finally {
      archive.disabled = false;
    }
  });
  byId('leadCardSection')?.addEventListener('change', (event) => {
    if (event.target?.id === 'needDesign' || event.target?.id === 'needInstallation') syncNeedConditionalFields();
  });
  document.addEventListener('leader-v4:lead-card-rendered', () => renderNeeds());
  document.addEventListener('leader-v4:route-change', (event) => {
    const id = event.detail?.leadId || null;
    resetWorkspace(id, id ? 'loading' : 'view');
    if (id) loadNeeds(id);
    else {
      setState({ leadNeeds: [], leadNeedsBusy: false, leadNeedsError: null });
      renderNeeds();
      emitNeedsLoaded(null);
    }
  });
  document.addEventListener('leader-v4:crm-ready', () => {
    if (v4State.route.leadId) {
      resetWorkspace(v4State.route.leadId, 'loading');
      loadNeeds(v4State.route.leadId);
    }
  });
}

export function bootNeeds() {
  bindNeedsEvents();
  renderNeeds();
  if (v4State.crmReady && v4State.route.leadId) {
    resetWorkspace(v4State.route.leadId, 'loading');
    loadNeeds(v4State.route.leadId);
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootNeeds);
else bootNeeds();
