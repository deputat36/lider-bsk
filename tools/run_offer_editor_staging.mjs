import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const url='https://otulfnouybahfnsycxqn.supabase.co',key='sb_publishable_iRCLPHgRaI5SNo9h4efMQw_W7Kdby1D';
const runKey=`${process.env.GITHUB_RUN_ID}:${process.env.GITHUB_RUN_ATTEMPT}`;
async function request(path,body,token,method='POST'){
 const r=await fetch(url+path,{method,signal:AbortSignal.timeout(20000),headers:{apikey:key,...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return{status:r.status,body:await r.json().catch(()=>null)};
}
async function bootstrap(action,args={}){
 const oidc=await fetch(process.env.ACTIONS_ID_TOKEN_REQUEST_URL+'&audience=leader-staging-authenticated-e2e',{signal:AbortSignal.timeout(15000),headers:{Authorization:'bearer '+process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}});const signed=await oidc.json();assert(oidc.ok&&signed.value,'oidc_failed');
 const r=await request('/functions/v1/leader-staging-authenticated-e2e-bootstrap',{action,run_key:runKey,...args},signed.value);assert.equal(r.body?.ok,true,`bootstrap:${action}:${r.status}:${r.body?.error}`);return r.body;
}
let fixture,token;
async function main(){
 assert(/^\d+:\d+$/.test(runKey),'github_run_required');
 fixture=await bootstrap('prepare');
 try{
  for(const value of [fixture.password,fixture.email,fixture.marker,fixture.lead_id])console.log('::add-mask::'+value);
  const auth=await request('/auth/v1/token?grant_type=password',{email:fixture.email,password:fixture.password});assert.equal(auth.status,200);token=auth.body.access_token;console.log('::add-mask::'+token);
  const seed=await bootstrap('prepare_offer_editor',{marker:fixture.marker}),id=seed.offer_id;
  const invoke=body=>request('/functions/v1/leader-crm-offer-transitions',body,token);
  const read=async()=>{const r=await request('/rest/v1/leader_commercial_offers?select=id,title,short_text,full_text,valid_until,status,total_sum,updated_at&id=eq.'+id,undefined,token,'GET');assert.equal(r.status,200);assert.equal(r.body.length,1);return r.body[0]};
  const command=(row,patch={},extra={})=>({action:'offer.update',request_id:crypto.randomUUID(),expected_updated_at:row.updated_at,payload:{offer_id:id,idempotency_key:crypto.randomUUID(),patch:{title:'Synthetic HTTP edit',short_text:'Synthetic short',full_text:'Synthetic full',valid_until:'2030-01-01',...patch}},...extra});
  let row=await read();const originalTotal=row.total_sum;
  const cmd=command(row);const saved=await invoke(cmd);assert.equal(saved.status,200,'manager_edit:'+saved.body?.error?.code);assert.equal(saved.body.offer.title,cmd.payload.patch.title);assert.equal(saved.body.offer.total_sum,originalTotal);
  const replay=await invoke(cmd);assert.equal(replay.status,200);assert.equal(replay.body.idempotent_replay,true);assert.equal(replay.body.offer.updated_at,saved.body.offer.updated_at);
  assert.equal((await invoke({...cmd,payload:{...cmd.payload,patch:{...cmd.payload.patch,title:'changed replay'}}})).status,409);
  assert.equal((await invoke(command(row))).status,409,'stale_revision');
  row=await read();assert.equal((await invoke(command(row,{full_text:'Я'.repeat(20001)}))).status,400);
  const forbidden=command(row);forbidden.payload.patch.total_sum=1;assert.equal((await invoke(forbidden)).status,400);
  const direct=await request('/rest/v1/leader_commercial_offers?id=eq.'+id,{title:'DIRECT MUST FAIL'},token,'PATCH');assert([401,403].includes(direct.status),'direct_update_must_fail');
  const serviceOnly=await request('/rest/v1/rpc/leader_update_offer_rpc',{p_payload:{actor_id:fixture.user_id,request:command(row)}},token);assert([401,403].includes(serviceOnly.status),'service_only_rpc');
  execFileSync(process.execPath,['tools/run_offer_editor_staging_browser.mjs'],{env:{...process.env,OFFER_STAGING_KEY:key,OFFER_STAGING_TOKEN:token,OFFER_STAGING_ACTOR:fixture.user_id,OFFER_STAGING_ID:id},stdio:'inherit',timeout:90000});
  row=await read();assert.equal(row.title,'Synthetic UI edit');assert.equal(row.full_text.length,'Полный текст: '.length+3000);assert.equal(row.total_sum,originalTotal);
  const concurrent=await Promise.all([invoke(command(row,{title:'Concurrent A'})),invoke(command(row,{title:'Concurrent B'}))]);assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
  for(const role of ['owner','admin','manager','accountant','designer','installer','contractor']){
   await bootstrap('set_role',{marker:fixture.marker,role});
   if(['owner','admin','manager'].includes(role)){row=await read();assert.equal((await invoke(command(row,{title:'Synthetic '+role}))).status,200,'allowed:'+role)}
   else {assert.equal((await invoke(command(row))).status,403,'denied:'+role);const hidden=await request('/rest/v1/leader_commercial_offers?select=id&id=eq.'+id,undefined,token,'GET');assert.equal(hidden.status,200);assert.deepEqual(hidden.body,[],'read_denied:'+role)}
   console.log(JSON.stringify({ok:true,role,edit_permission:true,read_permission:true}));
  }
  await bootstrap('set_role',{marker:fixture.marker,role:'manager'});row=await read();
  for(const status of ['Отправлено','Согласовано']){const body={action:'offer.transition',request_id:crypto.randomUUID(),expected_updated_at:row.updated_at,payload:{offer_id:id,status,idempotency_key:crypto.randomUUID()}};const transitioned=await invoke(body);assert.equal(transitioned.status,200,'transition:'+status+':'+transitioned.body?.error?.code);row=transitioned.body.offer;}
  assert.equal((await invoke(command(row))).status,409,'approved_readonly');
  await bootstrap('set_worker_active',{marker:fixture.marker,active:false});assert.equal((await invoke(command(row))).status,403,'inactive_denied');
  assert.equal((await request('/functions/v1/leader-crm-offer-transitions',command(row))).status,401);
  console.log(JSON.stringify({ok:true,project_ref:'otulfnouybahfnsycxqn',actual_ui_and_http:true,replay:true,stale_and_concurrent_cas:true,forbidden_fields:true,direct_update_denied:true,service_rpc_denied:true,approved_readonly:true,inactive_denied:true}));
 }catch(error){console.error('scenario_failed:'+error.message);throw error}
 finally{await bootstrap('set_worker_active',{marker:fixture.marker,active:true});const cleaned=await bootstrap('cleanup',{marker:fixture.marker});assert(Object.values(cleaned.residue).every(n=>n===0),'fixture_residue');assert.equal(cleaned.auth_user_deleted,true);console.log(JSON.stringify({ok:true,cleanup:true,residue:cleaned.residue,auth_user_deleted:true}));}
}
main().catch(e=>{console.error(String(e.message).slice(0,300));process.exitCode=1});
