import { v4State } from './state.js';
import { canPerformV4Action } from './action-permissions-v1.js';
import { normalizeCompanyLegalSettingsDraft } from './company-legal-settings-draft-v1.js';

const PREFIX = 'leader-document-draft-v1:';
const MAX_AGE = 3 * 24 * 60 * 60 * 1000;
let previews=[];
export function registerDocumentPreview(popup) {previews.push({actor:v4State.user?.id,popup});}
const companyKey=actor=>`leader-company-document-draft-v1:${actor}`;
export function readCompanyDocumentDraft() {
  if(!v4State.user?.id||!canPerformV4Action('settings.manage'))return null;
  try {const row=JSON.parse(sessionStorage.getItem(companyKey(v4State.user.id))||'null');return row?.schema===1&&row.actor===v4State.user.id&&row.savedAt<=Date.now()&&Date.now()-row.savedAt<MAX_AGE&&row.value?normalizeCompanyLegalSettingsDraft(row.value):null;}catch(_){return null;}
}
export function saveCompanyDocumentDraft(value) {
  if(!v4State.user?.id||!canPerformV4Action('settings.manage'))return false;
  try {sessionStorage.setItem(companyKey(v4State.user.id),JSON.stringify({schema:1,actor:v4State.user.id,savedAt:Date.now(),value:normalizeCompanyLegalSettingsDraft(value)}));return true;}catch(_){return false;}
}
export const documentActorContext = () => JSON.stringify([v4State.user?.id || '', v4State.profile?.role || '', v4State.profile?.is_active, canPerformV4Action('documents.generate'), canPerformV4Action('orders.read')]);
export const canPrepareDocument = () => Boolean(v4State.user?.id) && canPerformV4Action('documents.generate') && canPerformV4Action('orders.read');

function decimal(value) {
  const raw = String(value ?? '').trim().replace(/\s/g, '').replace(',', '.');
  return /^\d+(?:\.\d{1,6})?$/.test(raw) && Number.isFinite(Number(raw)) ? Number(raw) : null;
}

export function updateDocumentLine(target, kind) {
  const row = target?.closest?.(`[data-${kind}-item-row]`);
  if (!row) return;
  const qty = row.querySelector(`[data-${kind}-item-qty]`), price = row.querySelector(`[data-${kind}-item-price]`), sum = row.querySelector(`[data-${kind}-item-sum]`);
  const q = decimal(qty.value), p = decimal(price.value), s = decimal(sum.value);
  if ((target === qty || target === price) && q > 0 && p !== null) sum.value = String(Math.round((q * p + Number.EPSILON) * 100) / 100);
  if (target === sum && q > 0 && s !== null) price.value = String(Math.round(s / q * 1000000) / 1000000);
}

export function validateDocumentLines(form, kind, report = true) {
  const rows = [...form.querySelectorAll(`[data-${kind}-item-row]`)];
  let invalid = null;
  for (const row of rows) {
    for (const field of ['name', 'unit', 'qty', 'price', 'sum']) {
      const input = row.querySelector(`[data-${kind}-item-${field}]`);
      const value = decimal(input.value);
      const maximum={qty:1000000,price:1000000000,sum:1000000000000}[field];
      const valid = ['name','unit'].includes(field) ? Boolean(input.value.trim()) && (input.maxLength<0||input.value.length<=input.maxLength) : value !== null && value<=maximum && (field !== 'qty' || value > 0);
      input.setCustomValidity(valid ? '' : field === 'qty' ? 'Укажите количество от 0 до 1 000 000, исключая ноль.' : ['name','unit'].includes(field) ? 'Заполните это поле.' : `Укажите неотрицательное число до ${maximum}, до 6 знаков после запятой.`);
      if (!valid && !invalid) invalid = input;
    }
  }
  if (report && invalid) { invalid.focus(); invalid.reportValidity(); }
  return rows.length > 0 && !invalid;
}

export function validateDocumentText(form) {
  let valid=true;
  for(const input of form.querySelectorAll('input[maxlength],textarea[maxlength]')) {
    if(!input.id)continue;
    const long=input.value.length>input.maxLength;
    input.setCustomValidity(long?`Сократите текст до ${input.maxLength} символов. Введённое значение сохранено в форме.`:'');
    if(long)valid=false;
  }
  if(!valid)form.reportValidity();
  return valid;
}

// Drafts belong to the actor and tab. They are neither registered documents nor
// company settings. Other projects' storage keys are never touched.
export function mountDocumentDraft({ form, kind, order, itemRow, onRestore, onReset, onClose }) {
  const actor = v4State.user?.id, context = documentActorContext();
  const key = `${PREFIX}${actor}:${kind}:${order.id}`;
  const fieldPrefix = kind === 'act' ? 'actDraft' : 'contractDraft';
  let storage, disposed = false, dirty = false, revision=order.updated_at || '';
  try { storage = sessionStorage; } catch (_) {}
  const valid = () => !disposed && form.isConnected && canPrepareDocument() && context === documentActorContext();
  const notice = document.createElement('p'); notice.setAttribute('role','status'); notice.setAttribute('aria-live','polite'); notice.className='document-draft-notice';
  notice.textContent='Правки черновика хранятся в этой вкладке до 3 суток после последнего сохранения. Документ ещё не зарегистрирован в CRM.';
  const bar = document.createElement('div');bar.className='document-draft-controls';
  const reset = document.createElement('button');reset.type='button';reset.textContent='Начать заново из заказа';reset.dataset.documentDraftReset='1';
  bar.append(notice,reset);form.prepend(bar);
  const fields = () => [...form.querySelectorAll('input[id],textarea[id],select[id]')].filter(e => e.id.startsWith(fieldPrefix));
  const capture = () => ({ schema:1, actor, kind, orderId:order.id, revision, savedAt:Date.now(), fields:Object.fromEntries(fields().map(e=>[e.id,e.value])), rows:[...form.querySelectorAll(`[data-${kind}-item-row]`)].map(row=>Object.fromEntries(['name','qty','unit','price','sum'].map(name=>[name,row.querySelector(`[data-${kind}-item-${name}]`)?.value || '']))) });
  function save() {
    if (!valid()) return false;
    try {
      const draft = capture();
      if (!storage || draft.rows.length > 160 || Object.values(draft.fields).some(v=>v.length>16000) || draft.rows.some(row=>Object.values(row).some(v=>v.length>16000))) throw new Error('draft_unavailable');
      storage.setItem(key, JSON.stringify(draft)); dirty=false;
      notice.textContent=(revision!==(order.updated_at||'')?'Заказ с тех пор изменился: проверьте стороны, состав и суммы или начните заново. ':'')+'Черновик сохранён в этой вкладке на срок до 3 суток. Документ ещё не зарегистрирован в CRM.';
      return true;
    } catch (_) { dirty=true; notice.textContent='Черновик не удалось сохранить в этой вкладке. Скопируйте важные правки перед закрытием.'; return false; }
  }
  try {
    const raw = storage?.getItem(key);
    const draft = raw && raw.length < 2000000 ? JSON.parse(raw) : null;
    if (draft && draft.schema === 1 && draft.actor === actor && draft.kind === kind && draft.orderId === order.id && draft.savedAt <= Date.now() && Date.now()-draft.savedAt < MAX_AGE && Array.isArray(draft.rows) && draft.rows.length <= 160 && draft.fields && typeof draft.fields === 'object') {
      revision=typeof draft.revision==='string'?draft.revision:'';
      for (const e of fields()) if (typeof draft.fields[e.id] === 'string' && draft.fields[e.id].length <= 16000) e.value=draft.fields[e.id];
      const tbody = form.querySelector(`#${fieldPrefix}Items`);tbody.innerHTML='';
      for (const row of draft.rows) {
        tbody.insertAdjacentHTML('beforeend',itemRow({}));
        const node=tbody.lastElementChild;
        for (const name of ['name','qty','unit','price','sum']) if (typeof row[name] === 'string' && row[name].length <= 16000) node.querySelector(`[data-${kind}-item-${name}]`).value=row[name];
      }
      form.dataset.companySettingsApplied='1';
      notice.textContent=draft.revision !== (order.updated_at || '') ? 'Восстановлен черновик. Заказ с тех пор изменился: проверьте стороны, состав и суммы или начните заново.' : 'Восстановлен черновик из этой вкладки, срок хранения — до 3 суток после сохранения. Проверьте данные перед печатью.';
      onRestore?.();
    } else if (raw) storage?.removeItem(key);
  } catch (_) { notice.textContent='Сохранённый черновик недоступен. Новые правки будут сохранены при возможности.'; }
  const input = event => {event.target?.setCustomValidity?.('');dirty=true; queueMicrotask(save);};
  const change = () => { dirty=true; queueMicrotask(save); };
  const resetDraft = () => {
    if (!valid() || !window.confirm('Начать новый черновик из актуального заказа? Правки этого черновика будут удалены.')) return;
    try { storage?.removeItem(key); } catch (_) {}
    disposed=true;detach();onReset?.();
  };
  const dialog = form.closest('[role=dialog]');
  const keyboard = event => {
    if (!valid() || document.querySelector('.v4-company-settings-modal')) return;
    const dialogs=[...document.querySelectorAll('[role=dialog]')];
    if (dialogs.at(-1) !== dialog) return;
    if (event.key === 'Escape') { event.preventDefault();event.stopImmediatePropagation();onClose?.();return; }
    if (event.key !== 'Tab') return;
    const focusable=[...dialog.querySelectorAll('button,input,select,textarea,a[href]')].filter(e=>!e.disabled&&e.getClientRects().length);
    if (!focusable.length) return;
    const first=focusable[0],last=focusable.at(-1);
    if (event.shiftKey && document.activeElement===first) {event.preventDefault();last.focus();}
    else if (!event.shiftKey && document.activeElement===last) {event.preventDefault();first.focus();}
  };
  const beforeLeave=event=>{if(valid()&&dirty&&!save()){event.preventDefault();event.returnValue='';}};
  window.addEventListener('beforeunload',beforeLeave);
  form.addEventListener('input',input);form.addEventListener('change',change);reset.addEventListener('click',resetDraft);document.addEventListener('keydown',keyboard,true);
  function detach() {window.removeEventListener('beforeunload',beforeLeave);form.removeEventListener('input',input);form.removeEventListener('change',change);reset.removeEventListener('click',resetDraft);document.removeEventListener('keydown',keyboard,true);}
  form.querySelector('input,select,textarea')?.focus();
  return { save, close({purge=false}={}) {
    const wasDirty=dirty;
    if (!purge && !save() && wasDirty && !window.confirm('Черновик не удалось сохранить. Закрыть редактор и потерять несохранённые правки?')) return false;
    if (purge) {try{storage?.removeItem(key);}catch(_){} }
    disposed=true;detach();return true;
  } };
}

export function clearActorDocumentDrafts(actor) {
  if (!actor) return;
  try {for(const key of Object.keys(sessionStorage)) if(key.startsWith(`${PREFIX}${actor}:`)||key===companyKey(actor))sessionStorage.removeItem(key);}catch(_){}
  previews=previews.filter(entry=>{if(entry.actor!==actor)return true;try{entry.popup.close();}catch(_){}return false;});
}
