// Reuse the established real login and evidence harness; all writes target staging.
export function financeBrowserSource(ownerLoginSource) {
  const prefix = ownerLoginSource.slice(0, ownerLoginSource.indexOf('const visible='));
  if (!prefix || prefix === ownerLoginSource) throw new Error('finance_login_anchor_missing');
  return prefix + String.raw`
const {supabaseClient:client}=await import('./assets/v4/supabase-client.js');
const {invokeLeaderFunction}=await import('./assets/v4/functions-client.js');
const {v4State:state}=await import('./assets/v4/state.js');
const {buildOrderFinanceSnapshot}=await import('./assets/v4/finance-plan-actual-model-v1.js');
const steps=[];const record=name=>{steps.push(name);progress(name);};
const select=selector=>{const node=document.querySelector(selector);assert(node,'finance_node_missing:'+selector);return node;};
const click=selector=>{const node=select(selector);assert(!node.disabled,'finance_button_disabled');node.click();};
const value=(name,value)=>{const node=select('[data-finance-form] [name="'+name+'"]');node.value=value;node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));};
const read=async(table,fields,orderId)=>{if(table==='leader_orders'){const result=await invokeLeaderFunction('leader-crm-orders',{action:'get',order_id:orderId});return [result.order];}const result=await client.from(table).select(fields).eq(table==='leader_orders'?'id':'order_id',orderId);assert(!result.error,'finance_read_failed:'+table);return result.data;};
const lead=await client.from('leader_leads').select('converted_order_id').eq('id',R.leadId).single();
assert(!lead.error&&lead.data?.converted_order_id,'finance_source_order_missing');const orderId=lead.data.converted_order_id;
click('[data-v4-tab-button="orders"]');
await waitFor(()=>document.querySelector('[data-open-order="'+orderId+'"]'),'finance_order_button_missing');
click('[data-open-order="'+orderId+'"]');
try { await waitFor(()=>document.querySelector('[data-finance-new="payment"]'),'finance_writer_missing'); } catch (_) { throw new Error('finance_writer_missing:'+JSON.stringify({card:!!document.querySelector('#orderCardTitle'),finance:!!document.querySelector('[data-order-finance]'),code:document.querySelector('#orderCardV1')?.dataset.errorCode||'',role:state.profile?.role,loaded:state.profileLoaded})); }
assert(document.querySelector('[role="dialog"]'),'finance_dialog_semantics_missing');record('finance_card_opened');
const originalFetch=globalThis.fetch.bind(globalThis);const commands=[];let loseOnce=true;
globalThis.fetch=async(input,init)=>{
 const url=String(input?.url||input||'');
 if(url.startsWith('https://otulfnouybahfnsycxqn.supabase.co/functions/v1/leader-crm-finance')){
  const body=JSON.parse(init.body);commands.push(structuredClone(body));
  const response=await originalFetch(input,init);
  if(loseOnce&&response.ok){loseOnce=false;await response.clone().text();throw new Error('synthetic_lost_response_after_commit');}
  return response;
 }
 return originalFetch(input,init);
};
click('[data-finance-new="payment"]');value('amount','1000,25');value('method','Перевод');value('comment','Synthetic finance UI');
select('[data-finance-form]').requestSubmit();
await waitFor(()=>document.querySelector('[data-finance-form] [type="submit"]')?.textContent==='Повторить сохранение','finance_lost_response_not_recoverable');
assert(select('[data-finance-form] fieldset').disabled,'uncertain_finance_fields_not_locked');
click('[data-finance-form] [type="submit"]');
await waitFor(()=>!document.querySelector('[data-finance-form]')&&document.querySelector('[data-finance-saved]')?.textContent.includes('сохранена'),'finance_retry_not_saved');
assert(commands.length===2&&JSON.stringify(commands[0])===JSON.stringify(commands[1]),'finance_retry_identity_changed');
let receipts=await read('leader_payments','id,amount,payment_status,payment_type,is_confirmed,updated_at',orderId);
assert(receipts.length===1&&Number(receipts[0].amount)===1000.25,'finance_retry_created_duplicate');record('finance_ui_timeout_retry_no_duplicate');
const originalCommand=commands[0];
async function invoke(body){const result=await client.functions.invoke('leader-crm-finance',{body});if(result.error?.context?.json){try{result.data=await result.error.context.json();}catch(_){}}return result;}
const conflict=await invoke({...originalCommand,payload:{...originalCommand.payload,amount:1001.25}});assert(conflict.data?.error?.code==='idempotency_conflict','finance_conflict_not_rejected');
const stale=await invoke({...originalCommand,request_id:crypto.randomUUID()});assert(stale.data?.error?.code==='source_changed','finance_stale_not_rejected');
const invalid=await invoke({...originalCommand,request_id:crypto.randomUUID(),payload:{...originalCommand.payload,amount:0}});assert(invalid.data?.error?.code==='invalid_payload','finance_zero_record_not_rejected');
const direct=await client.from('leader_payments').insert({order_id:orderId,owner_id:state.user.id,amount:1});assert(direct.error,'finance_owner_direct_insert_allowed');
const rpc=await client.rpc('leader_write_finance_rpc',{p_payload:{actor_id:state.user.id,request:originalCommand}});assert(rpc.error,'finance_browser_service_rpc_allowed');record('finance_conflict_stale_validation_direct_write_guards');
click('[data-finance-new="expense"]');value('amount','400,10');value('method','Наличные');value('category','Материалы');value('comment','Synthetic expense UI');select('[data-finance-form]').requestSubmit();
await waitFor(()=>!document.querySelector('[data-finance-form]')&&document.querySelector('[data-finance-saved]')?.textContent.includes('сохранена'),'finance_expense_not_saved');
let expenses=await read('leader_expenses','id,amount,status,updated_at',orderId);let orders=await read('leader_orders','id,client_total,contractor_cost,profit,balance,prepayment,payment_status,updated_at',orderId);
let totals=buildOrderFinanceSnapshot(orders[0],receipts,expenses);
assert(expenses.length===1&&totals.confirmedExpenses===400.1&&totals.cashResult===600.15,'finance_cents_or_expense_mismatch');
assert(Number(orders[0].balance)===totals.debt&&Number(orders[0].prepayment)===1000.25&&orders[0].payment_status==='Частично оплачено','finance_order_projection_mismatch');
assert(select('[data-finance-total="cash"]').textContent.includes('600,15'),'finance_ui_cents_lost');record('finance_ui_expense_and_plan_fact');
click('[data-finance-void="'+expenses[0].id+'"]');value('reason','Ошибочная тестовая запись');
const beforeVoid=commands.length;select('[data-finance-form]').requestSubmit();await sleep(100);assert(commands.length===beforeVoid,'finance_void_confirmation_skipped');
select('[name="confirm"]').checked=true;select('[data-finance-form]').requestSubmit();
await waitFor(()=>!document.querySelector('[data-finance-form]')&&document.querySelector('[data-finance-saved]')?.textContent.includes('сохранена'),'finance_void_not_saved');
expenses=await read('leader_expenses','id,amount,status,updated_at',orderId);assert(expenses.length===1&&expenses[0].status==='Отменён'&&Number(expenses[0].amount)===400.1,'finance_void_deleted_or_changed_record');
const logs=await client.from('leader_activity_log').select('id,action,data').eq('user_id',state.user.id).like('action','finance.%');
assert(!logs.error&&logs.data.length===3,'finance_audit_missing_or_duplicate');assert(logs.data.some(row=>row.action==='finance.record.void'&&row.data.reason==='Ошибочная тестовая запись'),'finance_void_reason_missing');record('finance_ui_audited_void');
assert(document.documentElement.scrollWidth<=innerWidth,'finance_document_horizontal_overflow');
const dialog=select('[role="dialog"]');assert(dialog.scrollWidth<=dialog.clientWidth+1,'finance_dialog_horizontal_overflow');
document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert(!document.querySelector('[role="dialog"]'),'finance_escape_failed');
assert(document.activeElement?.dataset.openOrder===orderId,'finance_focus_not_restored');record('finance_keyboard_and_layout');
globalThis.fetch=originalFetch;
// Continue the real order through mounting, handover, settlement and closure.
const installation=await client.from('leader_installation_jobs').select('id,install_status').eq('order_id',orderId).single();
assert(!installation.error&&installation.data,'operations_installation_missing');
let current=(await read('leader_orders','id',orderId))[0];
assert(current.status==='Готово','operations_expected_ready');
const beforeMount=await client.functions.invoke('leader-crm-orders',{body:{action:'order.transition',request_id:crypto.randomUUID(),expected_updated_at:current.updated_at,payload:{order_id:orderId,target_status:'issued',comment:'Synthetic handover'}}});
let rejection=beforeMount.data;try{if(beforeMount.error)rejection=await beforeMount.error.context.clone().json();}catch(_){}
assert(rejection?.error?.code==='installation_not_completed','operations_incomplete_installation_allowed');record('operations_incomplete_installation_rejected');
click('[data-v4-tab-button="installation"]');
await waitFor(()=>document.querySelector('[data-open-installation-job-card="'+installation.data.id+'"]'),'operations_installation_button_missing');
click('[data-open-installation-job-card="'+installation.data.id+'"]');
await waitFor(()=>document.querySelector('#installJobStatus'),'operations_installation_card_missing');
for(const status of ['В работе','Выполнен']){
 const node=select('#installJobStatus');node.value=status;assert(node.value===status,'operations_installation_transition_unavailable');node.dispatchEvent(new Event('change',{bubbles:true}));
 click('[data-save-installation-job]');
 await waitFor(()=>document.querySelector('#installJobStatus')!==node&&document.querySelector('#installJobStatus')?.value===status,'operations_installation_not_saved');
}
click('[data-installation-job-close]');record('operations_installation_completed_in_ui');
click('[data-v4-tab-button="orders"]');await waitFor(()=>document.querySelector('[data-open-order="'+orderId+'"]'),'operations_order_missing');click('[data-open-order="'+orderId+'"]');
await waitFor(()=>document.querySelector('[data-order-operation="issued"]'),'operations_handover_missing');
click('[data-order-operation="issued"]');select('[data-order-operation-form] [name="comment"]').value='Результат принят клиентом, монтаж завершён';select('[data-order-operation-form]').requestSubmit();
await waitFor(()=>document.querySelector('[data-order-operation="closed"]')&&!document.querySelector('[data-order-operation-form]'),'operations_handover_not_saved');
current=(await read('leader_orders','id',orderId))[0];assert(current.status==='Выдано'&&current.issued_at&&Number(current.balance)>0,'operations_handover_created_fake_payment');record('operations_handover_without_fake_payment');
click('[data-order-operation="closed"]');
for(const name of ['expenses_reviewed','documents_reviewed','confirm'])select('[data-order-operation-form] [name="'+name+'"]').checked=true;
select('[data-order-operation-form]').requestSubmit();
await waitFor(()=>document.querySelector('[data-order-operation-form] [role="status"]')?.textContent.includes('Остался долг'),'operations_debt_close_not_rejected');
click('[data-order-operation-dismiss]');
click('[data-finance-new="payment"]');value('amount',String(current.balance));value('method','Перевод');value('comment','Synthetic final settlement');select('[data-finance-form]').requestSubmit();
await waitFor(()=>!document.querySelector('[data-finance-form]')&&document.querySelector('[data-finance-saved]')?.textContent.includes('сохранена'),'operations_final_settlement_failed');
click('[data-order-operation="closed"]');for(const name of ['expenses_reviewed','documents_reviewed','confirm'])select('[data-order-operation-form] [name="'+name+'"]').checked=true;select('[data-order-operation-form]').requestSubmit();
await waitFor(()=>!document.querySelector('[data-order-operation-form]')&&!document.querySelector('[data-order-operation="closed"]'),'operations_close_failed');
current=(await read('leader_orders','id',orderId))[0];assert(current.status==='Закрыт'&&current.completed_at&&current.issued_at&&Number(current.balance)===0&&current.payment_status==='Оплачено','operations_closed_projection_wrong');
const history=await invokeLeaderFunction('leader-crm-orders',{action:'events',order_id:orderId});assert(history.events?.length===2,'operations_audit_missing_or_duplicate');
select('[data-order-history]').open=true;await waitFor(()=>document.querySelector('[data-order-history-content]')?.textContent.includes('Закрыт'),'operations_history_missing');
const forbiddenPatch=await client.functions.invoke('leader-crm-orders',{body:{action:'update',order_id:orderId,payment_status:'Не оплачено'}});assert(forbiddenPatch.error,'operations_legacy_patch_allowed');
record('operations_paid_order_closed_with_history');
output('passed',{authenticated:true,role:'owner',financial_ui:true,order_lifecycle_ui:true,retry_no_duplicate:true,optimistic_lock:true,audited_void:true,cents_exact:true,direct_writes_denied:true,viewport_width:innerWidth,steps,cleanup_required:true});
}catch(error){output('failed',{error:clean(error?.message).slice(0,180),cleanup_required:true});}`;
}
