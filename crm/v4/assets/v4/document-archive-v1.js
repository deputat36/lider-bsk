import { v4State, subscribeState } from './state.js';
import { canPerformV4Action } from './action-permissions-v1.js';
import { registerDocumentPreview } from './document-draft-session-v1.js';
import { documentArchiveCommand, documentArchiveError, DOCUMENT_STATUS, invokeDocumentArchive } from './document-archive-transport-v1.js';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const context=()=>JSON.stringify([v4State.user?.id,v4State.profile?.role,v4State.profile?.is_active,v4State.crmReady]);
let identity=context(),drawer,activeOrder='',opener;
const pendingKey=order=>`leader-document-pending-v1:${v4State.user?.id}:${order}`;
function readPending(order){try{return (()=>{const saved=JSON.parse(sessionStorage.getItem(pendingKey(order))||'null');return saved&&Date.now()-saved.at<3*86400000?saved.command:null;})();}catch{return null;}}
function storePending(order,value){try{if(value)sessionStorage.setItem(pendingKey(order),JSON.stringify({at:Date.now(),command:value}));else sessionStorage.removeItem(pendingKey(order));return true;}catch{return false;}}

export function captureArchiveDraft(kind,raw){
 const draft=structuredClone(raw);delete draft.schemaVersion;
 if(kind==='act'){draft.taxMode=draft.tax;delete draft.tax;}
 return draft;
}
function closeDrawer(){drawer?.remove();drawer=null;if(opener?.isConnected)opener.focus();}
function message(node,text){if(node)node.textContent=text;}
function attachEditor({form,order,kind,getDraft}){
 if(!form||form.querySelector('[data-document-save]')||!canPerformV4Action('documents.create'))return;
 const panel=document.createElement('div');panel.className='document-draft-controls';
 panel.innerHTML='<div><p data-archive-editor-status role="status">Сохраните документ в архив, чтобы открыть его с другого устройства. При регистрации сервер присвоит номер.</p><button type="button" data-document-save>Сохранить черновик в архив</button> <button type="button" data-document-register>Зарегистрировать документ</button> <button type="button" data-document-list>Открыть архив заказа</button></div>';
 form.append(panel);
 const controls=[...panel.querySelectorAll('button')],note=panel.querySelector('[data-archive-editor-status]');
 let prepared=readPending(order.id),busy=false;
 const fieldState=new Map();
 function lock(locked){for(const field of form.querySelectorAll('input,select,textarea')){if(locked){if(!fieldState.has(field))fieldState.set(field,field.disabled);field.disabled=true;}else{field.disabled=fieldState.get(field)||false;}}if(!locked)fieldState.clear();}
 if(prepared){lock(true);message(note,'Осталась неподтверждённая операция. Повторите сохранение: будет использован прежний номер запроса.');}
 panel.addEventListener('click',async event=>{
  if(event.target.closest('[data-document-list]')){await openDocumentArchive(order.id);return;}
  const button=event.target.closest('[data-document-save],[data-document-register]');if(!button||busy)return;
  const actor=context();
  if(!prepared){
   if(!form.reportValidity())return;
   const register=button.hasAttribute('data-document-register');
   if(register&&!window.confirm('Зарегистрировать текущую версию и присвоить ей постоянный номер? Подписание отмечается отдельно.'))return;
   prepared=documentArchiveCommand('save',{kind,order_id:order.id,expected_order_updated_at:order.updated_at,draft:captureArchiveDraft(kind,getDraft()),register,
    ...(form.dataset.archiveGroup?{group_id:form.dataset.archiveGroup,expected_version:Number(form.dataset.archiveVersion)}:{})});
   if(!storePending(order.id,prepared)){prepared=null;message(note,'Не удалось сохранить попытку в этой вкладке. Освободите место в браузере и повторите.');return;}
  }
  busy=true;lock(true);controls.forEach(b=>b.disabled=true);message(note,'Сохраняю документ…');
  const result=await invokeDocumentArchive(prepared);
  if(actor!==context()||!form.isConnected)return;
  busy=false;controls.forEach(b=>b.disabled=false);
  if(result.ok){
   storePending(order.id,null);prepared=null;lock(false);form.dataset.archiveGroup=result.group_id;form.dataset.archiveVersion=result.version;
   message(note,`Сохранено в архиве: ${result.number||'черновик'}, версия ${result.version}. ${result.number?'Постоянный номер присвоен; подписание отмечается отдельно.':''}`);
   document.dispatchEvent(new CustomEvent('leader-v4:document-archived',{detail:{orderId:order.id}}));
  }else{
   message(note,documentArchiveError(result.code));
   if(!result.uncertain){storePending(order.id,null);prepared=null;lock(false);}
  }
 });
}

export async function openDocumentArchive(orderId){
 if(!orderId||!canPerformV4Action('documents.read'))return;
 closeDrawer();opener=document.activeElement;const actor=context();
 drawer=document.createElement('div');drawer.style.cssText='position:fixed;inset:0;background:#172033bb;z-index:820;display:grid;place-items:center;padding:12px';
 drawer.innerHTML='<section role="dialog" aria-modal="true" aria-label="Архив документов" style="box-sizing:border-box;width:min(900px,100%);max-height:94vh;overflow:auto;padding:20px;background:white;border-radius:16px"><div style="display:flex;justify-content:space-between;gap:12px"><h2>Архив документов заказа</h2><button type="button" data-archive-close>Закрыть</button></div><p data-archive-list-status role="status">Загружаю…</p><div data-archive-rows></div><button type="button" data-archive-more hidden>Показать ещё</button></section>';
 document.body.append(drawer);const current=drawer,rows=new Map();let offset=0,busy=false;
 const status=()=>current.querySelector('[data-archive-list-status]');
 async function load(){
  const result=await invokeDocumentArchive(documentArchiveCommand('list',{order_id:orderId,offset}));
  if(actor!==context()||drawer!==current)return;
  if(!result.ok){message(status(),documentArchiveError(result.code));return;}
  for(const row of result.rows||[])rows.set(row.id,row);offset=rows.size;
  message(status(),rows.size?'Сохраняются все версии. Изменения статуса фиксируют факт и не отправляют документ автоматически.':'Документов в архиве пока нет. Сохраните акт или договор из редактора.');
  current.querySelector('[data-archive-more]').hidden=!result.has_more;
  current.querySelector('[data-archive-rows]').innerHTML=[...rows.values()].map(row=>`<article data-archive-row="${esc(row.id)}" style="padding:14px;border:1px solid #cbd5e1;border-radius:12px;margin:10px 0;overflow-wrap:anywhere"><b>${esc(row.document_number||(row.document_type==='act'?'Акт':'Договор')+' — черновик')}</b><p>${esc(DOCUMENT_STATUS[row.status])} · версия ${row.version} · ${esc(row.document_date)} · ${Number(row.total).toLocaleString('ru-RU')} ₽</p><div style="display:flex;flex-wrap:wrap;gap:8px"><button type="button" data-archive-print>Открыть / печать</button>${!['signed','void'].includes(row.status)&&canPerformV4Action('documents.update')?'<button type="button" data-archive-edit>Новая версия</button>':''}${row.status==='generated'&&canPerformV4Action('documents.send')?'<button type="button" data-archive-transition="sent">Отметить отправленным</button>':''}${['generated','sent'].includes(row.status)&&canPerformV4Action('documents.sign')?'<button type="button" data-archive-transition="signed">Отметить подписанным</button>':''}${!['signed','void'].includes(row.status)&&canPerformV4Action('documents.void')?'<button type="button" data-archive-transition="void">Аннулировать</button>':''}</div></article>`).join('');
  current.querySelectorAll('button').forEach(b=>{b.style.minHeight='44px';});
 }
 current.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeDrawer();}if(event.key==='Tab'){const list=[...current.querySelectorAll('button')].filter(b=>!b.hidden&&!b.disabled);if(event.shiftKey&&document.activeElement===list[0]){event.preventDefault();list.at(-1)?.focus();}else if(!event.shiftKey&&document.activeElement===list.at(-1)){event.preventDefault();list[0]?.focus();}}});
 current.addEventListener('click',async event=>{
  if(event.target.closest('[data-archive-close]')){closeDrawer();return;}
  if(busy)return;
  if(event.target.closest('[data-archive-more]')){busy=true;await load();busy=false;return;}
  const target=event.target.closest('button'),row=rows.get(target?.closest('[data-archive-row]')?.dataset.archiveRow);if(!row)return;
  if(target.hasAttribute('data-archive-transition')){
   const key=orderId+':transition:'+row.id;let command=readPending(key);
   if(!command){const comment=window.prompt('Укажите основание: кому и когда передан документ, где хранится подтверждение или почему он аннулирован.');if(!comment)return;command=documentArchiveCommand('transition',{id:row.id,expected_status:row.status,status:target.dataset.archiveTransition,comment});if(!storePending(key,command)){message(status(),'Не удалось сохранить попытку. Повторите после освобождения места в браузере.');return;}}
   busy=true;const result=await invokeDocumentArchive(command);busy=false;
   if(result.ok||!result.uncertain)storePending(key,null);
   if(actor!==context()||drawer!==current)return;
   if(!result.ok){message(status(),documentArchiveError(result.code));return;}
   rows.clear();offset=0;await load();return;
  }
  const popup=target.hasAttribute('data-archive-print')?window.open('','_blank'):null;
  if(popup){try{popup.opener=null;}catch{}registerDocumentPreview(popup);popup.document.body.textContent='Загружаю сохранённую версию…';}
  busy=true;const result=await invokeDocumentArchive(documentArchiveCommand('get',{id:row.id}));busy=false;
  if(actor!==context()||drawer!==current){popup?.close();return;}
  if(!result.ok){popup?.close();message(status(),documentArchiveError(result.code));return;}
  if(target.hasAttribute('data-archive-edit')){
   closeDrawer();document.dispatchEvent(new CustomEvent('leader-v4:restore-archived-document',{detail:result.document}));return;
  }
  if(!popup){message(status(),'Разрешите всплывающее окно для открытия документа.');return;}
  const doc=result.document,module=await import(doc.document_type==='act'?'./order-act-preview-v1.js':'./order-contract-preview-v1.js');
  if(actor!==context()){popup.close();return;}
  const html=module.archivedDocumentHtml({...doc.snapshot.draft,tax:doc.snapshot.draft.taxMode,archived:true,archiveStatus:DOCUMENT_STATUS[doc.status],archiveVersion:doc.version,number:doc.document_number||'ЧЕРНОВИК'});
  popup.document.open();popup.document.write(html);popup.document.close();
 });
 await load();current.querySelector('[data-archive-close]')?.focus();
}
function injectOrderButton(){
 const footer=document.querySelector('#v4OrderCardModal .v4-order-modal-footer');
 if(!footer||footer.querySelector('[data-open-document-archive]')||!activeOrder||!canPerformV4Action('documents.read'))return;
 const button=document.createElement('button');button.type='button';button.dataset.openDocumentArchive='';button.textContent='Архив документов';button.addEventListener('click',()=>openDocumentArchive(activeOrder));footer.prepend(button);
}
if(typeof document!=='undefined'){
 document.addEventListener('leader-v4:document-editor-ready',event=>attachEditor(event.detail));
 document.addEventListener('leader-v4:order-card-rendered',event=>{activeOrder=event.detail?.orderId||'';injectOrderButton();});
 new MutationObserver(injectOrderButton).observe(document.body,{childList:true,subtree:true});
 let cleanupActor=v4State.user?.id||'',cleanupRole=v4State.profile?.role;
 subscribeState(()=>{const next=context();if(next===identity)return;identity=next;closeDrawer();activeOrder='';
  if(!v4State.user&&v4State.status!=='Нужен вход')return;
  const changed=cleanupActor&&(cleanupActor!==v4State.user?.id||cleanupRole&&v4State.profileLoaded&&cleanupRole!==v4State.profile?.role||v4State.profileLoaded&&v4State.profile?.is_active===false);
  if(changed)for(let i=sessionStorage.length-1;i>=0;i--){const key=sessionStorage.key(i);if(key?.startsWith('leader-document-pending-v1:'+cleanupActor+':'))sessionStorage.removeItem(key);}
  cleanupActor=v4State.user?.id||'';if(v4State.profileLoaded)cleanupRole=v4State.profile?.role;
 });
}
