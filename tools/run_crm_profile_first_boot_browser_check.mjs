#!/usr/bin/env node

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SCENARIOS = Object.freeze(['active', 'inactive', 'missing_profile', 'network_error', 'expired_session']);
const EVIDENCE_VERSION = 'crm-profile-first-browser-check-v1';

function text(value) { return String(value ?? '').trim(); }
function assert(value, code) { if (!value) throw new Error(code); }
function jsonForScript(value) { return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026'); }

function buildConfigSource() {
  return `export const V4_CONFIG = Object.freeze({\n`
    + `  authStorageKey: 'leader_profile_first_browser_check_session',\n`
    + `  timeouts: Object.freeze({ sessionMs: 1000, loginMs: 1000, logoutMs: 1000, profileMs: 1000, requestMs: 1000 })\n`
    + `});\n`;
}

function buildStateSource() {
  return `export const v4State = {session:null,user:null,profile:null,profileLoaded:false,crmReady:false,status:'',authBusy:false};\n`
    + `window.__PROFILE_STATE_LOG__=[];\n`
    + `export function setState(patch){Object.assign(v4State,patch||{});window.__PROFILE_STATE_LOG__.push({...v4State});}\n`
    + `export function resetAuthState(){Object.assign(v4State,{session:null,user:null,profile:null,profileLoaded:false,crmReady:false,status:'',authBusy:false});window.__PROFILE_STATE_LOG__.push({...v4State});}\n`;
}

function buildApiSource() {
  return `export async function timeout(promise){return await promise;}\n`
    + `export function isNetworkError(error){const value=String(error?.message||error||'').toLowerCase();return value.includes('failed to fetch')||value.includes('network')||value.includes('timeout')||value.includes('ожид');}\n`
    + `export function friendlyError(error){return error?.message||String(error||'Ошибка');}\n`;
}

function buildUiSource() {
  return `function node(id){return document.getElementById(id);}\n`
    + `window.__PROFILE_UI_LOG__={statuses:[],notices:[],toasts:[],bound:false};\n`
    + `export function bindAuthUi(){window.__PROFILE_UI_LOG__.bound=true;}\n`
    + `export function byId(id){return node(id);}\n`
    + `export function readCredentials(){return {email:'',password:''};}\n`
    + `export function renderProfile(profile){const target=node('profileValue');if(target)target.textContent=profile?JSON.stringify(profile):'';}\n`
    + `export function setAuthBusy(value){document.body.dataset.authBusy=value?'1':'0';}\n`
    + `export function setProfileNotice(value){const target=node('profileNotice');if(target){target.textContent=value||'';target.classList.toggle('hidden',!value);}window.__PROFILE_UI_LOG__.notices.push(String(value||''));}\n`
    + `export function setStatus(value,tone){const target=node('authStatus');if(target){target.textContent=value||'';target.dataset.tone=tone||'';}window.__PROFILE_UI_LOG__.statuses.push({value:String(value||''),tone:String(tone||'')});}\n`
    + `export function showLoggedIn(user){node('loginForm')?.classList.add('hidden');node('userPanel')?.classList.remove('hidden');const email=node('userEmail');if(email)email.textContent=user?.email||'';}\n`
    + `export function showLoggedOut(){node('loginForm')?.classList.remove('hidden');node('userPanel')?.classList.add('hidden');}\n`
    + `export function toast(value){window.__PROFILE_UI_LOG__.toasts.push(String(value||''));}\n`;
}

function buildSupabaseSource() {
  return `const scenario=new URL(window.location.href).searchParams.get('scenario')||'active';\n`
    + `const user={id:'11111111-1111-4111-8111-111111111111',email:'browser-check@example.invalid'};\n`
    + `const active={user_id:user.id,email:user.email,role:'manager',is_active:true,full_name:'Browser Check'};\n`
    + `const inactive={...active,is_active:false};\n`
    + `window.__PROFILE_MOCK_METRICS__={getSession:0,profileReads:0,ensureProfile:0,signOut:0,fromTables:[]};\n`
    + `function query(){return {select(){return this;},eq(){return this;},async maybeSingle(){window.__PROFILE_MOCK_METRICS__.profileReads+=1;if(scenario==='network_error')throw new Error('Failed to fetch profile');if(scenario==='missing_profile')return {data:null,error:null};if(scenario==='inactive')return {data:inactive,error:null};return {data:active,error:null};}};}\n`
    + `export const supabaseClient={\n`
    + `  auth:{\n`
    + `    async getSession(){window.__PROFILE_MOCK_METRICS__.getSession+=1;if(scenario==='expired_session')return {data:{session:null},error:{code:'refresh_token_not_found',message:'Invalid Refresh Token'}};return {data:{session:{user,access_token:'synthetic'}},error:null};},\n`
    + `    async signOut(){window.__PROFILE_MOCK_METRICS__.signOut+=1;return {error:null};},\n`
    + `    async signInWithPassword(){return {data:{session:{user},user},error:null};}\n`
    + `  },\n`
    + `  from(table){window.__PROFILE_MOCK_METRICS__.fromTables.push(table);return query();}\n`
    + `};\n`;
}

function buildFunctionsClientSource() {
  return `export async function invokeLeaderFunction(name,body){window.__PROFILE_MOCK_METRICS__.ensureProfile+=1;const userId='11111111-1111-4111-8111-111111111111';return {profile:{user_id:userId,email:'browser-check@example.invalid',role:'manager',is_active:false,full_name:'Pending Browser Check'}};}\n`;
}

function buildPageSource() {
  return `import {v4State} from './assets/v4/state.js';\n`
    + `const scenario=new URL(window.location.href).searchParams.get('scenario')||'active';\n`
    + `const resultNode=document.getElementById('profileBootResult');\n`
    + `let readyEvents=0;document.addEventListener('leader-v4:crm-ready',()=>{readyEvents+=1;});\n`
    + `async function run(){\n`
    + `if(scenario==='expired_session')localStorage.setItem('leader_profile_first_browser_check_session','stale');\n`
    + `function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}\n`
    + `async function waitFor(check,code,timeoutMs=5000){const started=Date.now();while(Date.now()-started<timeoutMs){if(check())return;await sleep(25);}throw new Error(code);}\n`
    + `function assert(value,code){if(!value)throw new Error(code);}\n`
    + `function output(status,payload){resultNode.dataset.status=status;resultNode.textContent=JSON.stringify({evidence_version:'${EVIDENCE_VERSION}',scenario,status,...payload},null,2);document.title=status==='passed'?'PROFILE FIRST PASSED':'PROFILE FIRST FAILED';}\n`
    + `try{\n`
    + `  const authModule=await import('./assets/v4/auth.js');\n`
    + `  authModule.bootAuth();\n`
    + `  const status=()=>document.getElementById('authStatus')?.textContent||'';\n`
    + `  if(scenario==='active')await waitFor(()=>readyEvents===1,'active_ready_timeout');\n`
    + `  if(scenario==='inactive'||scenario==='missing_profile')await waitFor(()=>status().includes('Доступ ожидает активации'),'pending_status_timeout');\n`
    + `  if(scenario==='network_error')await waitFor(()=>status().includes('Профиль не проверен'),'network_status_timeout');\n`
    + `  if(scenario==='expired_session')await waitFor(()=>status().includes('Сессия устарела'),'expired_status_timeout');\n`
    + `  const workspaceHidden=document.getElementById('crmWorkspace').classList.contains('hidden');\n`
    + `  const loginHidden=document.getElementById('loginForm').classList.contains('hidden');\n`
    + `  const userPanelHidden=document.getElementById('userPanel').classList.contains('hidden');\n`
    + `  const metrics=window.__PROFILE_MOCK_METRICS__;\n`
    + `  if(scenario==='active'){assert(v4State.crmReady===true,'active_crm_not_ready');assert(v4State.profileLoaded===true,'active_profile_not_loaded');assert(workspaceHidden===false,'active_workspace_hidden');assert(readyEvents===1,'active_ready_event_count');assert(loginHidden===true&&userPanelHidden===false,'active_login_state_invalid');}\n`
    + `  if(scenario==='inactive'){assert(v4State.crmReady===false,'inactive_crm_ready');assert(v4State.profileLoaded===true,'inactive_profile_not_loaded');assert(workspaceHidden===true,'inactive_workspace_visible');assert(readyEvents===0,'inactive_ready_event');assert(userPanelHidden===false,'inactive_logout_path_missing');assert(metrics.profileReads===1,'inactive_profile_read_count');}\n`
    + `  if(scenario==='missing_profile'){assert(v4State.crmReady===false,'missing_crm_ready');assert(v4State.profileLoaded===true,'missing_profile_state_not_loaded');assert(workspaceHidden===true,'missing_workspace_visible');assert(readyEvents===0,'missing_ready_event');assert(metrics.ensureProfile===1,'missing_ensure_profile_not_called');assert(userPanelHidden===false,'missing_logout_path_missing');}\n`
    + `  if(scenario==='network_error'){assert(v4State.crmReady===false,'network_crm_ready');assert(v4State.profileLoaded===false,'network_profile_marked_loaded');assert(workspaceHidden===true,'network_workspace_visible');assert(readyEvents===0,'network_ready_event');assert(userPanelHidden===false,'network_logout_path_missing');}\n`
    + `  if(scenario==='expired_session'){assert(v4State.crmReady===false,'expired_crm_ready');assert(v4State.user===null,'expired_user_not_cleared');assert(workspaceHidden===true,'expired_workspace_visible');assert(readyEvents===0,'expired_ready_event');assert(loginHidden===false&&userPanelHidden===true,'expired_login_not_restored');assert(metrics.signOut===1,'expired_local_signout_missing');assert(localStorage.getItem('leader_profile_first_browser_check_session')===null,'expired_storage_not_cleared');}\n`
    + `  output('passed',{crm_ready:v4State.crmReady,profile_loaded:v4State.profileLoaded,workspace_hidden:workspaceHidden,ready_events:readyEvents,login_hidden:loginHidden,user_panel_hidden:userPanelHidden,get_session_calls:metrics.getSession,profile_reads:metrics.profileReads,ensure_profile_calls:metrics.ensureProfile,signout_calls:metrics.signOut});\n`
    + `}catch(error){output('failed',{error:String(error?.message||error||'profile_first_browser_failed'),crm_ready:v4State.crmReady,profile_loaded:v4State.profileLoaded,ready_events:readyEvents});document.body.dataset.profileFirstFailed='true';}\n`
    + `document.body.dataset.profileFirstFinished='true';\n`
    + `}\n`
    + `run();\n`;
}

function buildHtml() {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Profile first running</title><style>.hidden{display:none!important}body{font-family:Arial,sans-serif}#profileBootResult{white-space:pre-wrap}</style></head><body><div id="authStatus">Подготовка</div><form id="loginForm"><input></form><div id="userPanel" class="hidden"><span id="userEmail"></span><button id="logoutBtn">Выйти</button></div><div id="profileNotice" class="hidden"></div><div id="profileValue"></div><main id="crmWorkspace" class="hidden">CRM WORKSPACE</main><pre id="profileBootResult" data-status="running">running</pre><script type="module" src="./profile-first-page.mjs"></script></body></html>`;
}

function mimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8' })[ext] || 'application/octet-stream';
}

async function findChrome() {
  const candidates = [process.env.CHROME_BIN, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
  for (const candidate of candidates) { try { await access(candidate, fsConstants.X_OK); return candidate; } catch (_) {} }
  throw new Error('headless_chrome_not_found');
}

async function createLocalServer(root) {
  const resolvedRoot = path.resolve(root);
  const server = createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url || '/', 'http://127.0.0.1');
      const relative = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, '') || 'profile-first.html';
      const target = path.resolve(resolvedRoot, relative);
      if (!target.startsWith(`${resolvedRoot}${path.sep}`) && target !== resolvedRoot) { res.writeHead(403); res.end('forbidden'); return; }
      const body = await readFile(target);
      res.writeHead(200, { 'Content-Type': mimeType(target), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(body);
    } catch (_) { res.writeHead(404); res.end('not found'); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('local_server_address_invalid');
  return { server, baseUrl: `http://127.0.0.1:${address.port}/profile-first.html` };
}

function runChrome(chrome, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(chrome, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', code => resolve({ code, stdout, stderr }));
  });
}

function decodeHtml(value) {
  return value.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

function evidenceFromDump(html) {
  const match = String(html).match(/<pre[^>]+id="profileBootResult"[^>]*>([\s\S]*?)<\/pre>/i);
  if (!match) throw new Error('profile_first_result_missing');
  const evidence = JSON.parse(decodeHtml(match[1]));
  if (evidence.status !== 'passed') throw new Error(`profile_first_failed:${evidence.scenario}:${evidence.error || 'unknown'}`);
  return evidence;
}

export async function runProfileFirstBrowserCheck({ repoRoot = path.resolve('.') } = {}) {
  const chrome = await findChrome();
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'lider-profile-first-browser-'));
  const assets = path.join(tempRoot, 'assets', 'v4');
  let server = null;
  try {
    await mkdir(assets, { recursive: true });
    const authSourcePath = path.join(repoRoot, 'crm', 'v4', 'assets', 'v4', 'auth.js');
    const authSource = await readFile(authSourcePath, 'utf8');
    const autoBoot = "document.addEventListener('DOMContentLoaded', bootAuth);";
    if (!authSource.includes(autoBoot)) throw new Error('auth_auto_boot_marker_missing');
    await writeFile(path.join(assets, 'auth.js'), authSource.replace(autoBoot, '// Browser check invokes bootAuth explicitly.'), 'utf8');
    await writeFile(path.join(assets, 'config.js'), buildConfigSource(), 'utf8');
    await writeFile(path.join(assets, 'state.js'), buildStateSource(), 'utf8');
    await writeFile(path.join(assets, 'api.js'), buildApiSource(), 'utf8');
    await writeFile(path.join(assets, 'ui.js'), buildUiSource(), 'utf8');
    await writeFile(path.join(assets, 'supabase-client.js'), buildSupabaseSource(), 'utf8');
    await writeFile(path.join(assets, 'functions-client.js'), buildFunctionsClientSource(), 'utf8');
    await writeFile(path.join(assets, 'user-admin-v1.js'), 'export {};\n', 'utf8');
    await writeFile(path.join(tempRoot, 'profile-first-page.mjs'), buildPageSource(), 'utf8');
    await writeFile(path.join(tempRoot, 'profile-first.html'), buildHtml(), 'utf8');
    const local = await createLocalServer(tempRoot); server = local.server;
    const evidence = [];
    for (const scenario of SCENARIOS) {
      const profileDir = await mkdtemp(path.join(tmpdir(), `lider-profile-first-${scenario}-`));
      try {
        const url = `${local.baseUrl}?scenario=${encodeURIComponent(scenario)}`;
        const dump = await runChrome(chrome, ['--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--disable-sync', '--no-first-run', `--user-data-dir=${profileDir}`, '--virtual-time-budget=7000', '--dump-dom', url]);
        if (dump.code !== 0) throw new Error(`headless_chrome_failed:${scenario}:${dump.code}:${text(dump.stderr).slice(0, 160)}`);
        evidence.push(evidenceFromDump(dump.stdout));
      } finally { await rm(profileDir, { recursive: true, force: true }); }
    }
    assert(evidence.length === SCENARIOS.length, 'scenario_count_invalid');
    assert(evidence.every(item => item.workspace_hidden === (item.scenario !== 'active')), 'workspace_gate_invalid');
    assert(evidence.find(item => item.scenario === 'active')?.ready_events === 1, 'active_ready_event_invalid');
    assert(evidence.filter(item => item.scenario !== 'active').every(item => item.ready_events === 0), 'blocked_ready_event_detected');
    return { evidence_version: EVIDENCE_VERSION, scenarios: evidence, no_external_network: true, no_real_users: true, no_database_writes: true };
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function main() {
  const result = await runProfileFirstBrowserCheck();
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) main().catch(error => { console.error(JSON.stringify({ ok: false, error: text(error?.message).slice(0, 300) })); process.exitCode = 1; });
