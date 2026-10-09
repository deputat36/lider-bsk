// Mutations target only the extra synthetic order prepared by the signed staging bootstrap.
import { readFile, writeFile } from 'node:fs/promises';
const url=process.env.STAGING_SUPABASE_URL,key=process.env.STAGING_SUPABASE_PUBLISHABLE_KEY,role=process.env.STAGING_CRM_E2E_EXPECTED_ROLE;
const assert=(value,code)=>{if(!value)throw Error(code)};
const json=async response=>response.json().catch(()=>({}));
async function main(){
 assert(url==='https://otulfnouybahfnsycxqn.supabase.co','staging_only');assert(['designer','contractor','installer'].includes(role),'unsupported_role');
 const signed=await fetch(url+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({email:process.env.STAGING_CRM_E2E_EMAIL,password:process.env.STAGING_CRM_E2E_PASSWORD})});const session=await json(signed);assert(signed.ok&&session.access_token,'login_failed');
 const headers={apikey:key,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'};
 if(process.argv.includes('--replay-denied')){const saved=JSON.parse(await readFile(process.env.STAGING_CRM_E2E_WORKER_COMMAND_PATH,'utf8'));const response=await fetch(url+'/functions/v1/'+saved.slug,{method:'POST',headers,body:JSON.stringify(saved.request)});assert(response.status===403,'inactive_replay_allowed');console.log(JSON.stringify({ok:true,role,inactive_replay_denied:true}));return;}
 const profile=await fetch(url+'/rest/v1/leader_user_profiles?select=role,is_active&user_id=eq.'+session.user.id,{headers});const profiles=await json(profile);assert(profile.ok&&profiles[0]?.role===role&&profiles[0]?.is_active===true,'profile_mismatch');
 const tables={design:['leader_design_tasks','id,title,task_status'],production:['leader_production_jobs','id,title,production_status'],installation:['leader_installation_jobs','id,title,install_status']};
 for(const [kind,[table,fields]]of Object.entries(tables)){const response=await fetch(url+'/rest/v1/'+table+'?select='+fields,{headers});const rows=await json(response);const allowed=role==='designer'?kind!=='installation':role==='installer'?kind==='installation':kind==='production';if(allowed){assert(response.ok&&Array.isArray(rows)&&rows.length>=1,'positive_read:'+kind)}else{assert([401,403].includes(response.status)||(response.ok&&Array.isArray(rows)&&rows.length===0),'wrong_role_read:'+kind)}}
 for(const [table,field]of [['leader_design_tasks','client_phone'],['leader_production_jobs','contractor_cost'],['leader_installation_jobs','installer_cost'],['leader_orders','profit']]){const response=await fetch(url+'/rest/v1/'+table+'?select='+field,{headers});const rows=await json(response);assert(([401,403].includes(response.status)||(response.status===400&&rows?.code==='42501'))||(response.ok&&Array.isArray(rows)&&rows.length===0),'private_field:'+table)}
 const fake='90000000-0000-4000-8000-000000000999';
 for(const [slug,action,allowed]of [['leader-crm-design','design_task.transition',role==='designer'],['leader-crm-production','production_job.update',role!=='installer'],['leader-crm-installation','installation_job.update',role==='installer']]){
  const body={action,request_id:crypto.randomUUID(),expected_updated_at:new Date().toISOString(),payload:action==='design_task.transition'?{task_id:fake,status:'В работе',layout_link:null,idempotency_key:'worker-probe:'+role+':'+action}:{job_id:fake,idempotency_key:'worker-probe:'+role+':'+action,patch:{title:'Synthetic permission probe'}}};
  const response=await fetch(url+'/functions/v1/'+slug,{method:'POST',headers,body:JSON.stringify(body)});const data=await json(response);const code=data.error?.code||data.error;assert(allowed?response.status===404&&code==='not_found':response.status===403,'write_permission:'+role+':'+action+':'+response.status+':'+code);
 }
 for(const rpc of ['leader_transition_design_task_rpc','leader_update_production_job_rpc','leader_update_installation_job_rpc']){const response=await fetch(url+'/rest/v1/rpc/'+rpc,{method:'POST',headers,body:JSON.stringify({p_payload:{actor_id:session.user.id,request:{}}})});assert([401,403].includes(response.status),'service_rpc_open:'+rpc)}
 const kind=role==='designer'?'design':role==='contractor'?'production':'installation';
 const [table,fields]=tables[kind];const id=process.env.STAGING_CRM_E2E_WORKER_ENTITY_ID;
 assert(/^[0-9a-f-]{36}$/.test(id||''),'worker_id_missing');
 const read=await fetch(url+'/rest/v1/'+table+'?select=id,order_id,updated_at& id=eq.'.replace(' ','')+id,{headers});const jobs=await json(read);
 assert(read.ok&&jobs.length===1&&jobs[0].order_id===process.env.STAGING_CRM_E2E_WORKER_ORDER_ID,'worker_order_mismatch');
 const slug='leader-crm-'+kind,action=kind==='design'?'design_task.transition':kind+'_job.update';
 const payload=kind==='design'?{task_id:id,status:'В работе',layout_link:null}:{job_id:id,patch:kind==='production'?{contractor_comment:'Synthetic authenticated worker API'}:{installer_comment:'Synthetic authenticated worker API'}};
 payload.idempotency_key='worker-positive:'+role+':'+crypto.randomUUID();
 const request={action,request_id:crypto.randomUUID(),expected_updated_at:jobs[0].updated_at,payload};
 const call=async body=>{const response=await fetch(url+'/functions/v1/'+slug,{method:'POST',headers,body:JSON.stringify(body)});return{response,data:await json(response)}};
 const privacy=value=>{if(!value||typeof value!=='object')return;for(const [name,item]of Object.entries(value)){assert(!['contractor_cost','client_total','installer_cost','client_price','profit','internal_comment','client_phone','client_email'].includes(name),'private_response:'+name);privacy(item)}};
 const saved=await call(request);assert(saved.response.ok&&saved.data.ok===true&&!saved.data.idempotent_replay,'worker_positive_failed:'+saved.response.status+':'+saved.data.error?.code);privacy(saved.data);
 for(const retried of [request,{...request,request_id:crypto.randomUUID()}]){const replay=await call(retried);assert(replay.response.ok&&replay.data.idempotent_replay===true,'worker_replay_failed');privacy(replay.data)}
 const stale=await call({...request,request_id:crypto.randomUUID(),payload:{...payload,idempotency_key:payload.idempotency_key+':stale'}});assert(stale.response.status===409&&stale.data.error?.code==='conflict','worker_stale_allowed');
 await writeFile(process.env.STAGING_CRM_E2E_WORKER_COMMAND_PATH,JSON.stringify({slug,request}),{mode:0o600});
 console.log(JSON.stringify({ok:true,role,authenticated:true,real_fixture_reads:true,private_fields_denied:true,wrong_role_denied:true,write_permission_contract:true,service_rpc_denied:true,synthetic_mutations:true,positive_update:true,idempotent_replay:true,stale_denied:true,response_privacy:true}));
}
main().catch(error=>{console.error(JSON.stringify({ok:false,error:String(error.message).slice(0,160)}));process.exitCode=1});
