import { rpc, esc } from './supabase-v2.js';

const dealId = new URLSearchParams(location.search).get('id');

function setInlineStatus(target, text, type = 'ok') {
  const box = target.closest('.list-item') || target.closest('.card') || target.parentElement;
  if (!box) return;
  let status = box.querySelector('.local-action-status');
  if (!status) {
    status = document.createElement('div');
    status.className = 'local-action-status status';
    status.style.marginTop = '8px';
    box.appendChild(status);
  }
  status.className = `local-action-status status ${type}`;
  status.textContent = text;
}

function docStatusTitle(status) {
  return ({ needed: 'Нужен', received: 'Получен', checked: 'Проверен' })[status] || status || 'needed';
}

function docStatusClass(status) {
  return status === 'received' || status === 'checked' ? 'green' : 'yellow';
}

function updateDocDom(button, status) {
  const item = button.closest('.list-item');
  const pill = item?.querySelector('.doc-status .pill');
  if (pill) {
    pill.className = `pill ${docStatusClass(status)}`;
    pill.textContent = docStatusTitle(status);
  }
}

function updateTaskDom(button, status) {
  const item = button.closest('.list-item');
  const pills = item?.querySelectorAll('.pill');
  if (pills?.[1]) pills[1].textContent = status;
}

function setBusy(button, isBusy, text = '') {
  if (!button) return;
  if (isBusy) {
    button.dataset.oldText = button.textContent;
    button.disabled = true;
    button.textContent = text || 'Сохраняю...';
  } else {
    button.disabled = false;
    if (button.dataset.oldText) button.textContent = button.dataset.oldText;
  }
}

async function handleDocumentStatus(event, button) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  const documentId = button.dataset.docId;
  const status = button.dataset.docStatus;
  if (!documentId || !status) return;

  try {
    setBusy(button, true);
    setInlineStatus(button, 'Сохраняю статус документа...', '');
    await rpc('nav_v2_update_document_status', { p_document_id: documentId, p_status: status }, 15000);
    updateDocDom(button, status);
    setInlineStatus(button, `Документ: ${docStatusTitle(status)}. Позиция на странице сохранена.`, 'ok');
  } catch (error) {
    setInlineStatus(button, 'Ошибка документа: ' + error.message, 'error');
  } finally {
    setBusy(button, false);
  }
}

async function handleTaskStatus(event, button) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  const taskId = button.dataset.taskId;
  const status = button.dataset.taskStatus;
  if (!taskId || !status) return;

  try {
    setBusy(button, true);
    setInlineStatus(button, 'Сохраняю статус задачи...', '');
    await rpc('nav_v2_update_task_status', { p_task_id: taskId, p_status: status }, 15000);
    updateTaskDom(button, status);
    setInlineStatus(button, 'Задача обновлена. Позиция на странице сохранена.', 'ok');
  } catch (error) {
    setInlineStatus(button, 'Ошибка задачи: ' + error.message, 'error');
  } finally {
    setBusy(button, false);
  }
}

async function handleAddComment(event, button) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  const textarea = document.getElementById('newComment');
  const body = textarea?.value?.trim() || '';
  if (!body) {
    setInlineStatus(button, 'Комментарий пустой.', 'error');
    return;
  }

  try {
    setBusy(button, true, 'Добавляю...');
    setInlineStatus(button, 'Добавляю комментарий...', '');
    await rpc('nav_v2_add_comment', { p_deal_id: dealId, p_body: body, p_visibility: 'team' }, 15000);
    const list = button.parentElement?.querySelector('.list');
    if (list) {
      list.insertAdjacentHTML('afterbegin', `<div class="list-item"><div><span class="pill blue">team</span> <span class="small">только что</span></div><p>${esc(body)}</p><span class="small">текущий пользователь</span></div>`);
    }
    textarea.value = '';
    setInlineStatus(button, 'Комментарий добавлен. Позиция на странице сохранена.', 'ok');
  } catch (error) {
    setInlineStatus(button, 'Ошибка комментария: ' + error.message, 'error');
  } finally {
    setBusy(button, false);
  }
}

document.addEventListener('click', (event) => {
  const docButton = event.target.closest('[data-doc-id][data-doc-status]');
  if (docButton) return handleDocumentStatus(event, docButton);

  const taskButton = event.target.closest('[data-task-id][data-task-status]');
  if (taskButton) return handleTaskStatus(event, taskButton);

  const addCommentButton = event.target.closest('#addComment');
  if (addCommentButton) return handleAddComment(event, addCommentButton);
}, true);
