#!/usr/bin/env node

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const STAGING_PROJECT_REF = 'otulfnouybahfnsycxqn';
export const STAGING_URL = `https://${STAGING_PROJECT_REF}.supabase.co`;
export const PRODUCTION_PROJECT_REF = 'ofewxuqfjhamgerwzull';
export const CONFIRMATION = 'YES_CREATE_AND_DELETE_SYNTHETIC_LEAD_FIXTURE';
export const EVIDENCE_VERSION = 'leader-lead-workflow-staging-ui-smoke-evidence-v1';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FORBIDDEN_EVIDENCE_KEYS = /email|password|token|authorization|apikey|api_key|secret|phone|client|message|payload|name/i;

function text(value) { return String(value ?? '').trim(); }
function asObject(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : null; }
export function isUuid(value) { return UUID_PATTERN.test(text(value)); }

export function assertExactStagingUrl(value) {
  const normalized = text(value).replace(/\/+$/, '');
  if (normalized !== STAGING_URL) throw new Error('staging_environment_guard_failed');
  if (normalized.includes(PRODUCTION_PROJECT_REF)) throw new Error('production_endpoint_forbidden');
  return normalized;
}

function required(name, env) {
  const value = text(env[name]);
  if (!value) throw new Error(`missing_environment_variable:${name}`);
  return value;
}

export function loadRuntimeConfig(env = process.env) {
  const supabaseUrl = assertExactStagingUrl(required('STAGING_SUPABASE_URL', env));
  const publishableKey = required('STAGING_SUPABASE_PUBLISHABLE_KEY', env);
  const email = required('STAGING_LEAD_UI_EMAIL', env);
  const password = required('STAGING_LEAD_UI_PASSWORD', env);
  const leadId = required('STAGING_LEAD_UI_LEAD_ID', env);
  const role = text(env.STAGING_LEAD_UI_ROLE || 'manager').toLowerCase();
  const expectedInitialStatus = text(env.STAGING_LEAD_UI_EXPECTED_STATUS || 'Новая');
  const evidencePath = text(env.STAGING_LEAD_UI_EVIDENCE_PATH) || 'artifacts/lead-workflow-staging-ui-smoke/evidence.json';
  if (required('STAGING_LEAD_UI_SMOKE_CONFIRM', env) !== CONFIRMATION) throw new Error('explicit_fixture_confirmation_required');
  if (!publishableKey.startsWith('sb_publishable_') && publishableKey.split('.').length !== 3) throw new Error('publishable_key_format_invalid');
  if (!email.includes('@') || password.length < 8) throw new Error('credentials_invalid');
  if (!isUuid(leadId)) throw new Error('lead_id_invalid');
  if (!['manager', 'admin', 'owner'].includes(role)) throw new Error('role_invalid');
  return Object.freeze({ supabaseUrl, publishableKey, email, password, leadId, role, expectedInitialStatus, evidencePath });
}

export function operatorPlan(env = process.env) {
  return {
    evidence_version: EVIDENCE_VERSION,
    project_ref: STAGING_PROJECT_REF,
    production_enabled: false,
    uses_real_lead_card_source: true,
    uses_real_staging_edge_transport: true,
    successful_mutations_expected: 3,
    rejected_mutations_expected: 1,
    server_events_expected: 3,
    ephemeral_auth_user: true,
    cleanup_required: true,
    required_runtime_inputs_present: {
      publishable_key: Boolean(text(env.STAGING_SUPABASE_PUBLISHABLE_KEY)),
      test_email: Boolean(text(env.STAGING_LEAD_UI_EMAIL)),
      test_password: Boolean(text(env.STAGING_LEAD_UI_PASSWORD)),
      lead_id: Boolean(text(env.STAGING_LEAD_UI_LEAD_ID)),
      explicit_confirmation: text(env.STAGING_LEAD_UI_SMOKE_CONFIRM) === CONFIRMATION,
    },
  };
}

export function sanitizeEvidence(value) {
  if (Array.isArray(value)) return value.map(sanitizeEvidence);
  if (!asObject(value)) return value;
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_EVIDENCE_KEYS.test(key)) continue;
    output[key] = sanitizeEvidence(item);
  }
  return output;
}

function jsonForScript(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

export function buildTemporaryConfigSource(config) {
  return `export const V4_CONFIG = Object.freeze({\n`
    + `  supabaseUrl: ${jsonForScript(config.supabaseUrl)},\n`
    + `  supabasePublishableKey: ${jsonForScript(config.publishableKey)},\n`
    + `  authStorageKey: 'leader_crm_v4_staging_lead_ui_smoke_session',\n`
    + `  timeouts: Object.freeze({ sessionMs: 9000, loginMs: 18000, logoutMs: 8000, profileMs: 5000, requestMs: 16000 })\n`
    + `});\n`;
}

export function buildRuntimeSource(config) {
  return `export const UI_SMOKE_RUNTIME = Object.freeze(${jsonForScript({
    email: config.email,
    password: config.password,
    leadId: config.leadId,
    role: config.role,
    expectedInitialStatus: config.expectedInitialStatus,
  })});\n`;
}

export function buildSmokeHtml() {
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Lead workflow staging UI smoke running</title>
  <style>
    body{font-family:Arial,sans-serif;margin:0;background:#f4f5f7;color:#171717}.hidden{display:none!important}
    .smoke-shell{max-width:1100px;margin:18px auto;padding:18px;background:#fff;border:1px solid #ddd;border-radius:16px}
    button{padding:8px 10px;margin:3px}.v4-subcard{padding:12px;margin:10px 0;border:1px solid #ddd;border-radius:12px}
    .v4-detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.v4-status.is-good{color:#176b32}.v4-status.is-error{color:#a00}
    #toast{position:fixed;left:16px;bottom:16px;background:#171717;color:#fff;padding:10px 14px;border-radius:12px;opacity:0}#toast.show{opacity:1}
    #uiSmokeResult{white-space:pre-wrap;word-break:break-word}
  </style>
</head>
<body>
  <main class="smoke-shell">
    <h1>Staging UI smoke: рабочий маршрут заявки</h1>
    <p id="authStatus" class="v4-status">Подготовка</p>
    <section id="leadsSection"></section>
    <section id="leadCardSection" class="hidden"><div id="leadCardContent"></div></section>
    <pre id="uiSmokeResult" data-status="running">running</pre>
  </main>
  <div id="toast"></div>
  <script>window.v4SetTab=()=>{};</script>
  <script type="module" src="./lead-workflow-ui-smoke-page.mjs"></script>
</body>
</html>`;
}

export function buildSmokePageSource() {
  return `import { UI_SMOKE_RUNTIME } from './lead-workflow-ui-smoke-runtime.mjs';
import { supabaseClient } from './assets/v4/supabase-client.js';
import { v4State, setState } from './assets/v4/state.js';
import './assets/v4/lead-card.js';
import './assets/v4/lead-workflow-staging-ui-v1.js';

const resultNode=document.getElementById('uiSmokeResult');
const authStatus=document.getElementById('authStatus');
function sleep(ms){return new Promise((resolve)=>setTimeout(resolve,ms));}
async function waitFor(check,code,timeout=24000){const started=Date.now();while(Date.now()-started<timeout){const value=check();if(value)return value;await sleep(120);}throw new Error(code);}
function assert(value,code){if(!value)throw new Error(code);}
function safeText(value,max=240){return String(value??'').trim().slice(0,max);}
function output(status,payload){const safe={evidence_version:'${EVIDENCE_VERSION}',status,project_ref:'${STAGING_PROJECT_REF}',card:'lead-card-v4',...payload};resultNode.dataset.status=status;resultNode.textContent=JSON.stringify(safe,null,2);document.title=status==='passed'?'Lead workflow UI smoke PASSED':'Lead workflow UI smoke FAILED';}
async function eventCount(){const response=await supabaseClient.from('leader_lead_events').select('id',{count:'exact',head:true}).eq('lead_id',UI_SMOKE_RUNTIME.leadId);if(response.error)throw response.error;return Number(response.count||0);}
async function serverLead(){const response=await supabaseClient.from('leader_leads').select('id,status,assigned_to,next_contact_at,updated_at').eq('id',UI_SMOKE_RUNTIME.leadId).single();if(response.error)throw response.error;return response.data;}
async function waitState(check,code){return waitFor(()=>check(v4State.currentLead)?v4State.currentLead:null,code,26000);}

let session=null;let workflowEvents=0;
document.addEventListener('leader-v4:lead-workflow-updated',()=>{workflowEvents+=1;});
try{
  if(document.readyState==='loading')await new Promise((resolve)=>document.addEventListener('DOMContentLoaded',resolve,{once:true}));
  authStatus.textContent='Вход в staging';
  const signed=await supabaseClient.auth.signInWithPassword({email:UI_SMOKE_RUNTIME.email,password:UI_SMOKE_RUNTIME.password});
  if(signed.error||!signed.data?.session||!signed.data?.user)throw new Error('authentication_failed');
  session=signed.data.session;
  setState({session,user:signed.data.user,profile:{role:UI_SMOKE_RUNTIME.role,is_active:true,full_name:'Synthetic staging UI smoke'},profileLoaded:true,crmReady:true,status:'Staging UI smoke',route:{leadId:UI_SMOKE_RUNTIME.leadId}});
  document.dispatchEvent(new CustomEvent('leader-v4:crm-ready'));

  await waitFor(()=>document.querySelector('#leadCardContent .v4-lead-card-view'),'lead_card_open_timeout');
  assert(safeText(v4State.currentLead?.status)===UI_SMOKE_RUNTIME.expectedInitialStatus,'initial_status_mismatch');
  assert(!v4State.currentLead?.assigned_to,'initial_assignee_not_empty');
  assert(document.querySelector('[data-lead-primary-action="assign_self"]'),'assign_self_control_missing');
  const initialEvents=await eventCount();
  assert(initialEvents===0,'initial_events_not_zero');

  document.querySelector('[data-lead-primary-action="assign_self"]').click();
  await waitState((lead)=>lead?.assigned_to===signed.data.user.id&&lead?.status==='В работе','assign_self_read_back_timeout');
  await waitFor(()=>workflowEvents===1,'assign_self_workflow_event_missing');
  const afterAssign=await serverLead();
  assert(afterAssign.assigned_to===signed.data.user.id&&afterAssign.status==='В работе','assign_self_server_mismatch');
  assert((await eventCount())===1,'assign_self_event_count_mismatch');

  const waitButton=()=>document.querySelector('[data-lead-status="Ждём ответ"]');
  await waitFor(waitButton,'waiting_status_control_missing');
  waitButton().click();
  await waitFor(()=>safeText(authStatus.textContent).includes('будущую дату следующего контакта'),'missing_next_contact_rejection_timeout');
  assert(workflowEvents===1,'rejected_command_emitted_success_event');
  assert((await eventCount())===1,'rejected_command_created_event');
  assert((await serverLead()).status==='В работе','rejected_command_changed_status');

  const contactButton=()=>document.querySelector('[data-next-contact="tomorrow"]');
  await waitFor(contactButton,'next_contact_control_missing');
  contactButton().click();
  await waitState((lead)=>Boolean(lead?.next_contact_at)&&Date.parse(lead.next_contact_at)>Date.now(),'next_contact_read_back_timeout');
  await waitFor(()=>workflowEvents===2,'next_contact_workflow_event_missing');
  assert((await eventCount())===2,'next_contact_event_count_mismatch');

  await waitFor(waitButton,'waiting_status_control_missing_after_contact');
  waitButton().click();
  await waitState((lead)=>lead?.status==='Ждём ответ','waiting_status_read_back_timeout');
  await waitFor(()=>workflowEvents===3,'waiting_status_workflow_event_missing');
  const finalLead=await serverLead();
  const finalEvents=await eventCount();
  assert(finalLead.status==='Ждём ответ','final_status_mismatch');
  assert(finalLead.assigned_to===signed.data.user.id,'final_assignee_mismatch');
  assert(Date.parse(finalLead.next_contact_at)>Date.now(),'final_next_contact_invalid');
  assert(finalEvents===3,'duplicate_or_missing_server_events');

  output('passed',{authenticated:true,exact_staging:true,direct_read_contract:true,assign_self_via_edge:true,missing_next_contact_rejected:true,rejection_event_delta_zero:true,next_contact_via_edge:true,waiting_status_via_edge:true,server_read_back:true,workflow_success_events:workflowEvents,server_event_count:finalEvents,successful_mutation_count:3,rejected_mutation_count:1,duplicate_events:false,cleanup_required:true});
}catch(error){
  output('failed',{error:safeText(error?.message||'ui_smoke_failed'),workflow_success_events:workflowEvents,cleanup_required:true});
  document.body.dataset.uiSmokeFailed='true';
}finally{
  if(session){try{await supabaseClient.auth.signOut();}catch(_){}}
  document.body.dataset.uiSmokeFinished='true';
}`;
}

function mimeType(filePath) {
  const ext=path.extname(filePath).toLowerCase();
  return ({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8'})[ext]||'application/octet-stream';
}

async function findChrome(env=process.env) {
  const candidates=[text(env.CHROME_BIN),'/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser'].filter(Boolean);
  for(const candidate of candidates){try{await access(candidate,fsConstants.X_OK);return candidate;}catch(_){}}
  throw new Error('headless_chrome_not_found');
}

async function createLocalServer(root) {
  const resolvedRoot=path.resolve(root);
  const server=createServer(async(req,res)=>{
    try{
      const requestUrl=new URL(req.url||'/','http://127.0.0.1');
      const relative=decodeURIComponent(requestUrl.pathname).replace(/^\/+/, '')||'lead-workflow-ui-smoke.html';
      const target=path.resolve(resolvedRoot,relative);
      if(!target.startsWith(resolvedRoot+path.sep)&&target!==resolvedRoot){res.writeHead(403);res.end('forbidden');return;}
      const body=await readFile(target);
      res.writeHead(200,{'Content-Type':mimeType(target),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(body);
    }catch(_){res.writeHead(404);res.end('not found');}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const address=server.address();
  if(!address||typeof address==='string')throw new Error('local_server_address_invalid');
  return {server,url:`http://127.0.0.1:${address.port}/lead-workflow-ui-smoke.html`};
}

function runChrome(chrome,args) {
  return new Promise((resolve,reject)=>{
    const child=spawn(chrome,args,{stdio:['ignore','pipe','pipe']});let stdout='';let stderr='';
    child.stdout.on('data',(chunk)=>{stdout+=chunk;});child.stderr.on('data',(chunk)=>{stderr+=chunk;});
    child.once('error',reject);child.once('close',(code)=>resolve({code,stdout,stderr}));
  });
}

function evidenceFromDump(html) {
  const match=String(html).match(/<pre[^>]+id="uiSmokeResult"[^>]*>([\s\S]*?)<\/pre>/i);
  if(!match)throw new Error('ui_smoke_result_missing');
  const decoded=match[1].replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
  const safe=sanitizeEvidence(JSON.parse(decoded));
  if(safe.status!=='passed')throw new Error(`ui_smoke_failed:${safe.error||'unknown'}`);
  if(safe.successful_mutation_count!==3||safe.rejected_mutation_count!==1||safe.server_event_count!==3)throw new Error('workflow_counts_invalid');
  return safe;
}

async function writePrivateJson(filePath,value) {
  const target=path.resolve(filePath);await mkdir(path.dirname(target),{recursive:true});
  await writeFile(target,`${JSON.stringify(sanitizeEvidence(value),null,2)}\n`,{encoding:'utf8',mode:0o600});return target;
}

export async function runUiSmoke({env=process.env,repoRoot=path.resolve('.')}={}) {
  const config=loadRuntimeConfig(env);const chrome=await findChrome(env);
  const tempRoot=await mkdtemp(path.join(tmpdir(),'lider-lead-workflow-ui-smoke-'));
  const tempV4=path.join(tempRoot,'crm','v4');let server=null;
  try{
    await cp(path.join(repoRoot,'crm','v4'),tempV4,{recursive:true});
    await writeFile(path.join(tempV4,'assets','v4','config.js'),buildTemporaryConfigSource(config),{encoding:'utf8',mode:0o600});
    await writeFile(path.join(tempV4,'lead-workflow-ui-smoke-runtime.mjs'),buildRuntimeSource(config),{encoding:'utf8',mode:0o600});
    await writeFile(path.join(tempV4,'lead-workflow-ui-smoke-page.mjs'),buildSmokePageSource(),{encoding:'utf8',mode:0o600});
    await writeFile(path.join(tempV4,'lead-workflow-ui-smoke.html'),buildSmokeHtml(),{encoding:'utf8',mode:0o600});
    const local=await createLocalServer(tempV4);server=local.server;
    const dump=await runChrome(chrome,['--headless','--disable-gpu','--no-sandbox','--hide-scrollbars','--disable-sync','--no-first-run','--virtual-time-budget=55000','--dump-dom',local.url]);
    if(dump.code!==0)throw new Error(`headless_chrome_failed:${dump.code}:${text(dump.stderr).slice(0,200)}`);
    const evidence=evidenceFromDump(dump.stdout);
    const finalEvidence={...evidence,finished_at:new Date().toISOString(),headless_dom_dump:true,local_temp_removed:true,external_fixture_cleanup_required:true};
    const evidenceTarget=await writePrivateJson(config.evidencePath,finalEvidence);
    return {evidence:finalEvidence,evidenceTarget};
  }finally{
    if(server)await new Promise((resolve)=>server.close(resolve));
    await rm(tempRoot,{recursive:true,force:true});
  }
}

function argumentValue(prefix){const match=process.argv.find((arg)=>arg.startsWith(`${prefix}=`));return match?match.slice(prefix.length+1):'';}
async function main(){
  const mode=argumentValue('--mode')||'plan';
  if(mode==='plan'){console.log(JSON.stringify(operatorPlan(),null,2));return;}
  if(mode!=='run')throw new Error('unsupported_mode');
  const result=await runUiSmoke();
  console.log(JSON.stringify({ok:true,evidence_version:EVIDENCE_VERSION,project_ref:STAGING_PROJECT_REF,evidence_path:result.evidenceTarget,external_fixture_cleanup_required:true},null,2));
}

const invokedDirectly=process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href;
if(invokedDirectly){main().catch((error)=>{console.error(JSON.stringify({ok:false,project_ref:STAGING_PROJECT_REF,error:text(error?.message).slice(0,300),external_fixture_cleanup_required:true}));process.exitCode=1;});}
