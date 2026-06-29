function auditCards() {
  return [...document.querySelectorAll('#publicLeadAuditSection .v4-audit-card')];
}

function cardHasRequestId(card) {
  const text = card.textContent || '';
  return /request_id:\s*(?!—)/.test(text);
}

function ensureStyles() {
  if (document.getElementById('publicLeadAuditSummaryV1Styles')) return;
  const style = document.createElement('style');
  style.id = 'publicLeadAuditSummaryV1Styles';
  style.textContent = `.v4-audit-request-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin:0 0 12px}.v4-audit-request-summary div{border:1px solid #bfdbfe;background:#eff6ff;color:#1e3a8a;border-radius:16px;padding:12px}.v4-audit-request-summary div.is-warn{border-color:#fde68a;background:#fff7ed;color:#92400e}.v4-audit-request-summary span{display:block;font-size:12px;font-weight:900;text-transform:uppercase}.v4-audit-request-summary b{display:block;margin-top:4px;font-size:22px}`;
  document.head.appendChild(style);
}

function renderAuditRequestSummary() {
  ensureStyles();
  const section = document.getElementById('publicLeadAuditSection');
  const content = document.getElementById('publicLeadAuditContent');
  const grid = content?.querySelector?.('.v4-audit-grid');
  if (!section || !content || !grid) return;

  const cards = auditCards();
  if (!cards.length) {
    document.getElementById('publicLeadAuditRequestSummaryV1')?.remove();
    return;
  }

  const withRequestId = cards.filter(cardHasRequestId).length;
  const withoutRequestId = cards.length - withRequestId;
  let summary = document.getElementById('publicLeadAuditRequestSummaryV1');
  if (!summary) {
    summary = document.createElement('div');
    summary.id = 'publicLeadAuditRequestSummaryV1';
    summary.className = 'v4-audit-request-summary';
    summary.dataset.publicLeadAuditRequestSummary = 'true';
    grid.insertAdjacentElement('afterend', summary);
  }
  summary.innerHTML = `<div><span>Видно событий</span><b>${cards.length}</b></div><div><span>С request_id</span><b>${withRequestId}</b></div><div class="${withoutRequestId ? 'is-warn' : ''}"><span>Без request_id</span><b>${withoutRequestId}</b></div>`;
}

function bootAuditSummary() {
  renderAuditRequestSummary();
  document.addEventListener('leader-v4:crm-ready', () => setTimeout(renderAuditRequestSummary, 300));
  document.addEventListener('click', (event) => {
    if (event.target.closest?.('[data-v4-tab-button="public_lead_audit"],[data-public-lead-audit-refresh],[data-public-lead-audit-filter]')) {
      setTimeout(renderAuditRequestSummary, 400);
      setTimeout(renderAuditRequestSummary, 1000);
    }
  }, true);
  document.addEventListener('input', (event) => {
    if (event.target.closest?.('[data-public-lead-audit-search]')) setTimeout(renderAuditRequestSummary, 100);
  }, true);
  const observer = new MutationObserver(() => renderAuditRequestSummary());
  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootAuditSummary); else bootAuditSummary();
