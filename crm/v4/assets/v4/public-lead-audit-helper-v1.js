import { supabaseClient } from './supabase-client.js';
import { openLeadRoute } from './router.js';

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}

function dateRu(value) {
  if (!value) return '—';
  try { return new Date(value).toLocaleString('ru-RU'); } catch (_) { return String(value); }
}

function traceStatusRu(value) {
  const map = {
    complete: 'Цепочка полная',
    lead_without_audit: 'Заявка без audit-события',
    audit_without_lead: 'Audit без заявки',
    missing: 'Не найдено'
  };
  return map[value] || value || '—';
}

function traceHint(value) {
  const map = {
    complete: 'Заявка и audit-событие найдены. Это нормальный сценарий.',
    lead_without_audit: 'Заявка есть, но audit-событие не найдено. Проверьте запись аудита и RLS.',
    audit_without_lead: 'Audit-событие есть, но заявка не найдена. Для suspicious это может быть ожидаемо.',
    missing: 'По этому request_id нет ни заявки, ни audit-события. Проверьте номер обращения и страницу отправки.'
  };
  return map[value] || 'Проверьте цепочку сайт → CRM вручную.';
}

function traceClass(value) {
  if (value === 'complete') return 'is-good';
  if (value === 'lead_without_audit' || value === 'audit_without_lead') return 'is-warn';
  if (value === 'missing') return 'is-danger';
  return 'is-warn';
}

function auditResultRu(value) {
  const map = { accepted: 'Принято', duplicate: 'Дубль', suspicious: 'Подозрительно', rejected: 'Отклонено', error: 'Ошибка' };
  return map[value] || value || '—';
}

function renderTraceResult(row, error) {
  const box = document.getElementById('publicLeadTraceResultV1');
  if (!box) return;
  if (error) {
    box.innerHTML = `<span style="color:#991b1b;font-weight:900">${esc(error)}</span>`;
    return;
  }
  if (!row) {
    box.innerHTML = '<span style="color:#92400e;font-weight:900">По этому request_id цепочка не найдена.</span>';
    return;
  }
  const cls = traceClass(row.trace_status);
  const openLead = row.lead_id ? `<button type="button" data-public-trace-open-lead="${esc(row.lead_id)}" style="border:1px solid #1d4ed8;background:#1d4ed8;color:#fff;border-radius:999px;padding:7px 11px;font-weight:900;width:max-content">Открыть заявку</button>` : '';
  box.innerHTML = `
    <div data-public-lead-trace-status="${esc(row.trace_status || 'unknown')}" style="display:grid;gap:8px">
      <b class="v4-public-trace-badge ${esc(cls)}">${esc(traceStatusRu(row.trace_status))}</b>
      <span style="font-weight:800;color:#1e3a8a">${esc(traceHint(row.trace_status))}</span>
      <span>request_id: <code>${esc(row.request_id || '—')}</code></span>
      <span>Заявка: ${row.lead_id ? 'найдена' : 'не найдена'} · ${esc(row.lead_status || '—')} · ${esc(dateRu(row.lead_created_at))}</span>
      <span>Клиент: ${esc(row.lead_name || '—')} · ${esc(row.lead_phone || row.lead_phone_normalized || '—')}</span>
      <span>Audit: ${row.audit_id ? auditResultRu(row.audit_result) : 'не найден'} · ${esc(row.audit_reason || '—')} · ${esc(dateRu(row.audit_created_at))}</span>
      <span>Страница: ${esc(row.audit_source_page_path || row.lead_source_page_path || row.audit_page_url || row.lead_page_url || '—')}</span>
      ${openLead}
    </div>`;
}

async function runTrace(requestId) {
  const id = String(requestId || '').trim();
  const box = document.getElementById('publicLeadTraceResultV1');
  if (!id) {
    renderTraceResult(null, 'Введите request_id.');
    return;
  }
  if (box) box.innerHTML = 'Проверяю цепочку...';
  try {
    const response = await supabaseClient
      .from('leader_request_trace')
      .select('request_id,trace_status,lead_id,lead_created_at,lead_status,lead_name,lead_phone,lead_phone_normalized,lead_source_page_path,lead_page_url,audit_id,audit_created_at,audit_result,audit_reason,audit_source_page_path,audit_page_url')
      .eq('request_id', id)
      .limit(1);
    if (response.error) throw response.error;
    renderTraceResult((response.data || [])[0] || null, null);
  } catch (error) {
    renderTraceResult(null, error?.message || 'Не удалось проверить request_id.');
  }
}

function ensureAuditHelper() {
  const section = document.getElementById('publicLeadAuditSection');
  if (!section || document.getElementById('publicLeadAuditHelperV1')) return;
  const note = document.createElement('div');
  note.id = 'publicLeadAuditHelperV1';
  note.style.cssText = 'margin:0 0 12px;padding:12px 14px;border:1px solid #bfdbfe;background:#eff6ff;color:#1e3a8a;border-radius:14px;font:13px/1.45 Arial,sans-serif';
  note.innerHTML = `
    <style>.v4-public-trace-badge{display:inline-flex;width:max-content;border-radius:999px;padding:5px 9px;background:#e0f2fe;color:#075985;font-weight:900}.v4-public-trace-badge.is-good{background:#dcfce7;color:#166534}.v4-public-trace-badge.is-warn{background:#fef3c7;color:#92400e}.v4-public-trace-badge.is-danger{background:#fee2e2;color:#991b1b}</style>
    <b style="display:block;margin-bottom:4px">Проверка v8</b>
    Для теста откройте <a href="https://www.lider-bsk.ru/request.html" target="_blank" rel="noopener">страницу заявки</a>, отправьте обращение с пометкой <code>Тест CRM v4 audit v8</code>, затем найдите номер обращения по <code>request_id</code>. Подробный чек-лист: <code>docs/CRM_V4_AUDIT_V8_CHECK.md</code>.
    <form id="publicLeadTraceFormV1" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
      <input id="publicLeadTraceInputV1" type="search" placeholder="Вставьте request_id" style="flex:1 1 240px;min-height:36px;border:1px solid #93c5fd;border-radius:10px;padding:8px 10px;font:inherit">
      <button type="submit" style="border:1px solid #1d4ed8;background:#1d4ed8;color:#fff;border-radius:999px;padding:8px 12px;font-weight:900">Проверить request_id</button>
    </form>
    <div id="publicLeadTraceResultV1" style="margin-top:10px;padding:10px;border:1px dashed #93c5fd;border-radius:10px;background:#fff;color:#1e3a8a">Введите request_id для трассировки через <code>leader_request_trace</code>.</div>`;
  section.insertBefore(note, section.firstChild);
}

function bootAuditHelper() {
  ensureAuditHelper();
  document.addEventListener('leader-v4:crm-ready', () => setTimeout(ensureAuditHelper, 300));
  document.addEventListener('click', (event) => {
    if (event.target.closest?.('[data-v4-tab-button="public_lead_audit"]')) {
      setTimeout(ensureAuditHelper, 300);
    }
    const openLead = event.target.closest?.('[data-public-trace-open-lead]');
    if (openLead) {
      event.preventDefault();
      openLeadRoute(openLead.dataset.publicTraceOpenLead);
    }
  }, true);
  document.addEventListener('submit', (event) => {
    if (event.target?.id !== 'publicLeadTraceFormV1') return;
    event.preventDefault();
    runTrace(document.getElementById('publicLeadTraceInputV1')?.value || '');
  });
  setInterval(ensureAuditHelper, 2000);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootAuditHelper); else bootAuditHelper();
