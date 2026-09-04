import { supabaseClient } from './supabase-client.js';
import { timeout, friendlyError } from './api.js';
import { v4State, setState } from './state.js';
import { byId, setStatus, toast } from './ui.js';
import { marginPercentFromMarkup, markupPercentForSubtotal, priceWithMarkup, repriceAutomaticItems } from './calculation-pricing-model-v1.js';
import { needCalculationPrefill } from './need-calculation-prefill-v1.js';
import { circleAreaSquareMeters, parseCalculationDiameters, parseCalculationPairs } from './calculation-spec-model-v1.js';
import { V4_CONFIG } from './config.js';
import { isStagingWorkflowEnvironment } from './workflow-staging-transport-v1.js';
import { catalogRowToDraftItem, catalogRowToTypicalDraftItem, legacyCatalogFallbackRows, loadCalculationCatalog } from './calculation-catalog-source-v1.js';
import { createCalculationCatalogItem } from './calculation-catalog-create-v1.js';
import { canPerformV4Action, CRM_V4_ACTIONS } from './action-permissions-v1.js';
import { contractorQuoteDraftItem } from './calculation-contractor-quote-model-v1.js';
import { compositeDraftValidation } from './calculation-composite-model-v1.js';

const CALC_FIELDS = 'id,lead_id,need_id,client_id,title,status,version_number,client_total,contractor_cost,profit,margin_percent,warning_level,warnings,public_comment,internal_comment,commercial_offer_id,order_id,created_by,updated_by,created_at,updated_at';
const ITEM_FIELDS = 'id,calculation_id,lead_id,catalog_id,category,item_type,name,unit,qty,contractor_price,contractor_sum,markup_percent,client_price,client_sum,profit,margin_percent,comment,data,sort_order,created_at,updated_at';

const CATALOG = [
  { category: 'Широкоформатная печать', name: 'Баннер 340/440 — стандарт', unit: 'м²', price: 350 },
  { category: 'Широкоформатная печать', name: 'Баннер 340/440 — устойчивая печать', unit: 'м²', price: 450 },
  { category: 'Широкоформатная печать', name: 'Баннер 510 — плотный', unit: 'м²', price: 520 },
  { category: 'Широкоформатная печать', name: 'Самоклеящаяся пленка (мат/гл/прозр.)', unit: 'м²', price: 550 },
  { category: 'Широкоформатная печать', name: 'Перфорированная пленка (OWV)', unit: 'м²', price: 750 },
  { category: 'Услуги по баннерам', name: 'Установка люверсов', unit: 'шт', price: 15 },
  { category: 'Услуги по баннерам', name: 'Проклейка баннера по краю', unit: 'м', price: 30 },
  { category: 'Услуги по баннерам', name: 'Склейка швов/карман', unit: 'м', price: 60 },
  { category: 'Пленка и листовые материалы', name: 'ПВХ вспененный 3 мм', unit: 'м²', price: 1400 },
  { category: 'Пленка и листовые материалы', name: 'ПВХ вспененный 4 мм', unit: 'м²', price: 1800 },
  { category: 'Пленка и листовые материалы', name: 'ПВХ вспененный 5 мм', unit: 'м²', price: 2150 },
  { category: 'Пленка и листовые материалы', name: 'ПВХ вспененный 6 мм', unit: 'м²', price: 2650 },
  { category: 'Пленка и листовые материалы', name: 'ПВХ вспененный 8 мм', unit: 'м²', price: 3800 },
  { category: 'Пленка и листовые материалы', name: 'ПВХ вспененный 10 мм', unit: 'м²', price: 4400 },
  { category: 'Пленка и листовые материалы', name: 'ПВХ вспененный 20 мм', unit: 'м²', price: 7600 },
  { category: 'Пленка и листовые материалы', name: 'Железо (листовой металл)', unit: 'м²', price: 1500 },
  { category: 'Пленка и листовые материалы', name: 'Самоклеящаяся мономерная пленка', unit: 'м²', price: 700 },
  { category: 'Пленка и листовые материалы', name: 'Монтажная пленка', unit: 'м²', price: 300 },
  { category: 'Печать фото', name: 'A4 фото (одна сторона)', unit: 'шт', price: 40 },
  { category: 'Печать фото', name: 'A4 ламинация', unit: 'шт', price: 40 }
];

const LEGACY_CATALOG_ROWS = legacyCatalogFallbackRows(CATALOG);
let calculationCatalogRows = LEGACY_CATALOG_ROWS;
let calculationCatalogSource = 'fallback';
let calculationCatalogLoadPromise = null;

const MODES = [
  ['catalog', 'Из каталога'],
  ['contractor_quote', 'Подрядчик / готовая смета'],
  ['composite', 'Составное изделие'],
  ['banner', 'Баннер'],
  ['film', 'Плёнка / наклейки'],
  ['sheet', 'ПВХ / листовой материал'],
  ['pvc_shapes', 'ПВХ-фигуры'],
  ['letters', 'Буквы / цифры'],
  ['photo', 'Фото A4'],
  ['service', 'Дизайн / монтаж / доставка'],
  ['custom', 'Ручная позиция']
];

let draftItems = [];
const calculationLoads = new Map();
let saveBusy = false;
let calculationModeError = '';

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}

function money(value) {
  return `${Math.round(Number(value || 0)).toLocaleString('ru-RU')} ₽`;
}

function parseNum(value) {
  const number = Number(String(value ?? '').replace(',', '.').replace(/\s+/g, ''));
  return Number.isFinite(number) ? number : 0;
}

function num(id) {
  return parseNum(byId(id)?.value || '');
}

function val(id) {
  return byId(id)?.value?.trim() || '';
}

function checked(id) {
  return Boolean(byId(id)?.checked);
}

function catalogByName(name) {
  return calculationCatalogRows.find((item) => item.name === name)
    || LEGACY_CATALOG_ROWS.find((item) => item.name === name)
    || null;
}

function catalogOptions(filter, selected = '') {
  return calculationCatalogRows.filter(filter).map((item) => `<option value="${esc(item.name)}" ${item.name === selected ? 'selected' : ''}>${esc(item.name)} · ${money(item.contractor_price)} / ${esc(item.unit)}</option>`).join('');
}

function catalogBackedOptions(selected = '') {
  return calculationCatalogRows.map((row) => `<option value="${esc(row.id || row.name)}" ${(row.id || row.name) === selected ? 'selected' : ''}>${esc(row.category)} · ${esc(row.name)} · ${esc(row.unit)}</option>`).join('');
}

function catalogBackedRow(value) {
  return calculationCatalogRows.find((row) => (row.id || row.name) === value) || calculationCatalogRows[0] || null;
}

function catalogSourceLabel() {
  return calculationCatalogSource === 'remote' ? 'Каталог CRM' : 'Встроенный резервный каталог';
}

function canManageCalculationCatalog() {
  return !isStagingWorkflowEnvironment(V4_CONFIG.supabaseUrl)
    && canPerformV4Action(CRM_V4_ACTIONS.CATALOG_MANAGE);
}

function renderCatalogCreatePanel() {
  if (isStagingWorkflowEnvironment(V4_CONFIG.supabaseUrl)) {
    return '<div class="v4-calc-mode-help">Добавление новой номенклатуры отключено в staging. Для проверки расчёта используйте резервный каталог или ручную позицию.</div>';
  }
  if (!canManageCalculationCatalog()) {
    return '<div class="v4-calc-mode-help">Новой номенклатурой управляет руководитель. Разовую работу можно добавить режимом «Ручная позиция».</div>';
  }
  return `
    <details class="v4-calc-settings">
      <summary>+ Новая позиция каталога</summary>
      <div class="v4-calc-mode-help">Добавьте повторно используемую услугу или материал. После сохранения позиция сразу будет выбрана в этом расчёте.</div>
      <div class="v4-form-grid">
        <label>Категория<input id="calcCatalogCreateCategory" placeholder="Например: Наружная реклама"></label>
        <label>Название<input id="calcCatalogCreateName" placeholder="Например: Табличка ПВХ 3 мм"></label>
        <label>Ед. измерения
          <select id="calcCatalogCreateUnit"><option>шт</option><option>м²</option><option>м</option><option>комплект</option><option>услуга</option><option>100 шт</option></select>
        </label>
        <label>Тип
          <select id="calcCatalogCreateType"><option>Изготовление</option><option>Материал</option><option>Услуга</option><option>Дизайн</option><option>Монтаж</option></select>
        </label>
        <label>Себестоимость за ед., ₽<input id="calcCatalogCreateCost" type="number" min="0" step="0.01" value="0"></label>
        <label>Наценка по умолчанию, %<input id="calcCatalogCreateMarkup" type="number" min="0" step="0.1" value="30"></label>
        <label>Минимальная цена клиенту, ₽<input id="calcCatalogCreateMin" type="number" min="0" step="0.01" value="0"></label>
        <label>Фиксированная цена клиенту, ₽<input id="calcCatalogCreateClient" type="number" min="0" step="0.01" placeholder="Пусто = по наценке"></label>
        <label>Описание<input id="calcCatalogCreateDescription" placeholder="Что входит в позицию"></label>
      </div>
      <div class="v4-form-actions">
        <button id="calcCreateCatalogItemBtn" type="button">Добавить в каталог</button>
      </div>
    </details>`;
}

function catalogCreateInputFromForm() {
  return {
    category: val('calcCatalogCreateCategory'),
    name: val('calcCatalogCreateName'),
    unit: val('calcCatalogCreateUnit') || 'шт',
    item_type: val('calcCatalogCreateType') || 'Изготовление',
    contractor_price: num('calcCatalogCreateCost'),
    markup_percent: num('calcCatalogCreateMarkup'),
    min_client_price: num('calcCatalogCreateMin'),
    default_client_price: num('calcCatalogCreateClient'),
    description: val('calcCatalogCreateDescription')
  };
}

async function createCatalogItemFromCalculation() {
  if (!canManageCalculationCatalog()) {
    toast('Добавлять номенклатуру могут только администратор или владелец');
    return;
  }
  const button = byId('calcCreateCatalogItemBtn');
  if (button) button.disabled = true;
  try {
    setStatus('Добавляю позицию в каталог...', 'warn');
    const result = await timeout(createCalculationCatalogItem({
      supabaseClient,
      input: catalogCreateInputFromForm(),
      allowWrite: canManageCalculationCatalog()
    }), 10000, 'Каталог не ответил за 10 секунд');
    if (!result.ok || !result.row) {
      const message = result.error?.message || 'Не удалось добавить позицию в каталог.';
      toast(message);
      setStatus(message, 'error');
      return;
    }
    const row = result.row;
    calculationCatalogRows = [...calculationCatalogRows.filter((item) => item.id !== row.id && item.name !== row.name), row]
      .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0) || String(a.category || '').localeCompare(String(b.category || ''), 'ru') || String(a.name || '').localeCompare(String(b.name || ''), 'ru'));
    calculationCatalogSource = 'remote';
    setCalcMode('catalog');
    const select = byId('calcCatalogBackedItem');
    if (select) select.value = row.id || row.name;
    renderSmartPreview();
    toast('Позиция добавлена в каталог и выбрана в расчёте');
    setStatus('Новая позиция каталога готова к расчёту.', 'good');
  } catch (error) {
    const message = friendlyError(error);
    toast(message);
    setStatus(`Ошибка каталога: ${message}`, 'error');
  } finally {
    const currentButton = byId('calcCreateCatalogItemBtn');
    if (currentButton) currentButton.disabled = false;
  }
}

function makeCatalogRawItem(row, options = {}) {
  if (!row) return null;
  return catalogRowToTypicalDraftItem(row, {
    ...options,
    catalogSource: row.settings?.legacy_fallback ? 'fallback' : calculationCatalogSource
  });
}

async function ensureCalculationCatalog() {
  if (calculationCatalogLoadPromise) return calculationCatalogLoadPromise;
  const catalogClient = isStagingWorkflowEnvironment(V4_CONFIG.supabaseUrl) ? null : supabaseClient;
  calculationCatalogLoadPromise = loadCalculationCatalog({ supabaseClient: catalogClient, fallbackRows: CATALOG }).then((result) => {
    calculationCatalogRows = result.rows;
    calculationCatalogSource = result.source;
    if (val('calcSmartMode') === 'catalog') setCalcMode('catalog');
    return result;
  });
  return calculationCatalogLoadPromise;
}

function calcSettings() {
  return {
    fixedMarkup: byId('calcMarkup')?.value ?? '',
    smallLimit: num('calcSmallLimit') || 3000,
    smallMarkup: num('calcSmallMarkup') || 30,
    medLimit: num('calcMedLimit') || 10000,
    mediumMarkup: num('calcMedMarkup') || 20,
    largeMarkup: num('calcLargeMarkup') || 10,
    roundStep: Math.max(1, num('calcRoundStep') || 10)
  };
}

function autoMarkupBySubtotal(subtotal, settings = calcSettings()) {
  return markupPercentForSubtotal(subtotal, { ...settings, mediumLimit: settings.medLimit }) / 100;
}

function makeRawItem({ category, itemType, name, unit, qty, contractorPrice, clientPrice, comment, data }) {
  return {
    category: category || 'Расчёт по позиции',
    item_type: itemType || 'Услуга',
    name: name || 'Позиция расчёта',
    unit: unit || 'шт',
    qty: Number(qty || 0),
    contractor_price: Number(contractorPrice || 0),
    client_price: Number(clientPrice || 0),
    comment: comment || '',
    data: data || {}
  };
}

function applyAutoPrice(rows) {
  const settings = calcSettings();
  const currentContractor = draftItems.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.contractor_price || 0), 0);
  const newContractor = rows.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.contractor_price || 0), 0);
  const markup = autoMarkupBySubtotal(currentContractor + newContractor, settings);
  return rows.map((item) => ({
    ...item,
    client_price: Number(item.client_price || 0) > 0 ? Number(item.client_price || 0) : priceWithMarkup(item.contractor_price, markup * 100, settings.roundStep),
    data: { ...(item.data || {}), price_source: Number(item.client_price || 0) > 0 ? 'manual' : 'auto', applied_markup_percent: markup * 100 }
  }));
}

function calcItem(raw, index) {
  const qty = Number(raw.qty || 0);
  const contractorPrice = Number(raw.contractor_price || 0);
  const clientPrice = Number(raw.client_price || 0);
  const contractorSum = qty * contractorPrice;
  const clientSum = qty * clientPrice;
  const profit = clientSum - contractorSum;
  const markupPercent = contractorSum > 0 ? ((clientSum - contractorSum) / contractorSum) * 100 : 0;
  const marginPercent = clientSum > 0 ? (profit / clientSum) * 100 : 0;
  return {
    catalog_id: raw.catalog_id || null,
    category: raw.category || 'Расчёт по позиции',
    item_type: raw.item_type || 'Услуга',
    name: raw.name || `Позиция ${index + 1}`,
    unit: raw.unit || 'шт',
    qty,
    contractor_price: contractorPrice,
    contractor_sum: contractorSum,
    markup_percent: markupPercent,
    client_price: clientPrice,
    client_sum: clientSum,
    profit,
    margin_percent: marginPercent,
    comment: raw.comment || '',
    data: raw.data || {},
    sort_order: index + 1
  };
}

function itemsWithRoundAdjustment(items) {
  const settings = calcSettings();
  const base = items.map(calcItem);
  const clientRaw = base.reduce((sum, item) => sum + item.client_sum, 0);
  const rounded = settings.roundStep > 1 ? Math.ceil(clientRaw / settings.roundStep) * settings.roundStep : clientRaw;
  const diff = Math.round((rounded - clientRaw) * 100) / 100;
  if (diff > 0) {
    return [...items, makeRawItem({
      category: 'Округление',
      itemType: 'Корректировка',
      name: `Округление итога до шага ${settings.roundStep} ₽`,
      unit: 'услуга',
      qty: 1,
      contractorPrice: 0,
      clientPrice: diff,
      comment: 'Автоматическое округление итоговой суммы',
      data: { calculation_mode: 'rounding', round_step: settings.roundStep }
    })];
  }
  return items;
}

function totals(items = draftItems, withRounding = false) {
  const sourceItems = withRounding ? itemsWithRoundAdjustment(items) : items;
  const calculated = sourceItems.map(calcItem);
  const contractor = calculated.reduce((sum, item) => sum + item.contractor_sum, 0);
  const client = calculated.reduce((sum, item) => sum + item.client_sum, 0);
  const profit = client - contractor;
  const margin = client > 0 ? (profit / client) * 100 : 0;
  const warnings = [];
  if (!calculated.length) warnings.push('Нет позиций расчёта');
  if (client <= 0) warnings.push('Сумма клиенту равна 0');
  if (contractor <= 0) warnings.push('Себестоимость равна 0');
  if (profit < 0) warnings.push('Расчёт убыточный');
  if (client > 0 && margin < 20) warnings.push('Маржа ниже 20%');
  return {
    items: calculated,
    rawItems: sourceItems,
    contractor_cost: contractor,
    client_total: client,
    profit,
    margin_percent: margin,
    warnings,
    warning_level: warnings.some((w) => w.includes('убыточный') || w.includes('равна 0')) ? 'critical' : warnings.length ? 'warning' : 'ok'
  };
}

function needOptions(selectedValue = '') {
  const options = [`<option value="" ${selectedValue ? '' : 'selected'}>Общий расчёт по заявке</option>`];
  (v4State.leadNeeds || []).filter((need) => need.status !== 'Архив').forEach((need) => {
    options.push(`<option value="${esc(need.id)}" ${need.id === selectedValue ? 'selected' : ''}>${esc(need.title || need.need_type || 'Потребность')}</option>`);
  });
  return options.join('');
}

function refreshNeedSelect() {
  const select = byId('calcNeedId');
  if (!select) return;
  const current = select.value || '';
  select.innerHTML = needOptions(current);
  if (current && ![...select.options].some((option) => option.value === current)) select.value = '';
}

function renderCalcCard(calc) {
  const levelClass = calc.warning_level === 'critical' ? 'is-error' : calc.warning_level === 'warning' ? 'is-warn' : 'is-good';
  const warnings = Array.isArray(calc.warnings) ? calc.warnings : [];
  return `
    <article class="v4-calc-card">
      <div>
        <div class="v4-calc-title-row">
          <h4>${esc(calc.title || 'Расчёт')}</h4>
          <span class="${levelClass}">${esc(calc.status || 'Черновик')}</span>
        </div>
        <div class="v4-calc-totals">
          <span><b>Клиенту:</b> ${money(calc.client_total)}</span>
          <span><b>Себестоимость:</b> ${money(calc.contractor_cost)}</span>
          <span><b>Прибыль:</b> ${money(calc.profit)}</span>
          <span><b>Маржа:</b> ${Math.round(Number(calc.margin_percent || 0))}%</span>
        </div>
        ${warnings.length ? `<div class="v4-calc-warnings">${warnings.map(esc).join(', ')}</div>` : ''}
      </div>
    </article>
  `;
}

function modeOptions(selected = 'banner') {
  return MODES.map(([value, label]) => `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(label)}</option>`).join('');
}

function renderModeButtons(selected = 'banner') {
  return MODES.map(([value, label]) => `<button type="button" class="${value === selected ? 'is-active' : ''}" data-calc-mode="${esc(value)}">${esc(label)}</button>`).join('');
}

function renderCompositeComponentRow(index = 0) {
  const numberLabel = Number(index || 0) + 1;
  return `
    <div class="v4-subcard" data-composite-component>
      <div class="v4-subcard-head"><div><b>Компонент ${numberLabel}</b></div><button type="button" data-action="remove-composite-component">Убрать</button></div>
      <div class="v4-form-grid">
        <label>Название<input data-composite-field="title" placeholder="Например: ПВХ 3 мм"></label>
        <label>Количество<input data-composite-field="qty" type="number" min="0.01" step="0.01" value="1"></label>
        <label>Ед.
          <select data-composite-field="unit"><option>шт</option><option>м²</option><option>м</option><option>комплект</option><option>услуга</option></select>
        </label>
        <label>Себестоимость за ед., ₽<input data-composite-field="contractor_price" type="number" min="0" step="0.01" value="0"></label>
        <label>Цена клиенту за ед., ₽<input data-composite-field="client_price" type="number" min="0" step="0.01" value="0"></label>
        <label>Комментарий<input data-composite-field="comment" placeholder="Материал, размер, работа"></label>
      </div>
      <div class="v4-option-row"><label><input data-composite-field="client_visible" type="checkbox" checked> Показывать этот компонент в подробном КП</label></div>
    </div>`;
}

function compositeComponentsFromForm() {
  return [...document.querySelectorAll('#calcCompositeComponents [data-composite-component]')].map((row) => {
    const field = (name) => row.querySelector(`[data-composite-field="${name}"]`);
    return {
      title: field('title')?.value || '',
      qty: parseNum(field('qty')?.value || 1),
      unit: field('unit')?.value || 'шт',
      contractor_price: parseNum(field('contractor_price')?.value || 0),
      client_price: parseNum(field('client_price')?.value || 0),
      client_visible: Boolean(field('client_visible')?.checked),
      comment: field('comment')?.value || ''
    };
  });
}

function compositeInputFromForm() {
  return {
    title: val('calcCompositeTitle'),
    category: 'Составное изделие',
    item_type: 'Изготовление',
    unit: 'комплект',
    visibility: val('calcCompositeVisibility') || 'single_line',
    client_price: num('calcCompositeClient'),
    comment: val('calcCompositeComment'),
    components: compositeComponentsFromForm()
  };
}

function compositeValidationMessage(errors = []) {
  if (errors.includes('composite_title_required')) return 'Укажите название составного изделия';
  if (errors.includes('composite_components_required')) return 'Добавьте хотя бы один компонент';
  if (errors.includes('composite_visible_component_required')) return 'Для подробного КП отметьте хотя бы один клиентский компонент';
  if (errors.includes('composite_visible_component_price_required')) return 'Для видимых компонентов подробного КП укажите цену клиенту';
  return 'Проверьте состав изделия';
}

function renderModeFields(mode = 'banner') {
  if (mode === 'catalog') {
    return `
      <div class="v4-calc-mode-help"><b>Позиция из справочника:</b> выберите готовую услугу или материал. Цена и правила берутся из ${esc(catalogSourceLabel())}; в сохранённом расчёте фиксируется snapshot.</div>
      <div class="v4-form-grid">
        <label>Позиция
          <select id="calcCatalogBackedItem">${catalogBackedOptions()}</select>
        </label>
        <label>Количество
          <input id="calcCatalogBackedQty" type="number" min="0.01" step="0.01" value="1">
        </label>
      </div>
      ${renderCatalogCreatePanel()}
    `;
  }
  if (mode === 'contractor_quote') {
    return `
      <div class="v4-calc-mode-help"><b>Готовая смета подрядчика:</b> внесите внутренние затраты. Общая наценка задаётся выше — отдельного второго калькулятора больше нет. Клиент увидит одну итоговую строку, внутренние расходы останутся в snapshot расчёта.</div>
      <div class="v4-form-grid">
        <label>Подрядчик<input id="calcContractorVendor" placeholder="Кто изготовит / выполнил расчёт"></label>
        <label>Цена подрядчика, ₽<input id="calcContractorBase" type="number" min="0" step="1" value="0"></label>
        <label>Доставка, ₽<input id="calcContractorDelivery" type="number" min="0" step="1" value="0"></label>
        <label>Монтаж, ₽<input id="calcContractorInstallation" type="number" min="0" step="1" value="0"></label>
        <label>Дизайн, ₽<input id="calcContractorDesign" type="number" min="0" step="1" value="0"></label>
        <label>Прочие расходы, ₽<input id="calcContractorOther" type="number" min="0" step="1" value="0"></label>
        <label>Итог клиенту вручную, ₽<input id="calcContractorClient" type="number" min="0" step="1" placeholder="Пусто = по общей наценке"></label>
        <label>Комментарий к позиции<input id="calcContractorComment" placeholder="Что входит в готовую стоимость"></label>
      </div>
    `;
  }
  if (mode === 'banner') {
    return `
      <div class="v4-form-grid">
        <label>Материал баннера
          <select id="calcCatalogItem">${catalogOptions((item) => item.name.includes('Баннер'), 'Баннер 340/440 — стандарт')}</select>
        </label>
        <label>Ширина, м
          <input id="calcWidth" type="number" min="0" step="0.01" placeholder="3">
        </label>
        <label>Высота, м
          <input id="calcHeight" type="number" min="0" step="0.01" placeholder="2">
        </label>
        <label>Количество, шт
          <input id="calcQty" type="number" min="1" step="1" value="1">
        </label>
        <label>Шаг люверсов, м
          <input id="calcGrommetStep" type="number" min="0.1" step="0.05" value="0.3">
        </label>
        <label>Проклейка, ₽/м
          <input id="calcHemmingCost" type="number" min="0" step="1" value="30">
        </label>
        <label>Люверс, ₽/шт
          <input id="calcGrommetCost" type="number" min="0" step="1" value="15">
        </label>
      </div>
      <div class="v4-option-row">
        <label><input id="calcNeedHemming" type="checkbox"> Проклейка по периметру</label>
        <label><input id="calcNeedGrommets" type="checkbox"> Люверсы по периметру</label>
      </div>
    `;
  }
  if (mode === 'film') {
    return `
      <div class="v4-form-grid">
        <label>Материал плёнки
          <select id="calcCatalogItem">${catalogOptions((item) => item.name.includes('плен') || item.name.includes('Плен') || item.name.includes('OWV'), 'Самоклеящаяся пленка (мат/гл/прозр.)')}</select>
        </label>
        <label>Ширина, м
          <input id="calcWidth" type="number" min="0" step="0.01" placeholder="1">
        </label>
        <label>Высота, м
          <input id="calcHeight" type="number" min="0" step="0.01" placeholder="1">
        </label>
        <label>Количество, шт
          <input id="calcQty" type="number" min="1" step="1" value="1">
        </label>
      </div>
      <div class="v4-option-row">
        <label><input id="calcNeedMountFilm" type="checkbox"> Добавить монтажную плёнку</label>
        <label><input id="calcNeedPlotterCut" type="checkbox"> Плоттерная резка и выборка</label>
      </div>
      <div class="v4-form-grid v4-dependent-costs">
        <label>Монтажная плёнка, ₽/м²<input id="calcMountFilmCost" type="number" min="0" step="1" value="300"></label>
        <label>Резка и выборка, ₽/м²<input id="calcPlotterCutCost" type="number" min="0" step="1" value="250"></label>
      </div>
    `;
  }
  if (mode === 'sheet') {
    return `
      <div class="v4-form-grid">
        <label>Материал
          <select id="calcCatalogItem">${catalogOptions((item) => item.category === 'Пленка и листовые материалы' && !item.name.includes('пленка') && !item.name.includes('пленки'), 'ПВХ вспененный 3 мм')}</select>
        </label>
        <label>Ширина, м
          <input id="calcWidth" type="number" min="0" step="0.01" placeholder="1">
        </label>
        <label>Высота, м
          <input id="calcHeight" type="number" min="0" step="0.01" placeholder="1">
        </label>
        <label>Количество, шт
          <input id="calcQty" type="number" min="1" step="1" value="1">
        </label>
      </div>
      <div class="v4-option-row">
        <label><input id="calcNeedSheetPrint" type="checkbox"> Печать на плёнке</label>
        <label><input id="calcNeedSheetLamination" type="checkbox"> Накатка / ламинация</label>
        <label><input id="calcNeedSheetCut" type="checkbox"> Резка деталей</label>
      </div>
      <div class="v4-form-grid v4-dependent-costs">
        <label>Плёнка для печати<select id="calcSheetPrintMaterial">${catalogOptions((item) => item.name.includes('Самоклеящаяся'), 'Самоклеящаяся пленка (мат/гл/прозр.)')}</select></label>
        <label>Накатка / ламинация, ₽/м²<input id="calcSheetLaminationCost" type="number" min="0" step="1" value="300"></label>
        <label>Резка, ₽/шт<input id="calcSheetCutCost" type="number" min="0" step="1" value="50"></label>
      </div>
    `;
  }
  if (mode === 'photo') {
    return `
      <div class="v4-form-grid">
        <label>Позиция
          <select id="calcCatalogItem">${catalogOptions((item) => item.category === 'Печать фото', 'A4 фото (одна сторона)')}</select>
        </label>
        <label>Количество, шт
          <input id="calcQty" type="number" min="1" step="1" value="1">
        </label>
      </div>
      <div class="v4-option-row">
        <label><input id="calcNeedLamination" type="checkbox"> Добавить ламинацию A4</label>
      </div>
    `;
  }
  if (mode === 'pvc_shapes') {
    return `
      <div class="v4-calc-mode-help"><b>Круги и фигурная резка:</b> укажите размеры как «30, 35, 40» или «30×2, 40×3». Расчёт сам разложит материал, печать и резку на строки.</div>
      <div class="v4-form-grid">
        <label>Толщина ПВХ, мм<input id="calcPvcThickness" type="number" min="1" step="1" value="20"></label>
        <label>Диаметры, см<input id="calcPvcDiameters" value="30, 35, 40" placeholder="30×2, 40×3"></label>
        <label>Коэффициент запаса<input id="calcPvcWaste" type="number" min="1" step="0.05" value="1.35"></label>
        <label>ПВХ, ₽/м²<input id="calcPvcCost" type="number" min="0" step="1" value="7600"></label>
        <label>Печать, ₽/м²<input id="calcPvcPrintCost" type="number" min="0" step="1" value="900"></label>
        <label>Фигурная резка, ₽/шт<input id="calcPvcCutCost" type="number" min="0" step="1" value="180"></label>
        <label>Что печатаем<input id="calcPvcPrintDescription" placeholder="Например: логотип или фотография"></label>
        <label>Файл / ссылка / примечание<input id="calcPvcFile" placeholder="Где находится макет"></label>
      </div>`;
  }
  if (mode === 'letters') {
    return `
      <div class="v4-calc-mode-help"><b>Буквы и цифры:</b> перечислите знаки и количество, например «3-2шт, 0-2шт, 5-1шт».</div>
      <div class="v4-form-grid">
        <label>Спецификация<input id="calcLettersSpec" placeholder="3-2шт, 0-2шт, 5-1шт"></label>
        <label>Высота, см<input id="calcLettersHeight" type="number" min="1" step="1" value="10"></label>
        <label>Цвет<input id="calcLettersColor" value="чёрный"></label>
        <label>Материал<input id="calcLettersMaterial" value="самоклеящаяся плёнка"></label>
        <label>Себестоимость, ₽/шт<input id="calcLettersCost" type="number" min="0" step="1" value="25"></label>
        <label>Цена клиенту, ₽/шт<input id="calcLettersClient" type="number" min="0" step="1" placeholder="Пусто = по общей наценке"></label>
      </div>`;
  }
  if (mode === 'service') {
    return `
      <div class="v4-form-grid">
        <label>Тип услуги
          <select id="calcServiceName"><option>Дизайн</option><option>Монтаж</option><option>Доставка</option><option>Выезд / замер</option><option>Срочность</option><option>Другое</option></select>
        </label>
        <label>Себестоимость / подрядчик, ₽
          <input id="calcServiceCost" type="number" min="0" step="1" value="0">
        </label>
        <label>Цена клиенту, ₽
          <input id="calcServiceClient" type="number" min="0" step="1" value="0">
        </label>
        <label>Комментарий
          <input id="calcServiceComment" placeholder="Например: монтаж на объекте клиента">
        </label>
      </div>
    `;
  }
  return `
    <div class="v4-form-grid">
      <label>Название позиции
        <input id="calcCustomName" placeholder="Например: сложная вывеска / нестандартная работа">
      </label>
      <label>Категория
        <input id="calcCustomCategory" value="Ручная позиция">
      </label>
      <label>Тип
        <select id="calcCustomType"><option>Изготовление</option><option>Услуга</option><option>Материал</option><option>Дизайн</option><option>Монтаж</option></select>
      </label>
      <label>Ед.
        <select id="calcCustomUnit"><option>шт</option><option>м²</option><option>м</option><option>комплект</option><option>услуга</option></select>
      </label>
      <label>Количество
        <input id="calcCustomQty" type="number" min="0" step="0.01" value="1">
      </label>
      <label>Себестоимость за ед.
        <input id="calcCustomCost" type="number" min="0" step="1" value="0">
      </label>
      <label>Цена клиенту за ед.
        <input id="calcCustomClient" type="number" min="0" step="1" value="0">
      </label>
      <label>Комментарий
        <input id="calcCustomComment" placeholder="Что входит в позицию">
      </label>
      <label>Характеристики
        <textarea id="calcCustomData" rows="2" placeholder="Размер, цвет, материал, способ изготовления"></textarea>
      </label>
    </div>
  `;
}

function area() {
  return num('calcWidth') * num('calcHeight') * (num('calcQty') || 1);
}

function perimeterTotal() {
  const w = num('calcWidth');
  const h = num('calcHeight');
  const qty = num('calcQty') || 1;
  return w > 0 && h > 0 ? 2 * (w + h) * qty : 0;
}

function currentModeItems() {
  const mode = val('calcSmartMode') || 'banner';
  const rows = [];
  calculationModeError = '';
  if (mode === 'composite') {
    const prepared = compositeDraftValidation(compositeInputFromForm());
    if (!prepared.ok) {
      calculationModeError = compositeValidationMessage(prepared.errors);
      return [];
    }
    if (prepared.item.data.visibility === 'single_line' && Number(prepared.item.client_price || 0) <= 0) {
      return applyAutoPrice([prepared.item]);
    }
    return [prepared.item];
  }
  if (mode === 'catalog') {
    const row = catalogBackedRow(val('calcCatalogBackedItem'));
    if (!row) return [];
    return [catalogRowToDraftItem(row, num('calcCatalogBackedQty') || 1, { catalog_source: calculationCatalogSource })];
  }
  if (mode === 'contractor_quote') {
    const item = contractorQuoteDraftItem({
      title: val('calcTitle') || 'Подрядный заказ',
      vendor: val('calcContractorVendor'),
      base: num('calcContractorBase'),
      delivery: num('calcContractorDelivery'),
      installation: num('calcContractorInstallation'),
      design: num('calcContractorDesign'),
      other: num('calcContractorOther'),
      clientPrice: num('calcContractorClient'),
      comment: val('calcContractorComment')
    });
    if (item.contractor_price <= 0) return [];
    return applyAutoPrice([item]);
  }
  if (mode === 'banner') {
    const material = catalogByName(val('calcCatalogItem')) || catalogByName('Баннер 340/440 — стандарт');
    const units = area();
    const per = perimeterTotal();
    const step = num('calcGrommetStep') || 0.3;
    if (units <= 0) return [];
    rows.push(makeCatalogRawItem(material, {
      itemType: 'Баннер',
      name: `${material.name} · ${num('calcWidth')}×${num('calcHeight')} м · ${num('calcQty') || 1} шт`,
      qty: units,
      comment: `Площадь: ${units.toFixed(2)} м²`,
      calculationMode: 'banner',
      data: { width: num('calcWidth'), height: num('calcHeight'), pieces: num('calcQty') || 1 }
    }));
    if (checked('calcNeedHemming') && per > 0) {
      const hem = catalogByName('Проклейка баннера по краю');
      rows.push(makeCatalogRawItem(hem, { itemType: 'Доп. услуга', name: 'Проклейка баннера по периметру', qty: per, contractorPrice: num('calcHemmingCost'), comment: `Периметр всего: ${per.toFixed(2)} м`, calculationMode: 'banner_hemming' }));
    }
    if (checked('calcNeedGrommets') && per > 0) {
      const grommet = catalogByName('Установка люверсов');
      const count = Math.ceil(per / step);
      rows.push(makeCatalogRawItem(grommet, { itemType: 'Доп. услуга', name: `Люверсы по периметру, шаг ${step} м`, qty: count, contractorPrice: num('calcGrommetCost'), comment: `Расчёт: ${per.toFixed(2)} м / ${step} м = ${count} шт`, calculationMode: 'banner_grommets', data: { step } }));
    }
    return applyAutoPrice(rows);
  }
  if (mode === 'film') {
    const material = catalogByName(val('calcCatalogItem')) || catalogByName('Самоклеящаяся пленка (мат/гл/прозр.)');
    const units = area();
    if (units <= 0) return [];
    rows.push(makeCatalogRawItem(material, { itemType: 'Плёнка', name: `${material.name} · ${num('calcWidth')}×${num('calcHeight')} м · ${num('calcQty') || 1} шт`, qty: units, comment: `Площадь: ${units.toFixed(2)} м²`, calculationMode: 'film', data: { width: num('calcWidth'), height: num('calcHeight'), pieces: num('calcQty') || 1 } }));
    if (checked('calcNeedMountFilm')) {
      const mount = catalogByName('Монтажная пленка');
      rows.push(makeCatalogRawItem(mount, { itemType: 'Доп. материал', name: 'Монтажная плёнка', qty: units, contractorPrice: num('calcMountFilmCost'), comment: `Площадь: ${units.toFixed(2)} м²`, calculationMode: 'mount_film' }));
    }
    if (checked('calcNeedPlotterCut')) rows.push(makeRawItem({ category: 'Обработка плёнки', itemType: 'Доп. услуга', name: 'Плоттерная резка и выборка', unit: 'м²', qty: units, contractorPrice: num('calcPlotterCutCost'), comment: `Площадь: ${units.toFixed(2)} м²`, data: { calculation_mode: 'plotter_cut' } }));
    return applyAutoPrice(rows);
  }
  if (mode === 'sheet') {
    const material = catalogByName(val('calcCatalogItem')) || catalogByName('ПВХ вспененный 3 мм');
    const units = area();
    if (units <= 0) return [];
    rows.push(makeCatalogRawItem(material, { itemType: 'Листовой материал', name: `${material.name} · ${num('calcWidth')}×${num('calcHeight')} м · ${num('calcQty') || 1} шт`, qty: units, comment: `Площадь: ${units.toFixed(2)} м²`, calculationMode: 'sheet', data: { width: num('calcWidth'), height: num('calcHeight'), pieces: num('calcQty') || 1 } }));
    if (checked('calcNeedSheetPrint')) {
      const film = catalogByName(val('calcSheetPrintMaterial')) || catalogByName('Самоклеящаяся пленка (мат/гл/прозр.)');
      rows.push(makeCatalogRawItem(film, { itemType: 'Печать', name: `Печать: ${film.name}`, unit: 'м²', qty: units, comment: `Площадь: ${units.toFixed(2)} м²`, calculationMode: 'sheet_print' }));
    }
    if (checked('calcNeedSheetLamination')) rows.push(makeRawItem({ category: 'Обработка листа', itemType: 'Доп. услуга', name: 'Накатка / ламинация', unit: 'м²', qty: units, contractorPrice: num('calcSheetLaminationCost'), data: { calculation_mode: 'sheet_lamination' } }));
    if (checked('calcNeedSheetCut')) rows.push(makeRawItem({ category: 'Обработка листа', itemType: 'Доп. услуга', name: 'Резка деталей', unit: 'шт', qty: num('calcQty') || 1, contractorPrice: num('calcSheetCutCost'), data: { calculation_mode: 'sheet_cut' } }));
    return applyAutoPrice(rows);
  }
  if (mode === 'photo') {
    const item = catalogByName(val('calcCatalogItem')) || catalogByName('A4 фото (одна сторона)');
    const qty = num('calcQty') || 1;
    rows.push(makeCatalogRawItem(item, { itemType: 'Фото', name: item.name, qty, comment: `${qty} шт`, calculationMode: 'photo' }));
    if (checked('calcNeedLamination')) {
      const lam = catalogByName('A4 ламинация');
      rows.push(makeCatalogRawItem(lam, { itemType: 'Доп. услуга', name: lam.name, qty, comment: `${qty} шт`, calculationMode: 'photo_lamination' }));
    }
    return applyAutoPrice(rows);
  }
  if (mode === 'pvc_shapes') {
    const diameters = parseCalculationDiameters(val('calcPvcDiameters'));
    const thickness = num('calcPvcThickness') || 20;
    const waste = Math.max(1, num('calcPvcWaste') || 1.35);
    const description = val('calcPvcPrintDescription') || 'печать по макету';
    const file = val('calcPvcFile');
    diameters.forEach((part) => {
      const area = circleAreaSquareMeters(part.diameter, part.qty);
      const materialArea = Math.round(area * waste * 100) / 100;
      const printArea = Math.round(area * 100) / 100;
      rows.push(makeRawItem({ category: 'ПВХ / фигуры', itemType: 'Изготовление', name: `ПВХ ${thickness} мм · круг ${part.diameter} см · ${part.qty} шт`, unit: 'м²', qty: materialArea, contractorPrice: num('calcPvcCost'), comment: `Площадь с запасом ${waste}: ${materialArea} м²`, data: { calculation_mode: 'pvc_shape_material', diameter_cm: part.diameter, thickness_mm: thickness, pieces: part.qty, file } }));
      rows.push(makeRawItem({ category: 'Печать', itemType: 'Изготовление', name: `Печать на круге ${part.diameter} см`, unit: 'м²', qty: printArea, contractorPrice: num('calcPvcPrintCost'), comment: [description, file].filter(Boolean).join('. '), data: { calculation_mode: 'pvc_shape_print', diameter_cm: part.diameter, pieces: part.qty } }));
      rows.push(makeRawItem({ category: 'Фигурная резка', itemType: 'Услуга', name: `Резка круга ${part.diameter} см`, unit: 'шт', qty: part.qty, contractorPrice: num('calcPvcCutCost'), data: { calculation_mode: 'pvc_shape_cut', diameter_cm: part.diameter } }));
    });
    return applyAutoPrice(rows);
  }
  if (mode === 'letters') {
    const clientPrice = num('calcLettersClient');
    const height = num('calcLettersHeight') || 10;
    const color = val('calcLettersColor') || 'чёрный';
    const material = val('calcLettersMaterial') || 'самоклеящаяся плёнка';
    return applyAutoPrice(parseCalculationPairs(val('calcLettersSpec')).map((part) => makeRawItem({ category: 'Буквы / цифры', itemType: 'Изготовление', name: `Буква/цифра «${part.name}» · ${height} см · ${color}`, unit: 'шт', qty: part.qty, contractorPrice: num('calcLettersCost'), clientPrice, comment: material, data: { calculation_mode: 'letters', symbol: part.name, height_cm: height, color, material, price_source: clientPrice > 0 ? 'manual' : 'auto' } })));
  }
  if (mode === 'service') {
    const cost = num('calcServiceCost');
    const client = num('calcServiceClient');
    return applyAutoPrice([makeRawItem({ category: 'Услуги', itemType: 'Услуга', name: val('calcServiceName') || 'Услуга', unit: 'услуга', qty: 1, contractorPrice: cost, clientPrice: client, comment: val('calcServiceComment'), data: { calculation_mode: 'service', price_source: client > 0 ? 'manual' : 'auto' } })]);
  }
  const customCost = num('calcCustomCost');
  const customClient = num('calcCustomClient');
  return applyAutoPrice([makeRawItem({ category: val('calcCustomCategory') || 'Ручная позиция', itemType: val('calcCustomType') || 'Услуга', name: val('calcCustomName') || 'Ручная позиция', unit: val('calcCustomUnit') || 'шт', qty: num('calcCustomQty') || 1, contractorPrice: customCost, clientPrice: customClient, comment: val('calcCustomComment'), data: { calculation_mode: 'custom', characteristics: val('calcCustomData'), price_source: customClient > 0 ? 'manual' : 'auto' } })]);
}

function renderSmartPreview() {
  const box = byId('calcSmartPreview');
  if (!box) return;
  const rows = currentModeItems();
  if (!rows.length) {
    box.className = 'v4-calc-live is-warn';
    box.innerHTML = `<em>${esc(calculationModeError || 'Заполните размеры, количество или стоимость — расчёт появится автоматически.')}</em>`;
    return;
  }
  const calculated = rows.map(calcItem);
  const contractor = calculated.reduce((sum, item) => sum + item.contractor_sum, 0);
  const client = calculated.reduce((sum, item) => sum + item.client_sum, 0);
  const profit = client - contractor;
  const margin = client > 0 ? (profit / client) * 100 : 0;
  box.className = `v4-calc-live ${profit < 0 ? 'is-error' : margin < 20 ? 'is-warn' : 'is-good'}`;
  box.innerHTML = `
    <span><b>Позиций:</b> ${calculated.length}</span>
    <span><b>Себестоимость:</b> ${money(contractor)}</span>
    <span><b>Клиенту:</b> ${money(client)}</span>
    <span><b>Прибыль:</b> ${money(profit)}</span>
    <span><b>Маржа:</b> ${Math.round(margin)}%</span>
    <div class="v4-estimate-lines">${calculated.map((item) => `<div><b>${esc(item.name)}</b><span>${Number(item.qty).toLocaleString('ru-RU')} ${esc(item.unit)} · подрядчик ${money(item.contractor_sum)} · клиент ${money(item.client_sum)}</span></div>`).join('')}</div>
  `;
}

function renderDraftItems() {
  const list = byId('calcDraftItems');
  const totalBox = byId('calcDraftTotals');
  const guideBox = byId('calcDraftGuide');
  if (!list || !totalBox) return;
  const result = totals(draftItems, true);
  const visible = draftItems.map(calcItem);
  list.innerHTML = visible.length ? visible.map((item, index) => `
    <tr>
      <td>${esc(item.name)}${item.comment ? `<small>${esc(item.comment)}</small>` : ''}</td>
      <td>${esc(item.unit)}</td>
      <td><input class="v4-calc-row-input" data-calc-row-field="qty" data-index="${index}" type="number" min="0" step="0.01" value="${item.qty}"></td>
      <td><input class="v4-calc-row-input" data-calc-row-field="contractor_price" data-index="${index}" type="number" min="0" step="1" value="${item.contractor_price}"></td>
      <td><div class="v4-calc-row-price"><input class="v4-calc-row-input" data-calc-row-field="client_price" data-index="${index}" type="number" min="0" step="1" value="${item.client_price}"><button type="button" data-action="auto-calc-item" data-index="${index}" title="Вернуть автоматическую цену" ${item.data?.price_source === 'manual' ? '' : 'disabled'}>Авто</button></div></td>
      <td>${money(item.client_sum)}</td>
      <td><button type="button" data-action="remove-calc-item" data-index="${index}">×</button></td>
    </tr>
  `).join('') : '<tr><td colspan="7">Позиции пока не добавлены. Выберите тип позиции выше, заполните поля и нажмите «Добавить в расчёт».</td></tr>';
  const levelClass = result.warning_level === 'critical' ? ' is-error' : result.warning_level === 'warning' ? ' is-warn' : ' is-good';
  totalBox.className = `v4-calc-totals v4-calc-total-panel${levelClass}`;
  totalBox.innerHTML = `
    <span><b>Клиенту:</b> ${money(result.client_total)}</span>
    <span><b>Себестоимость:</b> ${money(result.contractor_cost)}</span>
    <span><b>Прибыль:</b> ${money(result.profit)}</span>
    <span><b>Маржа:</b> ${Math.round(result.margin_percent)}%</span>
  `;
  if (guideBox) {
    guideBox.innerHTML = result.warnings.length
      ? `<div class="v4-calc-warnings">Перед сохранением проверьте: ${result.warnings.map(esc).join(', ')}</div>`
      : '<div class="v4-calc-ok">Расчёт можно сохранять. КП сформируется из клиентских сумм, себестоимость клиенту не покажется.</div>';
  }
  renderSmartPreview();
  renderPricingExplanation();
}

function renderCalcForm() {
  const selectedMode = byId('calcSmartMode')?.value || 'banner';
  return `
    <div class="v4-calc-form">
      <div class="v4-calc-wizard-head">
        <div>
          <h4>Новый расчёт</h4>
          <p>Один расчёт для типовых и нестандартных заказов. Добавляйте материалы, услуги и ручные позиции в общую смету.</p>
        </div>
        <div class="v4-calc-steps"><span>1. Позиции</span><span>2. Цена и прибыль</span><span>3. КП</span></div>
      </div>
      <div class="v4-form-grid">
        <label>Название расчёта
          <input id="calcTitle" placeholder="Например: Баннер 3×2 с люверсами">
        </label>
        <label>Потребность
          <select id="calcNeedId">${needOptions()}</select>
        </label>
        <label>Комментарий для клиента
          <input id="calcPublicComment" placeholder="Что входит в стоимость">
        </label>
      </div>
      <section class="v4-pricing-control" aria-label="Управление ценой расчёта">
        <div><h4>Наценка к себестоимости</h4><p>Наценка 20% означает: себестоимость 1 000 ₽ → клиенту 1 200 ₽. Итоговая маржа при этом 16,7%.</p></div>
        <div class="v4-markup-presets" role="group" aria-label="Быстрый выбор наценки"><button type="button" data-calc-markup="auto" class="is-active">Авто 10–30%</button><button type="button" data-calc-markup="10">10%</button><button type="button" data-calc-markup="20">20%</button><button type="button" data-calc-markup="30">30%</button></div>
        <label class="v4-markup-input">Своя наценка, %<input id="calcMarkup" type="number" min="0" step="1" placeholder="Автоматически"></label>
        <div id="calcPricingExplanation" class="v4-pricing-explanation" aria-live="polite"></div>
      </section>
      <div class="v4-calc-auto-box">
        <h4>Тип позиции</h4>
        <div class="v4-mode-buttons">${renderModeButtons(selectedMode)}</div>
        <label class="v4-mode-select">Текущий тип
          <select id="calcSmartMode">${modeOptions(selectedMode)}</select>
        </label>
        <div id="calcModeFields">${renderModeFields(selectedMode)}</div>
        <details class="v4-calc-settings">
          <summary>Дополнительные правила автоматической цены</summary>
          <div class="v4-form-grid">
            <label>Мелкий заказ до, ₽
              <input id="calcSmallLimit" type="number" value="3000">
            </label>
            <label>Наценка мелкий, %
              <input id="calcSmallMarkup" type="number" value="30">
            </label>
            <label>Средний заказ до, ₽
              <input id="calcMedLimit" type="number" value="10000">
            </label>
            <label>Наценка средний, %
              <input id="calcMedMarkup" type="number" value="20">
            </label>
            <label>Наценка крупный, %
              <input id="calcLargeMarkup" type="number" value="10">
            </label>
            <label>Шаг округления итога, ₽
              <input id="calcRoundStep" type="number" value="10">
            </label>
          </div>
        </details>
        <div id="calcSmartPreview" class="v4-calc-live"></div>
        <div class="v4-form-actions">
          <button id="addSmartCalcItemBtn" type="button" class="v4-primary">Добавить в расчёт</button>
        </div>
      </div>
      <div class="v4-table-wrap">
        <table class="v4-table">
          <thead><tr><th>Позиция</th><th>Ед.</th><th>Кол-во</th><th>Себест. ед.</th><th>Клиенту ед.</th><th>Сумма клиенту</th><th></th></tr></thead>
          <tbody id="calcDraftItems"></tbody>
        </table>
      </div>
      <div id="calcDraftTotals" class="v4-calc-totals"></div>
      <div id="calcDraftGuide"></div>
      <div class="v4-form-actions">
        <button id="saveCalculationBtn" type="button" class="v4-primary">Сохранить расчёт</button>
        <button id="clearCalculationBtn" type="button">Очистить</button>
      </div>
    </div>
  `;
}

export function renderCalculations() {
  const box = byId('calculationsBox');
  if (!box) return;
  if (!v4State.route.leadId) {
    box.innerHTML = '';
    return;
  }
  if (v4State.calculationsBusy) {
    box.innerHTML = '<div class="v4-empty">Загружаю расчёты...</div>';
    return;
  }
  const calculations = v4State.calculations || [];
  box.innerHTML = `
    <section class="v4-subcard v4-calculations-section">
      <div class="v4-subcard-head">
        <div>
          <h3>Расчёты</h3>
          <p>Расчёт теперь адаптируется под позицию. Для баннера достаточно указать размер и опции, дополнительные строки создаются автоматически.</p>
        </div>
        <span class="v4-muted">Расчётов: ${calculations.length}</span>
      </div>
      <div class="v4-calculations-list">
        ${v4State.calculationsError ? `<div class="v4-empty is-error">${esc(v4State.calculationsError)}</div>` : calculations.length ? calculations.map(renderCalcCard).join('') : '<div class="v4-empty">Расчётов пока нет. Начните с типа позиции: например, баннер или плёнка.</div>'}
      </div>
      ${renderCalcForm()}
    </section>
  `;
  renderDraftItems();
}

async function doLoadCalculations(leadId) {
  if (!leadId || !v4State.crmReady) {
    setState({ calculations: [], calculationsBusy: false, calculationsError: null });
    renderCalculations();
    return [];
  }
  setState({ calculationsBusy: true, calculationsError: null });
  renderCalculations();
  try {
    const response = await timeout(
      supabaseClient
        .from('leader_lead_calculations')
        .select(CALC_FIELDS)
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false }),
      12000,
      'Расчёты не загрузились за 12 секунд'
    );
    if (response.error) throw response.error;
    if (v4State.route.leadId !== leadId) return [];
    setState({ calculations: response.data || [], calculationsBusy: false, calculationsError: null });
    renderCalculations();
    return response.data || [];
  } catch (error) {
    const message = friendlyError(error);
    if (v4State.route.leadId !== leadId) return [];
    setState({ calculations: [], calculationsBusy: false, calculationsError: message });
    renderCalculations();
    setStatus(`Ошибка расчётов: ${message}`, 'error');
    return [];
  }
}

export function loadCalculations(leadId = v4State.route.leadId) {
  const key = leadId || '';
  if (calculationLoads.has(key)) return calculationLoads.get(key);
  const request = doLoadCalculations(leadId).finally(() => {
    if (calculationLoads.get(key) === request) calculationLoads.delete(key);
  });
  calculationLoads.set(key, request);
  return request;
}

function addSmartItems() {
  const items = currentModeItems();
  if (!items.length) {
    toast(calculationModeError || 'Заполните поля расчёта позиции');
    return;
  }
  const invalid = items.map(calcItem).filter((item) => item.client_sum <= 0 || item.profit < 0 || item.qty <= 0);
  if (invalid.length) {
    toast('Проверьте позицию: сумма клиенту должна быть больше 0, расчёт не должен быть убыточным');
    return;
  }
  draftItems.push(...items);
  if (!val('calcTitle')) {
    const title = items[0]?.name || 'Расчёт по заявке';
    const titleInput = byId('calcTitle');
    if (titleInput) titleInput.value = title;
  }
  renderDraftItems();
  toast(`Добавлено позиций: ${items.length}`);
}

function renderPricingExplanation() {
  const box = byId('calcPricingExplanation');
  if (!box) return;
  const settings = calcSettings();
  const subtotal = draftItems.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.contractor_price || 0), 0);
  const markup = markupPercentForSubtotal(subtotal, { ...settings, mediumLimit: settings.medLimit });
  const margin = marginPercentFromMarkup(markup);
  const fixed = String(byId('calcMarkup')?.value || '').trim();
  box.innerHTML = `<b>${fixed ? `Фиксированная наценка ${Math.round(markup)}%` : `Автоматическая наценка ${Math.round(markup)}%`}</b><span>Ориентировочная маржа ${margin.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}% до округления. Ручные цены позиций не изменяются.</span>`;
  document.querySelectorAll('[data-calc-markup]').forEach((button) => button.classList.toggle('is-active', button.dataset.calcMarkup === 'auto' ? !fixed : fixed === button.dataset.calcMarkup));
}

function refreshDraftPricing() {
  const settings = calcSettings();
  draftItems = repriceAutomaticItems(draftItems, { ...settings, mediumLimit: settings.medLimit });
  renderDraftItems();
  renderPricingExplanation();
}

async function rollbackCalculation(id) {
  if (!id) return;
  const rollback = await timeout(
    supabaseClient
      .from('leader_lead_calculations')
      .delete()
      .eq('id', id),
    10000,
    'Не удалось откатить пустой расчёт'
  );
  if (rollback.error) throw rollback.error;
}

async function syncLeadAfterCalculation() {
  const lead = v4State.currentLead;
  if (!lead?.id) return null;
  if (['КП отправлено', 'Согласовано', 'Создан заказ', 'Отказ', 'Спам'].includes(lead.status || '')) return null;
  const response = await supabaseClient
    .from('leader_leads')
    .update({ status: 'Расчёт подготовлен', updated_at: new Date().toISOString() })
    .eq('id', lead.id)
    .select('*')
    .single();
  if (response.error) return null;
  return response.data;
}

async function saveCalculation() {
  if (!v4State.route.leadId || saveBusy) return;
  const result = totals(draftItems, true);
  if (!result.items.length) {
    toast('Добавьте хотя бы одну позицию расчёта');
    return;
  }
  if (result.client_total <= 0 || result.profit < 0) {
    toast('Проверьте расчёт: сумма клиенту должна быть больше 0, расчёт не должен быть убыточным');
    return;
  }
  const calcPayload = {
    lead_id: v4State.route.leadId,
    need_id: val('calcNeedId') || null,
    client_id: v4State.currentLead?.converted_client_id || null,
    title: val('calcTitle') || 'Расчёт без названия',
    status: 'Черновик',
    version_number: (v4State.calculations || []).length + 1,
    client_total: result.client_total,
    contractor_cost: result.contractor_cost,
    profit: result.profit,
    margin_percent: result.margin_percent,
    warning_level: result.warning_level,
    warnings: result.warnings,
    public_comment: val('calcPublicComment'),
    internal_comment: '',
    created_by: v4State.user?.id || null,
    updated_by: v4State.user?.id || null
  };
  let createdCalculationId = null;
  saveBusy = true;
  const saveButton = byId('saveCalculationBtn');
  if (saveButton) saveButton.disabled = true;
  try {
    setStatus('Сохраняю расчёт...', 'warn');
    if (isStagingWorkflowEnvironment(V4_CONFIG.supabaseUrl)) {
      const leadUpdatedAt = v4State.currentLead?.updated_at;
      if (!leadUpdatedAt) throw new Error('lead_optimistic_lock_missing');
      const itemPayloads = result.rawItems.map((raw, index) => calcItem(raw, index));
      const invoked = await supabaseClient.functions.invoke('leader-crm-workflow', { body: {
        action: 'calculation.create_initial',
        request_id: globalThis.crypto.randomUUID(),
        expected_updated_at: leadUpdatedAt,
        payload: {
          lead_id: calcPayload.lead_id,
          need_id: calcPayload.need_id,
          idempotency_key: `calculation.create_initial:${calcPayload.lead_id}:${calcPayload.need_id}:v1`,
          title: calcPayload.title,
          public_comment: calcPayload.public_comment || null,
          internal_comment: null,
          items: itemPayloads
        }
      } });
      if (invoked.error || invoked.data?.ok !== true) throw new Error(invoked.data?.error?.code || invoked.error?.message || 'calculation_create_failed');
      const calc = invoked.data.calculation;
      const updatedLead = invoked.data.lead;
      setState({
        calculations: [calc, ...(v4State.calculations || []).filter((item) => item.id !== calc.id)],
        currentLead: updatedLead ? { ...(v4State.currentLead || {}), ...updatedLead } : v4State.currentLead,
        leads: updatedLead ? (v4State.leads || []).map((lead) => lead.id === updatedLead.id ? { ...lead, ...updatedLead } : lead) : v4State.leads
      });
      draftItems = [];
      renderCalculations();
      setStatus(invoked.data.idempotent_replay ? 'Расчёт восстановлен без дубля' : 'Расчёт сохранён атомарно. Теперь можно создать версию или КП.', 'good');
      toast(invoked.data.idempotent_replay ? 'Расчёт уже существовал' : 'Расчёт сохранён');
      return;
    }
    const calcResponse = await timeout(
      supabaseClient
        .from('leader_lead_calculations')
        .insert(calcPayload)
        .select(CALC_FIELDS)
        .single(),
      14000,
      'Расчёт не сохранился за 14 секунд'
    );
    if (calcResponse.error) throw calcResponse.error;
    const calc = calcResponse.data;
    createdCalculationId = calc.id;
    const itemPayloads = result.rawItems.map((raw, index) => ({ ...calcItem(raw, index), calculation_id: calc.id, lead_id: v4State.route.leadId }));
    const itemsResponse = await timeout(
      supabaseClient
        .from('leader_lead_calculation_items')
        .insert(itemPayloads)
        .select(ITEM_FIELDS),
      14000,
      'Позиции расчёта не сохранились за 14 секунд'
    );
    if (itemsResponse.error) throw itemsResponse.error;
    const updatedLead = await syncLeadAfterCalculation();
    setState({
      calculations: [calc, ...(v4State.calculations || [])],
      currentLead: updatedLead ? { ...(v4State.currentLead || {}), ...updatedLead } : v4State.currentLead,
      leads: updatedLead ? (v4State.leads || []).map((lead) => lead.id === updatedLead.id ? { ...lead, ...updatedLead } : lead) : v4State.leads
    });
    draftItems = [];
    renderCalculations();
    setStatus('Расчёт сохранён. Теперь можно сформировать КП ниже.', 'good');
    toast('Расчёт сохранён');
  } catch (error) {
    if (createdCalculationId) {
      try {
        await rollbackCalculation(createdCalculationId);
      } catch (rollbackError) {
        console.error('CRM v4 calculation rollback failed:', rollbackError);
      }
    }
    toast(friendlyError(error));
    setStatus(`Ошибка сохранения расчёта: ${friendlyError(error)}`, 'error');
  } finally {
    saveBusy = false;
    const currentSaveButton = byId('saveCalculationBtn');
    if (currentSaveButton) currentSaveButton.disabled = false;
  }
}

function setCalcMode(mode) {
  const select = byId('calcSmartMode');
  if (select) select.value = mode;
  const fields = byId('calcModeFields');
  if (fields) fields.innerHTML = renderModeFields(mode);
  document.querySelectorAll('button[data-calc-mode]').forEach((button) => button.classList.toggle('is-active', button.dataset.calcMode === mode));
  renderSmartPreview();
}

function applyNeedToCalculation(need) {
  const prefill = needCalculationPrefill(need);
  setCalcMode(prefill.mode);
  const values = { calcNeedId: prefill.needId, calcTitle: prefill.title, calcPublicComment: prefill.comment, calcWidth: prefill.width, calcHeight: prefill.height, calcQty: prefill.quantity };
  Object.entries(values).forEach(([id, value]) => { const element = byId(id); if (element && value !== '') element.value = value; });
  const material = byId('calcCatalogItem');
  if (material && prefill.material) { const option = [...material.options].find((item) => item.textContent.toLowerCase().includes(prefill.material.toLowerCase())); if (option) material.value = option.value; }
  renderSmartPreview();
  byId('calculationsBox')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  toast('Потребность перенесена в расчёт');
}

function bindCalculationEvents() {
  byId('leadCardSection')?.addEventListener('click', (event) => {
    const modeButton = event.target.closest('button[data-calc-mode]');
    if (modeButton) {
      setCalcMode(modeButton.dataset.calcMode);
      return;
    }
    const markupButton = event.target.closest('button[data-calc-markup]');
    if (markupButton) {
      const input = byId('calcMarkup');
      if (input) input.value = markupButton.dataset.calcMarkup === 'auto' ? '' : markupButton.dataset.calcMarkup;
      refreshDraftPricing();
      return;
    }
    if (event.target.closest('#calcCompositeAddComponentBtn')) {
      const container = byId('calcCompositeComponents');
      const index = container?.querySelectorAll('[data-composite-component]').length || 0;
      container?.insertAdjacentHTML('beforeend', renderCompositeComponentRow(index));
      renderSmartPreview();
      return;
    }
    const removeComposite = event.target.closest('button[data-action="remove-composite-component"]');
    if (removeComposite) {
      const container = byId('calcCompositeComponents');
      const components = container?.querySelectorAll('[data-composite-component]') || [];
      if (components.length <= 1) {
        toast('В составном изделии нужен хотя бы один компонент');
        return;
      }
      removeComposite.closest('[data-composite-component]')?.remove();
      renderSmartPreview();
      return;
    }
    if (event.target.closest('#calcCreateCatalogItemBtn')) {
      createCatalogItemFromCalculation();
      return;
    }
    if (event.target.closest('#addSmartCalcItemBtn')) addSmartItems();
    if (event.target.closest('#clearCalculationBtn')) {
      draftItems = [];
      renderCalculations();
    }
    if (event.target.closest('#saveCalculationBtn')) saveCalculation();
    const remove = event.target.closest('button[data-action="remove-calc-item"]');
    if (remove) {
      draftItems.splice(Number(remove.dataset.index), 1);
      renderDraftItems();
    }
    const autoPrice = event.target.closest('button[data-action="auto-calc-item"]');
    if (autoPrice) {
      const index = Number(autoPrice.dataset.index);
      if (draftItems[index]) draftItems[index].data = { ...(draftItems[index].data || {}), price_source: 'auto' };
      refreshDraftPricing();
    }
  });
  byId('leadCardSection')?.addEventListener('change', (event) => {
    const rowInput = event.target.closest('[data-calc-row-field]');
    if (rowInput) {
      const index = Number(rowInput.dataset.index);
      const field = rowInput.dataset.calcRowField;
      if (draftItems[index] && ['qty', 'contractor_price', 'client_price'].includes(field)) {
        if (field === 'client_price' && draftItems[index].data?.mode === 'composite' && draftItems[index].data?.visibility === 'detailed') {
          toast('Для подробного составного изделия цена задаётся компонентами. Удалите позицию и добавьте её заново после правки состава.');
          renderDraftItems();
          return;
        }
        draftItems[index][field] = Math.max(0, parseNum(rowInput.value));
        if (field === 'client_price') draftItems[index].data = { ...(draftItems[index].data || {}), price_source: 'manual' };
        if (field === 'contractor_price' && draftItems[index].data?.price_source !== 'manual') {
          draftItems = repriceAutomaticItems(draftItems, { ...calcSettings(), mediumLimit: calcSettings().medLimit });
        }
        renderDraftItems();
      }
      return;
    }
    if (event.target.closest('#calcSmartMode')) setCalcMode(event.target.value);
    if (event.target.closest('#calculationsBox')) renderSmartPreview();
  });
  byId('leadCardSection')?.addEventListener('input', (event) => {
    if (event.target?.id === 'calcMarkup') { refreshDraftPricing(); return; }
    if (event.target.closest('#calculationsBox')) renderSmartPreview();
  });
  document.addEventListener('leader-v4:lead-card-rendered', () => renderCalculations());
  document.addEventListener('leader-v4:needs-loaded', (event) => {
    if (event.detail?.leadId === v4State.route.leadId) refreshNeedSelect();
  });
  document.addEventListener('leader-v4:calculate-need', (event) => applyNeedToCalculation(event.detail?.need || {}));
  document.addEventListener('leader-v4:refresh-calculations', () => {
    if (v4State.route.leadId) loadCalculations(v4State.route.leadId);
  });
  document.addEventListener('leader-v4:route-change', (event) => {
    const id = event.detail?.leadId || null;
    draftItems = [];
    if (id) loadCalculations(id);
    else {
      setState({ calculations: [], calculationsBusy: false, calculationsError: null });
      renderCalculations();
    }
  });
  document.addEventListener('leader-v4:crm-ready', () => {
    if (v4State.route.leadId) loadCalculations(v4State.route.leadId);
  });
}

export function bootCalculations() {
  if (window.LeaderV4CalculationsBooted) return;
  window.LeaderV4CalculationsBooted = true;
  ensureCalculationCatalog();
  bindCalculationEvents();
  renderCalculations();
  if (v4State.crmReady && v4State.route.leadId) loadCalculations(v4State.route.leadId);
}

document.addEventListener('DOMContentLoaded', bootCalculations);
