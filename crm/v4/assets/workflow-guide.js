import { v4State, subscribeState } from 'https://deputat36.github.io/lidercalculator/assets/v4/state.js';

const stageConfig = [
  ['lead', 'Заявка', '.v4-card-view-head'],
  ['need', 'Потребность', '.v4-needs-section'],
  ['calculation', 'Расчёт', '#calculationsBox'],
  ['offer', 'КП', '#offersBox'],
  ['order', 'Заказ', '#ordersBox']
];

const expanded = new Set();
let scheduled = false;
let previousStage = null;
let observer = null;

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (symbol) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'
  }[symbol]));
}

function snapshot() {
  const needs = (v4State.leadNeeds || []).filter((item) => item.status !== 'Архив');
  const calculations = v4State.calculations || [];
  const offers = v4State.offers || [];
  const hasOrder = Boolean(
    v4State.currentLead?.converted_order_id ||
    calculations.some((item) => item.order_id) ||
    offers.some((item) => item.order_id)
  );
  const approved = offers.some((item) => item.status === 'Согласовано');
  const sent = offers.some((item) => item.status === 'КП отправлено');

  const complete = {
    lead: Boolean(v4State.currentLead),
    need: needs.length > 0,
    calculation: calculations.length > 0,
    offer: offers.length > 0,
    order: hasOrder
  };

  if (!complete.need) return {
    complete, active: 'need', title: 'Уточните задачу клиента',
    text: 'Добавьте хотя бы одну потребность: что изготовить, размеры, количество, сроки, дизайн и монтаж.',
    action: 'Добавить потребность', target: '.v4-needs-section .v4-need-form-card'
  };
  if (!complete.calculation) return {
    complete, active: 'calculation', title: 'Подготовьте расчёт',
    text: 'Добавьте позиции, себестоимость и цену клиенту, затем сохраните расчёт.',
    action: 'Перейти к расчёту', target: '#calculationsBox'
  };
  if (!complete.offer) return {
    complete, active: 'offer', title: 'Сформируйте предложение',
    text: 'Выберите сохранённый расчёт и подготовьте коммерческое предложение клиенту.',
    action: 'Сформировать КП', target: '#offersBox'
  };
  if (approved && !hasOrder) return {
    complete, active: 'order', title: 'Создайте заказ',
    text: 'КП согласовано. Перенесите клиента, позиции, суммы и срок в рабочий заказ.',
    action: 'Создать заказ', target: '#ordersBox'
  };
  if (sent && !approved && !hasOrder) return {
    complete, active: 'offer', title: 'Зафиксируйте ответ клиента',
    text: 'КП отправлено. После ответа отметьте его как согласованное или отклонённое.',
    action: 'Открыть КП', target: '#offersBox'
  };
  if (!hasOrder) return {
    complete, active: 'offer', title: 'Проверьте и отправьте КП',
    text: 'Скопируйте подходящую версию, отправьте клиенту и измените статус предложения.',
    action: 'Открыть КП', target: '#offersBox'
  };
  return {
    complete, active: 'order', title: 'Заказ создан',
    text: 'Заявка успешно доведена до заказа. Дальнейшая работа ведётся по заказу.',
    action: 'Посмотреть заказ', target: '#ordersBox'
  };
}

function stagesMarkup(data) {
  return stageConfig.map(([id, label, target], index) => {
    const done = data.complete[id];
    const active = data.active === id;
    return `<button type="button" class="v4-flow-step ${done ? 'is-done' : active ? 'is-active' : 'is-future'}" data-flow-target="${target}" aria-current="${active ? 'step' : 'false'}"><span>${done ? '✓' : index + 1}</span><b>${label}</b></button>`;
  }).join('');
}

function guideMarkup(data) {
  return `<section id="workflowGuide" class="v4-flow-guide"><div class="v4-flow-guide-main"><div><small>Текущий шаг</small><h3>${esc(data.title)}</h3><p>${esc(data.text)}</p></div><button type="button" class="v4-primary" data-flow-target="${esc(data.target)}">${esc(data.action)}</button></div><div class="v4-flow-steps">${stagesMarkup(data)}</div></section>`;
}

function stickyMarkup(data) {
  return `<div id="workflowSticky" class="v4-flow-sticky"><div><small>Следующий шаг</small><b>${esc(data.title)}</b></div><button type="button" class="v4-primary" data-flow-target="${esc(data.target)}">${esc(data.action)}</button></div>`;
}

function stageOf(section) {
  if (section.matches('.v4-needs-section')) return 'need';
  if (section.matches('.v4-calculations-section')) return 'calculation';
  if (section.matches('.v4-offers-section')) return 'offer';
  if (section.matches('.v4-orders-section')) return 'order';
  return '';
}

function decorateSections(data) {
  document.querySelectorAll('.v4-needs-section,.v4-calculations-section,.v4-offers-section,.v4-orders-section').forEach((section) => {
    const stage = stageOf(section);
    if (!stage) return;
    section.classList.add('v4-flow-section');
    section.dataset.flowStage = stage;
    section.classList.toggle('is-current', stage === data.active);
    section.classList.toggle('is-complete', Boolean(data.complete[stage]));

    const head = section.querySelector(':scope > .v4-subcard-head');
    if (head && !head.querySelector('.v4-flow-toggle')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'v4-flow-toggle';
      button.dataset.flowToggle = stage;
      head.appendChild(button);
    }

    const open = stage === data.active || expanded.has(stage);
    section.classList.toggle('is-collapsed', !open);
    const button = head?.querySelector('.v4-flow-toggle');
    if (button) {
      button.textContent = open ? 'Свернуть' : 'Развернуть';
      button.setAttribute('aria-expanded', String(open));
    }
  });

  document.querySelectorAll('.v4-lead-card-view > .v4-subcard').forEach((section) => {
    const title = section.querySelector('h3')?.textContent?.trim();
    if (title === 'Следующий этап') section.hidden = true;
    if (!['Ссылки и источник', 'Технические данные формы'].includes(title)) return;
    section.classList.add('v4-secondary-section');
    if (section.querySelector('.v4-secondary-toggle')) return;
    section.classList.add('is-collapsed');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'v4-secondary-toggle';
    button.textContent = 'Показать подробнее';
    section.insertBefore(button, section.children[1] || null);
  });
}

function scrollTo(selector) {
  const target = document.querySelector(selector);
  if (!target) return;
  const section = target.closest('.v4-flow-section');
  if (section) expanded.add(section.dataset.flowStage);
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  setTimeout(() => target.querySelector('input,select,textarea,button')?.focus({ preventScroll: true }), 400);
}

function render(autoScroll = false) {
  scheduled = false;
  const card = document.querySelector('.v4-lead-card-view');
  if (!card || !v4State.currentLead) {
    document.getElementById('workflowSticky')?.remove();
    return;
  }

  const data = snapshot();
  const oldGuide = document.getElementById('workflowGuide');
  if (oldGuide) oldGuide.outerHTML = guideMarkup(data);
  else card.querySelector('.v4-card-view-head')?.insertAdjacentHTML('afterend', guideMarkup(data));

  const oldSticky = document.getElementById('workflowSticky');
  if (oldSticky) oldSticky.outerHTML = stickyMarkup(data);
  else document.body.insertAdjacentHTML('beforeend', stickyMarkup(data));

  decorateSections(data);

  if (autoScroll && previousStage && previousStage !== data.active) {
    setTimeout(() => scrollTo(data.target), 180);
  }
  previousStage = data.active;
}

function queue(autoScroll = false) {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => render(autoScroll));
}

document.addEventListener('click', (event) => {
  const targetButton = event.target.closest('[data-flow-target]');
  if (targetButton) return scrollTo(targetButton.dataset.flowTarget);

  const toggle = event.target.closest('[data-flow-toggle]');
  if (toggle) {
    const stage = toggle.dataset.flowToggle;
    expanded.has(stage) ? expanded.delete(stage) : expanded.add(stage);
    return queue();
  }

  const secondary = event.target.closest('.v4-secondary-toggle');
  if (secondary) {
    const section = secondary.closest('.v4-secondary-section');
    const collapsed = section.classList.toggle('is-collapsed');
    secondary.textContent = collapsed ? 'Показать подробнее' : 'Скрыть подробности';
  }
});

document.addEventListener('leader-v4:lead-card-rendered', () => queue());
document.addEventListener('leader-v4:route-change', () => {
  expanded.clear();
  previousStage = null;
  queue();
});
subscribeState(() => queue(true));

function boot() {
  const root = document.getElementById('leadCardContent');
  if (root && !observer) {
    observer = new MutationObserver(() => queue());
    observer.observe(root, { childList: true, subtree: true });
  }
  queue();
}

document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', boot) : boot();
