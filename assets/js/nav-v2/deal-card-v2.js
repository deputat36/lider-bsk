import { setupTop, getCachedUser, renderAuthBox, rpc, esc, money, riskPill, saveCachedProfile, statusText } from './supabase-v2.js';

const dealId = new URLSearchParams(location.search).get('id');
let currentData = null;
let currentProfile = null;
let cardRequest = null;
let reloadRequest = null;
let activeTab = location.hash ? location.hash.replace('#', '') : 'overview';

function list(data, key) { return Array.isArray(data?.[key]) ? data[key] : []; }
function dateText(value) { return value ? new Date(value).toLocaleString('ru-RU') : '—'; }
function metric(label, value, cls = '') { return `<div class="metric ${cls}"><span>${label}</span><b>${value ?? '—'}</b></div>`; }
function countOpenTasks(items) { return items.filter((task) => ['open', 'in_progress'].includes(task.status)).length; }
function countMissingDocs(items) { return items.filter((doc) => doc.is_required && !['received', 'checked'].includes(doc.status)).length; }
function countRedRisks(items) { return items.filter((risk) => risk.level === 'red' && risk.is_resolved !== true).length; }
function isLawyer() { return currentProfile?.role === 'lawyer'; }
function setPageStatus(text, type = 'info') {
  const el = document.getElementById('pageStatus');
  if (el) { el.className = 'status ' + type; el.textContent = text; }
}

function restoreScroll(y) {
  if (!Number.isFinite(y)) return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => window.scrollTo({ top: Math.max(0, y), behavior: 'auto' }));
  });
}

function norm(value) { return String(value || '').trim().replace(/\s+/g, ' '); }
function firstWord(value) {
  const text = norm(value);
  return text ? text.split(' ')[0].replace(/[.,;:]+$/g, '') : '';
}
function arr(value) { return Array.isArray(value) ? value : []; }

function isDemoDeal(deal) {
  return deal?.deal_summary?.demo === true
    || deal?.wizard_snapshot?.demo === true
    || String(deal?.title || '').startsWith('ДЕМО:');
}
function demoBadge(deal) { return isDemoDeal(deal) ? '<span class="pill blue">ДЕМО</span> ' : ''; }

function participantSources(data) {
  const deal = data?.deal || {};
  return [
    data?.participants,
    data?.deal_participants,
    data?.dealParticipants,
    deal.participants,
    deal.deal_participants,
    deal.dealParticipants,
    deal.deal_summary?.participants,
    deal.wizard_snapshot?.participants,
    deal.deal_summary?.parties,
    deal.wizard_snapshot?.parties
  ];
}
function personName(item) {
  if (typeof item === 'string') return item;
  return item?.full_name || item?.fio || item?.name || item?.client_name || item?.participant_name || item?.title || '';
}
function side(item) { return norm(item?.side || item?.role || item?.type || item?.participant_role).toLowerCase(); }
function participantRank(item) {
  const s = side(item);
  if (s.includes('seller') || s.includes('продав') || s.includes('owner') || s.includes('собствен')) return 1;
  if (s.includes('buyer') || s.includes('покуп')) return 2;
  return 3;
}
function participantSurnames(data) {
  let people = [];
  for (const source of participantSources(data)) {
    if (arr(source).length) { people = arr(source); break; }
  }
  const seen = new Set();
  return people
    .slice()
    .sort((a, b) => participantRank(a) - participantRank(b))
    .map((item) => firstWord(personName(item)))
    .filter((name) => {
      const key = name.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
function findPersonName(deal, sideName) {
  const summary = deal?.deal_summary || {};
  const snapshot = deal?.wizard_snapshot || {};
  const sideData = snapshot?.[sideName] || snapshot?.[`${sideName}Info`] || {};
  const keys = sideName === 'seller'
    ? ['seller_last_name','seller_name','seller_fio','seller_full_name','seller']
    : ['buyer_last_name','buyer_name','buyer_fio','buyer_full_name','buyer'];
  for (const key of keys) {
    const value = norm(deal?.[key] || summary?.[key] || sideData?.[key] || snapshot?.[key]);
    if (value) return firstWord(value) || value;
  }
  return '';
}
function headlineAddress(data) {
  const deal = data?.deal || {};
  return norm(deal.address || deal.object_address || deal.property_address || deal.deal_summary?.address || deal.wizard_snapshot?.address) || 'Адрес не указан';
}
function dealHeadline(data) {
  const deal = data?.deal || {};
  const names = participantSurnames(data);
  const seller = names[0] || findPersonName(deal, 'seller') || 'продавец';
  const buyer = names[1] || findPersonName(deal, 'buyer') || 'покупатель';
  const base = `${headlineAddress(data)} — ${seller} / ${buyer}`;
  return isLawyer() ? `Юридическая проверка: ${base}` : base;
}

function confirmDemoAction(actionText) {
  const deal = currentData?.deal;
  if (!isDemoDeal(deal)) return true;
  return confirm(`Это демо-сделка. Подтвердите тестовое действие: ${actionText}. Реальные сделки не будут затронуты.`);
}
function dealModePanel(deal) {
  if (isDemoDeal(deal)) return `<div class="status ok"><span class="pill blue">ДЕМО</span> Тестовая карточка. Действия безопасны, но перед сохранением появится подтверждение.</div>`;
  return `<div class="status ok"><span class="pill green">Рабочая</span> Реальная сделка Навигатора. Все изменения сохраняются в CRM.</div>`;
}
function statusSelector(deal) {
  const statuses = [
    ['draft','Черновик'],['need_info','Нужно дозаполнить'],['need_lawyer','Юрист'],['need_broker','Брокер'],
    ['need_documents','Нужны документы'],['ready_for_deposit','Готова к задатку'],['deposit_done','Задаток внесен'],
    ['preparing_deal','Подготовка к сделке'],['ready_for_deal','Готова к сделке'],['registration','На регистрации'],
    ['registered','Зарегистрирована'],['closed','Закрыта'],['cancelled','Отменена']
  ];
  return `<div class="card" style="box-shadow:none">
    <h3>Статус сделки</h3>
    <div class="field"><label>Текущий статус</label><select id="dealStatus">${statuses.map(([id,title]) => `<option value="${id}" ${deal.status === id ? 'selected' : ''}>${title}</option>`).join('')}</select></div>
    <button id="saveStatus" class="btn primary" type="button">Сохранить статус</button>
  </div>`;
}
function lawyerQuickActions(deal) {
  return `<section class="card">
    <div class="section-title">
      <div>
        <h2>Юридические действия</h2>
        <p class="muted">Кнопки фиксируют позицию юриста в комментариях и меняют рабочий статус сделки.</p>
      </div>
      ${riskPill(deal.risk_level)}
    </div>
    <div id="pageStatus" class="status">Проверьте риски, документы и условия. После проверки выберите юридическое действие.</div>
    <div class="actions" style="justify-content:flex-start">
      <button class="btn green" data-legal-action="checked" type="button">Проверено юристом</button>
      <button class="btn light" data-legal-action="need_documents" type="button">Нужны документы</button>
      <button class="btn red" data-legal-action="stop_factor" type="button">Есть стоп-фактор</button>
      <button class="btn light" data-legal-action="return_spn" type="button">Вернуть СПН</button>
      <button class="btn light" data-tab-shortcut="docs" type="button">К документам</button>
      <button class="btn light" data-tab-shortcut="comments" type="button">Комментарий</button>
    </div>
  </section>`;
}
function quickActions(deal) {
  if (isLawyer()) return lawyerQuickActions(deal);
  return `<section class="card">
    <div class="section-title">
      <div>
        <h2>Быстрые действия</h2>
        <p class="muted">Кнопки меняют статус сделки и помогают быстро передать ее нужному специалисту.</p>
      </div>
      ${riskPill(deal.risk_level)}
    </div>
    <div id="pageStatus" class="status">Выберите действие или перейдите во вкладку нужного раздела.</div>
    <div class="actions" style="justify-content:flex-start">
      <button class="btn light" data-quick-status="need_lawyer" type="button">Передать юристу</button>
      <button class="btn light" data-quick-status="need_broker" type="button">Передать брокеру</button>
      <button class="btn green" data-quick-status="ready_for_deposit" type="button">Готово к задатку</button>
      <button class="btn green" data-quick-status="ready_for_deal" type="button">Готово к сделке</button>
      <button class="btn light" data-quick-status="need_documents" type="button">Нужны документы</button>
    </div>
  </section>`;
}
function legalPanel(data) {
  const deal = data.deal;
  const docs = list(data, 'documents');
  const risks = list(data, 'risks');
  const missingDocs = countMissingDocs(docs);
  const redRisks = countRedRisks(risks);
  return `<section class="card" style="border:2px solid rgba(220,38,38,.16)">
    <div class="section-title">
      <div><h2>Юридический профиль сделки</h2><p class="muted">Короткая карта проверки для юриста: риски, документы, дети, ипотека, расходы и расчеты.</p></div>
      <span class="pill yellow">lawyer</span>
    </div>
    <div class="kpi-row">
      ${metric('Красные риски', redRisks, redRisks ? 'red' : 'green')}
      ${metric('Не хватает документов', missingDocs, missingDocs ? 'yellow' : 'green')}
      ${metric('Дети / опека', deal.has_children ? 'есть' : 'нет', deal.has_children ? 'red' : 'green')}
      ${metric('Ипотека', deal.has_mortgage ? 'есть' : 'нет', deal.has_mortgage ? 'yellow' : '')}
    </div>
    <div class="list">
      <div class="list-item"><b>Статус</b>${statusText(deal.status)}</div>
      <div class="list-item"><b>Следующий шаг</b>${esc(deal.next_action || 'Проверить юридические риски и пакет документов.')}</div>
      <div class="list-item"><b>Расходы</b>${deal.expenses_agreed ? '<span class="pill green">согласованы</span>' : '<span class="pill yellow">не согласованы</span>'}</div>
      <div class="list-item"><b>Расчеты</b>${deal.settlements_agreed ? '<span class="pill green">согласованы</span>' : '<span class="pill yellow">не согласованы</span>'}</div>
    </div>
  </section>`;
}

function renderDocs(items) {
  if (!items.length) return '<div class="empty">Документы пока не сформированы.</div>';
  return `<div class="list">${items.map((doc) => `<div class="list-item"><div class="doc-status"><div><b>${esc(doc.title)}</b><span class="small">${esc(doc.category)} / ${esc(doc.side)}${doc.description ? ' — ' + esc(doc.description) : ''}</span></div><span class="pill ${doc.status === 'received' || doc.status === 'checked' ? 'green' : 'yellow'}">${esc(doc.status || 'needed')}</span></div><div class="actions" style="justify-content:flex-start"><button class="btn light" data-doc-status="received" data-doc-id="${doc.id}">Получен</button><button class="btn light" data-doc-status="checked" data-doc-id="${doc.id}">Проверен</button><button class="btn light" data-doc-status="needed" data-doc-id="${doc.id}">Нужен</button></div></div>`).join('')}</div>`;
}
function renderRisks(items) {
  if (!items.length) return '<div class="empty">Риски не обнаружены.</div>';
  return `<div class="list">${items.map((risk) => `<div class="list-item"><div>${riskPill(risk.level)} ${risk.blocks_deposit ? '<span class="pill red">блокирует задаток</span>' : ''} ${risk.blocks_deal ? '<span class="pill red">блокирует сделку</span>' : ''}</div><b>${esc(risk.title)}</b><p class="muted">${esc(risk.description || '')}</p><p><b>Рекомендация:</b> ${esc(risk.recommendation || 'Проверить с ответственным специалистом.')}</p></div>`).join('')}</div>`;
}
function renderExpenses(items) {
  if (!items.length) return '<div class="empty">Расходы пока не рассчитаны.</div>';
  const block = (title, sides) => {
    const allowedSides = Array.isArray(sides) ? sides : [sides];
    const filtered = items.filter((e) => allowedSides.includes(e.side));
    return `<div class="card" style="box-shadow:none"><h3>${title}</h3><div class="list">${filtered.map((e) => `<div class="list-item"><b>${esc(e.title)}</b><span class="small">${esc(e.category)} / сторона: ${esc(e.side)} / плательщик: ${esc(e.payer || 'не указан')}</span><p>${money(e.amount)} ${e.is_agreed ? '<span class="pill green">согласовано</span>' : '<span class="pill yellow">не согласовано</span>'}</p>${e.comment ? `<p class="muted">${esc(e.comment)}</p>` : ''}</div>`).join('') || '<div class="empty">Нет расходов</div>'}</div></div>`;
  };
  return `<div class="side-by-side">${block('Расходы покупателя','buyer')}${block('Расходы продавца','seller')}</div>${block('Общие и спорные расходы',['both','company','other_agency','external_party'])}`;
}
function renderTasks(items) {
  const filtered = isLawyer() ? items.filter((task) => !task.assigned_role || task.assigned_role === 'lawyer' || task.assigned_role === 'spn') : items;
  if (!filtered.length) return '<div class="empty">Задач по этому профилю пока нет.</div>';
  return `<div class="list">${filtered.map((task) => `<div class="list-item"><div><span class="pill ${task.priority === 'urgent' ? 'red' : task.priority === 'high' ? 'yellow' : 'blue'}">${esc(task.priority)}</span> <span class="pill">${esc(task.status)}</span> ${task.assigned_role ? `<span class="pill blue">${esc(task.assigned_role)}</span>` : ''}</div><b>${esc(task.title)}</b><p class="muted">${esc(task.description || '')}</p><div class="actions" style="justify-content:flex-start"><button class="btn light" data-task-status="in_progress" data-task-id="${task.id}">В работе</button><button class="btn green" data-task-status="done" data-task-id="${task.id}">Готово</button><button class="btn light" data-task-status="open" data-task-id="${task.id}">Открыта</button></div></div>`).join('')}</div>`;
}
function renderComments(items) {
  const placeholder = isLawyer() ? 'Юридический комментарий: что проверено, чего не хватает, есть ли стоп-факторы, что должен сделать СПН' : 'Напишите комментарий для команды, юриста или брокера';
  return `<div class="field"><label>Новый комментарий</label><textarea id="newComment" rows="4" placeholder="${esc(placeholder)}"></textarea></div><button id="addComment" class="btn primary" type="button">Добавить комментарий</button><div class="list" style="margin-top:14px">${items.map((comment) => `<div class="list-item"><div><span class="pill blue">${esc(comment.visibility || 'team')}</span> <span class="small">${dateText(comment.created_at)}</span></div><p>${esc(comment.body || '')}</p><span class="small">${esc(comment.author_name || comment.author_email || 'автор не указан')}</span></div>`).join('') || '<div class="empty">Комментариев пока нет.</div>'}</div>`;
}
function renderEvents(items) {
  if (!items.length) return '<div class="empty">Истории пока нет.</div>';
  return `<div class="list">${items.map((event) => `<div class="list-item"><b>${esc(event.title || event.event_type || 'Событие')}</b><p class="muted">${esc(event.description || '')}</p><span class="small">${dateText(event.created_at)} ${event.actor_email ? ' · ' + esc(event.actor_email) : ''}</span></div>`).join('')}</div>`;
}
function overview(data) {
  const deal = data.deal;
  return `<div class="side-by-side">
    <div class="card" style="box-shadow:none">
      <h3>Суть сделки</h3>
      <div class="list">
        <div class="list-item"><b>Адрес</b>${esc(headlineAddress(data))}</div>
        <div class="list-item"><b>Объект</b>${esc(deal.object_type || 'не указан')}</div>
        <div class="list-item"><b>Цена</b>${money(deal.price_total)}</div>
        <div class="list-item"><b>Статус</b>${statusText(deal.status)}</div>
        <div class="list-item"><b>Участники</b>${esc((participantSurnames(data).join(' / ')) || 'продавец / покупатель')}</div>
      </div>
    </div>
    ${statusSelector(deal)}
  </div>`;
}
function tabContent(data) {
  if (activeTab === 'docs') return `<h2>Документы</h2>${renderDocs(list(data,'documents'))}`;
  if (activeTab === 'risks') return `<h2>${isLawyer() ? 'Юридические риски' : 'Риски'}</h2>${renderRisks(list(data,'risks'))}`;
  if (activeTab === 'expenses') return `<h2>Расходы и расчеты</h2>${renderExpenses(list(data,'expenses'))}`;
  if (activeTab === 'tasks') return `<h2>Задачи</h2>${renderTasks(list(data,'tasks'))}`;
  if (activeTab === 'comments') return `<h2>${isLawyer() ? 'Юридические комментарии' : 'Комментарии'}</h2>${renderComments(list(data,'comments'))}`;
  if (activeTab === 'history') return `<h2>История</h2>${renderEvents(list(data,'events'))}`;
  return `<h2>Сводка</h2>${overview(data)}`;
}
function renderTabs(data) {
  const tabs = [
    ['overview','Сводка'],
    ['risks', isLawyer() ? 'Юр. риски' : 'Риски'],
    ['docs','Документы'],
    ['tasks','Задачи'],
    ['expenses','Расходы'],
    ['comments','Комментарии'],
    ['history','История']
  ];
  return `<section class="card"><div class="tabs">${tabs.map(([id,title]) => `<button class="tab ${activeTab === id ? 'active' : ''}" data-tab="${id}" type="button">${title}</button>`).join('')}</div><div class="tab-content">${tabContent(data)}</div></section>`;
}
function renderCard(data, options = {}) {
  currentData = data;
  const deal = data.deal;
  const docs = list(data, 'documents');
  const tasks = list(data, 'tasks');
  const risks = list(data, 'risks');
  document.getElementById('app').innerHTML = `<main class="nav-v2-shell">
    <section class="hero"><h1>${demoBadge(deal)}${esc(dealHeadline(data))}</h1><p>${esc(deal.next_action || (isLawyer() ? 'Проверить юридические риски, документы и условия сделки.' : 'Проверить карточку и определить следующий шаг.'))}</p></section>
    ${dealModePanel(deal)}
    ${isLawyer() ? legalPanel(data) : ''}
    <div class="kpi-row">
      ${metric('К задатку', (deal.readiness_deposit || 0) + '%', deal.readiness_deposit >= 80 ? 'green' : 'yellow')}
      ${metric('К сделке', (deal.readiness_deal || 0) + '%', deal.readiness_deal >= 80 ? 'green' : 'yellow')}
      ${metric('Документы', countMissingDocs(docs), countMissingDocs(docs) ? 'yellow' : 'green')}
      ${metric('Задачи', countOpenTasks(tasks), countOpenTasks(tasks) ? 'yellow' : 'green')}
    </div>
    <div class="kpi-row">
      ${metric('Статус', statusText(deal.status))}
      ${metric('Риск', riskPill(deal.risk_level))}
      ${metric('Красные риски', countRedRisks(risks), countRedRisks(risks) ? 'red' : 'green')}
      ${metric('Цена', money(deal.price_total))}
    </div>
    ${quickActions(deal)}
    ${renderTabs(data)}
  </main>`;
  bindActions();
  restoreScroll(options.restoreScrollY);
}
async function reloadAfterMutation(message = 'Обновляю карточку...', options = {}) {
  if (reloadRequest) return reloadRequest;
  const y = Number.isFinite(options.restoreScrollY) ? options.restoreScrollY : window.scrollY;
  setPageStatus(message);
  cardRequest = null;
  reloadRequest = load(true, { silent: true, restoreScrollY: y }).finally(() => { reloadRequest = null; });
  return reloadRequest;
}
async function runLegalAction(action) {
  const config = {
    checked: ['preparing_deal', 'Юрист: первичная юридическая проверка выполнена. Критичных замечаний по текущей информации нет. Можно продолжать подготовку сделки.'],
    need_documents: ['need_documents', 'Юрист: для продолжения проверки нужны дополнительные документы. СПН необходимо дозапросить пакет документов и обновить карточку сделки.'],
    stop_factor: ['need_lawyer', 'Юрист: выявлен юридический стоп-фактор. До устранения замечаний нельзя переводить сделку к задатку/основной сделке.'],
    return_spn: ['need_info', 'Юрист: карточка возвращена СПН на доработку. Нужно уточнить данные, документы или условия сделки.']
  }[action];
  if (!config) return;
  if (!confirmDemoAction('зафиксировать юридическое действие')) return;
  try {
    setPageStatus('Фиксирую юридическое действие...');
    await rpc('nav_v2_add_comment', { p_deal_id: dealId, p_body: config[1], p_visibility: 'team' });
    await rpc('nav_v2_update_deal_status', { p_deal_id: dealId, p_status: config[0] });
    await reloadAfterMutation();
  } catch (e) { setPageStatus('Ошибка юридического действия: ' + e.message, 'error'); }
}
function bindActions() {
  document.querySelectorAll('[data-tab]').forEach((btn) => btn.onclick = () => {
    activeTab = btn.dataset.tab;
    history.replaceState(null, '', `${location.pathname}${location.search}#${activeTab}`);
    if (currentData) renderCard(currentData, { restoreScrollY: window.scrollY });
  });
  document.querySelectorAll('[data-tab-shortcut]').forEach((btn) => btn.onclick = () => {
    activeTab = btn.dataset.tabShortcut;
    history.replaceState(null, '', `${location.pathname}${location.search}#${activeTab}`);
    if (currentData) renderCard(currentData, { restoreScrollY: window.scrollY });
  });
  document.querySelectorAll('[data-legal-action]').forEach((btn) => btn.onclick = () => runLegalAction(btn.dataset.legalAction));
  document.querySelectorAll('[data-quick-status]').forEach((btn) => btn.onclick = async () => {
    if (!confirmDemoAction('изменить статус сделки')) return;
    const y = window.scrollY;
    try { setPageStatus('Сохраняю быстрый статус...'); await rpc('nav_v2_update_deal_status', { p_deal_id: dealId, p_status: btn.dataset.quickStatus }); await reloadAfterMutation('Обновляю карточку...', { restoreScrollY: y }); }
    catch (e) { setPageStatus('Ошибка быстрого действия: ' + e.message, 'error'); }
  });
  const statusBtn = document.getElementById('saveStatus');
  if (statusBtn) statusBtn.onclick = async () => {
    if (!confirmDemoAction('изменить статус сделки')) return;
    const y = window.scrollY;
    try { setPageStatus('Сохраняю статус...'); await rpc('nav_v2_update_deal_status', { p_deal_id: dealId, p_status: document.getElementById('dealStatus').value }); await reloadAfterMutation('Обновляю карточку...', { restoreScrollY: y }); }
    catch (e) { setPageStatus('Ошибка: ' + e.message, 'error'); }
  };
  document.querySelectorAll('[data-doc-id]').forEach((btn) => btn.onclick = async () => {
    if (!confirmDemoAction('изменить статус документа')) return;
    const y = window.scrollY;
    try { setPageStatus('Обновляю документ...'); await rpc('nav_v2_update_document_status', { p_document_id: btn.dataset.docId, p_status: btn.dataset.docStatus }); await reloadAfterMutation('Документ обновлён. Обновляю карточку...', { restoreScrollY: y }); }
    catch (e) { setPageStatus('Ошибка документа: ' + e.message, 'error'); }
  });
  document.querySelectorAll('[data-task-id]').forEach((btn) => btn.onclick = async () => {
    if (!confirmDemoAction('изменить статус задачи')) return;
    const y = window.scrollY;
    try { setPageStatus('Обновляю задачу...'); await rpc('nav_v2_update_task_status', { p_task_id: btn.dataset.taskId, p_status: btn.dataset.taskStatus }); await reloadAfterMutation('Задача обновлена. Обновляю карточку...', { restoreScrollY: y }); }
    catch (e) { setPageStatus('Ошибка задачи: ' + e.message, 'error'); }
  });
  const add = document.getElementById('addComment');
  if (add) add.onclick = async () => {
    const body = document.getElementById('newComment').value.trim();
    if (!body) { setPageStatus('Комментарий пустой.', 'error'); return; }
    if (!confirmDemoAction('добавить комментарий')) return;
    const y = window.scrollY;
    try { setPageStatus('Добавляю комментарий...'); await rpc('nav_v2_add_comment', { p_deal_id: dealId, p_body: body, p_visibility: 'team' }); await reloadAfterMutation('Комментарий добавлен. Обновляю карточку...', { restoreScrollY: y }); }
    catch (e) { setPageStatus('Ошибка комментария: ' + e.message, 'error'); }
  };
}
async function load(force = false, options = {}) {
  if (!dealId) {
    document.getElementById('app').innerHTML = '<main class="nav-v2-shell"><div class="status error">Не указан id сделки.</div></main>';
    return;
  }
  if (!force && currentData) {
    renderCard(currentData, { restoreScrollY: options.restoreScrollY });
    return;
  }
  if (!options.silent) {
    document.getElementById('app').innerHTML = '<main class="nav-v2-shell"><div class="status">Загружаю карточку сделки...</div></main>';
  }
  try {
    if (force) cardRequest = null;
    if (!cardRequest) cardRequest = rpc('nav_v2_get_deal_card', { p_deal_id: dealId }, 25000);
    const cardData = await cardRequest;
    currentProfile = cardData.profile || currentProfile;
    saveCachedProfile(currentProfile);
    if (isLawyer() && !location.hash && activeTab === 'overview') activeTab = 'risks';
    renderCard(cardData, { restoreScrollY: options.restoreScrollY });
  } catch (error) {
    cardRequest = null;
    if (options.silent && currentData) {
      setPageStatus('Ошибка обновления: ' + error.message, 'error');
      restoreScroll(options.restoreScrollY);
      return;
    }
    document.getElementById('app').innerHTML = `<main class="nav-v2-shell"><div class="status error">Ошибка загрузки: ${esc(error.message)}</div><div class="actions" style="justify-content:flex-start"><button class="btn primary" onclick="location.reload()">Обновить страницу</button><a class="btn light" href="./deals-v2.html">К списку сделок</a></div></main>`;
  }
}
async function init() {
  setupTop('deals');
  if (!getCachedUser()) return renderAuthBox(document.getElementById('app'), async () => location.reload());
  await load();
}
init();
