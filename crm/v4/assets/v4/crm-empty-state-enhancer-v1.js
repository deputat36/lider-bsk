import { crmEmptyStateContext, crmEmptyStateModel } from './crm-empty-state-model-v1.js';

const STYLE_ID = 'crmEmptyStateV1Styles';
const STYLE_HREF = 'assets/v4/crm-empty-state-v1.css?v=20260715-1';
const ROOT_SELECTORS = ['#leadsList', '#ordersBox', '#financeControlContent', '#publicLeadAuditContent'];
let scheduled = false;

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const link = document.createElement('link');
  link.id = STYLE_ID;
  link.rel = 'stylesheet';
  link.href = STYLE_HREF;
  document.head.appendChild(link);
}

function containerInfo(node) {
  const financeColumn = Boolean(node.closest('.v4-fin-column'));
  const root = node.closest(ROOT_SELECTORS.join(','));
  if (!root) return null;
  const context = crmEmptyStateContext({ containerId: root.id, financeColumn });
  if (!context) return null;
  const columnTitle = financeColumn ? node.closest('.v4-fin-column')?.querySelector('h3')?.textContent || '' : '';
  return { root, context, financeColumn, columnTitle };
}

function readableText(node) {
  const copy = node.cloneNode(true);
  copy.querySelectorAll('button').forEach((button) => button.remove());
  return String(copy.textContent || '').replace(/\s+/g, ' ').trim();
}

function moveExistingButtons(node) {
  return [...node.querySelectorAll('button')].map((button) => {
    button.remove();
    return button;
  });
}

function defaultButton(action) {
  if (!action?.attribute || !/^data-[a-z0-9-]+$/.test(action.attribute)) return null;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'v4-primary';
  button.textContent = action.label;
  button.setAttribute(action.attribute, '');
  return button;
}

function enhanceNode(node) {
  if (!(node instanceof HTMLElement) || node.dataset.v4EmptyStateEnhanced === '1') return;
  const info = containerInfo(node);
  if (!info) return;

  const rawText = readableText(node);
  const model = crmEmptyStateModel({
    context: info.context,
    text: rawText,
    isError: node.classList.contains('is-error'),
    financeColumn: info.financeColumn,
    columnTitle: info.columnTitle
  });
  if (!model) return;

  const existingButtons = moveExistingButtons(node);
  const fallbackButton = existingButtons.length ? null : defaultButton(model.action);

  const state = document.createElement('div');
  state.className = `v4-empty-state is-${model.tone}${model.compact ? ' is-compact' : ''}`;
  state.dataset.v4EmptyStateContext = model.context;
  state.dataset.v4EmptyStateKind = model.kind;
  state.setAttribute('role', model.kind === 'error' ? 'alert' : 'status');
  state.setAttribute('aria-live', model.kind === 'error' ? 'assertive' : 'polite');

  const icon = document.createElement('span');
  icon.className = 'v4-empty-state-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = model.icon;

  const body = document.createElement('div');
  body.className = 'v4-empty-state-body';

  const title = document.createElement('div');
  title.className = 'v4-empty-state-title';
  title.textContent = model.title;
  body.appendChild(title);

  const description = document.createElement('p');
  description.className = 'v4-empty-state-text';
  description.textContent = model.description;
  body.appendChild(description);

  if (model.detail) {
    const detail = document.createElement('div');
    detail.className = 'v4-empty-state-detail';
    detail.textContent = model.detail;
    body.appendChild(detail);
  }

  const actionButtons = [...existingButtons, ...(fallbackButton ? [fallbackButton] : [])];
  if (actionButtons.length && !model.compact) {
    const actions = document.createElement('div');
    actions.className = 'v4-empty-state-actions';
    actionButtons.forEach((button, index) => {
      if (index === 0 && !button.classList.contains('v4-primary')) button.classList.add('v4-primary');
      actions.appendChild(button);
    });
    body.appendChild(actions);
  }

  state.append(icon, body);
  node.replaceChildren(state);
  node.dataset.v4EmptyStateEnhanced = '1';
  node.classList.remove('is-error');
}

export function enhanceCrmEmptyStates(root = document) {
  ROOT_SELECTORS.forEach((selector) => {
    const container = root.matches?.(selector) ? root : root.querySelector?.(selector);
    if (!container) return;
    container.querySelectorAll('.v4-empty').forEach(enhanceNode);
    if (container.matches?.('.v4-empty')) enhanceNode(container);
  });
}

function scheduleEnhance() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    enhanceCrmEmptyStates(document);
  });
}

function clearAuditEmptyFilter() {
  const input = document.querySelector('[data-public-lead-audit-search]');
  if (input) {
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  const all = document.querySelector('[data-public-lead-audit-filter="all"]');
  if (all) all.click();
}

function boot() {
  ensureStyles();
  scheduleEnhance();

  const root = document.getElementById('crmWorkspace') || document.body;
  const observer = new MutationObserver(scheduleEnhance);
  observer.observe(root, { childList: true, subtree: true });

  document.addEventListener('click', (event) => {
    if (event.target.closest?.('[data-public-lead-audit-clear-empty]')) {
      event.preventDefault();
      clearAuditEmptyFilter();
    }
  }, true);

  document.addEventListener('leader-v4:crm-ready', scheduleEnhance);
  document.addEventListener('leader-v4:tab-opened', scheduleEnhance);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
