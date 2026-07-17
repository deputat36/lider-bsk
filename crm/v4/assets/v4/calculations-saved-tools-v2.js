import { supabaseClient } from './supabase-client.js';
import { timeout, friendlyError } from './api.js';
import { v4State, subscribeState } from './state.js';
import { byId, setStatus, toast } from './ui.js';
import { CRM_V4_ACTIONS, canPerformV4Action } from './action-permissions-v1.js';
import { calculationOfferNextAction } from './calculation-offer-next-action-model-v1.js';
import {
  savedCalculationDetailsCopy,
  savedCalculationItemReview,
  savedCalculationPositionLabel
} from './calculation-saved-review-model-v1.js';
import {
  calculationVersionAudit,
  calculationVersionIntegrityCopy,
  calculationVersionState
} from './calculation-version-integrity-model-v1.js';

const ITEM_FIELDS = 'id,calculation_id,lead_id,catalog_id,category,item_type,name,unit,qty,contractor_price,contractor_sum,markup_percent,client_price,client_sum,profit,margin_percent,comment,data,sort_order,created_at,updated_at';

let lastLeadId = null;
let selectedId = null;
let selectedItems = [];
let detailsBusy = false;
let detailsError = '';
let renderTimer = null;
let previousOffers = null;
let previousCalculations = null;
let previousCalculationsBusy = null;
let previousCalculationsError = null;

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}

function money(value) {
  return `${Math.round(Number(value || 0)).toLocaleString('ru-RU')} ₽`;
}

function dateRu(value) {
  if (!value) return '—';
  try { return new Date(value).toLocaleString('ru-RU'); } catch (_) { return String(value); }
}

function host() {
  return byId('savedCalculationsBox');
}

function resetIfLeadChanged() {
  const leadId = v4State.route.leadId || null;
  if (lastLeadId === leadId) return;
  lastLeadId = leadId;
  selectedId = null;
  selectedItems = [];
  detailsBusy = false;
  detailsError = '';
}

function calcClass(calc, versionState) {
  const classes = [];
  if (calc.order_id) classes.push('is-good');
  else if (calc.commercial_offer_id) classes.push('is-warn');
  if (versionState.isDuplicate) classes.push('is-version-duplicate');
  if (versionState.protectedSource) classes.push('is-version-protected');
  return classes.length ? ` ${classes.join(' ')}` : '';
}

function renderVersionBadges(versionState) {
  if (!versionState.badges.length) return '';
  return versionState.badges
    .map((badge) => `<span class="v4-saved-calc-version-badge is-${esc(versionState.tone)}">${esc(badge)}</span>`)
    .join('');
}

function renderCalc(calc, audit) {
  const active = calc.id === selectedId;
  const versionState = calculationVersionState(calc, audit);
  const nextAction = calculationOfferNextAction(calc, v4State.offers || []);
  const offerAction = nextAction.enabled && canPerformV4Action(CRM_V4_ACTIONS.OFFERS_WRITE)
    ? `<button type="button" class="v4-primary" data-v2-calc-create-offer="${esc(calc.id)}">${esc(nextAction.label)}</button>`
    : '';
  return `
    <article class="v4-saved-calc-card${active ? ' is-active' : ''}${calcClass(calc, versionState)}" data-version-state="${esc(versionState.tone)}">
      <div>
        <div class="v4-saved-calc-title"><h4>${esc(calc.title || 'Расчёт')}</h4><span>${esc(calc.status || 'Черновик')}</span></div>
        <div class="v4-saved-calc-meta">
          <span><b>Версия:</b> ${versionState.version}</span>
          <span><b>Клиенту:</b> ${money(calc.client_total)}</span>
          <span><b>Себест.:</b> ${money(calc.contractor_cost)}</span>
          <span><b>Прибыль:</b> ${money(calc.profit)}</span>
          <span><b>Маржа:</b> ${Math.round(Number(calc.margin_percent || 0))}%</span>
          ${renderVersionBadges(versionState)}
        </div>
      </div>
      <div class="v4-saved-calc-actions">
        ${offerAction}
        <button type="button" data-v2-calc-details="${esc(calc.id)}" aria-expanded="${active ? 'true' : 'false'}" aria-controls="savedCalculationDetails">${active ? 'Обновить состав' : 'Показать состав'}</button>
      </div>
    </article>`;
}

function renderItemName(item, index) {
  const review = savedCalculationItemReview(item, index);
  const characteristics = review.characteristics.length
    ? `<ul class="v4-saved-calc-characteristics">${review.characteristics.map((value) => `<li>${esc(value)}</li>`).join('')}</ul>`
    : '';
  return `
    <div class="v4-saved-calc-item-title"><span class="v4-saved-calc-row-number">${review.rowNumber}</span><b>${esc(review.name)}</b></div>
    <div class="v4-saved-calc-item-tags"><span>${esc(review.category)}</span><span>${esc(review.itemType)}</span>${review.modeLabel && review.modeLabel !== review.itemType ? `<span>${esc(review.modeLabel)}</span>` : ''}${review.priceSource ? `<span>${esc(review.priceSource)}</span>` : ''}</div>
    ${item.comment ? `<small>${esc(item.comment)}</small>` : ''}
    ${characteristics}
  `;
}

function renderVersionGuard(calc, audit) {
  const versionState = calculationVersionState(calc, audit);
  return `
    <div class="v4-saved-calc-version-guard is-${esc(versionState.tone)}" role="note" data-version-guard="${esc(versionState.tone)}">
      <div>
        <b>${esc(versionState.title)}</b>
        <p>${esc(versionState.message)}</p>
      </div>
      <span>v${versionState.version} → новая v${versionState.nextVersion}</span>
    </div>`;
}

function renderDetails(audit) {
  const calc = (v4State.calculations || []).find((item) => item.id === selectedId);
  if (!selectedId) return '<div class="v4-empty">Выберите расчёт и нажмите «Показать состав», чтобы проверить сохранённые строки.</div>';
  if (detailsBusy) return '<div class="v4-empty">Загружаю состав расчёта...</div>';
  if (detailsError) return `<div class="v4-empty is-error">${esc(detailsError)}</div>`;
  if (!calc) return '<div class="v4-empty is-error">Расчёт не найден.</div>';
  if (!selectedItems.length) return '<div class="v4-empty">В расчёте нет сохранённых позиций.</div>';

  const rows = selectedItems.map((item, index) => {
    const review = savedCalculationItemReview(item, index);
    return `
      <tr aria-label="${esc(review.rowLabel)}">
        <td data-label="Позиция">${renderItemName(item, index)}</td>
        <td data-label="Единица">${esc(item.unit || 'шт')}</td>
        <td data-label="Количество">${Number(item.qty || 0).toLocaleString('ru-RU')}</td>
        <td data-label="Себестоимость за единицу">${money(item.contractor_price)}</td>
        <td data-label="Цена клиенту за единицу">${money(item.client_price)}</td>
        <td data-label="Сумма клиенту">${money(item.client_sum)}</td>
        <td data-label="Маржа">${Math.round(Number(item.margin_percent || 0))}%</td>
      </tr>`;
  }).join('');

  return `
    <div id="savedCalculationDetails" class="v4-saved-calc-details">
      <div class="v4-subcard-head">
        <div><h3>Состав расчёта: ${esc(calc.title || 'Расчёт')}</h3><p>Создан: ${dateRu(calc.created_at)}. ${esc(savedCalculationDetailsCopy(selectedItems.length))}</p></div>
        <div class="v4-saved-calc-details-actions"><span class="v4-saved-calc-count" aria-live="polite">${esc(savedCalculationPositionLabel(selectedItems.length))}</span><button type="button" data-v2-calc-close>Скрыть состав</button></div>
      </div>
      ${renderVersionGuard(calc, audit)}
      <div class="v4-table-wrap v4-saved-calc-review-table">
        <table class="v4-table v4-saved-calc-table">
          <thead><tr><th>Позиция</th><th>Ед.</th><th>Кол-во</th><th>Себест. ед.</th><th>Клиенту ед.</th><th>Сумма</th><th>Маржа</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;
}

function render() {
  resetIfLeadChanged();
  const box = host();
  if (!box) return;
  if (!v4State.route.leadId) {
    box.innerHTML = '<div class="v4-empty">Выберите заявку из списка.</div>';
    return;
  }
  const calculations = v4State.calculations || [];
  const audit = calculationVersionAudit(calculations);
  const integrity = calculationVersionIntegrityCopy(calculations);
  box.className = 'v4-calculations-host v4-saved-calc-host';
  box.innerHTML = `
    <section class="v4-subcard v4-saved-calc-section">
      <div class="v4-subcard-head">
        <div>
          <h3>Сохранённые расчёты</h3>
          <p>Здесь находятся сохранённые версии. Новый расчёт создаётся ниже в едином конструкторе для типовых и нестандартных позиций.</p>
        </div>
        <div class="v4-form-actions"><button type="button" data-v2-calc-refresh>Обновить список</button></div>
      </div>
      <div class="v4-saved-calc-integrity is-${esc(integrity.tone)}" role="status" data-version-integrity="${audit.hasDuplicates ? 'duplicate' : 'ok'}">
        <div><b>${esc(integrity.title)}</b><p>${esc(integrity.message)}</p></div>
        ${audit.calculationCount ? `<span>${audit.calculationCount} сохранено</span>` : ''}
      </div>
      <div class="v4-saved-calc-list">
        ${v4State.calculationsBusy ? '<div class="v4-empty">Загружаю расчёты...</div>' : v4State.calculationsError ? `<div class="v4-empty is-error">${esc(v4State.calculationsError)}</div>` : calculations.length ? calculations.map((calc) => renderCalc(calc, audit)).join('') : '<div class="v4-empty">Сохранённых расчётов пока нет. Ниже можно создать первый расчёт в едином конструкторе.</div>'}
      </div>
      ${renderDetails(audit)}
    </section>`;
}

function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(render, 40);
}

async function loadItems(id) {
  selectedId = id;
  selectedItems = [];
  detailsError = '';
  detailsBusy = true;
  render();
  try {
    const response = await timeout(
      supabaseClient
        .from('leader_lead_calculation_items')
        .select(ITEM_FIELDS)
        .eq('calculation_id', id)
        .order('sort_order', { ascending: true }),
      12000,
      'Состав расчёта не загрузился за 12 секунд'
    );
    if (response.error) throw response.error;
    selectedItems = response.data || [];
  } catch (error) {
    detailsError = friendlyError(error);
    setStatus(`Ошибка состава расчёта: ${detailsError}`, 'error');
  } finally {
    detailsBusy = false;
    render();
  }
}

function bind() {
  previousOffers = v4State.offers;
  previousCalculations = v4State.calculations;
  previousCalculationsBusy = v4State.calculationsBusy;
  previousCalculationsError = v4State.calculationsError;
  subscribeState((state) => {
    if (
      state.offers === previousOffers
      && state.calculations === previousCalculations
      && state.calculationsBusy === previousCalculationsBusy
      && state.calculationsError === previousCalculationsError
    ) return;
    previousOffers = state.offers;
    previousCalculations = state.calculations;
    previousCalculationsBusy = state.calculationsBusy;
    previousCalculationsError = state.calculationsError;
    scheduleRender();
  });
  document.addEventListener('leader-v4:lead-card-rendered', render);
  document.addEventListener('leader-v4:route-change', () => {
    lastLeadId = null;
    selectedId = null;
    selectedItems = [];
    detailsError = '';
    render();
  });
  document.addEventListener('leader-v4:crm-ready', scheduleRender);
  document.addEventListener('click', async (event) => {
    const createOffer = event.target.closest?.('[data-v2-calc-create-offer]');
    if (createOffer) {
      document.dispatchEvent(new CustomEvent('leader-v4:create-offer-from-calculation', {
        detail: { calculationId: createOffer.dataset.v2CalcCreateOffer }
      }));
      return;
    }
    const details = event.target.closest?.('[data-v2-calc-details]');
    if (details) {
      await loadItems(details.dataset.v2CalcDetails);
      return;
    }
    if (event.target.closest?.('[data-v2-calc-close]')) {
      selectedId = null;
      selectedItems = [];
      detailsError = '';
      render();
      return;
    }
    if (event.target.closest?.('[data-v2-calc-refresh]')) {
      toast('Обновляю расчёты');
      document.dispatchEvent(new CustomEvent('leader-v4:refresh-calculations'));
    }
  });
}

bind();
scheduleRender();
