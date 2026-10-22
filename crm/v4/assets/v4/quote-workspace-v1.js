import { v4State, subscribeState } from './state.js';
import { V4_CONFIG } from './config.js';
import { supabaseClient } from './supabase-client.js';
import { canPerformV4Action } from './action-permissions-v1.js';
import { QUOTE_STATUSES, QUOTE_WRITES, quoteEnvironment, quoteItems } from './quote-workspace-model-v1.js';
import { quoteCommand, invokeQuoteCommand } from './quote-workspace-transport-v1.js';

const s = { rows: [], more: false, page: 0, detail: null, templates: null, template: null, editor: null, pending: null, busy: false, notice: '', stale: false, assignees: [], selected: new Set() };
let generation = 0, readGeneration = 0;
const actorKey = () => JSON.stringify([v4State.user?.id, v4State.profile?.role, v4State.profile?.is_active, v4State.profileLoaded, v4State.crmReady]);
let identity = actorKey();
const manager = () => canPerformV4Action('calculations.write') && canPerformV4Action('needs.read');
const allowed = () => v4State.crmReady && (manager() || (v4State.profile?.role === 'contractor' && canPerformV4Action('production.write')));
const enabled = () => quoteEnvironment(V4_CONFIG.supabaseUrl) && allowed();
const esc = value => String(value ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const money = value => Number(value || 0).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' ₽';
const date = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('ru-RU') : '—';
const root = () => document.getElementById('quoteWorkspaceContent');
const current = () => s.detail?.quotes?.find(q => q.id === s.detail.task.current_quote_id);
const expired = q => q?.valid_until && Date.parse(q.valid_until) < Date.now();
const button = (action, label, disabled = false) => `<button type="button" data-quote-action="${action}" ${disabled || s.busy ? 'disabled' : ''}>${label}</button>`;
const input = (name, label, { type = 'text', max = 300, required = false, value = '' } = {}) => `<label>${label}<input name="${name}" type="${type}" maxlength="${max}" ${required ? 'required' : ''} value="${esc(s.editor?.values?.[name] ?? value)}"></label>`;
const textarea = (name, label, max = 5000, value = '') => `<label>${label}<textarea name="${name}" maxlength="${max}" rows="4" required>${esc(s.editor?.values?.[name] ?? value)}</textarea></label>`;

subscribeState(() => {
  const key = actorKey();
  if (key === identity) return;
  identity = key; generation++; readGeneration++;
  Object.assign(s, { rows: [], detail: null, templates: null, template: null, editor: null, pending: null, busy: false, notice: '', stale: false, assignees: [], selected: new Set() });
  document.getElementById('quoteWorkspaceSection')?.remove();
});

function remember(form = document.getElementById('quoteEditor')) {
  if (form && s.editor && !s.pending) s.editor.values = Object.fromEntries(new FormData(form));
}
function leave() {
  if (s.busy || s.pending) return false;
  if (s.editor && Object.keys(s.editor.values).length && !window.confirm('Закрыть форму без сохранения?')) return false;
  s.editor = null; s.stale = false; return true;
}
async function invoke(command) {
  return invokeQuoteCommand({ client: supabaseClient, supabaseUrl: V4_CONFIG.supabaseUrl, actorId: v4State.user?.id, command, allowed: allowed() });
}
async function read(operation, payload, apply) {
  if (!enabled() || s.busy) return;
  const token = generation, readToken = ++readGeneration;
  s.busy = true; s.notice = ''; render();
  const result = await invoke(quoteCommand(operation, payload));
  if (token !== generation || readToken !== readGeneration || !enabled()) return;
  s.busy = false;
  if (result.ok) apply(result); else s.notice = result.message;
  render();
}
async function list() {
  return read('list', { offset: s.page * 50 }, result => { s.rows = result.rows || []; s.more = result.has_more; s.detail = null; s.templates = null; s.template = null; });
}
async function detail(id, preserve = false) {
  return read('detail', { task_id: id }, result => { s.detail = result; s.selected = new Set(); s.templates = null; s.template = null; if (!preserve) s.editor = null; else { s.stale = true; s.notice = 'Актуальная карточка загружена, ваш ввод сохранён. Проверьте новое ТЗ и подтвердите продолжение.'; } });
}
function formHtml() {
  if (!s.editor) return '';
  const op = s.editor.operation, task = s.detail?.task;
  let fields = '';
  if (op === 'create') {
    fields = input('title','Название задания',{required:true}) + input('vendor_name','Подрядчик / организация',{required:true}) +
      `<label>Исполнитель в CRM<select name="assignee_id"><option value="">Ответ внесёт менеджер</option>${s.assignees.map(a=>`<option value="${esc(a.id)}" ${s.editor.values.assignee_id===a.id?'selected':''}>${esc(a.name)}</option>`).join('')}</select></label>` +
      `<label>Потребность<select name="need_id"><option value="">Общая задача заявки</option>${(v4State.leadNeeds || []).filter(n=>n.lead_id===v4State.route.leadId && !/архив/i.test(n.status)).map(n=>`<option value="${esc(n.id)}" ${s.editor.values.need_id===n.id?'selected':''}>${esc(n.title)}</option>`).join('')}</select></label>` +
      textarea('brief','Состав, размеры, материалы, объём и вопросы подрядчику',10000) + input('reference_url','Ссылка на исходники (https)',{type:'url',max:2000}) + input('deadline','Ответ нужен к',{type:'datetime-local'});
  } else if (op === 'respond') {
    fields = `<p>Ответ на ТЗ версии ${task.brief_version}. Укажите фактические объёмы и материалы. Изменение ТЗ менеджером потребует нового ответа.</p>` + s.editor.ids.map((id,i)=>`<article class="quote-line"><b>Позиция ${i+1}</b>${input('name_'+i,'Название',{required:true,max:500})}${input('unit_'+i,'Единица',{required:true,max:40,value:'шт'})}${input('qty_'+i,'Количество (до 3 знаков)',{required:true,value:'1'})}${input('cost_'+i,'Себестоимость за единицу, ₽',{required:true})}${input('specification_'+i,'Параметры для клиента',{max:2000})}${button('remove-'+i,'Удалить позицию',s.editor.ids.length===1)}</article>`).join('') + button('add-line','+ Позиция',s.editor.ids.length>=80) +
      input('note','Условия и внутренний комментарий',{max:5000}) + input('lead_time','Срок изготовления',{max:1000}) + input('valid_until','Цена действует до',{type:'datetime-local'}) + (manager()?input('source_note','Откуда получен ответ (звонок, письмо, дата)',{required:true,max:1000}):'');
  } else if (op === 'update') {
    fields = textarea('brief','Уточнённое ТЗ',10000,task.brief) + textarea('message','Что изменилось и почему') + '<p>Предыдущие версии ответа останутся в истории; принять и использовать их будет нельзя.</p>';
  } else if (op === 'template.save') {
    fields = input('name','Название заготовки',{required:true}) + input('category','Категория') + '<p>Сохраняются только выбранные позиции, подрядчик, дата и срок цены. Перед повторным использованием потребуется проверить актуальность.</p>';
  } else fields = textarea('message',({clarify:'Вопрос / ответ по уточнению',change:'Что нужно пересчитать',cancel:'Причина отмены'})[op] || 'Комментарий');
  return `<form id="quoteEditor"><h3>${({create:'Запросить расчёт',respond:'Ответ подрядчика',update:'Изменить ТЗ','template.save':'Сохранить позиции в библиотеку',clarify:'Уточнение',change:'Вернуть на пересчёт',cancel:'Отменить запрос'})[op]}</h3><fieldset ${s.pending || s.busy || s.stale ? 'disabled':''}>${fields}</fieldset><div class="quote-actions"><button type="submit" ${s.busy || s.stale?'disabled':''}>${s.pending?'Повторить тот же запрос':'Сохранить'}</button>${button('close-editor','Закрыть форму',Boolean(s.pending))}${s.stale?button('confirm-source','Я проверил актуальное ТЗ'):''}</div></form>`;
}
function itemsHtml(q, selectable) {
  return `<div class="quote-lines">${(q.items || []).map(i=>`<article class="quote-line">${selectable?`<label><input type="checkbox" data-quote-item="${esc(i.id)}" ${s.selected.has(i.id)?'checked':''} ${s.busy?'disabled':''}> Выбрать</label>`:''}<h4>${esc(i.name)}</h4><p>${esc(i.specification)}</p><p>${esc(i.qty)} ${esc(i.unit)} × ${money(i.unit_cost)} = <b>${money(i.qty*i.unit_cost)}</b></p></article>`).join('')}</div>`;
}
function detailHtml() {
  const t = s.detail.task, q = current(), active = !['accepted','cancelled'].includes(t.status);
  const safeLink = /^https:\/\/[^\s/@]+(?:\/[^\s]*)?$/.test(t.reference_url || '') ? `<a href="${esc(t.reference_url)}" target="_blank" rel="noopener noreferrer">Исходники</a>` : '';
  return `<h3>${esc(t.title)}</h3><p>${esc(QUOTE_STATUSES[t.status] || t.status)} · ${esc(t.vendor_name)} · Ответ к ${date(t.deadline)}</p><p class="quote-brief">${esc(t.brief)}</p>${safeLink}<p>Версия ТЗ ${t.brief_version}</p><div class="quote-actions">${active && ['new','changes','clarification'].includes(t.status)?button('respond','Внести ответ'):''}${active?button('clarify','Уточнить'):''}${manager() && active?button('update','Изменить ТЗ')+button('cancel','Отменить запрос'):''}${manager() && ['accepted','cancelled'].includes(t.status)?button('repeat','Новый запрос по этой задаче'):''}${manager() && t.status==='review'?button('accept','Принять расчёт',expired(q))+button('change','Вернуть на пересчёт'):''}${s.editor && !s.pending?button('reload-detail','Обновить карточку, сохранив ввод'):''}</div>${q?`<h4>Ответ версии ${q.version}</h4><p>${expired(q)?'Цена просрочена. Нужен новый ответ.':'Цена действует до '+date(q.valid_until)} · Изготовление: ${esc(q.lead_time || 'не указано')}</p>${itemsHtml(q,manager() && t.status==='accepted')}<p class="quote-brief">${esc(q.note)}</p>${manager() && t.status==='accepted'?`<div class="quote-actions">${button('transfer','Добавить выбранное в расчёт',expired(q))}${button('template.save','В библиотеку',expired(q))}</div><p>В черновик расчёта добавится себестоимость. Цена клиенту рассчитывается по текущим настройкам; заказ и КП не меняются.</p>`:''}`:''}<details><summary>История ответов и уточнений</summary>${(s.detail.events || []).map(e=>`<p>${date(e.created_at)} · ${esc(({create:'Создан запрос',respond:'Получен ответ',clarify:'Уточнение',change:'Пересчёт',update:'Изменено ТЗ',accept:'Принят расчёт',cancel:'Отмена','template.save':'Создана заготовка'})[e.kind] || e.kind)}<br>${esc(e.message)}</p>`).join('')}${(s.detail.quotes || []).filter(old=>old.id!==q?.id).map(old=>`<details><summary>Архивный ответ ${old.version}, ТЗ ${old.brief_version}</summary>${itemsHtml(old,false)}</details>`).join('')}</details>`;
}
function render() {
  const host = root(); if (!host || !enabled()) return;
  const t = s.template;
  host.innerHTML = `<div class="quote-actions">${button('list','Все запросы')}${manager()?button('create','+ Запросить расчёт',!v4State.route.leadId)+button('templates','Библиотека позиций'):''}</div>${manager() && !v4State.route.leadId?'<p>Для нового запроса сначала откройте заявку клиента.</p>':''}<p role="status" aria-live="polite">${esc(s.notice || (s.busy?'Загружаю…':''))}</p>${s.detail?detailHtml():t?`<h3>${esc(t.name)}</h3><p>${esc(t.vendor_name)} · Дата цены: ${date(t.cost_date)} · Действует до: ${date(t.valid_until)}</p>${itemsHtml(t,true)}<label><input type="checkbox" id="quoteTemplateConfirm"> Проверил состав, объёмы и актуальность себестоимости для текущей заявки</label>${button('transfer-template','Добавить выбранное в расчёт',!v4State.route.leadId)}`:s.templates?`<h3>Библиотека позиций</h3><p>Страница ${s.page+1}. Перед повторным использованием проверьте цены.</p>${s.templates.map(row=>button('template-'+row.id,esc(row.name)+' · '+esc(row.vendor_name))).join('') || '<p>Заготовок пока нет.</p>'}<div class="quote-actions">${button('templates-prev','Назад',s.page===0)}${button('templates-next','Далее',!s.more)}</div>`:`<div class="quote-lines">${s.rows.map(row=>`<article class="quote-line"><h3>${esc(row.title)}</h3><p>${esc(QUOTE_STATUSES[row.status] || row.status)} · ${esc(row.vendor_name)}</p><p>Ответ к ${date(row.deadline)}</p>${button('detail-'+row.id,'Открыть запрос')}</article>`).join('') || '<p>Запросов пока нет. Новый запрос связывается с текущей заявкой клиента.</p>'}</div><div class="quote-actions">${button('previous','Назад',s.page===0)}<span>Страница ${s.page+1}</span>${button('next','Далее',!s.more)}</div>`}${formHtml()}`;
}
async function save(command) {
  if (s.busy || !enabled()) return;
  const token = generation;
  s.pending ||= command; s.busy = true; s.notice = ''; render();
  const result = await invoke(s.pending);
  if (token !== generation || !enabled()) return;
  s.busy = false;
  if (!result.ok) {
    s.notice = result.message;
    if (!result.uncertain) s.pending = null;
    if (result.code === 'source_changed') s.stale = true;
    render(); return;
  }
  s.pending = null; s.editor = null; s.stale = false;
  await detail(result.task_id || s.detail?.task.id);
  if (token !== generation) return;
  s.notice = result.replay?'Сервер подтвердил прежнее сохранение. Дубликат не создан.':'Сохранено.'; render();
}
function selectedPayload() {
  if (!s.selected.size) throw Error('Выберите хотя бы одну позицию.');
  return { task_id: s.detail.task.id, quote_id: current().id, item_ids: [...s.selected] };
}
async function transfer(template = false) {
  if (!v4State.route.leadId || s.busy) return;
  if (!s.selected.size) { s.notice = 'Выберите позиции.'; render(); return; }
  if (template && !document.getElementById('quoteTemplateConfirm')?.checked) { s.notice = 'Подтвердите актуальность цены и состава.'; render(); return; }
  const token = generation, leadId = v4State.route.leadId, actorId = v4State.user?.id;
  s.busy = true; render();
  try {
    const result = await invoke(quoteCommand(template?'template.get':'selection', template?{template_id:s.template.id}:selectedPayload()));
    if (token !== generation || leadId !== v4State.route.leadId || !enabled()) return;
    if (!result.ok) throw Error(result.message);
    const selection = template?{...result.template,items:result.template.items.filter(i=>s.selected.has(i.id)),lead_id:leadId}:result;
    if (selection.lead_id !== leadId) throw Error('Откройте исходную заявку перед переносом позиций.');
    const calculator = await import('./calculations.js');
    if (token !== generation || leadId !== v4State.route.leadId || !enabled()) return;
    const added = calculator.appendQuoteSelection(selection, { template, actorId });
    s.notice = `В черновик добавлено позиций: ${added}. Откройте заявку, проверьте цену и сохраните расчёт.`;
    window.v4SetTab?.('card');
  } catch (e) { if (token === generation) s.notice = e.message; }
  finally { if (token === generation) { s.busy = false; render(); } }
}
async function action(name) {
  if (!enabled() || s.busy) return;
  if (s.pending) { s.notice = 'Сначала повторите сохранение: результат предыдущего запроса неизвестен.'; render(); return; }
  if (name==='confirm-source') { s.stale=false; s.notice='ТЗ проверено. Можно сохранить ответ.'; render(); return; }
  if (name==='reload-detail') return detail(s.detail.task.id,true);
  if (name==='close-editor') { if(leave()) render(); return; }
  if (name==='add-line') { remember(); s.editor.ids.push(crypto.randomUUID()); render(); return; }
  if (name.startsWith('remove-')) { remember(); const index=Number(name.slice(7)); if(s.editor.ids.length>1) { const fields=['name','unit','qty','cost','specification']; for(let j=index;j<s.editor.ids.length-1;j++) for(const field of fields) s.editor.values[field+'_'+j]=s.editor.values[field+'_'+(j+1)]; s.editor.ids.splice(index,1); render(); } return; }
  if (name==='transfer') return transfer();
  if (name==='transfer-template') return transfer(true);
  if (['accept','template.save'].includes(name)) { try{if(name==='template.save') selectedPayload();}catch(e){s.notice=e.message;render();return;} }
  if (name==='accept') { if(!window.confirm('Состав и объёмы проверены, принимаем этот ответ подрядчика?'))return;return save(quoteCommand('accept',{task_id:s.detail.task.id},{revision:s.detail.task.revision})); }
  if (name==='templates-prev' || name==='templates-next') { if(!leave())return; s.page+=name==='templates-next'?1:-1; return read('template.list',{offset:s.page*50},result=>{s.templates=result.rows || [];s.more=result.has_more;}); }
  if (name==='repeat') {
    if(!manager() || !s.detail || s.detail.task.lead_id!==v4State.route.leadId){s.notice='Сначала откройте исходную заявку.';render();return;}
    const task=s.detail.task;if(!leave())return;return read('assignees',{},result=>{s.assignees=result.rows || [];s.editor={operation:'create',values:{title:task.title,vendor_name:task.vendor_name,brief:task.brief,reference_url:task.reference_url || '',need_id:task.need_id || '',assignee_id:task.assignee_id || ''},taskId:crypto.randomUUID(),leadId:task.lead_id};});
  }
  if (QUOTE_WRITES.includes(name)) {
    if (!leave()) return;
    if (name==='create') {
      if(!manager() || !v4State.route.leadId)return;
      return read('assignees',{},result=>{s.assignees=result.rows || [];s.editor={operation:name,values:{},taskId:crypto.randomUUID(),leadId:v4State.route.leadId};});
    }
    const previous = name==='respond'?current():null;
    s.editor={operation:name,values:{},ids:previous?.items?.length?previous.items.map(()=>crypto.randomUUID()):[crypto.randomUUID()]};
    if(previous) previous.items.forEach((item,i)=>Object.assign(s.editor.values,{['name_'+i]:item.name,['unit_'+i]:item.unit,['qty_'+i]:item.qty,['cost_'+i]:item.unit_cost,['specification_'+i]:item.specification}));
    render(); return;
  }
  if (!leave()) return;
  if (name==='list') {s.page=0;return list();}
  if (name==='next'||name==='previous') {s.page+=name==='next'?1:-1;return list();}
  if (name.startsWith('detail-')) return detail(name.slice(7));
  if (name==='templates') {s.page=0;return read('template.list',{offset:0},result=>{s.detail=null;s.templates=result.rows || [];s.more=result.has_more;});}
  if (name.startsWith('template-')) return read('template.get',{template_id:name.slice(9)},result=>{s.detail=null;s.templates=null;s.template=result.template;s.selected=new Set();});
}
async function submit(form) {
  if (s.busy || s.stale || !s.editor) return;
  if (s.pending) return save(s.pending);
  remember(form);
  const e=s.editor,v=e.values,op=e.operation;
  try {
    let payload={task_id:s.detail?.task.id};
    const iso=value=>value?new Date(value).toISOString():null;
    if(op==='create') {
      if(e.leadId!==v4State.route.leadId)throw Error('Заявка изменилась. Откройте форму из нужной заявки.');
      payload={task_id:e.taskId,lead_id:e.leadId,need_id:v.need_id || null,assignee_id:v.assignee_id || null,title:v.title,vendor_name:v.vendor_name,brief:v.brief,reference_url:v.reference_url || null,deadline:iso(v.deadline)};
    } else if(op==='respond') payload={...payload,items:quoteItems(e.ids.map((id,i)=>({id,name:v['name_'+i],unit:v['unit_'+i],qty:v['qty_'+i],unit_cost:v['cost_'+i],specification:v['specification_'+i]}))),note:v.note || '',source_note:v.source_note || '',lead_time:v.lead_time || '',valid_until:iso(v.valid_until)};
    else if(op==='template.save') payload={...selectedPayload(),name:v.name,category:v.category || ''};
    else payload={...payload,message:v.message, ...(op==='update'?{brief:v.brief}:{})};
    await save(quoteCommand(op,payload,{revision:s.detail?.task.revision}));
  } catch(error) { s.notice=error.message; render(); }
}
export function mount() {
  if (!enabled() || document.getElementById('quoteWorkspaceSection')) return;
  const section=document.createElement('section');section.id='quoteWorkspaceSection';section.className='v4-card';section.dataset.v4ManagedSection='production';section.hidden=document.body.dataset.v4Tab!=='production';
  section.innerHTML='<h2>Запросы расчёта подрядчикам</h2><p>Тестовая среда. Ответ подрядчика проходит проверку менеджером перед переносом в расчёт.</p><div id="quoteWorkspaceContent"></div>';
  section.addEventListener('click',event=>{const node=event.target.closest('[data-quote-action]');if(node){event.preventDefault();action(node.dataset.quoteAction).catch(()=>{s.busy=false;s.notice='Не удалось выполнить действие.';render();});}});
  section.addEventListener('input',event=>{if(event.target.closest('#quoteEditor'))remember();});
  section.addEventListener('change',event=>{if(event.target.closest('#quoteEditor'))remember();if(event.target.dataset.quoteItem){if(event.target.checked)s.selected.add(event.target.dataset.quoteItem);else s.selected.delete(event.target.dataset.quoteItem);}});
  section.addEventListener('submit',event=>{if(event.target.id==='quoteEditor'){event.preventDefault();submit(event.target);}});
  if(!document.getElementById('quoteWorkspaceStyle')){const style=document.createElement('style');style.id='quoteWorkspaceStyle';style.textContent='.quote-actions{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.quote-lines{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr));gap:12px}.quote-line{min-width:0;padding:14px;border:1px solid #d1d5db;border-radius:12px;background:#fff;overflow-wrap:anywhere}.quote-brief{white-space:pre-wrap;overflow-wrap:anywhere}#quoteWorkspaceSection button{min-height:44px;white-space:normal}#quoteWorkspaceSection label{display:grid;gap:6px;margin:10px 0;min-width:0}#quoteWorkspaceSection input:not([type=checkbox]),#quoteWorkspaceSection textarea,#quoteWorkspaceSection select{box-sizing:border-box;width:100%;min-width:0;font:inherit;padding:10px}#quoteWorkspaceSection fieldset{border:0;padding:0;margin:0;min-width:0}#quoteWorkspaceSection p{overflow-wrap:anywhere}';document.head.appendChild(style);}
  document.getElementById('crmWorkspace')?.appendChild(section);render();
}
export async function load() {mount();if(enabled())await list();}
export async function refresh() {if(leave())await load();}

window.addEventListener('beforeunload',event=>{if(s.pending || (s.editor && Object.keys(s.editor.values).length)){event.preventDefault();event.returnValue='';}});
