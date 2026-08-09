import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@5.9.6'

const STAGING_REF='otulfnouybahfnsycxqn'
const ISSUER='https://token.actions.githubusercontent.com'
const AUDIENCE='leader-staging-authenticated-e2e'
const REPOSITORY='deputat36/lider-bsk'
const REPOSITORY_ID='1236281954'
const OWNER_ID='203537570'
const ACTOR_ID='203537570'
const BRANCH_REF='refs/heads/agent/487-authenticated-staging-e2e'
const E2E_WORKFLOW_REF=`${REPOSITORY}/.github/workflows/crm-staging-authenticated-e2e.yml@${BRANCH_REF}`
const CALLER_WORKFLOW_REF=`${REPOSITORY}/.github/workflows/crm-staging-installation-authenticated-ui-smoke-runtime.yml@${BRANCH_REF}`
const SUBJECT=`repo:${REPOSITORY}:ref:${BRANCH_REF}`
const JWKS=createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks`))
type JsonObject=Record<string,unknown>
const text=(value:unknown)=>String(value??'').trim()
const response=(status:number,value:JsonObject)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})
function bearer(req:Request){const value=text(req.headers.get('authorization'));return value.toLowerCase().startsWith('bearer ')?value.slice(7).trim():''}
function runKey(payload:JsonObject){const id=text(payload.run_id),attempt=text(payload.run_attempt);if(!/^\d+$/.test(id)||!/^\d+$/.test(attempt))throw new Error('github_run_claim_invalid');return `${id}:${attempt}`}
async function claims(req:Request){
  const token=bearer(req);if(!token)throw new Error('github_oidc_missing')
  const verified=await jwtVerify(token,JWKS,{issuer:ISSUER,audience:AUDIENCE,algorithms:['RS256']})
  const value=verified.payload as JsonObject
  const expected:Record<string,string>={repository:REPOSITORY,repository_id:REPOSITORY_ID,repository_owner_id:OWNER_ID,actor_id:ACTOR_ID,ref:BRANCH_REF,ref_type:'branch',event_name:'push',runner_environment:'github-hosted',repository_visibility:'public',sub:SUBJECT}
  for(const [key,wanted] of Object.entries(expected))if(text(value[key])!==wanted)throw new Error(`github_claim_rejected:${key}`)
  const workflowRef=text(value.workflow_ref)
  if(workflowRef!==E2E_WORKFLOW_REF&&workflowRef!==CALLER_WORKFLOW_REF)throw new Error('github_claim_rejected:workflow_ref')
  const jobWorkflowRef=text(value.job_workflow_ref)
  if(jobWorkflowRef&&jobWorkflowRef!==E2E_WORKFLOW_REF&&jobWorkflowRef!==CALLER_WORKFLOW_REF)throw new Error('github_claim_rejected:job_workflow_ref')
  if(!/^[0-9a-f]{40}$/i.test(text(value.sha)))throw new Error('github_sha_claim_invalid')
  return {runKey:runKey(value)}
}
function environment(){const url=text(Deno.env.get('SUPABASE_URL')).replace(/\/$/,'');const key=text(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));if(url!==`https://${STAGING_REF}.supabase.co`||!key)throw new Error('staging_service_environment_invalid');return{url,key}}
function headers(key:string){const value:Record<string,string>={apikey:key,'Content-Type':'application/json',Accept:'application/json'};if(key.split('.').length===3)value.Authorization=`Bearer ${key}`;return value}
async function service(path:string,init:RequestInit={}){const env=environment();const result=await fetch(env.url+path,{...init,headers:{...headers(env.key),...(init.headers||{})}});const body=await result.json().catch(()=>({})) as JsonObject;return{ok:result.ok,status:result.status,body}}
async function rpc(name:string,args:JsonObject){return await service(`/rest/v1/rpc/${name}`,{method:'POST',body:JSON.stringify(args)})}
function password(){const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);return `E2e!${Array.from(bytes,v=>v.toString(16).padStart(2,'0')).join('')}Z9`}
async function createUser(email:string,passwordValue:string,key:string){return await service('/auth/v1/admin/users',{method:'POST',body:JSON.stringify({email,password:passwordValue,email_confirm:true,app_metadata:{staging_crm_e2e:true,run_key:key},user_metadata:{synthetic:true}})})}
async function deleteUser(id:string){return await service(`/auth/v1/admin/users/${encodeURIComponent(id)}`,{method:'DELETE'})}
async function prepare(key:string){
  const suffix=crypto.randomUUID().replaceAll('-','').slice(0,12);const marker=`SYNTH-CRM-E2E-${key.replace(':','-')}-${suffix}`;const email=`crm-e2e-${key.replace(':','-')}-${suffix}@example.invalid`;const pass=password()
  const created=await createUser(email,pass,key);const userId=text(created.body.id||(created.body.user as JsonObject|undefined)?.id);if(!created.ok||!userId)throw new Error(`auth_create_failed:${created.status}`)
  try{const fixture=await rpc('leader_prepare_authenticated_e2e_rpc',{p_run_key:key,p_user_id:userId,p_email:email,p_marker:marker});if(!fixture.ok||fixture.body.ok!==true)throw new Error(`fixture_prepare_failed:${fixture.status}`);return{ok:true,action:'prepare',run_key:key,marker,email,password:pass,user_id:userId,lead_id:fixture.body.lead_id,role:'manager'}}catch(error){await deleteUser(userId).catch(()=>undefined);throw error}
}
async function inspect(marker:string){const result=await rpc('leader_inspect_authenticated_e2e_rpc',{p_marker:marker});if(!result.ok||result.body.ok!==true)throw new Error(`fixture_inspect_failed:${result.status}`);return{ok:true,action:'inspect',marker,...result.body}}
async function setRole(marker:string,role:string){const inspected=await inspect(marker);const userId=text(inspected.user_id);if(!userId)throw new Error('fixture_user_not_found');const result=await rpc('leader_set_authenticated_e2e_role_rpc',{p_user_id:userId,p_marker:marker,p_role:role});if(!result.ok||result.body.ok!==true)throw new Error(`fixture_role_failed:${result.status}`);return{ok:true,action:'set_role',role:text(result.body.role)}}
async function cleanup(marker:string){
  const cleaned=await rpc('leader_cleanup_authenticated_e2e_rpc',{p_marker:marker});if(!cleaned.ok||cleaned.body.ok!==true)throw new Error(`fixture_cleanup_failed:${cleaned.status}`)
  const userId=text(cleaned.body.auth_user_id);if(userId){const deleted=await deleteUser(userId);if(!deleted.ok&&deleted.status!==404)throw new Error(`auth_delete_failed:${deleted.status}`)}
  const residue=(cleaned.body.residue||{}) as JsonObject;for(const count of Object.values(residue))if(Number(count)!==0)throw new Error('fixture_cleanup_residue')
  return{ok:true,action:'cleanup',marker,residue,auth_user_deleted:true}
}
Deno.serve(async(req:Request)=>{if(req.method!=='POST')return response(405,{ok:false,error:'method_not_allowed'});try{const verified=await claims(req);const body=await req.json().catch(()=>({})) as JsonObject;const action=text(body.action);const supplied=text(body.run_key);if(supplied&&supplied!==verified.runKey)throw new Error('run_key_claim_mismatch');if(action==='prepare')return response(201,await prepare(verified.runKey));const marker=text(body.marker);if(!/^SYNTH-CRM-E2E-[A-Za-z0-9-]+$/.test(marker))throw new Error('marker_invalid');if(action==='inspect')return response(200,await inspect(marker));if(action==='set_role')return response(200,await setRole(marker,text(body.role)));if(action==='cleanup')return response(200,await cleanup(marker));return response(400,{ok:false,error:'unknown_action'})}catch(error){const message=text((error as Error)?.message||'oidc_bootstrap_failed').slice(0,180);console.error('authenticated_e2e_bootstrap',message);return response(403,{ok:false,error:message})}})
