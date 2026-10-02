import { supabaseClient } from './supabase-client.js';
import { V4_CONFIG } from './config.js';
import { v4State, subscribeState } from './state.js';
import { canPerformV4Action } from './action-permissions-v1.js';
import { openLeadRoute } from './router.js';
import { clientRegistryAvailable, clientError, prepareClientCommand, completeClientCommand, invokeClientCommand } from './client-registry-transport-v1.js';

const fieldLabels = { name:'Имя или название',phone:'Телефон',source:'Источник',address:'Адрес',comment:'Комментарий' };
const state = { search:'',offset:0,total:0,rows:[],loaded:false,sequence:0,detailSequence:0,selected:null,busy:false,uncertain:false,pending:null };
const esc = value => String(value ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const canRead = () => canPerformV4Action('clients.read');
const canWrite = () => canPerformV4Action('clients.write') && clientRegistryAvailable(V4_CONFIG.supabaseUrl);
const request = command => invokeClientCommand(supabaseClient,V4_CONFIG.supabaseUrl,command);
const date = value => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('ru-RU') : '—';
const byId = id => document.getElementById(id);

export function mount() {
  if (byId('clientRegistryV1') || !canRead()) return;
  const style=document.createElement('style');style.textContent=`
    #clientRegistryV1{min-width:0} .client-toolbar,.client-pager,.client-actions{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
    .client-toolbar{justify-content:space-between;margin-bottom:16px}.client-search{display:flex;gap:8px;flex:1;max-width:640px;align-items:end}
    .client-search label{flex:1;min-width:0}.client-search input{width:100%}.client-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(320px,1fr);gap:24px;align-items:start}
    .client-list{display:grid;gap:0}.client-row{display:block;text-align:left;background:var(--surface,#fff);color:var(--text,#172033);border:0;border-bottom:1px solid var(--border,#d7dce3);border-radius:0;padding:16px 12px;width:100%;min-height:64px;overflow-wrap:anywhere}
    .client-row:hover,.client-row[aria-current=true]{background:var(--surface-muted,#f0f3f7)}.client-row small{display:block;margin-top:5px;color:#475569}.client-row b{font-size:16px}.client-pager{margin-top:16px;justify-content:space-between}
    #clientDetail{min-width:0;overflow-wrap:anywhere}#clientDetail:focus{outline:2px solid var(--brand,#cf1820);outline-offset:5px}
    .client-fields{display:grid;grid-template-columns:1fr 1fr;gap:14px}.client-fields label{display:grid;gap:6px;min-width:0}.client-fields input,.client-fields textarea{width:100%;box-sizing:border-box;min-width:0}.client-wide{grid-column:1/-1}
    .client-actions{margin:16px 0}.client-links{padding-left:20px}.client-links li{margin:8px 0}.client-note{color:#475569;font-size:14px;line-height:1.55}.client-notice{margin:12px 0;white-space:pre-wrap}.client-notice[data-error=true]{color:#a31922}.client-data{display:grid;grid-template-columns:110px minmax(0,1fr);gap:10px;margin:16px 0}.client-data dd{margin:0;white-space:pre-wrap}.client-data dt{color:#475569}
    @media(max-width:800px){.client-grid{grid-template-columns:1fr}.client-fields{grid-template-columns:1fr}.client-search{flex-basis:100%}.client-toolbar{align-items:stretch}.client-data{grid-template-columns:1fr;gap:4px}.client-data dd{margin-bottom:10px}}
  `;document.head.append(style);
  const section=document.createElement('section');section.id='clientRegistryV1';section.className='v4-card';section.dataset.v4ManagedSection='clients';section.hidden=document.body.dataset.v4Tab!=='clients';
  section.innerHTML=`<div class="client-toolbar"><div><h2>Клиенты</h2><p class="client-note">Контакты, обращения и заказы в одной карточке.</p></div>${canWrite()?'<button type="button" class="v4-primary" data-client-new>Добавить клиента</button>':''}</div>
    <form class="client-search" id="clientSearchForm"><label for="clientSearch">Имя, название или телефон<input id="clientSearch" type="search" maxlength="200" autocomplete="off"></label><button type="submit">Найти</button></form>
    <p id="clientListNotice" role="status" aria-live="polite"></p><div class="client-grid"><div><div id="clientList" class="client-list"></div><div id="clientPager" class="client-pager"></div></div><section id="clientDetail" tabindex="-1" aria-label="Карточка клиента"><p class="client-note">Выберите клиента, чтобы увидеть контактные данные и историю работы.</p></section></div>`;
  byId('crmWorkspace').append(section);
  section.addEventListener('submit',event=>{
    if(event.target.id==='clientSearchForm'){event.preventDefault();state.search=byId('clientSearch').value.trim();state.offset=0;loadList();}
    if(event.target.id==='clientEditForm'){event.preventDefault();save(event.target);}
  });
  section.addEventListener('click',async event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.hasAttribute('data-client-new') && !state.busy && !state.uncertain){state.selected=null;edit();}
    if(button.dataset.clientOpen && !state.busy && !state.uncertain) await openClient(button.dataset.clientOpen);
    if(button.hasAttribute('data-client-edit')) edit(state.selected);
    if(button.hasAttribute('data-client-cancel') && !state.busy && !state.uncertain){state.selected?openClient(state.selected.id):byId('clientDetail').replaceChildren();}
    if(button.hasAttribute('data-client-reload')) await openClient(state.selected.id);
    if(button.hasAttribute('data-client-prev')){state.offset=Math.max(0,state.offset-50);await loadList();}
    if(button.hasAttribute('data-client-next')){state.offset+=50;await loadList();}
    if(button.hasAttribute('data-client-list-retry'))await loadList();
    if(button.dataset.clientLead)openLeadRoute(button.dataset.clientLead);
    if(button.dataset.clientOrder && !button.dataset.openOrder){await import('./order-card-v1.js?v=20261001-order-finance-1');button.dataset.openOrder=button.dataset.clientOrder;button.click();delete button.dataset.openOrder;}
  });
  section.addEventListener('keydown',event=>{if(event.key==='Escape' && byId('clientEditForm') && !state.busy && !state.uncertain){event.preventDefault();byId('clientDetail').querySelector('[data-client-cancel]')?.click();}});
  const unsubscribe=subscribeState(()=>{if(!canRead()){state.sequence++;state.detailSequence++;state.rows=[];state.selected=null;state.pending=null;state.busy=false;state.uncertain=false;section.remove();style.remove();state.loaded=false;unsubscribe();}});
}
async function loadList() {
  if(!canRead())return;const sequence=++state.sequence;
  byId('clientListNotice').textContent='Загружаю клиентов…';byId('clientList').setAttribute('aria-busy','true');
  const result=await request({action:'client.list',payload:{search:state.search,offset:state.offset}});
  if(sequence!==state.sequence || !canRead() || !byId('clientList'))return;
  byId('clientList').removeAttribute('aria-busy');
  if(!result.ok){byId('clientListNotice').textContent=clientError(result.code);byId('clientList').innerHTML='<button type="button" data-client-list-retry>Повторить загрузку</button>';byId('clientPager').innerHTML='';return;}
  state.rows=result.clients;state.total=result.total;state.loaded=true;
  byId('clientListNotice').textContent=`Найдено клиентов: ${result.total}`;
  byId('clientList').innerHTML=result.clients.length?result.clients.map(c=>`<button type="button" class="client-row" data-client-open="${esc(c.id)}" aria-current="${state.selected?.id===c.id}"><b>${esc(c.name || 'Без имени')}</b><small>${esc(c.phone || 'Телефон не указан')}${c.source?` · ${esc(c.source)}`:''}</small></button>`).join(''):`<p class="client-note">${state.search?'Совпадений нет. Попробуйте часть имени или последние цифры телефона.':'Клиентов пока нет. Добавьте первый контакт.'}</p>`;
  byId('clientPager').innerHTML=result.total>50?`<button type="button" data-client-prev ${state.offset===0?'disabled':''}>Назад</button><span>${state.offset+1}–${Math.min(state.offset+50,result.total)} из ${result.total}</span><button type="button" data-client-next ${state.offset+50>=result.total?'disabled':''}>Далее</button>`:'';
}
export async function openClient(id) {
  if(!canRead() || state.busy || state.uncertain)return;
  const sequence=++state.detailSequence;const host=byId('clientDetail');host.innerHTML='<p role="status">Загружаю карточку…</p>';
  const result=await request({action:'client.get',payload:{client_id:id}});
  if(sequence!==state.detailSequence || !canRead() || !host.isConnected)return;
  if(!result.ok){host.innerHTML=`<p role="alert">${esc(clientError(result.code))}</p><button type="button" data-client-open="${esc(id)}">Повторить</button>`;return;}
  state.selected=result.client;
  const c=result.client,links=result.links||{},history=result.history||[];
  host.innerHTML=`<h3>${esc(c.name || 'Без имени')}</h3><dl class="client-data">${Object.entries(fieldLabels).filter(([k])=>k!=='name').map(([k,v])=>`<dt>${v}</dt><dd>${k==='phone'&&c[k]?`<a href="tel:${esc(String(c[k]).replace(/[^+0-9]/g,''))}">${esc(c[k])}</a>`:esc(c[k]||'Не указано')}</dd>`).join('')}</dl>
    ${canWrite()?'<button type="button" data-client-edit>Редактировать данные</button>':''}<p class="client-note">Изменено: ${date(c.updated_at)}</p>
    <h4>Заявки · ${Number(links.lead_count||0)}</h4>${linkList(links.leads,'lead')}<h4>Заказы · ${Number(links.order_count||0)}</h4>${linkList(links.orders,'order')}
    <details><summary>История изменений · ${history.length}</summary>${history.length?`<ul class="client-links">${history.map(e=>`<li>${date(e.created_at)} · ${e.action==='client.create'?'Создан клиент':'Изменены данные'}<br><small>${esc((e.data?.fields||[]).map(k=>fieldLabels[k]||k).join(', '))} · сотрудник ${esc(String(e.user_id||'').slice(0,8))}</small></li>`).join('')}</ul>`:'<p class="client-note">Новые изменения будут показаны здесь. Для старых записей история могла не сохраняться.</p>'}</details>`;
  byId('clientList').querySelectorAll('[data-client-open]').forEach(b=>b.setAttribute('aria-current',String(b.dataset.clientOpen===id)));
  host.focus({preventScroll:true});if(innerWidth<=800)host.scrollIntoView({block:'start'});
}
function linkList(rows=[],kind) {return rows.length?`<ul class="client-links">${rows.map(r=>`<li><button type="button" data-client-${kind}="${esc(r.id)}">${esc(r.title||'Без названия')}</button><br><small>${esc(r.status||'')} · ${date(r.created_at)}</small></li>`).join('')}</ul>${rows.length===20?'<p class="client-note">Показаны последние 20 записей.</p>':''}`:'<p class="client-note">Связанных записей пока нет.</p>';}
function edit(client={}) {
  if(!canWrite() || state.busy || state.uncertain)return;state.detailSequence++;state.pending=null;
  const c=client||{},host=byId('clientDetail');
  host.innerHTML=`<h3>${c.id?'Редактировать клиента':'Новый клиент'}</h3><form id="clientEditForm"><div class="client-fields">
    ${Object.entries(fieldLabels).map(([k,v])=>`<label class="${['name','address','comment'].includes(k)?'client-wide':''}" for="clientField-${k}">${v}${k==='name'?' *':''}${k==='comment'?`<textarea id="clientField-${k}" name="${k}" maxlength="2000" rows="3">${esc(c[k])}</textarea>`:`<input id="clientField-${k}" name="${k}" value="${esc(c[k])}" type="${k==='phone'?'tel':'text'}" maxlength="${({name:200,phone:80,source:120,address:500})[k]}" ${k==='name'?'required':''} autocomplete="${({name:'name',phone:'tel',address:'street-address'})[k]||'off'}">`}</label>`).join('')}</div>
    <p class="client-note">* Обязательное поле. Телефон помогает находить повторные обращения. Сохранённые заказы и документы сохранят свои исходные данные.</p>
    <div id="clientSaveNotice" class="client-notice" role="status" aria-live="polite"></div><div class="client-actions"><button class="v4-primary" type="submit">Сохранить клиента</button><button type="button" data-client-cancel>Отмена</button></div></form>`;
  byId('clientField-name').focus();if(innerWidth<=800)host.scrollIntoView({block:'start'});
}
async function save(form) {
  if(!canWrite() || state.busy)return;
  const payload=Object.fromEntries(Object.keys(fieldLabels).map(k=>[k,form.elements[k].value.trim()]));
  const selected=state.selected;if(selected?.id)payload.client_id=selected.id;
  if(!payload.name){form.elements.name.focus();return;}
  state.busy=true;const notice=byId('clientSaveNotice');notice.textContent='Сохраняю…';notice.dataset.error='false';
  form.querySelectorAll('input,textarea,button').forEach(n=>n.disabled=true);
  let result;
  try {
    if(!state.pending)state.pending=await prepareClientCommand(v4State.user.id,selected?.id?'client.update':'client.create',payload,selected?.updated_at);
    result=await request(state.pending.command);
  } catch(error){result={ok:false,code:error.message,uncertain:false};}
  state.busy=false;state.uncertain=result.uncertain===true;
  if(!result.ok){
    notice.textContent=clientError(result.code);notice.dataset.error='true';
    if(!state.uncertain){if(state.pending)completeClientCommand(state.pending.key);state.pending=null;}
    form.querySelectorAll('input,textarea,button').forEach(n=>n.disabled=state.uncertain && n.type!=='submit');
    if(result.existing_client_id)notice.insertAdjacentHTML('beforeend',` <button type="button" data-client-open="${esc(result.existing_client_id)}">Открыть существующего клиента</button>`);
    if(result.code==='source_changed')notice.insertAdjacentHTML('beforeend',' <button type="button" data-client-reload>Загрузить актуальную карточку</button>');
    return;
  }
  completeClientCommand(state.pending.key);state.pending=null;state.uncertain=false;
  document.dispatchEvent(new CustomEvent('leader-v4:clients-changed',{detail:{id:result.client.id}}));
  await loadList();await openClient(result.client.id);
  byId('clientDetail').insertAdjacentHTML('afterbegin','<p role="status">Данные клиента сохранены.</p>');
}
export async function load(){mount();if(!canRead())return;if(!state.loaded)await loadList();}
export async function refresh(){mount();if(canRead())await loadList();}
