import { supabaseClient } from './supabase-client.js';
import { friendlyError } from './api.js';
import { v4State } from './state.js';
import { CRM_V4_ACTIONS, canPerformV4Action } from './action-permissions-v1.js';
import {
  CATALOG_MANAGEMENT_MODEL_V1,
  catalogManagementCategories,
  catalogManagementSummary,
  catalogPriceLogChanges,
  filterCatalogManagementRows,
  normalizeCatalogManagementRow,
  normalizeCatalogPriceLog
} from './catalog-management-model-v1.js';

const CATALOG_FIELDS = 'id,category,name,unit,contractor_price,is_active,sort_order,created_at,updated_at,description,item_type,markup_percent,min_client_price,default_client_price,calculation_mode';
const LOG_FIELDS = 'id,catalog_id,changed_by_email,change_type,reason,old_contractor_price,new_contractor_price,old_markup_percent,new_markup_percent,old_min_client_price,new_min_client_price,old_default_client_price,new_default_client_price,old_is_active,new_is_active,created_at';

const state = {
  rows: [],
  selectedId: '',
  logs: [],
  loaded: false,
  busy: false,
  historyBusy: false,
  historyUnavailable: false,
  filters: { search: '', category: 'all', status: 'all', sort: 'sort_order' }
};

function esc(value) {
  return String(value ?? '').replace(/[&<>\"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;' }[char]));
}

function money(value) {
  return `${Math.round(Number(value || 0)).toLocaleString('ru-RU')} ₽`;
}

function percent(value) {
  return `${Number(value || 0).toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%`;
}

function dateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
}

function section() {
  return document.getElementById('catalogManagementSection');
}

function root() {
  return document.getElementById('catalogManagementContent');
}

function canReadCatalog() {
  return canPerformV4Action(CRM_V4_ACTIONS.CATALOG_READ, v4State.profile)
    || canPerformV4Action(CRM_V4_ACTIONS.CATALOG_MANAGE, v4State.profile);
}

function ensureStyle() {
  if (document.getElementById('catalog-management-v1-style')) return;
  const style = document.createElement('style');
  style.id = 'catalog-management-v1-style';
  style.textContent = `
    .v4-catalog-note{margin:12px 0;border:1px solid #bfdbfe;background:#eff6ff;border-radius:16px;padding:12px 14px;color:#1e3a8a;line-height:1.45}
    .v4-catalog-stats{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:10px;margin:14px 0}.v4-catalog-stats>div{border:1px solid #dbeafe;background:#fff;border-radius:16px;padding:12px}.v4-catalog-stats span{display:block;color:#64748b;font-size:12px;font-weight:900;text-transform:uppercase}.v4-catalog-stats b{font-size:24px}
    .v4-catalog-filters{display:grid;grid-template-columns:minmax(200px,1.4fr) repeat(3,minmax(150px,.7fr));gap:10px;margin:14px 0}.v4-catalog-filters label{display:grid;gap:6px;font-weight:900;color:#334155}.v4-catalog-filters input,.v4-catalog-filters select{width:100%;border:1px solid #cbd5e1;border-radius:12px;padding:10px;background:#fff;font:inherit}
    .v4-catalog-layout{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(290px,.8fr);gap:14px;align-items:start}.v4-catalog-table-wrap{overflow:auto;border:1px solid #dbeafe;border-radius:16px;background:#fff}.v4-catalog-table{width:100%;border-collapse:collapse;min-width:940px}.v4-catalog-table th,.v4-catalog-table td{padding:10px;border-bottom:1px solid #e2e8f0;text-align:left;vertical-align:top}.v4-catalog-table th{position:sticky;top:0;background:#f8fafc;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:.03em}.v4-catalog-table tr[data-catalog-id]{cursor:pointer}.v4-catalog-table tr[data-catalog-id]:hover,.v4-catalog-table tr.is-selected{background:#eff6ff}.v4-catalog-name small{display:block;color:#64748b;margin-top:4px;max-width:360px}.v4-catalog-badge{display:inline-flex;border-radius:999px;padding:4px 8px;font-size:11px;font-weight:900;background:#dcfce7;color:#166534}.v4-catalog-badge.off{background:#fee2e2;color:#991b1b}.v4-catalog-price-main{font-weight:900}.v4-catalog-muted{color:#64748b;font-size:12px}
    .v4-catalog-detail{position:sticky;top:78px;border:1px solid #dbeafe;border-radius:16px;background:#fff;padding:14px}.v4-catalog-detail h3{margin:0 0 4px}.v4-catalog-detail dl{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0}.v4-catalog-detail dl>div{border:1px solid #e2e8f0;border-radius:12px;padding:9px}.v4-catalog-detail dt{font-size:11px;color:#64748b;font-weight:900;text-transform:uppercase}.v4-catalog-detail dd{margin:3px 0 0;font-weight:900}.v4-catalog-history{display:grid;gap:8px;margin-top:10px}.v4-catalog-history-item{border-left:3px solid #93c5fd;background:#f8fafc;border-radius:10px;padding:9px 10px}.v4-catalog-history-item b{display:block}.v4-catalog-history-item small{color:#64748b}.v4-catalog-history-item ul{margin:6px 0 0;padding-left:18px}
    @media(max-width:1000px){.v4-catalog-layout{grid-template-columns:1fr}.v4-catalog-detail{position:static}.v4-catalog-filters{grid-template-columns:1fr 1fr}.v4-catalog-stats{grid-template-columns:1fr 1fr}}
    @media(max-width:620px){.v4-catalog-filters{grid-template-columns:1fr}.v4-catalog-stats{grid-template-columns:1fr 1fr}.v4-catalog-table{min-width:760px}}
  `;
  document.head.appendChild(style);
}

function ensureSection() {
  if (section()) return;
  const workspace = document.getElementById('crmWorkspace');
  if (!workspace) return;
  ensureStyle();
  const node = document.createElement('section');
  node.id = 'catalogManagementSection';
  node.className = 'v4-card';
  node.dataset.v4ManagedSection = 'catalog';
  node.hidden = true;
  node.innerHTML = `
    <div class="v4-section-head">
      <div><h2>Каталог услуг и материалов</h2><p>Единая номенклатура для расчётов. ${CATALOG_MANAGEMENT_MODEL_V1}</p></div>
      <button id="catalogManagementReloadBtn" type="button" class="v4-primary">Обновить каталог</button>
    </div>
    <div id="catalogManagementContent"><div class="v4-empty">Откройте раздел, чтобы загрузить каталог.</div></div>
  `;
  const nav = document.getElementById('v4LayoutTabs');
  if (nav) nav.insertAdjacentElement('afterend', node);
  else workspace.appendChild(node);
}

function categoryOptions() {
  return ['<option value="all">Все категории</option>', ...catalogManagementCategories(state.rows).map((value) => `<option value="${esc(value)}" ${state.filters.category === value ? 'selected' : ''}>${esc(value)}</option>`)].join('');
}

function visibleRows() {
  return filterCatalogManagementRows(state.rows, state.filters);
}

function rowsHtml(rows) {
  if (!rows.length) return '<tr><td colspan="9"><div class="v4-empty">По текущим фильтрам позиций нет.</div></td></tr>';
  return rows.map((raw) => {
    const row = normalizeCatalogManagementRow(raw);
    return `
      <tr data-catalog-id="${esc(row.id)}" class="${row.id === state.selectedId ? 'is-selected' : ''}" tabindex="0">
        <td class="v4-catalog-name"><b>${esc(row.name)}</b><small>${esc(row.description || row.item_type)}</small></td>
        <td>${esc(row.category)}</td>
        <td>${esc(row.unit)}</td>
        <td><span class="v4-catalog-price-main">${money(row.contractor_price)}</span></td>
        <td>${percent(row.markup_percent)}</td>
        <td>${row.default_client_price ? money(row.default_client_price) : '<span class="v4-catalog-muted">по наценке</span>'}</td>
        <td>${money(row.calculated_client_price)}</td>
        <td><span class="v4-catalog-badge ${row.is_active ? '' : 'off'}">${row.is_active ? 'Активна' : 'Выключена'}</span></td>
        <td>${row.sort_order}</td>
      </tr>`;
  }).join('');
}

function historyHtml() {
  if (state.historyBusy) return '<div class="v4-empty">Загружаю историю...</div>';
  if (state.historyUnavailable) return '<div class="v4-empty">История цен пока недоступна в этом окружении.</div>';
  if (!state.logs.length) return '<div class="v4-empty">Истории изменений по позиции пока нет.</div>';
  return `<div class="v4-catalog-history">${state.logs.map((raw) => {
    const log = normalizeCatalogPriceLog(raw);
    const changes = catalogPriceLogChanges(log);
    return `<article class="v4-catalog-history-item"><b>${dateTime(log.created_at)}</b><small>${esc(log.changed_by_email || 'Пользователь CRM')}${log.reason ? ` · ${esc(log.reason)}` : ''}</small>${changes.length ? `<ul>${changes.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>` : '<div class="v4-catalog-muted">Изменение без ценовых полей</div>'}</article>`;
  }).join('')}</div>`;
}

function detailHtml() {
  if (!state.selectedId) return '<aside class="v4-catalog-detail"><h3>Позиция каталога</h3><p class="v4-catalog-muted">Выберите строку, чтобы увидеть параметры и историю цены.</p></aside>';
  const raw = state.rows.find((row) => row.id === state.selectedId);
  if (!raw) return '';
  const row = normalizeCatalogManagementRow(raw);
  return `<aside class="v4-catalog-detail">
    <h3>${esc(row.name)}</h3><p class="v4-catalog-muted">${esc(row.category)} · ${esc(row.item_type)} · обновлено ${dateTime(row.updated_at)}</p>
    <dl>
      <div><dt>Себестоимость</dt><dd>${money(row.contractor_price)}</dd></div>
      <div><dt>Наценка</dt><dd>${percent(row.markup_percent)}</dd></div>
      <div><dt>Минимум клиенту</dt><dd>${money(row.min_client_price)}</dd></div>
      <div><dt>Фикс. цена</dt><dd>${row.default_client_price ? money(row.default_client_price) : '—'}</dd></div>
      <div><dt>Ориентир клиенту</dt><dd>${money(row.calculated_client_price)}</dd></div>
      <div><dt>Режим</dt><dd>${esc(row.calculation_mode)}</dd></div>
    </dl>
    <div class="v4-catalog-note"><b>Редактирование защищено.</b><br>На первом этапе раздел только показывает рабочий каталог и историю. Изменение цен будет подключено отдельной атомарной server-side командой, чтобы цена и журнал не расходились.</div>
    <h4>История цены</h4>${historyHtml()}
  </aside>`;
}

function render() {
  const host = root();
  if (!host) return;
  const summary = catalogManagementSummary(state.rows);
  const rows = visibleRows();
  host.innerHTML = `
    <div class="v4-catalog-note"><b>Источник для расчётов:</b> здесь видны реальные параметры ` + '`leader_catalog`' + `. Фильтры ничего не меняют в базе.</div>
    <div class="v4-catalog-stats"><div><span>Всего</span><b>${summary.total}</b></div><div><span>Активных</span><b>${summary.active}</b></div><div><span>Выключено</span><b>${summary.inactive}</b></div><div><span>Категорий</span><b>${summary.categories}</b></div></div>
    <div class="v4-catalog-filters">
      <label>Поиск<input id="catalogManagementSearch" type="search" value="${esc(state.filters.search)}" placeholder="Название, категория, описание"></label>
      <label>Категория<select id="catalogManagementCategory">${categoryOptions()}</select></label>
      <label>Статус<select id="catalogManagementStatus"><option value="all">Все</option><option value="active" ${state.filters.status === 'active' ? 'selected' : ''}>Активные</option><option value="inactive" ${state.filters.status === 'inactive' ? 'selected' : ''}>Выключенные</option></select></label>
      <label>Сортировка<select id="catalogManagementSort"><option value="sort_order" ${state.filters.sort === 'sort_order' ? 'selected' : ''}>Порядок каталога</option><option value="name" ${state.filters.sort === 'name' ? 'selected' : ''}>Название</option><option value="category" ${state.filters.sort === 'category' ? 'selected' : ''}>Категория</option><option value="cost_desc" ${state.filters.sort === 'cost_desc' ? 'selected' : ''}>Себестоимость ↓</option><option value="updated_desc" ${state.filters.sort === 'updated_desc' ? 'selected' : ''}>Недавно изменённые</option></select></label>
    </div>
    <p class="v4-catalog-muted">Показано ${rows.length} из ${summary.total} позиций.</p>
    <div class="v4-catalog-layout">
      <div class="v4-catalog-table-wrap"><table class="v4-catalog-table"><thead><tr><th>Позиция</th><th>Категория</th><th>Ед.</th><th>Себестоимость</th><th>Наценка</th><th>Фикс. цена</th><th>Ориентир клиенту</th><th>Статус</th><th>Порядок</th></tr></thead><tbody>${rowsHtml(rows)}</tbody></table></div>
      ${detailHtml()}
    </div>`;
}

function renderError(error) {
  const host = root();
  if (host) host.innerHTML = `<div class="v4-empty is-error"><b>Каталог не загрузился.</b><p>${esc(friendlyError(error))}</p></div>`;
}

async function loadHistory(catalogId) {
  if (!catalogId) return;
  state.historyBusy = true;
  state.historyUnavailable = false;
  state.logs = [];
  render();
  try {
    const response = await supabaseClient
      .from('leader_catalog_price_logs')
      .select(LOG_FIELDS)
      .eq('catalog_id', catalogId)
      .order('created_at', { ascending: false })
      .limit(40);
    if (response.error) {
      const code = String(response.error.code || '');
      const message = String(response.error.message || '').toLowerCase();
      if (code === '42P01' || code === 'PGRST205' || message.includes('leader_catalog_price_logs')) {
        state.historyUnavailable = true;
        return;
      }
      throw response.error;
    }
    if (state.selectedId === catalogId) state.logs = response.data || [];
  } catch (error) {
    console.warn('Catalog price history load failed:', error);
    state.historyUnavailable = true;
  } finally {
    state.historyBusy = false;
    render();
  }
}

async function load(force = false) {
  ensureSection();
  if (!canReadCatalog()) {
    if (root()) root().innerHTML = '<div class="v4-empty is-error">Недостаточно прав для просмотра каталога.</div>';
    return;
  }
  if (state.loaded && !force) {
    render();
    return;
  }
  if (state.busy) return;
  state.busy = true;
  if (root()) root().innerHTML = '<div class="v4-empty">Загружаю каталог...</div>';
  try {
    const response = await supabaseClient.from('leader_catalog').select(CATALOG_FIELDS).order('sort_order', { ascending: true }).order('name', { ascending: true });
    if (response.error) throw response.error;
    state.rows = response.data || [];
    state.loaded = true;
    if (state.selectedId && !state.rows.some((row) => row.id === state.selectedId)) state.selectedId = '';
    render();
  } catch (error) {
    renderError(error);
  } finally {
    state.busy = false;
  }
}

function readFilters() {
  state.filters = {
    search: document.getElementById('catalogManagementSearch')?.value || '',
    category: document.getElementById('catalogManagementCategory')?.value || 'all',
    status: document.getElementById('catalogManagementStatus')?.value || 'all',
    sort: document.getElementById('catalogManagementSort')?.value || 'sort_order'
  };
}

function bind() {
  const workspace = document.getElementById('crmWorkspace');
  if (!workspace || workspace.dataset.catalogManagementBound === '1') return;
  workspace.dataset.catalogManagementBound = '1';
  workspace.addEventListener('click', (event) => {
    if (event.target.closest('#catalogManagementReloadBtn')) {
      state.loaded = false;
      load(true);
      return;
    }
    const row = event.target.closest('tr[data-catalog-id]');
    if (row) {
      state.selectedId = row.dataset.catalogId || '';
      state.logs = [];
      render();
      loadHistory(state.selectedId);
    }
  });
  workspace.addEventListener('keydown', (event) => {
    const row = event.target.closest?.('tr[data-catalog-id]');
    if (!row || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    row.click();
  });
  workspace.addEventListener('input', (event) => {
    if (event.target?.id !== 'catalogManagementSearch') return;
    readFilters();
    render();
    document.getElementById('catalogManagementSearch')?.focus();
  });
  workspace.addEventListener('change', (event) => {
    if (!['catalogManagementCategory', 'catalogManagementStatus', 'catalogManagementSort'].includes(event.target?.id)) return;
    readFilters();
    render();
  });
}

export async function mount() {
  ensureSection();
  bind();
}

export async function loadCatalogManagement() {
  await load(false);
}

export async function refreshCatalogManagement() {
  state.loaded = false;
  await load(true);
}

export { loadCatalogManagement as load, refreshCatalogManagement as refresh };
