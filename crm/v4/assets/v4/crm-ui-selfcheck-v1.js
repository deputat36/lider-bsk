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

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}

function check() {
  return EXPECTED_TABS.map((item) => {
    const buttons = Array.from(document.querySelectorAll(`[data-v4-tab-button="${item.key}"]`));
    return {
      ...item,
      count: buttons.length,
      ok: buttons.length === 1,
      message: buttons.length === 1 ? 'OK' : buttons.length === 0 ? 'нет кнопки' : `дублей: ${buttons.length}`
    };
  });
}

function render() {
  const host = document.querySelector('#crmDiagnosticsBox') || document.querySelector('#crmWorkspace .v4-card') || document.getElementById('crmWorkspace');
  if (!host || document.getElementById('crmUiSelfcheckV1')) return;
  const box = document.createElement('details');
  box.id = 'crmUiSelfcheckV1';
  box.style.marginTop = '12px';
  box.innerHTML = '<summary style="font-weight:900;cursor:pointer">Проверка загруженных разделов CRM</summary><div id="crmUiSelfcheckV1Result" style="display:grid;gap:6px;margin-top:10px"></div>';
  host.appendChild(box);
  refresh();
}

function refresh() {
  const result = document.getElementById('crmUiSelfcheckV1Result');
  if (!result) return;
  result.innerHTML = check().map((item) => `<div style="display:flex;justify-content:space-between;gap:10px;border:1px solid #e2e8f0;border-radius:12px;padding:8px;background:#fff"><b>${esc(item.label)}</b><span style="font-weight:900;color:${item.ok ? '#166534' : '#92400e'}">${esc(item.message)}</span></div>`).join('');
}

function boot() {
  render();
  document.addEventListener('leader-v4:crm-ready', () => setTimeout(() => { render(); refresh(); }, 500));
  document.addEventListener('leader-v4:tab-opened', () => setTimeout(refresh, 300));
  setTimeout(() => { render(); refresh(); }, 1500);
  setInterval(refresh, 5000);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();