const EXPECTED_TABS = [
  { key: 'management_dashboard', label: 'Дашборд' },
  { key: 'leads', label: 'Заявки' },
  { key: 'orders', label: 'Заказы' },
  { key: 'order_control', label: 'Контроль заказов' },
  { key: 'finance_control', label: 'Финансы' },
  { key: 'production', label: 'Производство' },
  { key: 'contact_control', label: 'Контроль контактов' },
  { key: 'public_lead_audit', label: 'Аудит заявок' }
];

const ACCESS_ROLES = ['owner', 'admin', 'manager'];

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}

function text(selector) {
  return String(document.querySelector(selector)?.textContent || '').trim();
}

function row(label, message, ok = true) {
  return { label, message, ok };
}

function checkTabs() {
  return EXPECTED_TABS.map((item) => {
    const buttons = Array.from(document.querySelectorAll(`[data-v4-tab-button="${item.key}"]`));
    return row(
      item.label,
      buttons.length === 1 ? 'OK' : buttons.length === 0 ? 'нет кнопки' : `дублей: ${buttons.length}`,
      buttons.length === 1
    );
  });
}

function checkAccess() {
  const authStatus = text('#authStatus') || '—';
  const email = text('#userEmail') || text('#profileEmail') || '—';
  const role = text('#profileRole') || '—';
  const active = text('#profileActive') || '—';
  const tab = document.body?.dataset?.v4Tab || '—';
  const roleOk = ACCESS_ROLES.includes(role);
  const activeOk = active === 'Активен';
  const emailOk = email !== '—' && email.includes('@');

  return [
    row('Статус входа', authStatus, !/ошибка|нужен вход/i.test(authStatus)),
    row('Email', email, emailOk),
    row('Роль', role, roleOk),
    row('Профиль', active, activeOk),
    row('Текущий раздел', tab, tab !== '—'),
    row('URL', window.location.href, true)
  ];
}

function renderRows(title, rows) {
  return `<div style="display:grid;gap:6px"><b style="margin-top:4px;color:#0f172a">${esc(title)}</b>${rows.map((item) => `<div style="display:flex;justify-content:space-between;gap:10px;border:1px solid #e2e8f0;border-radius:12px;padding:8px;background:#fff"><b>${esc(item.label)}</b><span style="font-weight:900;color:${item.ok ? '#166534' : '#92400e'};text-align:right;overflow-wrap:anywhere">${esc(item.message)}</span></div>`).join('')}</div>`;
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
    renderRows('Доступ', checkAccess()),
    renderRows('Разделы', checkTabs())
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
