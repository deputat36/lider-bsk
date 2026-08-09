#!/usr/bin/env node

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { access, cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const EVIDENCE_VERSION = 'crm-lazy-tab-browser-check-v1';
const VIEWPORTS = Object.freeze([
  { name: 'desktop', width: 1366, height: 900, full: true },
  { name: 'mobile-360', width: 360, height: 900, full: false },
  { name: 'mobile-390', width: 390, height: 900, full: false },
  { name: 'mobile-430', width: 430, height: 900, full: false }
]);

function text(value) { return String(value ?? '').trim(); }
function assert(value, code) { if (!value) throw new Error(code); }

function mockSupabaseSource() {
  return `const user={id:'11111111-1111-4111-8111-111111111111',email:'lazy-browser@example.invalid'};
const profile={user_id:user.id,email:user.email,role:'owner',is_active:true,full_name:'Lazy Browser Check'};
window.__CRM_BROWSER_MOCK__={reads:[],mutations:[],functionCalls:[]};
const pause=()=>new Promise(resolve=>setTimeout(resolve,55));
class Query{
  constructor(table){this.table=table;this.singleMode=false;this.head=false;}
  select(_columns,options={}){this.head=options?.head===true;return this;}
  eq(){return this;} neq(){return this;} gt(){return this;} gte(){return this;} lt(){return this;} lte(){return this;}
  in(){return this;} is(){return this;} not(){return this;} or(){return this;} contains(){return this;}
  order(){return this;} limit(){return this;} range(){return this;} match(){return this;} abortSignal(){return this;}
  insert(){window.__CRM_BROWSER_MOCK__.mutations.push({table:this.table,method:'insert'});return this;}
  update(){window.__CRM_BROWSER_MOCK__.mutations.push({table:this.table,method:'update'});return this;}
  delete(){window.__CRM_BROWSER_MOCK__.mutations.push({table:this.table,method:'delete'});return this;}
  upsert(){window.__CRM_BROWSER_MOCK__.mutations.push({table:this.table,method:'upsert'});return this;}
  async result(single=false){await pause();window.__CRM_BROWSER_MOCK__.reads.push(this.table);if(single&&this.table==='leader_user_profiles')return {data:profile,error:null,count:1};return {data:single?null:[],error:null,count:0};}
  maybeSingle(){return this.result(true);} single(){return this.result(true);}
  then(resolve,reject){return this.result(false).then(resolve,reject);}
}
export const supabaseClient={
  auth:{
    async getSession(){return {data:{session:{user,access_token:'synthetic-browser-token'}},error:null};},
    async signInWithPassword(){return {data:{session:{user,access_token:'synthetic-browser-token'},user},error:null};},
    async signOut(){return {error:null};}
  },
  from(table){return new Query(String(table||''));},
  async rpc(name){window.__CRM_BROWSER_MOCK__.reads.push('rpc:'+String(name||''));await pause();return {data:[],error:null};}
};
`;
}

function mockFunctionsSource() {
  return `export async function invokeLeaderFunction(name,body){
window.__CRM_BROWSER_MOCK__?.functionCalls.push({name:String(name||''),action:String(body?.action||'')});
await new Promise(resolve=>setTimeout(resolve,55));
return {data:[],items:[],rows:[],orders:[],jobs:[],events:[],profiles:[],invites:[],profile:null};
}
`;
}

function instrumentationSource() {
  return `<script>
window.__CRM_BROWSER_ERRORS__=[];
window.__CRM_BROWSER_WARNINGS__=[];
window.addEventListener('error',event=>window.__CRM_BROWSER_ERRORS__.push({type:'error',message:String(event.message||'error')}));
window.addEventListener('unhandledrejection',event=>window.__CRM_BROWSER_ERRORS__.push({type:'unhandledrejection',message:String(event.reason?.message||event.reason||'rejection')}));
const originalError=console.error.bind(console);console.error=(...args)=>{window.__CRM_BROWSER_ERRORS__.push({type:'console.error',message:args.map(String).join(' ').slice(0,240)});originalError(...args);};
const originalWarn=console.warn.bind(console);console.warn=(...args)=>{window.__CRM_BROWSER_WARNINGS__.push({type:'console.warn',message:args.map(value=>value?.stack||value?.message||String(value)).join(' ').slice(0,1400)});originalWarn(...args);};
</script>`;
}

function controllerSource() {
  return `const TABS=['management_dashboard','orders','order_control','finance_control','production','contact_control','public_lead_audit','user_admin'];
const HEAVY=['management-dashboard-v3.js','orders-fast-loader-v1.js','order-control-v2.js','finance-control-v2.js','production-board-v3.js','production-alerts-v1.js','production-job-card-v2.js','installation-job-card-v2.js','contact-control-v1.js','public-lead-audit-v1.js','user-admin-v1.js','lead-card.js','needs.js','calculations.js','offers.js','orders.js'];
const out=document.getElementById('lazyBrowserCheckResult');
const params=new URL(location.href).searchParams;
const full=params.get('full')==='1';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const assert=(value,code)=>{if(!value)throw new Error(code);};
async function waitFor(check,code,timeoutMs=9000){const started=Date.now();while(Date.now()-started<timeoutMs){if(check())return;await sleep(25);}throw new Error(code);}
function jsResources(){return performance.getEntriesByType('resource').map(entry=>entry.name).filter(name=>/\\.(?:m?js)(?:\\?|$)/.test(name));}
function sectionReady(tab){if(tab==='leads')return document.getElementById('leadsSection')?.style.display!=='none';const section=document.querySelector('[data-v4-managed-section="'+tab+'"]');const loading=document.querySelector('#v4TabLoadFeedback[data-v4-loader-state="loading"]:not([hidden])');return Boolean(section&&!section.hidden&&!loading);}
async function openTab(tab){const button=document.querySelector('[data-v4-tab-button="'+tab+'"]');assert(button,'button_missing:'+tab);const started=Date.now();button.click();await waitFor(()=>document.body.dataset.v4Tab===tab,'tab_state_timeout:'+tab);await waitFor(()=>sectionReady(tab),'tab_content_timeout:'+tab);assert(document.querySelectorAll('#v4LayoutTabs .is-active').length===1,'active_button_count:'+tab);assert(button.classList.contains('is-active'),'active_button_mismatch:'+tab);assert(new URL(location.href).searchParams.get('tab')===tab,'url_tab_mismatch:'+tab);return Date.now()-started;}
function layoutEvidence(){const buttons=[...document.querySelectorAll('#v4LayoutTabs button')].filter(button=>getComputedStyle(button).display!=='none');const rects=buttons.map(button=>{const r=button.getBoundingClientRect();return {tab:button.dataset.v4TabButton,width:r.width,height:r.height,left:r.left,right:r.right,top:r.top,bottom:r.bottom};});let overlap=false;for(let i=0;i<rects.length;i+=1){for(let j=i+1;j<rects.length;j+=1){const a=rects[i],b=rects[j];if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1)overlap=true;}}return {inner_width:innerWidth,scroll_width:document.documentElement.scrollWidth,horizontal_overflow:document.documentElement.scrollWidth>innerWidth+1,button_overlap:overlap,min_button_height:Math.min(...rects.map(r=>r.height)),visible_buttons:rects.length};}
function finish(status,payload){const result={evidence_version:'${EVIDENCE_VERSION}',status,viewport:params.get('viewport')||'',full,...payload};out.dataset.status=status;out.textContent=JSON.stringify(result);document.title=status==='passed'?'LAZY TAB BROWSER PASSED':'LAZY TAB BROWSER FAILED';document.body.dataset.lazyBrowserCheckFinished='true';}
async function run(){try{
await waitFor(()=>!document.getElementById('crmWorkspace')?.classList.contains('hidden'),'workspace_timeout');
await waitFor(()=>document.body.dataset.v4Tab==='leads','initial_leads_timeout');
await sleep(250);
const eagerEntrypoints=document.querySelectorAll('script[type="module"][src]:not([src$="lazy-tab-browser-controller.mjs"])').length;
const initialResources=jsResources();
const initialHeavy=HEAVY.filter(name=>initialResources.some(url=>url.includes(name)));
assert(eagerEntrypoints<=11,'eager_entrypoints:'+eagerEntrypoints);
assert(initialHeavy.length===0,'hidden_heavy_loaded:'+initialHeavy.join(','));
const first=[];const repeated=[];
const tabsToCheck=full?TABS:['orders','production','user_admin'];
for(const tab of tabsToCheck){const firstMs=await openTab(tab);const beforeRepeat=jsResources().length;await sleep(150);const repeatMs=await openTab(tab);const afterRepeat=jsResources().length;assert(afterRepeat===beforeRepeat,'module_reloaded:'+tab);first.push({tab,ms:firstMs});repeated.push({tab,ms:repeatMs});}
assert(jsResources().filter(url=>url.includes('installation-job-card-v2.js')).length===1,'installation_import_count');
assert(window.__CRM_BROWSER_MOCK__.mutations.length===0,'unexpected_mock_mutation');
let rapid=null;let historyResult=null;
if(full){
document.querySelector('[data-v4-tab-button="management_dashboard"]').click();
document.querySelector('[data-v4-tab-button="orders"]').click();
document.querySelector('[data-v4-tab-button="production"]').click();
document.querySelector('[data-v4-tab-button="public_lead_audit"]').click();
await waitFor(()=>document.body.dataset.v4Tab==='public_lead_audit'&&sectionReady('public_lead_audit'),'rapid_final_timeout');await sleep(350);
rapid={final_tab:document.body.dataset.v4Tab,url_tab:new URL(location.href).searchParams.get('tab')};assert(rapid.final_tab==='public_lead_audit'&&rapid.url_tab==='public_lead_audit','rapid_navigation_overridden');
await openTab('orders');await openTab('finance_control');history.back();await waitFor(()=>document.body.dataset.v4Tab==='orders'&&sectionReady('orders'),'history_back_timeout');history.forward();await waitFor(()=>document.body.dataset.v4Tab==='finance_control'&&sectionReady('finance_control'),'history_forward_timeout');historyResult={back:'orders',forward:'finance_control'};
}
const layout=layoutEvidence();assert(!layout.horizontal_overflow,'horizontal_overflow');assert(!layout.button_overlap,'navigation_button_overlap');assert(document.body.innerText.trim().length>200,'blank_workspace');
await sleep(200);assert(window.__CRM_BROWSER_ERRORS__.length===0,'browser_errors:'+JSON.stringify(window.__CRM_BROWSER_ERRORS__));
finish('passed',{eager_entrypoints:eagerEntrypoints,initial_heavy_modules:initialHeavy,first,repeated,rapid,history:historyResult,layout,installation_imports:1,mock_mutations:0,console_errors:0});
}catch(error){const feedback=document.getElementById('v4TabLoadFeedback');finish('failed',{error:String(error?.message||error||'lazy_browser_failed'),tab:document.body.dataset.v4Tab,layout:layoutEvidence(),browser_errors:window.__CRM_BROWSER_ERRORS__,browser_warnings:window.__CRM_BROWSER_WARNINGS__,loader:{state:feedback?.dataset?.v4LoaderState||'',tab:feedback?.dataset?.v4LoaderTab||'',hidden:Boolean(feedback?.hidden),text:String(feedback?.innerText||'').slice(0,300)},managed_sections:[...document.querySelectorAll('[data-v4-managed-section]')].map(section=>({tab:section.dataset.v4ManagedSection,hidden:section.hidden})),production_resources:jsResources().filter(url=>url.includes('production')||url.includes('installation')).map(url=>url.split('/').pop()),mock_mutations:window.__CRM_BROWSER_MOCK__?.mutations||[]});}}
run();
`;
}

function injectHarness(html) {
  const instrumented = html.replace('</head>', `${instrumentationSource()}</head>`);
  const result = '<pre id="lazyBrowserCheckResult" data-status="running" hidden>running</pre>';
  const controller = '<script type="module" src="assets/v4/lazy-tab-browser-controller.mjs"></script>';
  return instrumented.replace('</body>', `${result}${controller}</body>`);
}

function mimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ({
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml'
  })[ext] || 'application/octet-stream';
}

async function findChrome() {
  const candidates = [process.env.CHROME_BIN, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
  for (const candidate of candidates) {
    try { await access(candidate, fsConstants.X_OK); return candidate; } catch (_) { /* continue */ }
  }
  throw new Error('headless_chrome_not_found');
}

async function createLocalServer(root) {
  const resolvedRoot = path.resolve(root);
  const server = createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url || '/', 'http://127.0.0.1');
      const relative = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, '') || 'crm/v4/index.html';
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
  return { server, baseUrl: `http://127.0.0.1:${address.port}/crm/v4/index.html` };
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
  const match = String(html).match(/<pre[^>]+id="lazyBrowserCheckResult"[^>]*>([\s\S]*?)<\/pre>/i);
  if (!match) throw new Error('lazy_browser_result_missing');
  const evidence = JSON.parse(decodeHtml(match[1]));
  if (evidence.status !== 'passed') {
    const detail = JSON.stringify({
      error: evidence.error || 'unknown',
      tab: evidence.tab || '',
      browser_errors: evidence.browser_errors || [],
      browser_warnings: evidence.browser_warnings || [],
      loader: evidence.loader || {},
      managed_sections: evidence.managed_sections || [],
      production_resources: evidence.production_resources || [],
      mock_mutations: evidence.mock_mutations || []
    }).slice(0, 2200);
    throw new Error(`lazy_browser_failed:${evidence.viewport}:${detail}`);
  }
  return evidence;
}

export async function runLazyTabBrowserCheck({ repoRoot = path.resolve('.') } = {}) {
  const chrome = await findChrome();
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'lider-lazy-tab-browser-'));
  let server = null;
  try {
    const tempCrm = path.join(tempRoot, 'crm', 'v4');
    await cp(path.join(repoRoot, 'crm', 'v4'), tempCrm, { recursive: true });
    const indexPath = path.join(tempCrm, 'index.html');
    await writeFile(indexPath, injectHarness(await readFile(indexPath, 'utf8')), 'utf8');
    await writeFile(path.join(tempCrm, 'assets', 'v4', 'supabase-client.js'), mockSupabaseSource(), 'utf8');
    await writeFile(path.join(tempCrm, 'assets', 'v4', 'functions-client.js'), mockFunctionsSource(), 'utf8');
    await writeFile(path.join(tempCrm, 'assets', 'v4', 'lazy-tab-browser-controller.mjs'), controllerSource(), 'utf8');
    const local = await createLocalServer(tempRoot); server = local.server;
    const evidence = [];
    for (const viewport of VIEWPORTS) {
      const profileDir = await mkdtemp(path.join(tmpdir(), `lider-lazy-tab-${viewport.name}-`));
      try {
        const url = `${local.baseUrl}?tab=leads&viewport=${encodeURIComponent(viewport.name)}&full=${viewport.full ? '1' : '0'}`;
        const dump = await runChrome(chrome, [
          '--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--disable-sync', '--no-first-run',
          '--force-device-scale-factor=1', `--window-size=${viewport.width},${viewport.height}`,
          `--user-data-dir=${profileDir}`, '--virtual-time-budget=30000', '--dump-dom', url
        ]);
        if (dump.code !== 0) throw new Error(`headless_chrome_failed:${viewport.name}:${dump.code}:${text(dump.stderr).slice(0, 220)}`);
        evidence.push(evidenceFromDump(dump.stdout));
      } finally { await rm(profileDir, { recursive: true, force: true }); }
    }
    assert(evidence.length === VIEWPORTS.length, 'viewport_count_invalid');
    assert(evidence.every(item => item.eager_entrypoints <= 11), 'eager_entrypoint_regression');
    assert(evidence.every(item => item.initial_heavy_modules.length === 0), 'hidden_module_regression');
    assert(evidence.every(item => item.layout.horizontal_overflow === false), 'responsive_overflow_regression');
    assert(evidence.every(item => item.mock_mutations === 0), 'browser_check_mutated_mock_backend');
    const desktop = evidence.find(item => item.viewport === 'desktop');
    assert(desktop?.rapid?.final_tab === 'public_lead_audit', 'rapid_navigation_not_proved');
    assert(desktop?.history?.back === 'orders' && desktop?.history?.forward === 'finance_control', 'history_not_proved');
    return { evidence_version: EVIDENCE_VERSION, viewports: evidence, no_external_network: true, no_real_credentials: true, no_database_writes: true };
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await rm(tempRoot, { recursive: true, force: true });
  }
}

async function main() {
  const result = await runLazyTabBrowserCheck();
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) main().catch(error => { console.error(JSON.stringify({ ok: false, error: text(error?.message).slice(0, 4000) })); process.exitCode = 1; });
