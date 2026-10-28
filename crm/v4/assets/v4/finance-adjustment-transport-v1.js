const PROJECTS=['https://ofewxuqfjhamgerwzull.supabase.co','https://otulfnouybahfnsycxqn.supabase.co'];
export const adjustmentError=code=>({forbidden:'Недостаточно прав для финансовой операции.',auth_required:'Войдите в CRM снова.',source_changed:'Заказ изменился. Обновите карточку и сверьте операцию.',invalid_source_payment:'Выберите проведённое поступление. Для перенесённой оплаты сначала отмените перенос.',refund_exceeds_receipts:'Возврат превышает доступную сумму исходного платежа или чистых поступлений заказа.',same_client_required:'Оба заказа должны быть связаны с одним клиентом в реестре.',allocation_exceeds_overpayment:'Сумма переноса превышает текущую переплату.',allocation_exceeds_debt:'Сумма переноса превышает долг выбранного заказа.',allocation_already_used:'В другом заказе уже недостаточно средств для обратного переноса. Сначала проверьте его движения.',already_void:'Операция уже отменена. Обновите карточку.',reason_required:'Укажите основание операции, не менее трёх символов.',expenses_unresolved:'В заказе есть непроведённые расходы. Сначала проведите или отмените их.',expense_confirmation_required:'Подтвердите, что все фактические расходы внесены.',idempotency_conflict:'Повтор отличается от исходной операции.',invalid_payload:'Проверьте сумму, дату и выбранные записи.',not_found:'Заказ или операция недоступны.',storage_unavailable:'Не удалось сохранить ключ безопасного повтора. Проверьте хранилище браузера.'})[code]||'Результат не подтверждён. Повторите ту же операцию: прежний ключ защитит от дубля.';
export async function prepareAdjustment({actorId,operation,payload,storage=globalThis.sessionStorage}){
 const {expected_updated_at,expected_target_updated_at,...content}=payload;
 const bytes=new TextEncoder().encode(JSON.stringify({actorId,operation,content}));
 const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
 const key=`leader-finance-adjustment-pending-v1:${actorId}:${payload.order_id}:${digest}`;let saved;
 try{saved=JSON.parse(storage.getItem(key)||'null');if(!saved?.request_id)saved={request_id:crypto.randomUUID(),expected_updated_at,expected_target_updated_at};storage.setItem(key,JSON.stringify(saved));}catch{throw Error('storage_unavailable');}
 return {key,command:{operation,request_id:saved.request_id,payload:{...structuredClone(content),expected_updated_at:saved.expected_updated_at,...(saved.expected_target_updated_at?{expected_target_updated_at:saved.expected_target_updated_at}:{})}}};
}
export function completeAdjustment(key,storage=globalThis.sessionStorage){try{storage.removeItem(key);}catch{}}
export async function invokeAdjustment({client,url,actorId,command,allowed=true,timeoutMs=14000}){
 if(!allowed||!PROJECTS.includes(url))return{ok:false,code:'forbidden'};let timer;
 const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),timeoutMs);});const bounded=promise=>Promise.race([promise,deadline]);
 try{
  const session=(await bounded(client.auth.getSession()))?.data?.session;
  if(!actorId||session?.user?.id!==actorId||!session?.access_token)return{ok:false,code:'auth_required'};
  const response=await bounded(client.functions.invoke('leader-crm-finance-adjustments',{body:command,headers:{Authorization:`Bearer ${session.access_token}`}}));let result=response?.data;
  if(response?.error){try{result=await bounded(response.error.context.clone().json());}catch{return{ok:false,code:'finance_adjustment_failed',uncertain:true};}}
  if(result?.ok)return result;
  const code=result?.error?.code||'finance_adjustment_failed';return{ok:false,code,uncertain:code==='finance_adjustment_failed'||Number(response?.error?.context?.status)>=500};
 }catch{return{ok:false,code:'finance_adjustment_failed',uncertain:true};}finally{clearTimeout(timer);}
}

export async function readExpenseConfirmations({client,url,actorId,orderIds}){
 const confirmed={},deadline=Date.now()+10000;
 for(let offset=0;offset<orderIds.length;offset+=250){
  const remaining=deadline-Date.now();if(remaining<500)break;
  const result=await invokeAdjustment({client,url,actorId,timeoutMs:remaining,command:{operation:'closures',payload:{order_ids:orderIds.slice(offset,offset+250)}}});
  if(!result.ok)break;for(const row of result.rows||[])confirmed[row.order_id]=row.confirmed===true;
 }
 return confirmed;
}
