import { toast } from './ui.js';
import {
  calculationDraftClearDecision,
  calculationDraftReviewDescriptor,
  calculationDraftRowLabels,
  calculationPositionCountLabel,
  reconcileCalculationDraftReview
} from './calculation-draft-review-model-v1.js';

let reviewMetadata = [];
let pendingReview = null;
let clearArmedUntil = 0;
let clearResetTimer = 0;
let observer = null;
let decorateScheduled = false;

function text(value) {
  return String(value ?? '').trim();
}

function editableRows() {
  return [...document.querySelectorAll('#calcDraftItems tr')]
    .filter((row) => row.querySelector('[data-calc-row-field]'));
}

function rowName(row, index) {
  const firstCell = row.cells?.[0];
  if (!firstCell) return `Позиция ${index + 1}`;
  const clone = firstCell.cloneNode(true);
  clone.querySelectorAll('small, .v4-calc-row-review-meta, .v4-calc-row-number').forEach((node) => node.remove());
  return text(clone.textContent) || `Позиция ${index + 1}`;
}

function fieldValue(id) {
  return text(document.getElementById(id)?.value);
}

function capturePendingReview() {
  const select = document.getElementById('calcSmartMode');
  const mode = text(select?.value) || 'custom';
  const modeLabel = text(select?.selectedOptions?.[0]?.textContent) || 'Позиция расчёта';
  const previewRows = [...document.querySelectorAll('#calcSmartPreview .v4-estimate-lines > div')];
  const category = mode === 'custom' ? fieldValue('calcCustomCategory') : modeLabel;
  const itemType = mode === 'custom'
    ? fieldValue('calcCustomType')
    : mode === 'service' ? 'Услуга' : 'Состав позиции';
  const characteristics = mode === 'custom' ? fieldValue('calcCustomData') : '';
  return previewRows.map((preview) => calculationDraftReviewDescriptor({
    modeLabel,
    category,
    itemType,
    characteristics,
    previewName: text(preview.querySelector('b')?.textContent)
  }));
}

function resetClearButton() {
  clearArmedUntil = 0;
  if (clearResetTimer) window.clearTimeout(clearResetTimer);
  clearResetTimer = 0;
  const button = document.getElementById('clearCalculationBtn');
  if (!button) return;
  button.textContent = 'Очистить';
  button.classList.remove('is-confirming');
  button.removeAttribute('aria-describedby');
}

function armClearButton(button, armedUntil) {
  clearArmedUntil = armedUntil;
  button.textContent = 'Нажмите ещё раз — очистить';
  button.classList.add('is-confirming');
  button.setAttribute('aria-describedby', 'calcDraftReviewHint');
  if (clearResetTimer) window.clearTimeout(clearResetTimer);
  clearResetTimer = window.setTimeout(resetClearButton, Math.max(0, armedUntil - Date.now()));
}

function ensureDraftReviewHead(wrap, count) {
  const form = wrap.closest('.v4-calc-form');
  if (!form) return;
  let head = form.querySelector('.v4-calc-draft-review-head');
  if (!head) {
    head = document.createElement('div');
    head.className = 'v4-calc-draft-review-head';
    head.innerHTML = `
      <div>
        <h4>Состав расчёта</h4>
        <p id="calcDraftReviewHint">Проверьте каждую строку, себестоимость и цену клиенту. На телефоне строки показываются отдельными карточками.</p>
      </div>
      <span class="v4-calc-draft-count" aria-live="polite"></span>
    `;
    wrap.before(head);
  }
  const counter = head.querySelector('.v4-calc-draft-count');
  if (counter) counter.textContent = calculationPositionCountLabel(count);
}

function addReviewMeta(firstCell, descriptor) {
  firstCell.querySelector('.v4-calc-row-review-meta')?.remove();
  firstCell.querySelector('.v4-calc-row-characteristics')?.remove();
  const meta = document.createElement('div');
  meta.className = 'v4-calc-row-review-meta';
  const category = document.createElement('span');
  category.textContent = descriptor.category;
  const itemType = document.createElement('span');
  itemType.textContent = descriptor.itemType;
  meta.append(category, itemType);
  firstCell.append(meta);
  if (descriptor.characteristics) {
    const details = document.createElement('small');
    details.className = 'v4-calc-row-characteristics';
    details.textContent = `Характеристики: ${descriptor.characteristics}`;
    firstCell.append(details);
  }
}

function decorateDraftRows() {
  decorateScheduled = false;
  const section = document.getElementById('leadCardSection');
  const wrap = document.querySelector('#calcDraftItems')?.closest('.v4-table-wrap');
  if (!section || !wrap) return;

  observer?.disconnect();
  const rows = editableRows();
  reviewMetadata = reviewMetadata.slice(0, rows.length);
  while (reviewMetadata.length < rows.length) {
    reviewMetadata.push(calculationDraftReviewDescriptor());
  }

  wrap.classList.add('v4-draft-review-table');
  ensureDraftReviewHead(wrap, rows.length);

  const labels = ['Позиция', 'Единица', 'Количество', 'Себестоимость за единицу', 'Цена клиенту за единицу', 'Сумма клиенту', 'Действие'];
  rows.forEach((row, index) => {
    const name = rowName(row, index);
    const aria = calculationDraftRowLabels(index, name);
    row.dataset.calcReviewRow = String(index + 1);
    row.setAttribute('aria-label', aria.row);
    [...row.cells].forEach((cell, cellIndex) => {
      cell.dataset.label = labels[cellIndex] || '';
    });

    const firstCell = row.cells?.[0];
    if (firstCell) {
      let number = firstCell.querySelector('.v4-calc-row-number');
      if (!number) {
        number = document.createElement('span');
        number.className = 'v4-calc-row-number';
        firstCell.prepend(number);
      }
      number.textContent = String(index + 1);
      addReviewMeta(firstCell, reviewMetadata[index]);
    }

    const qty = row.querySelector('[data-calc-row-field="qty"]');
    const contractor = row.querySelector('[data-calc-row-field="contractor_price"]');
    const client = row.querySelector('[data-calc-row-field="client_price"]');
    const autoButton = row.querySelector('[data-action="auto-calc-item"]');
    const removeButton = row.querySelector('[data-action="remove-calc-item"]');
    if (qty) qty.setAttribute('aria-label', aria.quantity);
    if (contractor) contractor.setAttribute('aria-label', aria.contractorPrice);
    if (client) client.setAttribute('aria-label', aria.clientPrice);
    if (autoButton) {
      autoButton.setAttribute('aria-label', aria.autoPrice);
      autoButton.title = aria.autoPrice;
      let state = autoButton.parentElement?.querySelector('.v4-calc-price-state');
      if (!state) {
        state = document.createElement('small');
        state.className = 'v4-calc-price-state';
        autoButton.parentElement?.append(state);
      }
      state.textContent = autoButton.disabled ? 'Автоматическая цена' : 'Ручная цена';
    }
    if (removeButton) {
      removeButton.textContent = 'Удалить';
      removeButton.classList.add('v4-calc-remove-row');
      removeButton.setAttribute('aria-label', aria.remove);
      removeButton.title = aria.remove;
    }
  });

  if (!rows.length) reviewMetadata = [];
  observer?.observe(section, { childList: true, subtree: true });
}

function scheduleDecoration() {
  if (decorateScheduled) return;
  decorateScheduled = true;
  window.queueMicrotask(decorateDraftRows);
}

function bindDraftReviewEvents(section) {
  section.addEventListener('click', (event) => {
    const addButton = event.target.closest('#addSmartCalcItemBtn');
    if (addButton) {
      pendingReview = {
        beforeCount: editableRows().length,
        descriptors: capturePendingReview()
      };
      window.setTimeout(() => {
        if (!pendingReview) return;
        const afterCount = editableRows().length;
        reviewMetadata = reconcileCalculationDraftReview(
          reviewMetadata,
          pendingReview.descriptors,
          pendingReview.beforeCount,
          afterCount
        );
        pendingReview = null;
        decorateDraftRows();
      }, 0);
      return;
    }

    const removeButton = event.target.closest('[data-action="remove-calc-item"]');
    if (removeButton) {
      const index = Number(removeButton.dataset.index);
      if (Number.isInteger(index) && index >= 0) reviewMetadata.splice(index, 1);
      window.setTimeout(decorateDraftRows, 0);
      return;
    }

    const clearButton = event.target.closest('#clearCalculationBtn');
    if (!clearButton) return;
    const decision = calculationDraftClearDecision({
      rowCount: editableRows().length,
      armedUntil: clearArmedUntil,
      now: Date.now()
    });
    if (decision.action === 'empty') {
      event.preventDefault();
      event.stopImmediatePropagation();
      toast('Черновик расчёта уже пуст');
      return;
    }
    if (decision.action === 'arm') {
      event.preventDefault();
      event.stopImmediatePropagation();
      armClearButton(clearButton, decision.armedUntil);
      toast('Нажмите «Очистить» ещё раз в течение 4 секунд');
      return;
    }
    reviewMetadata = [];
    pendingReview = null;
    resetClearButton();
    window.setTimeout(() => {
      decorateDraftRows();
      toast('Черновик расчёта очищен');
    }, 0);
  }, true);
}

export function bootCalculationDraftReview() {
  if (observer) return;
  const section = document.getElementById('leadCardSection');
  if (!section) return;
  observer = new MutationObserver(scheduleDecoration);
  observer.observe(section, { childList: true, subtree: true });
  bindDraftReviewEvents(section);
  document.addEventListener('leader-v4:lead-card-rendered', scheduleDecoration);
  document.addEventListener('leader-v4:route-change', () => {
    reviewMetadata = [];
    pendingReview = null;
    resetClearButton();
    scheduleDecoration();
  });
  scheduleDecoration();
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', bootCalculationDraftReview);
}
