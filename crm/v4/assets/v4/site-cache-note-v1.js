const CRM_ACCESS_ROUTE_VERSION = '20260627-access-route-1';

function bootSiteCacheNote() {
  if (document.getElementById('siteCacheNoteV1')) return;
  const note = document.createElement('div');
  note.id = 'siteCacheNoteV1';
  note.style.cssText = 'position:fixed;left:14px;bottom:14px;z-index:9999;max-width:360px;background:#0f172a;color:#fff;border-radius:16px;padding:12px 14px;font:13px/1.4 Arial,sans-serif;box-shadow:0 16px 44px rgba(15,23,42,.24);display:none';
  note.innerHTML = `<b style="display:block;margin-bottom:4px">Подсказка проверки</b>Если на сайте или в CRM виден старый вид, нажмите Ctrl + F5. Это обновит кеш CSS/JS.<br><span style="display:block;margin-top:6px;color:#bfdbfe">CRM build: ${CRM_ACCESS_ROUTE_VERSION}</span>`;
  document.body.appendChild(note);
  const key = `leader-cache-note-seen-${CRM_ACCESS_ROUTE_VERSION}`;
  if (!localStorage.getItem(key)) {
    note.style.display = 'block';
    localStorage.setItem(key, '1');
    setTimeout(() => { note.style.display = 'none'; }, 12000);
  }
  import('./crm-ui-selfcheck-v1.js?v=20260624-contour-1').catch(() => {});
  import('./public-lead-audit-v1.js?v=20260625-duplicate-copy-1').catch(() => {});
  import('./public-lead-audit-helper-v1.js?v=20260625-trace-widget-1').catch(() => {});
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootSiteCacheNote); else bootSiteCacheNote();