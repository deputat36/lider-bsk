#!/usr/bin/env node

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const STAGING_REF = 'otulfnouybahfnsycxqn';
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const PRODUCTION_REF = 'ofewxuqfjhamgerwzull';
const EVIDENCE_VERSION = 'leader-crm-authenticated-staging-e2e-v1';
const CONFIRMATION = 'YES_CREATE_AND_DELETE_SYNTHETIC_STAGING_DATA';
const FORBIDDEN_EVIDENCE_KEYS = /email|password|token|authorization|apikey|api_key|secret|phone|client|cost|profit|payment|balance|comment|marker|user_id/i;

function text(value) { return String(value ?? '').trim(); }
function required(name, env) { const value = text(env[name]); if (!value) throw new Error(`missing_environment_variable:${name}`); return value; }
function assertUuid(value, code) { if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text(value))) throw new Error(code); }
function assertStagingUrl(value) {
  const normalized = text(value).replace(/\/+$/, '');
  if (normalized !== STAGING_URL || normalized.includes(PRODUCTION_REF)) throw new Error('staging_environment_guard_failed');
  return normalized;
}
function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !FORBIDDEN_EVIDENCE_KEYS.test(key)).map(([key, item]) => [key, sanitize(item)]));
}
function loadConfig(env = process.env) {
  const config = {
    supabaseUrl: assertStagingUrl(required('STAGING_SUPABASE_URL', env)),
    publishableKey: required('STAGING_SUPABASE_PUBLISHABLE_KEY', env),
    email: required('STAGING_CRM_E2E_EMAIL', env),
    password: required('STAGING_CRM_E2E_PASSWORD', env),
    marker: required('STAGING_CRM_E2E_MARKER', env),
    leadId: required('STAGING_CRM_E2E_LEAD_ID', env),
    evidencePath: required('STAGING_CRM_E2E_EVIDENCE_PATH', env),
    supabaseUmdPath: required('STAGING_CRM_E2E_SUPABASE_UMD', env)
  };
  if (required('STAGING_CRM_E2E_CONFIRM', env) !== CONFIRMATION) throw new Error('explicit_staging_confirmation_required');
  if (!config.publishableKey.startsWith('sb_publishable_') && config.publishableKey.split('.').length !== 3) throw new Error('publishable_key_invalid');
  if (!config.email.endsWith('@example.invalid') || config.password.length < 20) throw new Error('synthetic_credentials_invalid');
  if (!/^SYNTH-CRM-E2E-[A-Za-z0-9-]+$/.test(config.marker)) throw new Error('synthetic_marker_invalid');
  assertUuid(config.leadId, 'lead_id_invalid');
  return Object.freeze(config);
}

export function operatorPlan() {
  return {
    evidence_version: EVIDENCE_VERSION,
    project_ref: STAGING_REF,
    production_enabled: false,
    actual_crm_index: true,
    first_login_via_form: true,
    browser_navigation: ['leads', 'lead_card', 'orders_direct', 'production', 'installation'],
    destructive_scope: 'unique_synthetic_marker_only',
    external_cleanup_required: true
  };
}

function jsonScript(value) { return JSON.stringify(value).replace(/[<>&]/g, (character) => ({ '<': '\\u003c', '>': '\\u003e', '&': '\\u0026' }[character])); }
function temporaryConfigSource(config) {
  return `export const V4_CONFIG=Object.freeze({supabaseUrl:${jsonScript(config.supabaseUrl)},supabasePublishableKey:${jsonScript(config.publishableKey)},authStorageKey:'leader_crm_v4_authenticated_staging_e2e',timeouts:Object.freeze({sessionMs:12000,loginMs:22000,logoutMs:8000,profileMs:12000,requestMs:20000})});\n`;
}
function temporaryClientSource() {
  return `import {V4_CONFIG} from './config.js';\nif(!globalThis.supabase?.createClient)throw new Error('local_supabase_umd_missing');\nexport const supabaseClient=globalThis.supabase.createClient(V4_CONFIG.supabaseUrl,V4_CONFIG.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:V4_CONFIG.authStorageKey}});\n`;
}
function runtimeSource(config) {
  return `export const CRM_E2E_RUNTIME=Object.freeze(${jsonScript({ email: config.email, password: config.password, marker: config.marker, leadId: config.leadId })});\n`;
}

function browserSource() {
  return `import {CRM_E2E_RUNTIME as R} from './crm-authenticated-e2e-runtime.mjs';

const result=document.getElementById('crmAuthenticatedE2eResult');
let supabaseClient;
const started=Date.now();
const steps=[];
const ids={};
const sleep=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));
const clean=(value)=>String(value??'').trim();
function assert(value,code){if(!value)throw new Error(code);}
function record(name,detail='pass'){steps.push({name,detail});}
async function waitFor(check,code,timeout=30000){const begin=Date.now();while(Date.now()-begin<timeout){const value=await check();if(value)return value;await sleep(120);}throw new Error(code);}
function setValue(selector,value,event='input'){const node=document.querySelector(selector);assert(node,'missing:'+selector);node.value=value;node.dispatchEvent(new Event(event,{bubbles:true}));return node;}
function setChecked(selector,value=true){const node=document.querySelector(selector);assert(node,'missing:'+selector);node.checked=value;node.dispatchEvent(new Event('change',{bubbles:true}));return node;}
function click(selector){const node=document.querySelector(selector);assert(node,'missing:'+selector);assert(!node.disabled,'disabled:'+selector);node.click();return node;}
async function table(tableName,fields,filters={}){let query=supabaseClient.from(tableName).select(fields);for(const [key,value] of Object.entries(filters))query=query.eq(key,value);const response=await query;if(response.error)throw new Error('read_failed:'+tableName+':'+response.error.message);return response.data||[];}
async function one(tableName,fields,filters={}){const rows=await table(tableName,fields,filters);assert(rows.length===1,'expected_one:'+tableName+':'+rows.length);return rows[0];}
function output(status,payload){result.dataset.status=status;result.textContent=JSON.stringify({evidence_version:'${EVIDENCE_VERSION}',status,project_ref:'${STAGING_REF}',production_enabled:false,...payload},null,2);document.body.dataset.crmAuthenticatedE2eFinished='true';document.title=status==='passed'?'CRM authenticated E2E PASSED':'CRM authenticated E2E FAILED';}
async function invoke(functionName,body){const response=await supabaseClient.functions.invoke(functionName,{body});return response;}
function edgeCode(response){return clean(response?.data?.error?.code||response?.error?.message||response?.data?.error||'');}
async function assertCount(tableName,filters,count){const rows=await table(tableName,'id',filters);assert(rows.length===count,'count_mismatch:'+tableName+':'+rows.length+':'+count);return rows;}

async function firstLoginAndLead(){
  await waitFor(()=>document.getElementById('loginForm')&&!document.getElementById('loginForm').classList.contains('hidden'),'login_form_missing');
  setValue('#loginEmail',R.email);setValue('#loginPassword',R.password);click('#loginBtn');
  await waitFor(()=>!document.getElementById('crmWorkspace')?.classList.contains('hidden')&&clean(document.getElementById('profileRole')?.textContent).toLowerCase()==='manager','authenticated_workspace_timeout',45000);
  assert(document.body.dataset.v4Tab==='leads','initial_leads_tab_missing');record('login_first_entry');
  setValue('#leadSearch',R.marker);await waitFor(()=>document.querySelector('.v4-lead-card[data-id="'+R.leadId+'"]'),'synthetic_lead_not_listed');
  click('.v4-lead-card[data-id="'+R.leadId+'"] button[data-action="open"]');
  await waitFor(()=>document.querySelector('.v4-lead-card-view')&&location.search.includes('lead='+R.leadId),'lead_card_open_timeout');record('lead_card');
  const assign=document.querySelector('[data-lead-primary-action="assign_self"]');if(assign)assign.click();
  await waitFor(async()=>{try{return (await one('leader_leads','id,status,assigned_to,updated_at',{id:R.leadId})).assigned_to||false;}catch(_){return false;}},'lead_assignment_timeout');
  const assigned=await one('leader_leads','id,status,assigned_to,updated_at',{id:R.leadId});assert(assigned.status==='В работе','lead_assignment_status_sync_failed');record('lead_assignment');
}

async function createNeedAndCalculation(){
  await waitFor(()=>{const node=document.querySelector('button[data-action="open-create-need"]');return node&&!node.disabled;},'need_create_entry_missing');click('button[data-action="open-create-need"]');
  await waitFor(()=>document.getElementById('needForm'),'need_form_missing');
  setValue('#needTitle',R.marker+' need');setValue('#needDescription',R.marker+' synthetic brief');setValue('#needWidth','2');setValue('#needHeight','1');setValue('#needQuantity','1');setValue('#needMaterial','Synthetic material');setValue('#needDeadline','Synthetic deadline '+R.marker);setChecked('#needDesign');setValue('#needDesignReason',R.marker+' synthetic design');setChecked('#needInstallation');setValue('#needInstallAddress',R.marker+' synthetic address');setValue('#needInstallationReason',R.marker+' synthetic installation');click('#saveNeedBtn');
  const need=await waitFor(async()=>{try{const rows=await table('leader_lead_needs','id,lead_id,title,need_design,need_installation,updated_at',{lead_id:R.leadId});return rows.length===1?rows[0]:false;}catch(_){return false;}},'need_create_timeout');ids.need=need.id;assert(need.need_design&&need.need_installation,'need_projection_failed');record('need_create');
  await waitFor(()=>document.querySelector('[data-calc-mode="custom"]')&&document.getElementById('calcTitle'),'calculation_builder_missing');
  click('[data-calc-mode="custom"]');setValue('#calcTitle',R.marker+' calculation');setValue('#calcCustomName',R.marker+' synthetic item');setValue('#calcCustomCost','1000');setValue('#calcCustomClient','1600');setValue('#calcCustomComment',R.marker);click('#addSmartCalcItemBtn');
  await waitFor(()=>document.querySelector('#calcDraftItems [data-calc-row-field="client_price"]'),'calculation_item_not_added');click('#saveCalculationBtn');
  const calculation=await waitFor(async()=>{try{const rows=await table('leader_lead_calculations','id,lead_id,need_id,title,version_number,client_total,contractor_cost,profit,status,updated_at',{lead_id:R.leadId});return rows.length===1?rows[0]:false;}catch(_){return false;}},'calculation_create_timeout',45000);ids.calculation=calculation.id;assert(Number(calculation.client_total)===1600&&Number(calculation.contractor_cost)===1000&&Number(calculation.profit)===600,'calculation_server_totals_failed');await assertCount('leader_lead_calculation_items',{calculation_id:calculation.id},1);record('calculation_create_atomic');
  await waitFor(()=>document.querySelector('[data-calc-version-source="'+calculation.id+'"]'),'calculation_version_entry_missing');click('[data-calc-version-source="'+calculation.id+'"]');await waitFor(()=>document.getElementById('calculationVersionEditor'),'calculation_version_editor_missing');
  setValue('[data-version-field="title"]',R.marker+' calculation v2');setValue('[data-version-row-field="client_price"][data-index="0"]','1700');click('[data-version-save]');
  const versions=await waitFor(async()=>{try{const rows=await table('leader_lead_calculations','id,version_number,is_current,client_total,profit,updated_at',{lead_id:R.leadId});return rows.length===2?rows:false;}catch(_){return false;}},'calculation_version_timeout',45000);const current=versions.find((row)=>row.is_current===true)||versions.sort((a,b)=>Number(b.version_number)-Number(a.version_number))[0];ids.calculation=current.id;assert(Number(current.version_number)===2&&Number(current.client_total)===1700,'calculation_version_projection_failed');record('calculation_version');
}

async function createOfferAndOrder(){
  await waitFor(()=>document.getElementById('createOfferBtn')&&!document.getElementById('createOfferBtn').disabled,'offer_create_entry_missing');setValue('#offerTitle',R.marker+' offer');setValue('#offerExtraComment',R.marker+' synthetic terms');click('#createOfferBtn');
  const offer=await waitFor(async()=>{try{const rows=await table('leader_commercial_offers','id,lead_id,calculation_id,title,status,total_sum,updated_at',{lead_id:R.leadId});return rows.length===1?rows[0]:false;}catch(_){return false;}},'offer_create_timeout',45000);ids.offer=offer.id;assert(Number(offer.total_sum)===1700,'offer_total_projection_failed');record('offer_create');
  await waitFor(()=>document.querySelector('.v4-offer-card[data-id="'+offer.id+'"] [data-action="mark-offer-sent"]'),'offer_send_missing');click('.v4-offer-card[data-id="'+offer.id+'"] [data-action="mark-offer-sent"]');await waitFor(async()=>{try{return (await one('leader_commercial_offers','id,status,updated_at',{id:offer.id})).status==='Отправлено';}catch(_){return false;}},'offer_send_timeout');
  await waitFor(()=>document.querySelector('.v4-offer-card[data-id="'+offer.id+'"] [data-action="approve-offer"]'),'offer_approve_missing');click('.v4-offer-card[data-id="'+offer.id+'"] [data-action="approve-offer"]');await waitFor(async()=>{try{return (await one('leader_commercial_offers','id,status,updated_at',{id:offer.id})).status==='Согласовано';}catch(_){return false;}},'offer_approve_timeout');record('offer_transitions_projection');
  await waitFor(()=>document.querySelector('.v4-offer-card[data-id="'+offer.id+'"] [data-open-offer-card]'),'offer_card_entry_missing');click('.v4-offer-card[data-id="'+offer.id+'"] [data-open-offer-card]');await waitFor(()=>document.getElementById('offerOrderCreateBox')&&document.querySelector('[data-create-order-from-offer]'),'order_from_offer_form_missing',30000);
  setValue('#offerOrderProjectName',R.marker+' order');setValue('#offerOrderLayoutStatus','Нужен дизайн','change');setValue('#offerOrderComment',R.marker+' synthetic order');click('[data-create-order-from-offer]');
  const order=await waitFor(async()=>{try{const rows=await table('leader_orders','id,lead_id,offer_id,calculation_id,project_name,status,layout_status,updated_at',{lead_id:R.leadId});return rows.length===1?rows[0]:false;}catch(_){return false;}},'order_create_timeout',45000);ids.order=order.id;assert(order.layout_status==='Нужен дизайн','order_layout_projection_failed');record('order_create_projection');
  document.querySelector('[data-offer-card-close]')?.click();
}

async function navigationAndRefresh(){
  click('[data-v4-tab-button="orders"]');await waitFor(()=>document.body.dataset.v4Tab==='orders'&&location.search.includes('tab=orders'),'orders_direct_route_missing');await waitFor(()=>document.querySelector('.v4-orders-fast-card')?.textContent.includes(R.marker),'direct_orders_data_missing',30000);record('direct_orders');
  click('[data-v4-tab-button="leads"]');await waitFor(()=>document.body.dataset.v4Tab==='leads','leads_reopen_failed');history.back();await waitFor(()=>document.body.dataset.v4Tab==='orders','history_back_failed');history.forward();await waitFor(()=>document.body.dataset.v4Tab==='leads','history_forward_failed');click('[data-v4-tab-button="orders"]');await waitFor(()=>document.body.dataset.v4Tab==='orders','orders_second_open_failed');record('back_forward_reopen');
  sessionStorage.setItem('leaderCrmAuthenticatedE2eResume',JSON.stringify({stage:'after_refresh',orderId:ids.order}));location.reload();
  await new Promise(()=>{});
}

async function designProductionInstallation(orderId){
  ids.order=orderId;
  await waitFor(()=>!document.getElementById('crmWorkspace')?.classList.contains('hidden')&&document.body.dataset.v4Tab==='orders','refresh_session_restore_failed',45000);await waitFor(()=>document.querySelector('.v4-orders-fast-card')?.textContent.includes(R.marker),'refresh_orders_missing',30000);record('refresh_authenticated');
  click('[data-design-task-draft-order="'+orderId+'"]');await waitFor(()=>document.querySelector('[data-design-task-staging-create]'),'design_create_missing');click('[data-design-task-staging-create]');
  const task=await waitFor(async()=>{try{const rows=await table('leader_design_tasks','id,order_id,task_status,layout_status,layout_link,updated_at',{order_id:orderId});return rows.length===1?rows[0]:false;}catch(_){return false;}},'design_create_timeout',45000);ids.design=task.id;record('design_create');
  for(const target of ['В работе','На согласовании']){await waitFor(()=>document.querySelector('[data-design-task-transition="'+target+'"]'),'design_transition_missing:'+target);click('[data-design-task-transition="'+target+'"]');await waitFor(async()=>{try{return (await one('leader_design_tasks','id,task_status,updated_at',{id:task.id})).task_status===target;}catch(_){return false;}},'design_transition_timeout:'+target);}
  document.querySelector('[data-design-task-draft-close]')?.click();click('[data-production-staging-order="'+orderId+'"]');await waitFor(()=>document.getElementById('productionStagingPreviewV1'),'production_review_preview_missing');assert(!document.querySelector('[data-production-staging-create]')||document.querySelector('[data-production-staging-create]').disabled,'review_status_client_allowed_production');record('review_not_approved_ui_guard');
  const reviewOrder=await one('leader_orders','id,updated_at,layout_status',{id:orderId});const rejected=await invoke('leader-crm-production-create',{action:'production_job.create_from_order',request_id:crypto.randomUUID(),expected_updated_at:reviewOrder.updated_at,payload:{order_id:orderId,design_task_id:task.id,idempotency_key:'production.review-block:'+orderId,job:{title:R.marker+' blocked production',priority:'Обычная',deadline:null,layout_status:'Макет согласован',file_url:'https://example.invalid/'+task.id,technical_task:R.marker,contractor_id:null,contractor_cost:null}}});assert(rejected.data?.ok!==true&&['conflict','validation_error'].includes(edgeCode(rejected)),'review_status_server_allowed_production:'+edgeCode(rejected));await assertCount('leader_production_jobs',{order_id:orderId},0);record('review_not_approved_server_guard');document.querySelector('[data-production-staging-close]')?.click();
  click('[data-design-task-draft-order="'+orderId+'"]');await waitFor(()=>document.querySelector('[data-design-task-transition="Согласовано"]'),'design_approve_missing');click('[data-design-task-transition="Согласовано"]');await waitFor(async()=>{try{return (await one('leader_design_tasks','id,task_status,updated_at',{id:task.id})).task_status==='Согласовано';}catch(_){return false;}},'design_approve_timeout');const approvedOrder=await one('leader_orders','id,layout_status,updated_at',{id:orderId});assert(approvedOrder.layout_status==='Макет согласован','approved_layout_projection_failed');record('design_approved_projection');document.querySelector('[data-design-task-draft-close]')?.click();
  click('[data-production-staging-order="'+orderId+'"]');await waitFor(()=>document.querySelector('[data-production-staging-create]')&&!document.querySelector('[data-production-staging-create]').disabled,'production_create_missing');click('[data-production-staging-create]');
  const production=await waitFor(async()=>{try{const rows=await table('leader_production_jobs','id,order_id,production_status,layout_status,updated_at',{order_id:orderId});return rows.length===1?rows[0]:false;}catch(_){return false;}},'production_create_timeout',45000);ids.production=production.id;await waitFor(()=>document.querySelector('.v4-production-staging-result')?.textContent.includes('idempotent replay'),'production_replay_ui_missing',30000);await assertCount('leader_production_jobs',{order_id:orderId},1);record('production_create_idempotent_replay');document.querySelector('[data-production-staging-close]')?.click();
  const stale=await invoke('leader-crm-production-create',{action:'production_job.create_from_order',request_id:crypto.randomUUID(),expected_updated_at:'2000-01-01T00:00:00.000Z',payload:{order_id:orderId,design_task_id:task.id,idempotency_key:'production.stale:'+orderId,job:{title:R.marker+' stale',priority:'Обычная',deadline:null,layout_status:'Макет согласован',file_url:'https://example.invalid/'+task.id,technical_task:R.marker,contractor_id:null,contractor_cost:null}}});assert(stale.data?.ok!==true&&edgeCode(stale)==='conflict','production_stale_not_blocked:'+edgeCode(stale));await assertCount('leader_production_jobs',{order_id:orderId},1);record('production_stale_rollback');
  click('[data-v4-tab-button="production"]');await waitFor(()=>document.body.dataset.v4Tab==='production'&&document.querySelector('[data-open-production-job-card="'+production.id+'"]'),'production_board_missing',30000);click('[data-open-production-job-card="'+production.id+'"]');await waitFor(()=>document.getElementById('prodJobStatus'),'production_card_missing');setValue('#prodJobStatus','В производстве','change');click('[data-save-production-job]');await waitFor(async()=>{try{return (await one('leader_production_jobs','id,production_status,updated_at',{id:production.id})).production_status==='В производстве';}catch(_){return false;}},'production_in_progress_timeout');await waitFor(()=>document.getElementById('prodJobStatus')?.value==='В производстве','production_card_readback_failed');setValue('#prodJobStatus','Готово','change');click('[data-save-production-job]');await waitFor(async()=>{try{return (await one('leader_production_jobs','id,production_status,updated_at',{id:production.id})).production_status==='Готово';}catch(_){return false;}},'production_ready_timeout');record('production_ready_projection');document.querySelector('[data-production-job-close]')?.click();click('[data-production-light-refresh]');
  await waitFor(()=>document.querySelector('[data-installation-staging-create="'+production.id+'"]'),'installation_create_missing',30000);click('[data-installation-staging-create="'+production.id+'"]');await waitFor(()=>document.querySelector('[data-installation-staging-confirm]'),'installation_modal_missing');click('[data-installation-staging-confirm]');
  const installation=await waitFor(async()=>{try{const rows=await table('leader_installation_jobs','id,order_id,production_job_id,install_status,updated_at',{order_id:orderId});return rows.length===1?rows[0]:false;}catch(_){return false;}},'installation_create_timeout',45000);ids.installation=installation.id;await assertCount('leader_installation_jobs',{order_id:orderId},1);record('installation_create_idempotent_replay');
  await waitFor(()=>document.querySelector('[data-production-light-kind="installation"]'),'installation_tab_missing');click('[data-production-light-kind="installation"]');await waitFor(()=>document.querySelector('[data-open-installation-job-card="'+installation.id+'"]'),'installation_board_missing');click('[data-open-installation-job-card="'+installation.id+'"]');await waitFor(()=>document.getElementById('installJobStatus'),'installation_card_missing');record('installation_card');
  const finalOrder=await one('leader_orders','id,production_status,installation_status,layout_status,status,updated_at',{id:orderId});assert(finalOrder.production_status==='Готово'&&finalOrder.installation_status,'final_order_projection_failed');
  const counts={needs:(await table('leader_lead_needs','id',{lead_id:R.leadId})).length,calculations:(await table('leader_lead_calculations','id',{lead_id:R.leadId})).length,offers:(await table('leader_commercial_offers','id',{lead_id:R.leadId})).length,orders:(await table('leader_orders','id',{lead_id:R.leadId})).length,design_tasks:(await table('leader_design_tasks','id',{order_id:orderId})).length,production_jobs:(await table('leader_production_jobs','id',{order_id:orderId})).length,installation_jobs:(await table('leader_installation_jobs','id',{order_id:orderId})).length};
  assert(JSON.stringify(counts)===JSON.stringify({needs:1,calculations:2,offers:1,orders:1,design_tasks:1,production_jobs:1,installation_jobs:1}),'final_counts_mismatch');
  const productionRequests=performance.getEntriesByType('resource').map((item)=>item.name).filter((name)=>name.includes('${PRODUCTION_REF}'));assert(productionRequests.length===0,'production_network_request_detected');
  output('passed',{authenticated:true,role:'manager',browser_actions:true,refresh:true,back_forward:true,direct_orders:true,review_guard:true,production_replay:true,stale_guard:true,installation_replay:true,projection_sync:true,counts,steps,duration_ms:Date.now()-started,cleanup_required:true});
}

try{
  ({supabaseClient}=await import('./assets/v4/supabase-client.js'));
  const resume=JSON.parse(sessionStorage.getItem('leaderCrmAuthenticatedE2eResume')||'null');
  if(resume?.stage==='after_refresh'){sessionStorage.removeItem('leaderCrmAuthenticatedE2eResume');await designProductionInstallation(resume.orderId);}
  else{await firstLoginAndLead();await createNeedAndCalculation();await createOfferAndOrder();await navigationAndRefresh();}
}catch(error){output('failed',{error:clean(error?.message||'browser_e2e_failed').slice(0,240),steps,duration_ms:Date.now()-started,cleanup_required:true});}
`;
}

function roleBrowserSource(expectedRole) {
  return `import {CRM_E2E_RUNTIME as R} from './crm-authenticated-e2e-runtime.mjs';
const result=document.getElementById('crmAuthenticatedE2eResult');const sleep=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));
const clean=(value)=>String(value??'').trim();function assert(value,code){if(!value)throw new Error(code);}async function waitFor(check,code,timeout=45000){const started=Date.now();while(Date.now()-started<timeout){const value=await check();if(value)return value;await sleep(120);}throw new Error(code);}
function output(status,payload){result.dataset.status=status;result.textContent=JSON.stringify({evidence_version:'${EVIDENCE_VERSION}',status,project_ref:'${STAGING_REF}',production_enabled:false,...payload},null,2);document.body.dataset.crmAuthenticatedE2eFinished='true';document.title=status==='passed'?'CRM role UI PASSED':'CRM role UI FAILED';}
try{await waitFor(()=>document.getElementById('loginForm')&&!document.getElementById('loginForm').classList.contains('hidden'),'login_form_missing');const email=document.getElementById('loginEmail'),password=document.getElementById('loginPassword');email.value=R.email;email.dispatchEvent(new Event('input',{bubbles:true}));password.value=R.password;password.dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('loginBtn').click();await waitFor(()=>!document.getElementById('crmWorkspace')?.classList.contains('hidden')&&clean(document.getElementById('profileRole')?.textContent).toLowerCase()==='${expectedRole}','role_workspace_timeout');
const visible=(tab)=>{const node=document.querySelector('[data-v4-tab-button="'+tab+'"]');return Boolean(node&&!node.hidden&&!node.disabled&&node.getAttribute('aria-hidden')!=='true');};
${expectedRole === 'owner'
    ? "for(const tab of ['leads','orders','order_control','finance_control','production','user_admin'])assert(visible(tab),'owner_tab_hidden:'+tab);document.querySelector('[data-v4-tab-button=\"user_admin\"]').click();await waitFor(()=>document.body.dataset.v4Tab==='user_admin','owner_user_admin_open_failed');"
    : "for(const tab of ['leads','orders','order_control','production'])assert(visible(tab),'manager_tab_hidden:'+tab);for(const tab of ['finance_control','user_admin'])assert(!visible(tab),'manager_forbidden_tab_visible:'+tab);"}
output('passed',{authenticated:true,role:'${expectedRole}',ui_allowed_controls:true,ui_forbidden_controls:${expectedRole === 'owner' ? "'not_applicable_full_access'" : 'true'},cleanup_required:true});}catch(error){output('failed',{error:clean(error?.message).slice(0,180),cleanup_required:true});}`;
}

function mimeType(filePath) {
  return ({ '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' })[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}
async function localServer(root) {
  const safeRoot = path.resolve(root);
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', 'http://127.0.0.1');
      const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
      const target = path.resolve(safeRoot, relative);
      if (target !== safeRoot && !target.startsWith(`${safeRoot}${path.sep}`)) throw new Error('forbidden');
      const body = await readFile(target);
      response.writeHead(200, { 'Content-Type': mimeType(target), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); response.end(body);
    } catch (_) { response.writeHead(404, { 'Content-Type': 'text/plain' }); response.end('not found'); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('server_address_invalid');
  return { server, url: `http://127.0.0.1:${address.port}/index.html?tab=leads` };
}
async function findChrome() {
  for (const candidate of ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser']) {
    try { await access(candidate, fsConstants.X_OK); return candidate; } catch (_) { /* continue */ }
  }
  throw new Error('headless_chrome_not_found');
}
function runChrome(binary, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] }); let stdout = ''; let stderr = '';
    let settled = false; let connecting = false; let socket;
    const stop = () => { child.kill('SIGTERM'); setTimeout(() => child.kill('SIGKILL'), 5000).unref(); };
    const finish = (value, error) => { if (settled) return; settled = true; clearTimeout(timer); try { socket?.close(); } catch (_) { /* noop */ } stop(); if (error) reject(error); else resolve(value); };
    const connect = async (browserWebSocketUrl) => {
      const parsed = new URL(browserWebSocketUrl); const listUrl = `http://${parsed.host}/json/list`;
      let pageTarget;
      for (let attempt = 0; attempt < 300 && !pageTarget; attempt += 1) {
        const targets = await fetch(listUrl).then((response) => response.json()).catch(() => []);
        pageTarget = targets.find((target) => target.type === 'page'
          && /^http:\/\/127\.0\.0\.1:\d+\/index\.html\?tab=leads/.test(String(target.url || ''))
          && target.webSocketDebuggerUrl);
        if (!pageTarget) await new Promise((done) => setTimeout(done, 100));
      }
      if (!pageTarget) throw new Error('chrome_page_target_missing');
      socket = new WebSocket(pageTarget.webSocketDebuggerUrl);
      await new Promise((opened, failed) => { socket.addEventListener('open', opened, { once: true }); socket.addEventListener('error', () => failed(new Error('chrome_devtools_socket_failed')), { once: true }); });
      clearTimeout(timer);
      let sequence = 0; const pending = new Map();
      socket.addEventListener('message', (event) => { const message = JSON.parse(String(event.data)); const callback = pending.get(message.id); if (!callback) return; pending.delete(message.id); clearTimeout(callback.timer); if (message.error) callback.reject(new Error(`chrome_cdp_error:${message.error.message}`)); else callback.resolve(message.result); });
      const command = (method, params = {}) => new Promise((resolveCommand, rejectCommand) => {
        const id = ++sequence;
        const commandTimer = setTimeout(() => { pending.delete(id); rejectCommand(new Error(`chrome_cdp_timeout:${method}`)); }, 10000);
        pending.set(id, { resolve: resolveCommand, reject: rejectCommand, timer: commandTimer });
        socket.send(JSON.stringify({ id, method, params }));
      });
      await command('Runtime.enable');
      await new Promise((done) => setTimeout(done, 1500));
      const deadline = Date.now() + 360000;
      while (Date.now() < deadline) {
        let state;
        try { state = await command('Runtime.evaluate', { expression: `document.body?.dataset?.crmAuthenticatedE2eFinished==='true'`, returnByValue: true }); }
        catch (error) { if (String(error?.message || '').startsWith('chrome_cdp_timeout:Runtime.evaluate')) { await new Promise((done) => setTimeout(done, 500)); continue; } throw error; }
        if (state?.result?.value === true) {
          const dom = await command('Runtime.evaluate', { expression: 'document.documentElement.outerHTML', returnByValue: true });
          finish({ code: 0, stdout: String(dom?.result?.value || ''), stderr }); return;
        }
        await new Promise((done) => setTimeout(done, 200));
      }
      throw new Error('chrome_browser_scenario_timeout');
    };
    const timer = setTimeout(() => finish(null, new Error('chrome_devtools_start_timeout')), 35000);
    child.stdout.on('data', (chunk) => { stdout += chunk; }); child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.stderr.on('data', () => { const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match && !connecting) { connecting = true; connect(match[1]).catch((error) => finish(null, error)); } });
    child.once('error', (error) => finish(null, error)); child.once('close', (code) => { if (!settled) finish({ code, stdout, stderr }); });
    connecting = true;
    connect('ws://127.0.0.1:9222/devtools/browser').catch((error) => finish(null, error));
  });
}
function decodeHtml(value) { return value.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'); }
function evidenceFromDom(dom) {
  const match = String(dom).match(/<pre[^>]+id="crmAuthenticatedE2eResult"[^>]*>([\s\S]*?)<\/pre>/i); if (!match) throw new Error('browser_evidence_missing');
  const evidence = sanitize(JSON.parse(decodeHtml(match[1]))); if (evidence.status !== 'passed') throw new Error(`browser_e2e_failed:${evidence.error || 'unknown'}`); return evidence;
}

async function run(env = process.env, roleUi = '') {
  const config = loadConfig(env); const chrome = await findChrome(); const tempRoot = await mkdtemp(path.join(tmpdir(), 'lider-crm-authenticated-e2e-')); const tempV4 = path.join(tempRoot, 'v4'); let server;
  try {
    await cp(path.resolve('crm/v4'), tempV4, { recursive: true });
    await mkdir(path.join(tempV4, 'assets/vendor'), { recursive: true });
    await cp(config.supabaseUmdPath, path.join(tempV4, 'assets/vendor/supabase-v2.112.2.js'));
    await writeFile(path.join(tempV4, 'assets/v4/config.js'), temporaryConfigSource(config), { mode: 0o600 });
    await writeFile(path.join(tempV4, 'assets/v4/supabase-client.js'), temporaryClientSource(), { mode: 0o600 });
    await writeFile(path.join(tempV4, 'crm-authenticated-e2e-runtime.mjs'), runtimeSource(config), { mode: 0o600 });
    await writeFile(path.join(tempV4, 'crm-authenticated-e2e-page.mjs'), roleUi ? roleBrowserSource(roleUi) : browserSource(), { mode: 0o600 });
    const indexPath = path.join(tempV4, 'index.html'); const html = await readFile(indexPath, 'utf8');
    await writeFile(indexPath, html.replace('</body>', '<script src="./assets/vendor/supabase-v2.112.2.js"></script><pre id="crmAuthenticatedE2eResult" data-status="running" hidden>running</pre><script type="module" src="./crm-authenticated-e2e-page.mjs"></script></body>'), { mode: 0o600 });
    const local = await localServer(tempV4); server = local.server;
    const chromeResult = await runChrome(chrome, ['--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--disable-sync', '--no-first-run', '--disable-background-networking', '--disable-dev-shm-usage', '--remote-debugging-port=9222', `--user-data-dir=${path.join(tempRoot, 'chrome-profile')}`, local.url]);
    if (chromeResult.code !== 0) throw new Error(`headless_chrome_failed:${chromeResult.code}`);
    const evidence = evidenceFromDom(chromeResult.stdout); const target = path.resolve(config.evidencePath); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 }); return { evidence, target };
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    for (let attempt = 0; attempt < 30; attempt += 1) {
      try { await rm(tempRoot, { recursive: true, force: true }); break; }
      catch (error) { if (attempt === 29) throw error; await new Promise((resolve) => setTimeout(resolve, 100)); }
    }
  }
}

function arg(name) { const entry = process.argv.find((value) => value.startsWith(`${name}=`)); return entry ? entry.slice(name.length + 1) : ''; }
async function main() { const mode = arg('--mode') || 'plan'; if (mode === 'plan') { console.log(JSON.stringify(operatorPlan(), null, 2)); return; } const role = mode === 'role-ui' ? required('STAGING_CRM_E2E_EXPECTED_ROLE', process.env).toLowerCase() : ''; if (mode !== 'run' && mode !== 'role-ui') throw new Error('unsupported_mode'); if (role && !['manager', 'owner'].includes(role)) throw new Error('unsupported_role_ui'); const result = await run(process.env, role); console.log(JSON.stringify({ ok: true, project_ref: STAGING_REF, evidence_path: result.target, cleanup_required: true })); }
const direct = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (direct) main().catch((error) => { console.error(JSON.stringify({ ok: false, project_ref: STAGING_REF, error: text(error?.message).slice(0, 260), cleanup_required: true })); process.exitCode = 1; });
