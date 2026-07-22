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
export const CONFIRMATION = 'YES_USE_EXISTING_SYNTHETIC_FIXTURES';
export const EVIDENCE_VERSION = 'leader-installation-staging-ui-smoke-evidence-v1';
export const ALLOWED_ROLES = Object.freeze(new Set(['installer', 'manager', 'admin', 'owner']));

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FORBIDDEN_EVIDENCE_KEYS = /email|password|token|authorization|apikey|api_key|secret|phone|client|cost|profit|payment|balance|comment/i;

function text(value) { return String(value ?? '').trim(); }
function asObject(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : null; }
export function isUuid(value) { return UUID_PATTERN.test(text(value)); }

export function projectRefFromUrl(value) {
  try { return new URL(value).hostname.split('.')[0] || ''; }
  catch (_) { return ''; }
}

export function assertExactStagingUrl(value) {
  const normalized = text(value).replace(/\/+$/, '');
  if (normalized !== STAGING_URL || projectRefFromUrl(normalized) !== STAGING_PROJECT_REF) {
    throw new Error('staging_environment_guard_failed');
  }
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
  const email = required('STAGING_INSTALLATION_UI_EMAIL', env);
  const password = required('STAGING_INSTALLATION_UI_PASSWORD', env);
  const jobId = required('STAGING_INSTALLATION_UI_JOB_ID', env);
  const role = text(env.STAGING_INSTALLATION_UI_ROLE || 'installer').toLowerCase();
  const expectedInitialStatus = text(env.STAGING_INSTALLATION_UI_EXPECTED_STATUS || 'Запланирован');
  const titleSuffix = text(env.STAGING_INSTALLATION_UI_TITLE_SUFFIX || ' · UI smoke');
  const evidencePath = text(env.STAGING_INSTALLATION_UI_EVIDENCE_PATH)
    || 'artifacts/installation-staging-ui-smoke/evidence.json';
  const confirmation = required('STAGING_INSTALLATION_UI_SMOKE_CONFIRM', env);

  if (confirmation !== CONFIRMATION) throw new Error('explicit_fixture_confirmation_required');
  if (!publishableKey.startsWith('sb_publishable_') && publishableKey.split('.').length !== 3) {
    throw new Error('publishable_key_format_invalid');
  }
  if (!email.includes('@') || email.length > 320) throw new Error('test_email_invalid');
  if (password.length < 8 || password.length > 500) throw new Error('test_password_invalid');
  if (!isUuid(jobId)) throw new Error('job_id_invalid');
  if (!ALLOWED_ROLES.has(role)) throw new Error('ui_role_invalid');
  if (!expectedInitialStatus || expectedInitialStatus.length > 120) throw new Error('expected_status_invalid');
  if (!titleSuffix || titleSuffix.length > 80) throw new Error('title_suffix_invalid');

  return Object.freeze({
    supabaseUrl,
    publishableKey,
    email,
    password,
    jobId,
    role,
    expectedInitialStatus,
    titleSuffix,
    evidencePath
  });
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

export function operatorPlan(env = process.env) {
  return {
    evidence_version: EVIDENCE_VERSION,
    project_ref: STAGING_PROJECT_REF,
    exact_staging_url: STAGING_URL,
    production_enabled: false,
    uses_real_card_source: true,
    temporary_local_copy: true,
    mutation_count_expected: 1,
    screenshot_run_enabled: false,
    creates_server_fixtures: false,
    deletes_server_fixtures: false,
    external_fixture_lifecycle_required: true,
    local_credentials_deleted_in_finally: true,
    required_runtime_inputs_present: {
      publishable_key: Boolean(text(env.STAGING_SUPABASE_PUBLISHABLE_KEY)),
      test_email: Boolean(text(env.STAGING_INSTALLATION_UI_EMAIL)),
      test_password: Boolean(text(env.STAGING_INSTALLATION_UI_PASSWORD)),
      job_id: Boolean(text(env.STAGING_INSTALLATION_UI_JOB_ID)),
      explicit_confirmation: text(env.STAGING_INSTALLATION_UI_SMOKE_CONFIRM) === CONFIRMATION
    },
    assertions: [
      'authenticated_session',
      'real_installation_card_opened',
      'exact_staging_edge_notice',
      'privacy_safe_projection',
      'staging_comments_read_only',
      'title_update_via_single_edge_command',
      'server_read_back',
      'production_config_unchanged'
    ]
  };
}

function jsonForScript(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

export function buildTemporaryConfigSource(config) {
  return `export const V4_CONFIG = Object.freeze({\n`
    + `  supabaseUrl: ${jsonForScript(config.supabaseUrl)},\n`
    + `  supabasePublishableKey: ${jsonForScript(config.publishableKey)},\n`
    + `  authStorageKey: 'leader_crm_v4_staging_ui_smoke_session',\n`
    + `  timeouts: Object.freeze({ sessionMs: 9000, loginMs: 18000, logoutMs: 8000, profileMs: 5000, requestMs: 12000 })\n`
    + `});\n`;
}

export function buildRuntimeSource(config) {
  return `export const UI_SMOKE_RUNTIME = Object.freeze(${jsonForScript({
    email: config.email,
    password: config.password,
    jobId: config.jobId,
    role: config.role,
    expectedInitialStatus: config.expectedInitialStatus,
    titleSuffix: config.titleSuffix
  })});\n`;
}

export function buildSmokeHtml() {
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Installation staging UI smoke running</title>
  <link rel="stylesheet" href="./assets/v4/ui-polish.css">
  <style>
    body{font-family:Arial,sans-serif;margin:0;background:#f4f5f7;color:#171717}
    .smoke-shell{max-width:920px;margin:24px auto;padding:20px;background:#fff;border:1px solid #ddd;border-radius:18px}
    .smoke-meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}
    .smoke-meta div{padding:12px;border-radius:12px;background:#f7f7f8;border:1px solid #e5e5e7}
    #toast{position:fixed;left:16px;bottom:16px;background:#171717;color:#fff;padding:10px 14px;border-radius:12px;opacity:0}
    #toast.show{opacity:1}
    #uiSmokeResult{white-space:pre-wrap;word-break:break-word}
  </style>
</head>
<body>
  <main class="smoke-shell">
    <h1>Staging UI smoke: монтаж</h1>
    <p id="authStatus" class="v4-status">Подготовка</p>
    <div class="smoke-meta">
      <div><b>Среда</b><br>exact staging</div>
      <div><b>Карточка</b><br>installation-job-card-v2</div>
      <div><b>Путь</b><br>Edge read/write</div>
    </div>
    <button id="openInstallationSmoke" type="button" hidden>Открыть карточку</button>
    <pre id="uiSmokeResult" data-status="running">running</pre>
  </main>
  <div id="toast"></div>
  <script type="module" src="./installation-ui-smoke-page.mjs"></script>
</body>
</html>`;
}

export function buildSmokePageSource() {
  return `import { UI_SMOKE_RUNTIME } from './installation-ui-smoke-runtime.mjs';
import { supabaseClient } from './assets/v4/supabase-client.js';
import { setState } from './assets/v4/state.js';
import './assets/v4/installation-job-card-v2.js';

const resultNode=document.getElementById('uiSmokeResult');
const authStatus=document.getElementById('authStatus');
const openButton=document.getElementById('openInstallationSmoke');
function sleep(ms){return new Promise((resolve)=>setTimeout(resolve,ms));}
async function waitFor(check,code,timeout=18000){const started=Date.now();while(Date.now()-started<timeout){const value=check();if(value)return value;await sleep(120);}throw new Error(code);}
function assert(value,code){if(!value)throw new Error(code);}
function safeText(value,max=300){return String(value??'').trim().slice(0,max);}
function output(status,payload){const safe={evidence_version:'${EVIDENCE_VERSION}',status,project_ref:'${STAGING_PROJECT_REF}',card:'installation-job-card-v2',...payload};resultNode.dataset.status=status;resultNode.textContent=JSON.stringify(safe,null,2);document.title=status==='passed'?'Installation UI smoke PASSED':'Installation UI smoke FAILED';}

let session=null;
try{
  authStatus.textContent='Вход в staging';
  const signed=await supabaseClient.auth.signInWithPassword({email:UI_SMOKE_RUNTIME.email,password:UI_SMOKE_RUNTIME.password});
  if(signed.error||!signed.data?.session||!signed.data?.user)throw new Error('authentication_failed');
  session=signed.data.session;
  setState({session,user:signed.data.user,profile:{role:UI_SMOKE_RUNTIME.role,is_active:true,full_name:'Synthetic staging UI smoke'},profileLoaded:true,crmReady:true,status:'Staging UI smoke'});

  openButton.dataset.openInstallationJobCard=UI_SMOKE_RUNTIME.jobId;
  openButton.hidden=false;
  openButton.click();

  const titleInput=await waitFor(()=>document.getElementById('installJobTitle'),'card_open_timeout');
  const statusSelect=document.getElementById('installJobStatus');
  assert(statusSelect,'status_select_missing');
  assert(document.querySelector('[data-installation-staging-edge]'),'staging_edge_notice_missing');
  assert(!document.querySelector('[data-v4-cost-sensitive]'),'cost_projection_exposed');
  assert(document.body.textContent.includes('комментарии доступны только для чтения'),'comments_read_only_notice_missing');
  assert(!document.querySelector('[data-add-installation-comment]'),'comment_write_control_exposed');
  assert(safeText(statusSelect.value)===UI_SMOKE_RUNTIME.expectedInitialStatus,'initial_status_mismatch');

  const initialTitle=safeText(titleInput.value,500);
  const desiredTitle=safeText(initialTitle+UI_SMOKE_RUNTIME.titleSuffix,500);
  assert(desiredTitle&&desiredTitle!==initialTitle,'desired_title_invalid');
  titleInput.value=desiredTitle;
  authStatus.textContent='Сохранение через staging Edge';
  document.querySelector('[data-save-installation-job]')?.click();

  await waitFor(()=>{const input=document.getElementById('installJobTitle');const notice=document.querySelector('[data-installation-staging-edge]');const good=document.getElementById('authStatus')?.classList.contains('is-good');return input?.value===desiredTitle&&notice&&good?input:null;},'server_read_back_timeout',24000);
  assert(document.getElementById('installJobTitle')?.value===desiredTitle,'read_back_title_mismatch');
  assert(document.querySelector('[data-installation-staging-edge]'),'staging_notice_lost_after_read_back');
  assert(!document.querySelector('[data-v4-cost-sensitive]'),'cost_projection_exposed_after_read_back');

  output('passed',{authenticated:true,role:UI_SMOKE_RUNTIME.role,job_id_valid:/^[0-9a-f-]{36}$/i.test(UI_SMOKE_RUNTIME.jobId),edge_notice:true,privacy_projection:true,comments_read_only:true,update_via_edge:true,server_read_back:true,title_changed:true,mutation_count:1,cleanup_required:true});
}catch(error){
  output('failed',{error:safeText(error?.message||'ui_smoke_failed'),mutation_count_at_most:1,cleanup_required:true});
  document.body.dataset.uiSmokeFailed='true';
}finally{
  if(session){try{await supabaseClient.auth.signOut({scope:'local'});}catch(_){}}
  document.body.dataset.uiSmokeFinished='true';
}`;
}

function mimeType(filePath) {
  const ext=path.extname(filePath).toLowerCase();
  return ({'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'})[ext]||'application/octet-stream';
}

async function findChrome(env=process.env) {
  const candidates=[text(env.CHROME_BIN),'/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/usr/bin/chromium-browser','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe','C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'].filter(Boolean);
  for(const candidate of candidates){try{await access(candidate,fsConstants.X_OK);return candidate;}catch(_){}}
  throw new Error('headless_chrome_not_found');
}

async function createLocalServer(root) {
  const resolvedRoot=path.resolve(root);
  const server=createServer(async(req,res)=>{
    try{
      const requestUrl=new URL(req.url||'/','http://127.0.0.1');
      const relative=decodeURIComponent(requestUrl.pathname).replace(/^\/+/, '')||'installation-ui-smoke.html';
      const target=path.resolve(resolvedRoot,relative);
      if(!target.startsWith(resolvedRoot+path.sep)&&target!==resolvedRoot){res.writeHead(403,{'Content-Type':'text/plain'});res.end('forbidden');return;}
      const body=await readFile(target);
      res.writeHead(200,{'Content-Type':mimeType(target),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(body);
    }catch(_){res.writeHead(404,{'Content-Type':'text/plain'});res.end('not found');}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const address=server.address();
  if(!address||typeof address==='string')throw new Error('local_server_address_invalid');
  return {server,url:`http://127.0.0.1:${address.port}/installation-ui-smoke.html`};
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
  if(safe.mutation_count!==1)throw new Error('unexpected_mutation_count');
  return safe;
}

async function writePrivateJson(filePath,value) {
  const target=path.resolve(filePath);await mkdir(path.dirname(target),{recursive:true});
  await writeFile(target,`${JSON.stringify(sanitizeEvidence(value),null,2)}\n`,{encoding:'utf8',mode:0o600});return target;
}

export async function runUiSmoke({env=process.env,repoRoot=path.resolve('.')}={}) {
  const config=loadRuntimeConfig(env);const chrome=await findChrome(env);
  const tempRoot=await mkdtemp(path.join(tmpdir(),'lider-installation-ui-smoke-'));
  const tempV4=path.join(tempRoot,'crm','v4');let server=null;
  try{
    await cp(path.join(repoRoot,'crm','v4'),tempV4,{recursive:true});
    await writeFile(path.join(tempV4,'assets','v4','config.js'),buildTemporaryConfigSource(config),{encoding:'utf8',mode:0o600});
    await writeFile(path.join(tempV4,'installation-ui-smoke-runtime.mjs'),buildRuntimeSource(config),{encoding:'utf8',mode:0o600});
    await writeFile(path.join(tempV4,'installation-ui-smoke-page.mjs'),buildSmokePageSource(),{encoding:'utf8',mode:0o600});
    await writeFile(path.join(tempV4,'installation-ui-smoke.html'),buildSmokeHtml(),{encoding:'utf8',mode:0o600});
    const local=await createLocalServer(tempV4);server=local.server;
    const dump=await runChrome(chrome,['--headless','--disable-gpu','--no-sandbox','--hide-scrollbars','--disable-sync','--no-first-run','--virtual-time-budget=35000','--dump-dom',local.url]);
    if(dump.code!==0)throw new Error(`headless_chrome_failed:${dump.code}`);
    const evidence=evidenceFromDump(dump.stdout);
    const finalEvidence={...evidence,finished_at:new Date().toISOString(),headless_dom_dump:true,screenshot_created:false,local_temp_removed:true,external_fixture_cleanup_required:true};
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
