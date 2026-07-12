import { supabaseClient } from './supabase-client.js';
import {
  boardStatus,
  isBoardDateOverdue,
  productionBoardMetrics
} from './production-board-status-model-v1.js';

let loading = false;
let lastRun = 0;

function ensureStyles() {
  if (document.getElementById('productionAlertsV1Styles')) return;
  const style = document.createElement('style');
  style.id = 'productionAlertsV1Styles';
  style.textContent = `.v4-production-tab-badge{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;margin-left:6px;padding:0 6px;border-radius:999px;background:#dcfce7;color:#166534;font-size:12px;font-weight:900;line-height:1}.v4-production-tab-badge.is-warn{background:#fef3c7;color:#92400e}.v4-production-tab-badge.is-danger{background:#fee2e2;color:#991b1b}.v4-production-alert-line{border:1px solid #fecaca;background:#fff7f7;color:#991b1b;border-radius:14px;padding:10px 12px;margin:0 0 12px;font-weight:900}.v4-production-alert-line.is-ok{border-color:#bbf7d0;background:#f0fdf4;color:#166534}.v4-production-alert-line.is-warn{border-color:#fde68a;background:#fffbeb;color:#92400e}.v4-prod-light-badge[data-registry-unknown-status="true"]{background:#fef3c7;color:#92400e;border:1px dashed #f59e0b}`;
  document.head.appendChild(style);
}

function badge() {
  const button = document.querySelector('[data-v4-tab-button="production"]');
  if (!button) return null;
  let element = button.querySelector('.v4-production-tab-badge');
  if (!element) {
    element = document.createElement('span');
    element.className = 'v4-production-tab-badge';
    element.textContent = '•';
    element.title = 'Проверка производства запускается при открытии раздела';
    button.appendChild(element);
  }
  return element;
}

function unknownTotal(counts) {
  return Number(counts.unknownProduction || 0) + Number(counts.unknownInstallation || 0);
}

function unknownSuffix(counts) {
  const total = unknownTotal(counts);
  return total ? ` Неизвестных статусов: ${total}.` : '';
}

function setBadge(counts) {
  const element = badge();
  if (!element) return;
  const totalProblem = counts.overdueProduction + counts.overdueInstallation;
  const totalToday = counts.todayProduction + counts.todayInstallation;
  const totalUnknown = unknownTotal(counts);
  element.classList.remove('is-warn', 'is-danger');
  if (totalProblem > 0) {
    element.textContent = String(totalProblem);
    element.title = `Просрочено: производство ${counts.overdueProduction}, монтаж ${counts.overdueInstallation}.${unknownSuffix(counts)}`;
    element.classList.add('is-danger');
    return;
  }
  if (totalToday > 0) {
    element.textContent = String(totalToday);
    element.title = `На сегодня: производство ${counts.todayProduction}, монтаж ${counts.todayInstallation}.${unknownSuffix(counts)}`;
    element.classList.add('is-warn');
    return;
  }
  if (totalUnknown > 0) {
    element.textContent = '?';
    element.title = `Найдены неизвестные статусы: производство ${counts.unknownProduction}, монтаж ${counts.unknownInstallation}. Они оставлены в открытом контроле.`;
    element.classList.add('is-warn');
    return;
  }
  element.textContent = '✓';
  element.title = 'Просроченных задач и неизвестных статусов нет';
}

function insertAlertLine(counts) {
  const box = document.getElementById('productionBoardSectionContent');
  if (!box) return;
  const board = box.querySelector('.v4-prod-light');
  if (!board) return;
  let line = box.querySelector('#productionAlertLine');
  if (!line) {
    line = document.createElement('div');
    line.id = 'productionAlertLine';
    board.insertAdjacentElement('afterbegin', line);
  }
  const totalProblem = counts.overdueProduction + counts.overdueInstallation;
  const totalToday = counts.todayProduction + counts.todayInstallation;
  const totalUnknown = unknownTotal(counts);
  line.className = 'v4-production-alert-line';
  if (totalProblem > 0) {
    line.textContent = `Внимание: просрочено задач — ${totalProblem}. Производство: ${counts.overdueProduction}, монтаж: ${counts.overdueInstallation}.${unknownSuffix(counts)}`;
    return;
  }
  if (totalToday > 0) {
    line.classList.add('is-warn');
    line.textContent = `Сегодня требуют внимания задач — ${totalToday}. Производство: ${counts.todayProduction}, монтаж: ${counts.todayInstallation}.${unknownSuffix(counts)}`;
    return;
  }
  if (totalUnknown > 0) {
    line.classList.add('is-warn');
    line.textContent = `Просроченных задач нет, но найдены неизвестные статусы — ${totalUnknown}. Они не считаются завершёнными и остаются в открытом контроле.`;
    return;
  }
  line.classList.add('is-ok');
  line.textContent = 'Просроченных производственных и монтажных задач нет.';
}

function setSummaryValue(label, value) {
  document.querySelectorAll('#productionBoardSectionContent .v4-prod-light-summary > div').forEach((item) => {
    const title = item.querySelector('span')?.textContent?.trim();
    if (title !== label) return;
    const target = item.querySelector('b');
    if (target) target.textContent = String(value);
  });
}

function syncBoardSummary(counts) {
  setSummaryValue('Производство открыто', counts.productionOpen);
  setSummaryValue('Монтаж открыт', counts.installationOpen);
  setSummaryValue('Просрочено', counts.overdueProduction + counts.overdueInstallation);
}

function overdueLabel(card) {
  return [...card.querySelectorAll('small')].find((item) => item.textContent?.trim() === 'Просрочено') || null;
}

function syncVisibleCards(production, installation) {
  const kind = document.body.dataset.productionBoardKind === 'installation' ? 'installation' : 'production';
  const jobs = kind === 'installation' ? installation : production;
  const cards = [...document.querySelectorAll('#productionBoardSectionContent .v4-prod-light-grid .v4-prod-light-card')];
  cards.forEach((card, index) => {
    const job = jobs[index];
    if (!job) return;
    const rawStatus = kind === 'installation' ? job.install_status : job.production_status;
    const deadline = kind === 'installation' ? job.scheduled_at : job.deadline;
    const model = boardStatus(kind, rawStatus);
    const overdue = isBoardDateOverdue(deadline, model.done);
    card.classList.toggle('is-overdue', overdue);

    let label = overdueLabel(card);
    if (overdue && !label) {
      label = document.createElement('small');
      label.dataset.registryOverdue = 'true';
      label.style.color = '#991b1b';
      label.style.fontWeight = '900';
      label.textContent = 'Просрочено';
      card.querySelector('.v4-prod-light-card-actions')?.insertAdjacentElement('beforebegin', label);
    } else if (!overdue && label) {
      label.remove();
    }

    const statusBadge = card.querySelector('.v4-prod-light-badge');
    if (!statusBadge) return;
    if (model.unknown) {
      statusBadge.dataset.registryUnknownStatus = 'true';
      statusBadge.title = model.warning || 'Неизвестный статус оставлен в открытом контроле';
    } else {
      delete statusBadge.dataset.registryUnknownStatus;
      statusBadge.removeAttribute('title');
    }
  });
}

async function fetchSnapshot() {
  const [productionResponse, installationResponse] = await Promise.all([
    supabaseClient.from('leader_production_jobs').select('id,production_status,deadline').order('deadline', { ascending: true }).limit(80),
    supabaseClient.from('leader_installation_jobs').select('id,install_status,scheduled_at').order('scheduled_at', { ascending: true }).limit(80)
  ]);
  const production = productionResponse.error ? [] : productionResponse.data || [];
  const installation = installationResponse.error ? [] : installationResponse.data || [];
  return {
    production,
    installation,
    counts: productionBoardMetrics(production, installation)
  };
}

async function refreshProductionAlerts(force = false) {
  ensureStyles();
  const now = Date.now();
  if (!force && now - lastRun < 20000) return;
  if (loading) return;
  loading = true;
  try {
    const snapshot = await fetchSnapshot();
    lastRun = now;
    setBadge(snapshot.counts);
    insertAlertLine(snapshot.counts);
    syncBoardSummary(snapshot.counts);
    syncVisibleCards(snapshot.production, snapshot.installation);
  } finally {
    loading = false;
  }
}

function boot() {
  ensureStyles();
  badge();
  document.addEventListener('leader-v4:tab-opened', (event) => {
    if (event.detail?.tab === 'production') setTimeout(() => refreshProductionAlerts(true), 900);
  });
  document.addEventListener('leader-v4:production-board-rendered', () => {
    setTimeout(() => refreshProductionAlerts(true), 100);
  });
  document.addEventListener('leader-v4-order-updated', () => {
    if (document.body.dataset.v4Tab === 'production') setTimeout(() => refreshProductionAlerts(true), 900);
  });
  document.addEventListener('click', (event) => {
    if (!event.target.closest?.('[data-v4-tab-button="production"],[data-production-light-refresh],[data-production-light-kind]')) return;
    if (document.body.dataset.v4Tab === 'production') setTimeout(() => refreshProductionAlerts(true), 900);
  });
}

if (!window.LeaderV4ProductionAlertsV1Booted) {
  window.LeaderV4ProductionAlertsV1Booted = true;
  boot();
}

export { refreshProductionAlerts };
