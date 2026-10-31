import assert from 'node:assert/strict';

let handler;
const url='https://otulfnouybahfnsycxqn.supabase.co';
const actor='a6020000-0000-4000-8000-000000000001';
const offerId='a6020000-0000-4000-8000-000000000004';
const env={SUPABASE_URL:url,SUPABASE_ANON_KEY:'synthetic-anon',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service'};
globalThis.Deno={serve:fn=>handler=fn,env:{get:key=>env[key]}};
const calls=[];
let role='manager', visible=true, authenticated=true, permissionBroken=false;
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
globalThis.fetch=async(input,init={})=>{
  const endpoint=new URL(input), body=init.body?JSON.parse(init.body):null;
  calls.push({path:endpoint.pathname,headers:init.headers,body});
  if(endpoint.pathname==='/auth/v1/user') return reply(authenticated?{id:actor,email:'synthetic@example.invalid'}:{},authenticated?200:401);
  if(endpoint.pathname.endsWith('/leader_actor_has_crm_action_rpc')) return reply(['owner','admin','manager'].includes(role),permissionBroken?503:200);
  if(endpoint.pathname==='/rest/v1/leader_commercial_offers') return reply(visible?[{id:offerId}]:[]);
  if(endpoint.pathname.endsWith('/leader_update_offer_rpc')||endpoint.pathname.endsWith('/leader_transition_offer_rpc')) return reply({ok:true,offer:{id:offerId,title:'КП'}});
  throw new Error('Unexpected endpoint: '+endpoint.pathname);
};
await import('../supabase/functions/leader-crm-offer-transitions/index.ts');
const command=action=>({action,request_id:'a6020000-0000-4000-8000-000000000005',expected_updated_at:'2026-10-31T12:00:00.123456Z',payload:{offer_id:offerId,...(action==='offer.update'?{patch:{title:'КП',short_text:'Текст',full_text:'Полный текст',valid_until:'2026-11-05'}}:{status:'Отправлено'}),idempotency_key:'SYNTH-OFFER-602-edge'}});
const invoke=(body,options={})=>handler(new Request(url+'/functions/v1/leader-crm-offer-transitions',{method:'POST',headers:{Authorization:'Bearer synthetic-user','Content-Type':'application/json'},body:JSON.stringify(body),...options}));
for(role of ['owner','admin','manager','accountant','designer','installer','contractor']) for(const action of ['offer.update','offer.transition']) {
  calls.length=0;const result=await invoke(command(action));
  const allowed=['owner','admin','manager'].includes(role);
  assert.equal(result.status,allowed?200:403,role+':'+action);
  const permission=calls.find(c=>c.path.endsWith('/leader_actor_has_crm_action_rpc'));
  assert.equal(permission.body.p_action,action==='offer.update'?'offers.write':'offers.transition');
  assert.equal(permission.body.p_actor_id,actor);
  const writes=calls.filter(c=>/leader_(update|transition)_offer_rpc$/.test(c.path));
  assert.equal(writes.length,allowed?1:0);
  if(allowed){assert.equal(writes[0].body.p_payload.actor_id,actor);assert.equal(writes[0].body.p_payload.actor_email,'synthetic@example.invalid');}
}
role='manager';calls.length=0;visible=false;
assert.equal((await invoke(command('offer.update'))).status,404);
assert.equal(calls.some(c=>c.path.endsWith('/leader_update_offer_rpc')),false);
visible=true;permissionBroken=true;calls.length=0;
assert.equal((await invoke(command('offer.update'))).status,503);
assert.equal(calls.some(c=>c.path.endsWith('/leader_update_offer_rpc')),false);
permissionBroken=false;authenticated=false;calls.length=0;
assert.equal((await invoke(command('offer.update'))).status,401);assert.equal(calls.length,1);
authenticated=true;calls.length=0;
assert.equal((await invoke(command('offer.update'),{headers:{'Content-Type':'application/json'}})).status,401);assert.equal(calls.length,0);
assert.equal((await invoke({}, {method:'DELETE',body:null})).status,405);
assert.equal((await invoke({}, {body:'['})).status,400);
assert.equal((await invoke({action:'__proto__'})).status,400);
assert.equal((await invoke({...command('offer.update'),payload:{offer_id:'invalid'}})).status,400);
assert.equal((await invoke({}, {body:' '.repeat(131073)})).status,413);
const spoofed=command('offer.update');spoofed.actor_id='attacker';spoofed.actor_email='attacker@example.invalid';
await invoke(spoofed);
assert.equal(calls.findLast(c=>c.path.endsWith('/leader_update_offer_rpc')).body.p_payload.actor_id,actor);
console.log('Offer operations actual Edge handler: 7 roles × 2 actions, fresh Auth, actor binding, object visibility, malformed/oversized body and fail-closed permission PASS');
