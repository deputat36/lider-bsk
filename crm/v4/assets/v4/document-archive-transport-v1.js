import { supabaseClient } from './supabase-client.js';
import { V4_CONFIG } from './config.js';
import { v4State } from './state.js';

const PROJECTS=['https://ofewxuqfjhamgerwzull.supabase.co','https://otulfnouybahfnsycxqn.supabase.co'];
export const DOCUMENT_STATUS=Object.freeze({draft:'Черновик',generated:'Зарегистрирован',sent:'Отправлен клиенту',signed:'Подписан',void:'Аннулирован'});
export function documentArchiveError(code){return ({forbidden:'Недостаточно прав.',auth_required:'Войдите в CRM.',source_changed:'Данные изменились. Обновите карточку и сверьте свои правки.',idempotency_conflict:'Состав повторной операции изменился. Обновите карточку.',company_incomplete:'Владелец должен заполнить и подтвердить общие реквизиты.',company_confirmation_required:'Подтвердите правильность общих реквизитов.',invalid_items:'Проверьте наименование, количество, единицу и цену каждой позиции.',line_total_mismatch:'Сумма строки не совпадает с количеством и ценой.',order_total_mismatch:'Сумма документа должна совпадать с итогом заказа. Сначала исправьте заказ или состав документа.',document_incomplete:'Заполните дату, заказчика и налогообложение.',terminal_document:'Подписанный или аннулированный документ нельзя переписать. Нужен отдельный исправительный документ.',comment_required:'Укажите основание изменения статуса.',invalid_transition:'Для этого статуса действие недоступно.',not_found:'Документ или заказ недоступен.',context_changed:'Пользователь изменился. Повторите действие.'})[code]||'Сервер не подтвердил результат. Повторите ту же операцию: второй документ не будет создан.';}
export function documentArchiveCommand(operation,payload={},requestId){return {operation,payload:structuredClone(payload),...(['save','transition','company.save'].includes(operation)?{request_id:requestId||crypto.randomUUID()}: {})};}
export async function invokeDocumentArchive(command,{deadlineMs=14000}={}){
 const actor=v4State.user?.id,role=v4State.profile?.role;let timer;
 const fail=code=>({ok:false,code,uncertain:code==='document_command_failed'});
 if(!actor||!v4State.crmReady)return fail('auth_required');
 if(!PROJECTS.includes(V4_CONFIG.supabaseUrl))return fail('forbidden');
 const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('timeout')),deadlineMs);});
 const bounded=promise=>Promise.race([promise,deadline]);
 try{
  const session=(await bounded(supabaseClient.auth.getSession()))?.data?.session;
  if(session?.user?.id!==actor||!session?.access_token)return fail('auth_required');
  const response=await bounded(supabaseClient.functions.invoke('leader-crm-documents',{body:command,headers:{Authorization:`Bearer ${session.access_token}`}}));
  if(actor!==v4State.user?.id||role!==v4State.profile?.role||!v4State.crmReady)return fail('context_changed');
  let data=response?.data;
  if(response?.error){try{data=await bounded(response.error.context.clone().json());}catch{return fail('document_command_failed');}}
  if(data?.ok!==true)return fail(data?.error?.code||'document_command_failed');
  return data;
 }catch{return fail('document_command_failed');}finally{clearTimeout(timer);}
}
