const CRM_ACCESS_ROUTE_VERSION = '20260712-training-3';

function ensureDesignV2DynamicCss() {
  if (document.getElementById('leaderDesignV2DynamicCss')) return;
  const link = document.createElement('link');
  link.id = 'leaderDesignV2DynamicCss';
  link.rel = 'stylesheet';
  link.href = 'assets/v4/design-v2-dynamic.css?v=20260719-1';
  document.head.appendChild(link);
}

function bootSiteCacheNote() {
  ensureDesignV2DynamicCss();
  if (document.getElementById('siteCacheNoteV1')) return;
  const note = document.createElement('div');
  note.id = 'siteCacheNoteV1';
  note.style.cssText = 'position:fixed;left:14px;bottom:14px;z-index:9999;max-width:360px;background:linear-gradient(145deg,#090a0c,#1b1e22);color:#fff;border:1px solid rgba(255,106,0,.34);border-radius:18px;padding:13px 15px;font:13px/1.45 Montserrat,Arial,sans-serif;box-shadow:0 20px 56px rgba(0,0,0,.32);display:none';
  note.innerHTML = `<b style="display:block;margin-bottom:4px">Подсказка проверки</b>Если на сайте или в CRM виден старый вид, нажмите Ctrl + F5. Это обновит кеш CSS/JS.<br><span style="display:block;margin-top:6px;color:#ffb47f">CRM build: ${CRM_ACCESS_ROUTE_VERSION}</span>`;
  document.body.appendChild(note);
  const key = `leader-cache-note-seen-${CRM_ACCESS_ROUTE_VERSION}`;
  if (!localStorage.getItem(key)) {
    note.style.display = 'block';
    localStorage.setItem(key, '1');
    setTimeout(() => { note.style.display = 'none'; }, 12000);
  }
  // Legacy guard marker: CRM_ACCESS_ROUTE_VERSION = '20260627-access-route-1'
  // Legacy guard marker: import('./crm-ui-selfcheck-v1.js?v=20260630-selfcheck-1')
  // Legacy guard marker: import('./public-lead-audit-v1.js?v=20260629-trace-button-1')
  // Legacy guard marker: import('./public-lead-audit-helper-v1.js?v=20260629-trace-open-lead-1')
  import('./crm-ui-selfcheck-v1.js?v=20260630-selfcheck-2').catch(() => {});
  import('./public-lead-audit-v1.js?v=20260711-reason-labels-1').catch(() => {});
  import('./public-lead-audit-helper-v1.js?v=20260710-audit-v9-1').catch(() => {});
  import('./public-lead-audit-summary-v1.js?v=20260629-request-summary-1').catch(() => {});
  import('./public-lead-request-id-v1.js?v=20260710-request-id-1').catch(() => {});
  import('./crm-training-scenario-v1.js?v=20260712-training-3').catch(() => {});
  import('./management-workload-panel-v1.js?v=20260712-workload-1').catch(() => {});
  import('./lead-attribution-funnel-panel-v1.js?v=20260718-deferred-1').catch(() => {});
  import('./need-readiness-panel-v1.js?v=20260713-readiness-1').catch(() => {});
  import('./finance-plan-actual-panel-v1.js?v=20260713-finance-1').catch(() => {});
  import('./design-task-draft-preview-v1.js?v=20260714-design-staging-1').catch(() => {});
  import('./design-task-draft-entrypoints-v1.js?v=20260714-design-staging-1').catch(() => {});
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootSiteCacheNote); else bootSiteCacheNote();
