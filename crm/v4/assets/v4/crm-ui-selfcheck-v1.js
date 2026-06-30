import { V4_CONFIG } from './config.js';

const CRM_ACCESS_ROUTE_VERSION = '20260627-access-route-1';

const EXPECTED_TABS = [
  { key: 'management_dashboard', label: 'Дашборд' },
  { key: 'leads', label: 'Заявки' },
  { key: 'orders', label: 'Заказы' },
  { key: 'order_control', label: 'Контроль заказов' },
  { key: 'finance_control', label: 'Финансы' },
  { key: 'production', label: 'Производство' },
  { key: 'contact_control', label: 'Контроль контактов' },
  { key: 'public_lead_audit', label: 'Аудит заявок' },
  { key: 'user_admin', label: 'Доступ' }
];

const ACCESS_ROLES = ['owner', 'admin', 'manager'];
const EXPECTED_STORAGE_KEY = 'leader_crm_v4_main_session';
const LEGACY_STORAGE_KEY = 'leader_crm_v4_session';
const CRM_TEST_ISSUE_URL = 'https://github.com/deputat36/lider-bsk/issues/new?template=crm-v4-browser-test.md';

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}

function text(selector) {
  return String(document.querySelector(selector)?.textContent || '').trim();
}

function row(label, message, ok = true) {
  return { label, message, ok };
}

function storageHas(key) {
  try {
    return window.localStorage.getItem(key) !== null;
  } catch (_) {
    return false;
  }
}

function checkSessionIsolation() {
  const keyOk = V4_CONFIG.authStorageKey === EXPECTED_STORAGE_KEY;
  const sessionStored = storageHas(EXPECTED_STORAGE_KEY);
  const legacyStored = storageHas(LEGACY_STORAGE_KEY);
  return [
    row('Контур', 'Основной', true),
    row('Ключ сессии', V4_CONFIG.authStorageKey, keyOk),
    row('Сессия контура', sessionStored ? 'сохранена' : 'не найдена', sessionStored),
    row('Старый общий ключ', legacyStored ? 'обнаружен' : 'очищен', !legacyStored)
  ];
}

function checkTabs() {
  return EXPECTED_TABS.map((item) => {
    const buttons = Array.from(document.querySelectorAll(`[data-v4-tab-button="${item.key}"]`));
    return row(item.label, buttons.length === 1 ? 'OK' : buttons.length === 0 ? 'нет кнопки' : `дублей: ${buttons.length}`, buttons.length === 1);
  });
}

function checkAccessRoute() {
  const url = new URL(window.location.href);
  const directRoute = url.searchParams.get('tab') === 'user_admin' || url.hash === '#user_admin';
  const bodyCanRoute = document.body?.dataset?.v4Tab === 'user_admin' || typeof window.v4SetTab === 'function';
  const accessSection = document.getElementById('userAdminSection');
  const buildNote = document.getElementById('siteCacheNoteV1');
  const buildText = buildNote?.textContent || '';
  return [
    row('Прямой маршрут Доступ', directRoute ? 'открыт по URL' : '?tab=user_admin не в URL', true),
    row('Роутер вкладок', typeof window.v4SetTab === 'function' ? 'OK' : 'нет window.v4SetTab', typeof window.v4SetTab === 'function'),
    row('Секция Доступ', accessSection ? 'создана' : 'пока не создана', Boolean(accessSection)),
    row('Версия доступа', CRM_ACCESS_ROUTE_VERSION, true),
    row('Build marker', buildText.includes(CRM_ACCESS_ROUTE_VERSION) ? 'виден' : 'проверьте Ctrl + F5', buildText.includes(CRM_ACCESS_ROUTE_VERSION) || bodyCanRoute)
  ];
}

function checkAuditTools() {
  const auditButton = document.querySelector('[data-v4-tab-button="public_lead_audit"]');
  const auditSection = document.getElementById('publicLeadAuditSection');
  const helper = document.getElementById('publicLeadAuditHelperV1');
  const traceForm = document.getElementById('publicLeadTraceFormV1');
  const traceInput = document.getElementById('publicLeadTraceInputV1');
  const summaryAddon = document.getElementById('publicLeadAuditSummaryV1Styles') || document.getElementById('publicLeadAuditRequestSummaryV1');
  const traceButton = document.querySelector('[data-public-lead-audit-trace]');
  return [
    row('Вкладка аудита', auditButton ? 'OK' : 'нет кнопки', Boolean(auditButton)),
    row('Секция аудита', auditSection ? 'создана' : 'пока не создана', Boolean(auditSection)),
    row('Trace helper', helper ? 'загружен' : 'проверьте Ctrl + F5', Boolean(helper)),
    row('Форма request_id', traceForm && traceInput ? 'OK' : 'нет формы', Boolean(traceForm && traceInput)),
    row('Summary addon', summaryAddon ? 'загружен' : 'пока нет сводки', Boolean(summaryAddon)),
    row('Кнопка Проверить цепочку', traceButton ? 'видна в карточках' : 'появится после загрузки audit-событий', true)
  ];
}

function checkDesignTools() {
  const ordersTab = document.querySelector('[data-v4-tab-button="orders"]');
  const controlTab = document.querySelector('[data-v4-tab-button="order_control"]');
  const productionTab = document.querySelector('[data-v4-tab-button="production"]');
  const orderCardDesign = document.querySelector('[data-order-design-section]');
  const fastDesign = document.querySelector('[data-orders-fast-design-summary]') || document.querySelector('[data-orders-fast-design]');
  const controlDesign = document.querySelector('[data-order-control-design]');
  const productionWarning = document.querySelector('[data-production-layout-warning]');
  const jobWarning = document.querySelector('[data-production-job-layout-alert]');
  return [
    row('Вкладка Заказы', ordersTab ? 'OK' : 'нет кнопки', Boolean(ordersTab)),
    row('Контроль заказов', controlTab ? 'OK' : 'нет кнопки', Boolean(controlTab)),
    row('Производство', productionTab ? 'OK' : 'нет кнопки', Boolean(productionTab)),
    row('Дизайн в заказе', orderCardDesign ? 'виден в карточке' : 'появится после открытия карточки заказа', true),
    row('Дизайн проверить', fastDesign ? 'виден в списке заказов' : 'появится после загрузки заказов', true),
    row('Дизайн / макеты и производство', controlDesign ? 'виден в контроле заказов' : 'появится после открытия контроля заказов', true),
    row('Макет не согласован', productionWarning ? 'виден на производственной доске' : 'появится для несогласованного макета', true),
    row('Дизайн / макет не согласован', jobWarning ? 'виден в задании' : 'появится в карточке производственного задания', true)
  ];
}

function checkAccess() {
  const authStatus = text('#authStatus') || '—';
  const email = text('#userEmail') || text('#profileEmail') || '—';
  const role = text('#profileRole') || '—';
  const active = text('#profileActive') || '—';
  const tab = document.body?.dataset?.v4Tab || '—';
  return [
    row('Статус входа', authStatus, !/ошибка|нужен вход/i.test(authStatus)),
    row('Email', email, email !== '—' && email.includes('@')),
    row('Роль', role, ACCESS_ROLES.includes(role)),
    row('Профиль', active, active === 'Активен'),
    row('Текущий раздел', tab, tab !== '—'),
    row('URL', window.location.href, true)
  ];
}

function renderRows(title, rows) {
  return `<div style="display:grid;gap:6px"><b style="margin-top:4px;color:#0f172a">${esc(title)}</b>${rows.map((item) => `<div style="display:flex;justify-content:space-between;gap:10px;border:1px solid #e2e8f0;border-radius:12px;padding:8px;background:#fff"><b>${esc(item.label)}</b><span style="font-weight:900;color:${item.ok ? '#166534' : '#92400e'};text-align:right;overflow-wrap:anywhere">${esc(item.message)}</span></div>`).join('')}</div>`;
}

function renderIssueLink() {
  return `<div style="display:grid;gap:6px;border:1px solid #bfdbfe;background:#eff6ff;border-radius:12px;padding:10px"><b style="color:#1e3a8a">Если есть ошибка</b><span style="color:#334155">Зафиксируйте email, роль, раздел, красные ошибки консоли и 404 по assets. Затем создайте GitHub issue по шаблону браузерной проверки.</span><a href="${CRM_TEST_ISSUE_URL}" target="_blank" rel="noopener" style="font-weight:900;color:#1d4ed8">Создать GitHub issue CRM v4 browser test</a></div>`;
}

function render() {
  const host = document.querySelector('#crmDiagnosticsBox') || document.querySelector('#crmWorkspace .v4-card') || document.getElementById('crmWorkspace');
  if (!host || document.getElementById('crmUiSelfcheckV1')) return;
  const box = document.createElement('details');
  box.id = 'crmUiSelfcheckV1';
  box.style.marginTop = '12px';
  box.innerHTML = '<summary style="font-weight:900;cursor:pointer">Проверка загруженных разделов и доступа CRM</summary><div id="crmUiSelfcheckV1Result" style="display:grid;gap:12px;margin-top:10px"></div>';
  host.appendChild(box);
  refresh();
}

function refresh() {
  const result = document.getElementById('crmUiSelfcheckV1Result');
  if (!result) return;
  result.innerHTML = [
    renderRows('Контур и сессия', checkSessionIsolation()),
    renderRows('Доступ', checkAccess()),
    renderRows('Маршрут Доступ', checkAccessRoute()),
    renderRows('Разделы', checkTabs()),
    renderRows('Аудит request_id', checkAuditTools()),
    renderRows('Дизайн в заказах', checkDesignTools()),
    renderIssueLink()
  ].join('');
}

function boot() {
  render();
  document.addEventListener('leader-v4:crm-ready', () => setTimeout(() => { render(); refresh(); }, 500));
  document.addEventListener('leader-v4:tab-opened', () => setTimeout(refresh, 300));
  setTimeout(() => { render(); refresh(); }, 1500);
  setInterval(refresh, 5000);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
