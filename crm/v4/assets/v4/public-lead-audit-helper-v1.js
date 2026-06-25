function ensureAuditHelper() {
  const section = document.getElementById('publicLeadAuditSection');
  if (!section || document.getElementById('publicLeadAuditHelperV1')) return;
  const note = document.createElement('div');
  note.id = 'publicLeadAuditHelperV1';
  note.style.cssText = 'margin:0 0 12px;padding:12px 14px;border:1px solid #bfdbfe;background:#eff6ff;color:#1e3a8a;border-radius:14px;font:13px/1.45 Arial,sans-serif';
  note.innerHTML = '<b style="display:block;margin-bottom:4px">Проверка v8</b>Для теста откройте <a href="https://www.lider-bsk.ru/request.html" target="_blank" rel="noopener">страницу заявки</a>, отправьте обращение с пометкой <code>Тест CRM v4 audit v8</code>, затем найдите номер обращения по <code>request_id</code>. Подробный чек-лист: <code>docs/CRM_V4_AUDIT_V8_CHECK.md</code>.';
  section.insertBefore(note, section.firstChild);
}

function bootAuditHelper() {
  ensureAuditHelper();
  document.addEventListener('leader-v4:crm-ready', () => setTimeout(ensureAuditHelper, 300));
  document.addEventListener('click', (event) => {
    if (event.target.closest?.('[data-v4-tab-button="public_lead_audit"]')) {
      setTimeout(ensureAuditHelper, 300);
    }
  }, true);
  setInterval(ensureAuditHelper, 2000);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootAuditHelper); else bootAuditHelper();
