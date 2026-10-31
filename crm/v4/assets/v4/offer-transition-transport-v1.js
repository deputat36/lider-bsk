export const OFFER_TRANSITION_PRODUCTION_ENABLED = true;
export function offerTransitionAvailable(url) {
  return url==='https://otulfnouybahfnsycxqn.supabase.co' || (OFFER_TRANSITION_PRODUCTION_ENABLED && url==='https://ofewxuqfjhamgerwzull.supabase.co');
}
const messages={conflict:'КП уже изменилось. Обновите карточку и проверьте статус.',source_not_current:'КП относится к старой версии расчёта. Сформируйте предложение из актуальной версии.',order_already_created:'По этому КП уже создан заказ. Откройте его из карточки.',invalid_transition:'Этот переход недоступен для текущего статуса КП.',forbidden:'У вашей роли нет права изменять статус КП.',not_found:'КП не найдено.',validation_error:'Не удалось проверить данные КП. Обновите карточку.'};

export const OFFER_EDIT_LIMITS = Object.freeze({ title: 500, short_text: 4000, full_text: 20000 });
export function offerEditReason(offer, calculation) {
  if (!offer || offer.status !== 'Черновик' || offer.sent_at || offer.approved_at) return 'Отправленное или согласованное КП сохранено для истории. Для новых условий создайте новую версию расчёта и новое КП.';
  if (offer.order_id || calculation?.order_id) return 'По этому КП уже создан заказ. Его условия сохраняются в истории.';
  if (calculation?.is_current_revision !== true) return 'Это КП относится к старой версии расчёта. Сформируйте КП из актуальной версии.';
  return '';
}
export function validateOfferEdit(patch) {
  const fields = ['title', 'short_text', 'full_text', 'valid_until'];
  if (!patch || Object.keys(patch).length !== fields.length || !fields.every(k => typeof patch[k] === 'string')) throw new Error('Заполните поля редактора КП.');
  if (!patch.title.trim() || Object.entries(OFFER_EDIT_LIMITS).some(([k, max]) => patch[k].length > max)) throw new Error('Проверьте название и длину текста. Введённые данные сохранены в редакторе.');
  if (!patch.short_text.trim() && !patch.full_text.trim()) throw new Error('Заполните короткий или полный текст КП.');
  const date = new Date(patch.valid_until + 'T00:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(patch.valid_until) || !Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== patch.valid_until) throw new Error('Укажите корректную дату действия КП.');
  return { title: patch.title.trim(), short_text: patch.short_text, full_text: patch.full_text, valid_until: patch.valid_until };
}
export async function prepareOfferEditCommand({ actorId, offer, patch }, storage = sessionStorage) {
  const clean = validateOfferEdit(patch);
  if (!actorId || !offer?.id || !offer.updated_at || !Number.isFinite(Date.parse(offer.updated_at))) throw new Error('Обновите карточку КП перед редактированием.');
  const fingerprint = JSON.stringify({ actorId, offerId: offer.id, revision: offer.updated_at, patch: clean });
  const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(fingerprint)))].map(x => x.toString(16).padStart(2, '0')).join('');
  const key = `leader-offer-edit-pending-v1:${actorId}:${digest}`;
  let saved;
  try {
    saved = JSON.parse(storage.getItem(key) || 'null');
    if (!saved || saved.fingerprint !== fingerprint || !/^[0-9a-f-]{36}$/i.test(saved.request_id)) saved = { fingerprint, request_id: crypto.randomUUID() };
    storage.setItem(key, JSON.stringify(saved));
  } catch (_) { throw new Error('Разрешите хранилище браузера для безопасного повтора сохранения.'); }
  return { key, command: { action: 'offer.update', request_id: saved.request_id, expected_updated_at: offer.updated_at, payload: { offer_id: offer.id, patch: clean, idempotency_key: `offer-edit:${saved.request_id}` } } };
}
export async function updateOffer({ client, url, offer, patch, canInvokeNow = () => true, storage = sessionStorage, timeoutMs = 20000 }) {
  if (!offerTransitionAvailable(url)) throw new Error('Редактирование КП ещё не включено в этом окружении.');
  const signed = await client.auth.getSession();
  const session = signed.data?.session, actorId = session?.user?.id;
  if (!actorId) throw new Error('Сначала войдите в CRM');
  const { key, command } = await prepareOfferEditCommand({ actorId, offer, patch }, storage);
  if (!canInvokeNow()) throw Object.assign(new Error('Нет права редактировать КП. Обновите сессию.'), { code: 'forbidden' });
  let timer;
  try {
    const response = await Promise.race([
      client.functions.invoke('leader-crm-offer-transitions', { body: command, ...(session.access_token ? { headers: { Authorization: `Bearer ${session.access_token}` } } : {}) }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), timeoutMs); }),
    ]);
    let data = response.data;
    if (response.error) { try { data = await response.error.context?.clone?.().json(); } catch (_) {} }
    if (data?.ok === true) { try { storage.removeItem(key); } catch (_) {} return data; }
    const code = data?.error?.code || data?.error || 'network_error';
    const uncertain = !data?.error || !response.error?.context || response.error.context.status >= 500;
    if (!uncertain) storage.removeItem(key);
    const editMessages = { ...messages, forbidden: 'У вашей роли нет права редактировать КП.', offer_not_editable: 'КП уже отправлено или согласовано. Его текст сохранён для истории.', validation_error: 'Не удалось сохранить поля КП. Проверьте длину текста и дату.', conflict: 'КП уже изменилось. Ваши правки сохранены: сравните их с актуальной версией.' };
    throw Object.assign(new Error(editMessages[code] || 'Подтверждение не получено. Повторите сохранение с теми же данными: ключ повтора защитит от дубля.'), { code, uncertain });
  } catch (error) {
    if (error.code) throw error;
    throw Object.assign(new Error('Подтверждение не получено. Повторите сохранение с теми же данными: ключ повтора защитит от дубля.'), { code: 'network_error', uncertain: true });
  } finally { clearTimeout(timer); }
}
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
