import {
  CRM_V4_ACTIONS,
  canPerformV4Action
} from './action-permissions-v1.js';

const STYLE_ID = 'designTaskDraftEntrypointsV1Styles';
let lastOpenedOrderId = '';
let scheduled = false;

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `.v4-design-draft-entry{border:1px solid #c4b5fd;background:#f5f3ff;color:#5b21b6;border-radius:11px;padding:8px 10px;font-weight:900;cursor:pointer}.v4-design-draft-entry:hover{background:#ede9fe}.v4-design-draft-entry-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}@media(max-width:640px){.v4-design-draft-entry{width:100%}}`;
  document.head.appendChild(style);
}

function mayReadDesign() {
  return canPerformV4Action(CRM_V4_ACTIONS.DESIGN_READ);
}

function removeEntrypoints() {
  document.querySelectorAll('[data-design-task-draft-entrypoint]').forEach((element) => element.remove());
}

function button(orderId, label) {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = 'v4-design-draft-entry';
  element.dataset.designTaskDraftOrder = orderId;
  element.dataset.designTaskDraftEntrypoint = '1';
  element.textContent = label;
  return element;
}

function decorateQualityQueue() {
  const modal = document.getElementById('orderOperationalQualityModalV1');
  if (!modal) return;
  const title = modal.querySelector('#orderQualityDialogTitle')?.textContent?.trim() || '';
  if (title !== 'Нужен дизайн, задачи нет') return;

  modal.querySelectorAll('.v4-order-quality-row').forEach((row) => {
    if (row.querySelector('[data-design-task-draft-entrypoint]')) return;
    const openOrder = row.querySelector('[data-open-order]');
    const orderId = String(openOrder?.dataset.openOrder || '').trim();
    if (!orderId) return;
    row.appendChild(button(orderId, 'Подготовить черновик design task'));
  });
}

function decorateOrderCard() {
  const section = document.querySelector('#orderCardV1 [data-order-design-section]');
  if (!section || !lastOpenedOrderId) return;
  if (section.querySelector('[data-design-task-draft-entrypoint]')) return;
  const actions = document.createElement('div');
  actions.className = 'v4-design-draft-entry-actions';
  actions.dataset.designTaskDraftEntrypoint = '1';
  actions.appendChild(button(lastOpenedOrderId, 'Проверить дизайн-задачу'));
  section.appendChild(actions);
}

function decorate() {
  scheduled = false;
  ensureStyles();
  if (!mayReadDesign()) {
    removeEntrypoints();
    return;
  }
  decorateQualityQueue();
  decorateOrderCard();
}

function scheduleDecorate() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(decorate);
}

function boot() {
  ensureStyles();
  const observer = new MutationObserver(scheduleDecorate);
  observer.observe(document.body, { childList: true, subtree: true });

  document.addEventListener('click', (event) => {
    const openOrder = event.target.closest?.('[data-open-order]');
    if (openOrder) {
      const orderId = String(openOrder.dataset.openOrder || '').trim();
      if (orderId) lastOpenedOrderId = orderId;
      setTimeout(scheduleDecorate, 0);
    }
  }, true);

  document.addEventListener('leader-v4:crm-ready', scheduleDecorate);
  document.addEventListener('leader-v4:tab-opened', scheduleDecorate);
  document.addEventListener('leader-v4-order-updated', scheduleDecorate);
  document.addEventListener('leader-v4:order-card-rendered', (event) => {
    const orderId = String(event.detail?.orderId || '').trim();
    if (orderId) lastOpenedOrderId = orderId;
    scheduleDecorate();
  });
  scheduleDecorate();
}

if (!window.LeaderV4DesignTaskDraftEntrypointsV1Booted) {
  window.LeaderV4DesignTaskDraftEntrypointsV1Booted = true;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}
