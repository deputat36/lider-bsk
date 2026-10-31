import assert from 'node:assert/strict';
import { prepareOfferEditCommand, updateOffer, validateOfferEdit, offerEditReason } from '../crm/v4/assets/v4/offer-transition-transport-v1.js';

const values = new Map();
const storage = { getItem:k => values.get(k), setItem:(k,v) => values.set(k,v), removeItem:k => values.delete(k) };
const offer = { id:'90000000-0000-4000-8000-000000000602', status:'Черновик', updated_at:'2026-10-31T12:00:00.123456Z' };
const patch = { title:'Новое КП', short_text:'Краткое предложение', full_text:'Строка 1\nСтрока 2 <условия>', valid_until:'2026-11-05' };
const requests = [];
let mode = 'lost';
const client = {
  auth:{ getSession:async () => ({ data:{ session:{ user:{id:'actor-602'}, access_token:'synthetic-token' } } }) },
  functions:{ invoke:async (name, options) => {
    assert.equal(name,'leader-crm-offer-transitions');
    assert.equal(options.headers.Authorization,'Bearer synthetic-token');
    requests.push(structuredClone(options.body));
    if (mode === 'lost') return { error:new Error('network') };
    if (mode === 'conflict') return { error:{ context:{ status:409, clone:() => ({ json:async () => ({ok:false,error:{code:'conflict'}}) }) } } };
    return {data:{ok:true,offer:{...offer,...patch},idempotent_replay:true}};
  } },
};
const input = {client,url:'https://otulfnouybahfnsycxqn.supabase.co',offer,patch,storage};
assert.equal(offerEditReason(offer,{is_current_revision:true}),'');
for (const state of ['Отправлено','КП отправлено','Согласовано','Отклонено','Устарело']) assert.notEqual(offerEditReason({...offer,status:state},{is_current_revision:true}),'');
assert.notEqual(offerEditReason({...offer,order_id:'order'},{is_current_revision:true}),'');
assert.notEqual(offerEditReason(offer,{is_current_revision:false}),'');
assert.deepEqual(validateOfferEdit(patch),patch);
assert.throws(() => validateOfferEdit({...patch,valid_until:'2026-02-30'}),/дату/);
assert.throws(() => validateOfferEdit({...patch,title:'я'.repeat(501)}),/длину/);
assert.throws(() => validateOfferEdit({...patch,short_text:'',full_text:''}),/текст/);
assert.throws(() => validateOfferEdit({...patch,total_sum:1}),/поля/);
assert.equal(validateOfferEdit({...patch,full_text:'я'.repeat(20000)}).full_text.length,20000);
assert.throws(() => validateOfferEdit({...patch,full_text:'я'.repeat(20001)}),/длину/);

await assert.rejects(updateOffer(input),error => error.uncertain === true);
assert.equal(values.size,1);
mode='ok';await updateOffer(input);
assert.deepEqual(requests[0],requests[1],'retry must retain full payload, UUID and microsecond revision');
assert.equal(values.size,0);
assert.equal(requests[0].expected_updated_at,offer.updated_at);
assert.equal(requests[0].payload.patch.full_text,patch.full_text);

const first=await prepareOfferEditCommand({actorId:'actor-602',offer,patch},storage);
const changed=await prepareOfferEditCommand({actorId:'actor-602',offer,patch:{...patch,title:'Другое КП'}},storage);
const revision=await prepareOfferEditCommand({actorId:'actor-602',offer:{...offer,updated_at:'2026-10-31T12:00:01.123456Z'},patch},storage);
const actor=await prepareOfferEditCommand({actorId:'other-actor',offer,patch},storage);
assert.equal(new Set([first.key,changed.key,revision.key,actor.key]).size,4);
values.clear();mode='conflict';
await assert.rejects(updateOffer(input),error => error.code === 'conflict' && error.uncertain === false);
assert.equal(values.size,0,'known conflict starts a new command after explicit reconciliation');
const before=requests.length;
await assert.rejects(updateOffer({...input,canInvokeNow:() => false}),/Нет права/);
assert.equal(requests.length,before,'lost permission before invoke must not send command');
await assert.rejects(updateOffer({...input,url:'https://unrelated.supabase.co'}),/не включено/);
assert.equal(requests.length,before);
await assert.rejects(updateOffer({...input,storage:{getItem(){throw new Error('blocked')}}}),/хранилище/);
assert.equal(requests.length,before);
console.log('Offer editing validation, complete text, actor/revision binding, lost-response replay, conflict and host/permission guards PASS');
