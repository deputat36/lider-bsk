export const OFFER_TRANSITION_PRODUCTION_ENABLED = false;
export function offerTransitionAvailable(url) {
  return url==='https://otulfnouybahfnsycxqn.supabase.co' || (OFFER_TRANSITION_PRODUCTION_ENABLED && url==='https://ofewxuqfjhamgerwzull.supabase.co');
}
const messages={conflict:'КП уже изменилось. Обновите карточку и проверьте статус.',source_not_current:'КП относится к старой версии расчёта. Сформируйте предложение из актуальной версии.',order_already_created:'По этому КП уже создан заказ. Откройте его из карточки.',invalid_transition:'Этот переход недоступен для текущего статуса КП.',forbidden:'У вашей роли нет права изменять статус КП.',not_found:'КП не найдено.',validation_error:'Не удалось проверить данные КП. Обновите карточку.'};
export async function transitionOffer({client,url,offer,status}) {
  if(!offerTransitionAvailable(url))throw new Error('Изменение статуса КП ещё не включено в этом окружении.');
  const session=await client.auth.getSession();const actor=session.data?.session?.user?.id;
  if(!actor)throw new Error('Сначала войдите в CRM');
  const key=`leader-offer-transition-v1:${actor}:${offer.id}:${status}:${offer.updated_at}`;
  let id;try{id=sessionStorage.getItem(key)||crypto.randomUUID();sessionStorage.setItem(key,id);}catch(_){throw new Error('Разрешите хранилище браузера для безопасного повтора.');}
  const body={action:'offer.transition',request_id:id,expected_updated_at:offer.updated_at,payload:{offer_id:offer.id,status,idempotency_key:`offer:${id}`}};
  let timer;
  try{
    const r=await Promise.race([client.functions.invoke('leader-crm-offer-transitions',{body}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Подтверждение не получено. Повторите действие: повтор не создаст дубль.')),20000);})]);
    let data=r.data;if(r.error){try{data=await r.error.context?.clone?.().json();}catch(_){}}
    if(data?.ok!==true){const code=data?.error?.code||data?.error;if(code&&r.error?.context?.status<500)sessionStorage.removeItem(key);throw new Error(messages[code]||'Подтверждение не получено. Повторите действие: тот же ключ защитит от дубля.');}
    sessionStorage.removeItem(key);return data;
  }finally{clearTimeout(timer);}
}
