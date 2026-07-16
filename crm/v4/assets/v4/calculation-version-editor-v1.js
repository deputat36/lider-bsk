import { supabaseClient } from './supabase-client.js';
import { V4_CONFIG } from './config.js';
import { timeout, friendlyError } from './api.js';
import { v4State } from './state.js';
import { byId, setStatus, toast } from './ui.js';
import { loadCalculations, renderCalculations } from './calculations.js';
import {
  CRM_V4_ACTIONS,
  canPerformV4Action
} from './action-permissions-v1.js';
import {
  invokeStagingCalculationVersion
} from './calculation-version-staging-transport-v1.js';
import {
  buildCalculationVersionTransportDraft,
  calculationVersionPersistenceRoute,
  createCalculationVersionIdempotencyKey
} from './calculation-version-save-route-v1.js';
import {
  calculationVersionItem,
  calculationVersionTotals,
  createCalculationVersionDraft,
  nextCalculationVersion
} from './calculation-version-edit-model-v1.js';

const CALC_FIELDS = 'id,lead_id,need_id,client_id,title,status,version_number,client_total,contractor_cost,profit,margin_percent,warning_level,warnings,public_comment,internal_comment,commercial_offer_id,order_id,created_by,updated_by,created_at,updated_at';
const ITEM_FIELDS = 'id,calculation_id,lead_id,catalog_id,category,item_type,name,unit,qty,contractor_price,contractor_sum,markup_percent,client_price,client_sum,profit,margin_percent,comment,data,sort_order,created_at,updated_at';
const STYLE_HREF = 'assets/v4/calculation-version-editor-v1.css?v=20260716-1';

let layoutObserver = null;
let reconcileQueued = false;
let repairingLayout = false;
let versionDraft = null;
let editorBusy = false;
let saveBusy = false;

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (match) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;'
  }[match]));
}

function number(value) {
  const parsed = Number(String(value ?? '').replace(',', '.').replace(/\s+/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value) {
  return `${Math.round(Number(value || 0)).toLocaleString('ru-RU')} ₽`;
}

function persistenceRoute() {
  return calculationVersionPersistenceRoute(V4_CONFIG.supabaseUrl);
}

function sourceCalculation() {
  if (!versionDraft?.sourceCalculationId) return null;
  return (v4State.calculations || []).find((calculation) => calculation.id === versionDraft.sourceCalculationId) || null;
}

function ensureStyles() {
  if (document.querySelector('link[data-calculation-version-editor]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = STYLE_HREF;
  link.dataset.calculationVersionEditor = 'v1';
  document.head.append(link);
}

function ensureWorkspace() {
  const calculationsBox = byId('calculationsBox');
  if (!calculationsBox?.parentElement) return null;
  let workspace = byId('savedCalculationsWorkspace');
  if (workspace && workspace.parentElement !== calculationsBox.parentElement) {
    workspace.remove();
    workspace = null;
  }
  if (!workspace) {
    workspace = document.createElement('div');
    workspace.id = 'savedCalculationsWorkspace';
    workspace.className = 'v4-calculation-version-workspace';
    workspace.innerHTML = '<div id="savedCalculationsSnapshot"></div><div id="calculationVersionEditorHost"></div>';
    calculationsBox.parentElement.insertBefore(workspace, calculationsBox);
  }
  return workspace;
}

function savedSnapshotHost() {
  return byId('savedCalculationsSnapshot');
}

function editorHost() {
  return byId('calculationVersionEditorHost');
}

function scheduleReconcile() {
  if (reconcileQueued) return;
  reconcileQueued = true;
  window.queueMicrotask(reconcileLayout);
}

function enhanceSavedCalculations() {
  const snapshot = savedSnapshotHost();
  if (!snapshot) return;

  snapshot.querySelectorAll('.v4-saved-calc-card').forEach((card) => {
    const detailsButton = card.querySelector('[data-v2-calc-details]');
    const calculationId = detailsButton?.dataset.v2CalcDetails;
    const actions = card.querySelector('.v4-saved-calc-actions');
    if (!calculationId || !actions || actions.querySelector('[data-calc-version-source]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'v4-primary v4-calc-version-start';
    button.dataset.calcVersionSource = calculationId;
    button.textContent = 'Изменить / новая версия';
    button.title = 'Скопировать этот расчёт в редактируемую новую версию. Исходный расчёт не изменится.';
    actions.append(button);
  });

  const headerActions = snapshot.querySelector('.v4-saved-calc-section > .v4-subcard-head .v4-form-actions');
  if (headerActions && !headerActions.querySelector('[data-calc-new-empty]')) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.calcNewEmpty = 'true';
    button.textContent = 'Новый пустой расчёт';
    button.title = 'Перейти к единому конструктору и создать ещё один расчёт в этой заявке.';
    headerActions.prepend(button);
  }
}

function enhanceBuilder() {
  const calculationsBox = byId('calculationsBox');
  const form = calculationsBox?.querySelector('.v4-calc-form');
  if (!form) return;
  calculationsBox.classList.add('v4-calculation-builder-host');
  const heading = form.querySelector('.v4-calc-wizard-head h4');
  const copy = form.querySelector('.v4-calc-wizard-head p');
  if (heading) heading.textContent = 'Новый расчёт';
  if (copy) copy.textContent = 'Создайте новый расчёт в этой же заявке или используйте кнопку «Изменить / новая версия» у сохранённого варианта.';
}

function reconcileLayout() {
  reconcileQueued = false;
  if (repairingLayout) return;
  const calculationsBox = byId('calculationsBox');
  if (!calculationsBox) return;
  const workspace = ensureWorkspace();
  const snapshot = savedSnapshotHost();
  if (!workspace || !snapshot) return;

  const savedSection = calculationsBox.querySelector('.v4-saved-calc-section');
  const builder = calculationsBox.querySelector('.v4-calc-form');
  if (savedSection && !builder) {
    repairingLayout = true;
    snapshot.replaceChildren(savedSection);
    renderCalculations();
    window.setTimeout(() => {
      repairingLayout = false;
      enhanceSavedCalculations();
      enhanceBuilder();
      renderVersionEditor();
    }, 0);
    return;
  }

  enhanceSavedCalculations();
  enhanceBuilder();
  renderVersionEditor();
}

function needOptions(selectedId = null) {
  const options = ['<option value="">Общий расчёт по заявке</option>'];
  (v4State.leadNeeds || [])
    .filter((need) => need.status !== 'Архив')
    .forEach((need) => {
      options.push(`<option value="${esc(need.id)}" ${need.id === selectedId ? 'selected' : ''}>${esc(need.title || need.need_type || 'Потребность')}</option>`);
    });
  return options.join('');
}

function rowEditor(item, index) {
  const calculated = calculationVersionItem(item, index);
  return `
    <article class="v4-version-edit-row" data-version-row="${index}">
      <div class="v4-version-edit-row-head">
        <b>Позиция ${index + 1}</b>
        <button type="button" data-version-remove-row="${index}" aria-label="Удалить позицию ${index + 1}">Удалить</button>
      </div>
      <div class="v4-version-edit-grid">
        <label>Название<input data-version-row-field="name" data-index="${index}" value="${esc(item.name)}"></label>
        <label>Категория<input data-version-row-field="category" data-index="${index}" value="${esc(item.category)}"></label>
        <label>Тип<input data-version-row-field="item_type" data-index="${index}" value="${esc(item.item_type)}"></label>
        <label>Единица<input data-version-row-field="unit" data-index="${index}" value="${esc(item.unit)}"></label>
        <label>Количество<input data-version-row-field="qty" data-index="${index}" type="number" min="0" step="0.01" value="${calculated.qty}"></label>
        <label>Себестоимость за ед.<input data-version-row-field="contractor_price" data-index="${index}" type="number" min="0" step="1" value="${calculated.contractor_price}"></label>
        <label>Цена клиенту за ед.<input data-version-row-field="client_price" data-index="${index}" type="number" min="0" step="1" value="${calculated.client_price}"></label>
        <label class="v4-version-comment">Комментарий<input data-version-row-field="comment" data-index="${index}" value="${esc(item.comment)}"></label>
      </div>
      <div class="v4-version-row-summary">
        <span>Себестоимость: <b data-version-row-contractor="${index}">${money(calculated.contractor_sum)}</b></span>
        <span>Клиенту: <b data-version-row-client="${index}">${money(calculated.client_sum)}</b></span>
        <span>Прибыль: <b data-version-row-profit="${index}">${money(calculated.profit)}</b></span>
      </div>
    </article>`;
}

function renderVersionEditor() {
  const host = editorHost();
  if (!host) return;
  if (editorBusy) {
    host.innerHTML = '<section class="v4-subcard v4-version-editor"><div class="v4-empty">Загружаю расчёт для правок...</div></section>';
    return;
  }
  if (!versionDraft) {
    host.innerHTML = '';
    return;
  }

  const totals = calculationVersionTotals(versionDraft.items);
  const route = persistenceRoute();
  host.innerHTML = `
    <section id="calculationVersionEditor" class="v4-subcard v4-version-editor" aria-labelledby="calculationVersionEditorTitle">
      <div class="v4-subcard-head">
        <div>
          <p class="v4-kicker">Правки клиента без новой заявки</p>
          <h3 id="calculationVersionEditorTitle">Новая версия v${versionDraft.nextVersion}</h3>
          <p>Скопировано из версии v${versionDraft.sourceVersion}. Исходный расчёт, его КП и заказ останутся без изменений.</p>
        </div>
        <button type="button" data-version-close>Закрыть редактор</button>
      </div>
      <div class="v4-version-source-note" role="note">
        <b>Что делать:</b>
        <span>измените позиции, количество, себестоимость или цену клиенту и сохраните новую версию в этой же заявке.</span>
      </div>
      <div class="v4-version-source-note" role="status" data-version-persistence="${esc(route.mode)}">
        <b>${esc(route.title)}:</b>
        <span>${esc(route.description)}</span>
      </div>
      <div class="v4-form-grid v4-version-main-fields">
        <label>Название новой версии<input data-version-field="title" value="${esc(versionDraft.title)}"></label>
        <label>Потребность<select data-version-field="needId">${needOptions(versionDraft.needId)}</select></label>
        <label>Комментарий для клиента<input data-version-field="publicComment" value="${esc(versionDraft.publicComment)}"></label>
      </div>
      <div class="v4-version-edit-list">
        ${versionDraft.items.length ? versionDraft.items.map(rowEditor).join('') : '<div class="v4-empty is-error">Все позиции удалены. Добавьте хотя бы одну строку.</div>'}
      </div>
      <div class="v4-form-actions v4-version-row-actions">
        <button type="button" data-version-add-row>Добавить ручную позицию</button>
      </div>
      <div class="v4-version-totals ${totals.warning_level === 'critical' ? 'is-error' : totals.warning_level === 'warning' ? 'is-warn' : 'is-good'}" data-version-totals>
        <span><b>Клиенту:</b> <em data-version-total-client>${money(totals.client_total)}</em></span>
        <span><b>Себестоимость:</b> <em data-version-total-contractor>${money(totals.contractor_cost)}</em></span>
        <span><b>Прибыль:</b> <em data-version-total-profit>${money(totals.profit)}</em></span>
        <span><b>Маржа:</b> <em data-version-total-margin>${Math.round(totals.margin_percent)}%</em></span>
      </div>
      <div class="v4-version-warnings" data-version-warnings>${totals.warnings.length ? esc(totals.warnings.join(', ')) : 'Расчёт готов к сохранению.'}</div>
      <div class="v4-form-actions">
        <button type="button" class="v4-primary" data-version-save ${totals.canSave && !saveBusy ? '' : 'disabled'}>${saveBusy ? 'Сохраняю...' : `${esc(route.buttonPrefix)} v${versionDraft.nextVersion}`}</button>
        <button type="button" data-version-close>Отменить правки</button>
      </div>
    </section>`;
}

function updateEditorComputed() {
  if (!versionDraft) return;
  const totals = calculationVersionTotals(versionDraft.items);
  versionDraft.items.forEach((item, index) => {
    const calculated = calculationVersionItem(item, index);
    const contractor = document.querySelector(`[data-version-row-contractor="${index}"]`);
    const client = document.querySelector(`[data-version-row-client="${index}"]`);
    const profit = document.querySelector(`[data-version-row-profit="${index}"]`);
    if (contractor) contractor.textContent = money(calculated.contractor_sum);
    if (client) client.textContent = money(calculated.client_sum);
    if (profit) profit.textContent = money(calculated.profit);
  });
  const totalBox = document.querySelector('[data-version-totals]');
  if (totalBox) {
    totalBox.className = `v4-version-totals ${totals.warning_level === 'critical' ? 'is-error' : totals.warning_level === 'warning' ? 'is-warn' : 'is-good'}`;
  }
  const values = {
    '[data-version-total-client]': money(totals.client_total),
    '[data-version-total-contractor]': money(totals.contractor_cost),
    '[data-version-total-profit]': money(totals.profit),
    '[data-version-total-margin]': `${Math.round(totals.margin_percent)}%`
  };
  Object.entries(values).forEach(([selector, value]) => {
    const element = document.querySelector(selector);
    if (element) element.textContent = value;
  });
  const warnings = document.querySelector('[data-version-warnings]');
  if (warnings) warnings.textContent = totals.warnings.length ? totals.warnings.join(', ') : 'Расчёт готов к сохранению.';
  const saveButton = document.querySelector('[data-version-save]');
  if (saveButton) saveButton.disabled = !totals.canSave || saveBusy;
}

async function fetchCalculationItems(calculationId) {
  const response = await timeout(
    supabaseClient
      .from('leader_lead_calculation_items')
      .select(ITEM_FIELDS)
      .eq('calculation_id', calculationId)
      .order('sort_order', { ascending: true }),
    12000,
    'Состав расчёта не загрузился за 12 секунд'
  );
  if (response.error) throw response.error;
  return response.data || [];
}

async function startVersionDraft(calculationId) {
  const source = (v4State.calculations || []).find((calculation) => calculation.id === calculationId);
  if (!source) {
    toast('Расчёт не найден. Обновите список.');
    return;
  }
  if (source.lead_id !== v4State.route.leadId) {
    toast('Расчёт относится к другой заявке');
    return;
  }
  editorBusy = true;
  renderVersionEditor();
  try {
    const items = await fetchCalculationItems(calculationId);
    if (!items.length) throw new Error('В исходном расчёте нет позиций для копирования');
    versionDraft = createCalculationVersionDraft(source, items, v4State.calculations || []);
    versionDraft.sourceUpdatedAt = source.updated_at;
    if (persistenceRoute().mode === 'staging_edge') {
      versionDraft.idempotencyKey = createCalculationVersionIdempotencyKey(source.id);
    }
    renderVersionEditor();
    byId('calculationVersionEditor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    document.querySelector('[data-version-field="title"]')?.focus();
    toast(`Расчёт v${source.version_number || 1} скопирован в новую версию`);
  } catch (error) {
    versionDraft = null;
    toast(friendlyError(error));
    setStatus(`Не удалось открыть расчёт для правок: ${friendlyError(error)}`, 'error');
  } finally {
    editorBusy = false;
    renderVersionEditor();
  }
}

async function rollbackLegacyCalculation(calculationId) {
  if (!calculationId) return;
  const response = await timeout(
    supabaseClient.from('leader_lead_calculations').delete().eq('id', calculationId),
    10000,
    'Не удалось откатить незавершённую версию'
  );
  if (response.error) throw response.error;
}

async function freshNextVersion(leadId) {
  const response = await timeout(
    supabaseClient
      .from('leader_lead_calculations')
      .select('id,version_number')
      .eq('lead_id', leadId),
    10000,
    'Не удалось проверить номер новой версии'
  );
  if (response.error) throw response.error;
  return nextCalculationVersion(response.data || []);
}

async function refreshSavedCalculations(leadId) {
  await loadCalculations(leadId);
  document.querySelector('#savedCalculationsSnapshot [data-v2-calc-refresh]')?.click();
  return true;
}

async function saveVersionDraftThroughStaging(leadId) {
  const source = sourceCalculation();
  if (!source || source.lead_id !== leadId) throw new Error('Исходный расчёт изменился. Откройте его заново.');
  if (!versionDraft.idempotencyKey) {
    versionDraft.idempotencyKey = createCalculationVersionIdempotencyKey(source.id);
  }
  const transportDraft = buildCalculationVersionTransportDraft(versionDraft);
  const result = await invokeStagingCalculationVersion({
    client: supabaseClient,
    supabaseUrl: V4_CONFIG.supabaseUrl,
    canWrite: canPerformV4Action(CRM_V4_ACTIONS.CALCULATIONS_WRITE),
    sourceCalculation: source,
    draft: transportDraft,
    expectedUpdatedAt: versionDraft.sourceUpdatedAt || source.updated_at,
    readAfterSuccess: () => refreshSavedCalculations(leadId)
  });
  if (!result.ok) throw new Error(result.message);

  const savedVersion = Number(result.calculation?.version_number || versionDraft.nextVersion || 0) || versionDraft.nextVersion;
  versionDraft = null;
  renderVersionEditor();
  setStatus(
    result.replay
      ? `Безопасный повтор вернул существующую тестовую версию v${savedVersion} без дубликата.`
      : `Тестовая версия v${savedVersion} сохранена атомарно в staging. Старый расчёт не изменён.`,
    'good'
  );
  toast(result.message);
}

async function saveVersionDraftLegacy(leadId, totals) {
  let createdCalculationId = null;
  try {
    const nextVersion = await freshNextVersion(leadId);
    versionDraft.nextVersion = nextVersion;
    const calcPayload = {
      lead_id: leadId,
      need_id: versionDraft.needId || null,
      client_id: versionDraft.clientId || v4State.currentLead?.converted_client_id || null,
      title: versionDraft.title || `Расчёт — правки v${nextVersion}`,
      status: 'Черновик',
      version_number: nextVersion,
      client_total: totals.client_total,
      contractor_cost: totals.contractor_cost,
      profit: totals.profit,
      margin_percent: totals.margin_percent,
      warning_level: totals.warning_level,
      warnings: totals.warnings,
      public_comment: versionDraft.publicComment || '',
      internal_comment: versionDraft.internalComment,
      commercial_offer_id: null,
      order_id: null,
      created_by: v4State.user?.id || null,
      updated_by: v4State.user?.id || null
    };
    const calcResponse = await timeout(
      supabaseClient
        .from('leader_lead_calculations')
        .insert(calcPayload)
        .select(CALC_FIELDS)
        .single(),
      14000,
      'Новая версия не сохранилась за 14 секунд'
    );
    if (calcResponse.error) throw calcResponse.error;
    const calculation = calcResponse.data;
    createdCalculationId = calculation.id;
    const itemPayloads = totals.items.map((item) => ({
      ...item,
      calculation_id: calculation.id,
      lead_id: leadId
    }));
    const itemsResponse = await timeout(
      supabaseClient
        .from('leader_lead_calculation_items')
        .insert(itemPayloads)
        .select('id'),
      14000,
      'Позиции новой версии не сохранились за 14 секунд'
    );
    if (itemsResponse.error) throw itemsResponse.error;

    versionDraft = null;
    renderVersionEditor();
    await refreshSavedCalculations(leadId);
    setStatus(`Новая версия v${nextVersion} сохранена в этой же заявке. Старый расчёт не изменён.`, 'good');
    toast(`Сохранена новая версия v${nextVersion}`);
  } catch (error) {
    if (createdCalculationId) {
      try {
        await rollbackLegacyCalculation(createdCalculationId);
      } catch (rollbackError) {
        console.error('CRM calculation version rollback failed:', rollbackError);
      }
    }
    throw error;
  }
}

async function saveVersionDraft() {
  if (!versionDraft || saveBusy) return;
  const leadId = v4State.route.leadId;
  if (!leadId || versionDraft.leadId !== leadId) {
    toast('Заявка изменилась. Откройте расчёт заново.');
    return;
  }
  const totals = calculationVersionTotals(versionDraft.items);
  if (!totals.canSave) {
    toast('Проверьте количество, цену клиенту и прибыль');
    updateEditorComputed();
    return;
  }

  const route = persistenceRoute();
  saveBusy = true;
  renderVersionEditor();
  try {
    setStatus(
      route.mode === 'staging_edge'
        ? 'Сохраняю тестовую версию атомарно через staging...'
        : 'Сохраняю новую версию расчёта...',
      'warn'
    );
    if (route.mode === 'staging_edge') await saveVersionDraftThroughStaging(leadId);
    else await saveVersionDraftLegacy(leadId, totals);
  } catch (error) {
    const message = friendlyError(error);
    setStatus(`Ошибка сохранения новой версии: ${message}`, 'error');
    toast(message);
  } finally {
    saveBusy = false;
    renderVersionEditor();
  }
}

function openEmptyBuilder() {
  renderCalculations();
  window.setTimeout(() => {
    enhanceBuilder();
    byId('calculationsBox')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    byId('calcTitle')?.focus();
    toast('Новый пустой расчёт открыт в этой же заявке');
  }, 0);
}

function bindEvents() {
  document.addEventListener('click', (event) => {
    const sourceButton = event.target.closest?.('[data-calc-version-source]');
    if (sourceButton) {
      startVersionDraft(sourceButton.dataset.calcVersionSource);
      return;
    }
    if (event.target.closest?.('[data-calc-new-empty]')) {
      openEmptyBuilder();
      return;
    }
    if (event.target.closest?.('[data-version-close]')) {
      versionDraft = null;
      renderVersionEditor();
      return;
    }
    if (event.target.closest?.('[data-version-add-row]')) {
      versionDraft?.items.push({
        catalog_id: null,
        category: 'Ручная позиция',
        item_type: 'Услуга',
        name: 'Новая позиция',
        unit: 'шт',
        qty: 1,
        contractor_price: 0,
        client_price: 0,
        comment: '',
        data: { calculation_mode: 'custom', price_source: 'manual' },
        sort_order: (versionDraft.items.length || 0) + 1
      });
      renderVersionEditor();
      return;
    }
    const removeButton = event.target.closest?.('[data-version-remove-row]');
    if (removeButton && versionDraft) {
      versionDraft.items.splice(Number(removeButton.dataset.versionRemoveRow), 1);
      renderVersionEditor();
      return;
    }
    if (event.target.closest?.('[data-version-save]')) saveVersionDraft();
  });

  document.addEventListener('input', (event) => {
    if (!versionDraft) return;
    const mainField = event.target.closest?.('[data-version-field]');
    if (mainField) {
      const field = mainField.dataset.versionField;
      if (field === 'title') versionDraft.title = mainField.value;
      if (field === 'publicComment') versionDraft.publicComment = mainField.value;
      return;
    }
    const rowField = event.target.closest?.('[data-version-row-field]');
    if (!rowField) return;
    const index = Number(rowField.dataset.index);
    const field = rowField.dataset.versionRowField;
    if (!versionDraft.items[index]) return;
    versionDraft.items[index][field] = ['qty', 'contractor_price', 'client_price'].includes(field)
      ? Math.max(0, number(rowField.value))
      : rowField.value;
    updateEditorComputed();
  });

  document.addEventListener('change', (event) => {
    if (!versionDraft) return;
    const mainField = event.target.closest?.('[data-version-field]');
    if (mainField?.dataset.versionField === 'needId') versionDraft.needId = mainField.value || null;
  });

  document.addEventListener('leader-v4:route-change', () => {
    versionDraft = null;
    byId('savedCalculationsWorkspace')?.remove();
    scheduleReconcile();
  });
  document.addEventListener('leader-v4:lead-card-rendered', scheduleReconcile);
}

export function bootCalculationVersionEditor() {
  if (typeof document === 'undefined') return;
  ensureStyles();
  const section = byId('leadCardSection');
  if (!section) return;
  layoutObserver = new MutationObserver(scheduleReconcile);
  layoutObserver.observe(section, { childList: true, subtree: true });
  bindEvents();
  scheduleReconcile();
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', bootCalculationVersionEditor);
}
