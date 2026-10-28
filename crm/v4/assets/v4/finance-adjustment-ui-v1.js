import { FINANCE_METHODS } from './finance-record-model-v1.js';
import { adjustmentError,completeAdjustment,invokeAdjustment,prepareAdjustment } from './finance-adjustment-transport-v1.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=value=>Number(value||0).toLocaleString('ru-RU',{maximumFractionDigits:2})+' ₽';
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Moscow'}).format(new Date());
export function mountFinanceAdjustments(root,{order,payments,client,url,actorId,canWrite,refresh}){
 if(!root||!canWrite())return{isBusy:()=>false};
 const host=document.createElement('details');host.className='v4-order-finance-summary';host.dataset.financeAdjustments='';
 host.innerHTML='<summary>Возвраты, переплата и полнота расходов</summary><p>Возврат фиксирует фактическую выплату клиенту. Перенос переплаты связывает два заказа одного клиента и не меняет общую сумму денег.</p><p data-adjustment-status role="status">Откройте раздел, чтобы загрузить доступные операции.</p><div data-adjustment-controls></div><div data-adjustment-history></div><div data-adjustment-editor></div>';
 root.append(host);let busy=false,uncertain=false,prepared=null,options=null,loaded=false;
 const note=text=>{host.querySelector('[data-adjustment-status]').textContent=text;};
 const api=command=>invokeAdjustment({client,url,actorId,command,allowed:canWrite()});
 const editor=host.querySelector('[data-adjustment-editor]');
 async function load(){
  if(busy)return;busy=true;note('Проверяю текущую переплату и историю…');
  const result=await api({operation:'options',payload:{order_id:order.id}});busy=false;if(!root.isConnected)return;
  if(!result.ok){note(adjustmentError(result.code));host.querySelector('[data-adjustment-controls]').innerHTML='<button type="button" data-adjustment-reload>Повторить проверку</button>';return;}
  loaded=true;options=result;note(`Переплата: ${money(result.overpayment)}. ${result.expenses_confirmed?'Полнота расходов подтверждена для текущего состава.':'Полнота расходов ещё не подтверждена.'}`);
  host.querySelector('[data-adjustment-controls]').innerHTML='<div class="v4-order-modal-actions"><button type="button" data-adjustment-open="refund">Внести возврат</button><button type="button" data-adjustment-open="allocate">Перенести переплату</button><button type="button" data-adjustment-open="expenses.confirm">Подтвердить полноту расходов</button></div>';
  const protectedIds=new Set(result.protected_payment_ids||[]);root.querySelectorAll('[data-finance-void]').forEach(button=>{if(protectedIds.has(button.dataset.financeVoid)){button.hidden=true;}});
  host.querySelector('[data-adjustment-history]').innerHTML=(result.adjustments||[]).map(row=>`<p><b>${row.kind==='refund'?'Возврат':'Перенос переплаты'}: ${money(row.amount)}</b> · ${row.state==='posted'?'Проведён':'Отменён'}<br>${esc(row.reason)}${row.state==='posted'&&row.source_order_id===order.id?`<br><button type="button" data-adjustment-open="void" data-adjustment-id="${esc(row.id)}">Отменить эту операцию</button>`:''}</p>`).join('');
 }
 function open(operation,id){
  if(busy||uncertain||!options)return;
  const incoming=payments.filter(row=>row.is_confirmed&&['проведён','проведен','posted'].includes(String(row.payment_status).toLowerCase())&&!/(возврат|расход|исход)/i.test(row.payment_type||'')&&!['allocation_in','allocation_out','refund'].includes(row.related_entity_type));
  prepared=null;
  editor.innerHTML=`<form data-adjustment-form data-operation="${operation}"${id?` data-adjustment-id="${esc(id)}"`:''}><h4>${{refund:'Фактический возврат клиенту',allocate:'Перенос переплаты',void:'Исправление ошибочной операции','expenses.confirm':'Все расходы внесены'}[operation]}</h4><fieldset class="v4-finance-fields">
   ${operation==='refund'?`<label class="v4-finance-wide">Исходный платёж<select name="payment_id" required><option value="">Выберите поступление</option>${incoming.map(row=>`<option value="${esc(row.id)}">${money(row.amount)} · ${esc(row.payment_date)} · ${esc(row.method)}</option>`).join('')}</select></label>`:''}
   ${operation==='allocate'?`<label class="v4-finance-wide">Заказ того же клиента<select name="target_order_id" required><option value="">Выберите заказ</option>${(options.targets||[]).filter(row=>Number(row.debt)>0).map(row=>`<option value="${esc(row.id)}">№${esc(row.order_number||'—')} · ${esc(row.project_name)} · долг ${money(row.debt)}</option>`).join('')}</select></label><p class="v4-finance-wide">Доступно для переноса: ${money(options.overpayment)}. Если заказа нет в списке, проверьте связь обоих заказов с одним клиентом.</p>`:''}
   ${['refund','allocate'].includes(operation)?`<label>Сумма, ₽<input name="amount" inputmode="decimal" required></label><label>Дата операции<input name="date" type="date" min="2000-01-01" max="${today()}" value="${today()}" required></label>`:''}
   ${operation==='refund'?`<label>Способ возврата<select name="method" required><option value="">Выберите</option>${FINANCE_METHODS.map(method=>`<option>${esc(method)}</option>`).join('')}</select></label>`:''}
   <label class="v4-finance-wide">Основание<textarea name="reason" required minlength="3" maxlength="2000" rows="2"></textarea></label>
   ${operation==='expenses.confirm'?'<label class="v4-finance-confirm v4-finance-wide"><input name="confirmed" type="checkbox" required>Все фактические расходы по заказу внесены. При изменении расходов подтверждение снимется.</label>':'<label class="v4-finance-confirm v4-finance-wide"><input name="confirmed" type="checkbox" required>Проверил сумму, назначение и основание операции.</label>'}
   </fieldset><p data-adjustment-message role="status"></p><div class="v4-order-modal-actions"><button type="submit" class="v4-primary">Подтвердить</button><button type="button" data-adjustment-dismiss>Не сохранять</button></div></form>`;
  editor.querySelector('input,select,textarea')?.focus();
 }
 host.addEventListener('toggle',()=>{if(host.open&&!loaded)void load();});
 host.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.hasAttribute('data-adjustment-reload'))void load();
  if(button.hasAttribute('data-adjustment-open'))open(button.dataset.adjustmentOpen,button.dataset.adjustmentId);
  if(button.hasAttribute('data-adjustment-dismiss')&&!busy&&!uncertain)editor.innerHTML='';
 });
 host.addEventListener('submit',async event=>{
  const form=event.target.closest('[data-adjustment-form]');if(!form)return;event.preventDefault();if(busy)return;busy=true;
  const fieldset=form.querySelector('fieldset'),submit=form.querySelector('[type=submit]'),dismiss=form.querySelector('[data-adjustment-dismiss]'),message=form.querySelector('[data-adjustment-message]');
  try{
   if(!canWrite())throw Error('forbidden');
   if(!prepared){
    const values=Object.fromEntries(new FormData(form)),operation=form.dataset.operation;
    if(!values.confirmed)throw Error('expense_confirmation_required');
    const payload={order_id:order.id,expected_updated_at:order.updated_at,reason:values.reason};
    if(['refund','allocate'].includes(operation)){
     const raw=String(values.amount).trim().replace(',','.');if(!/^\d+(?:\.\d{1,2})?$/.test(raw)||Number(raw)<=0)throw Error('invalid_payload');
     Object.assign(payload,{amount:Number(raw),date:values.date});
    }
    if(operation==='refund')Object.assign(payload,{payment_id:values.payment_id,method:values.method});
    if(operation==='allocate'){const target=options.targets.find(row=>row.id===values.target_order_id);if(!target)throw Error('invalid_payload');Object.assign(payload,{target_order_id:target.id,expected_target_updated_at:target.updated_at});}
    if(operation==='void')payload.adjustment_id=form.dataset.adjustmentId;
    if(operation==='expenses.confirm')payload.confirmed=true;
    prepared=await prepareAdjustment({actorId,operation,payload});
   }
   busy=true;fieldset.disabled=true;submit.disabled=true;dismiss.disabled=true;message.textContent='Сохраняю…';
   const result=await api(prepared.command);if(!root.isConnected)return;
   if(result.ok){completeAdjustment(prepared.key);prepared=null;uncertain=false;busy=false;await refresh('Финансовая операция сохранена. Итоги пересчитаны.');document.dispatchEvent(new CustomEvent('leader-v4:finance-changed',{detail:{orderId:order.id}}));return;}
   uncertain=result.uncertain===true;message.textContent=adjustmentError(result.code);submit.textContent=uncertain?'Повторить ту же операцию':'Подтвердить';
   if(!uncertain){completeAdjustment(prepared.key);prepared=null;}
  }catch(error){message.textContent=adjustmentError(error.message);}
  finally{busy=false;if(root.isConnected){submit.disabled=false;fieldset.disabled=uncertain;dismiss.disabled=uncertain;}}
 });
 return{isBusy:()=>busy||uncertain};
}
