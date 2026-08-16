#!/usr/bin/env node

import { createServer } from 'node:http';
import { request as httpsRequest } from 'node:https';
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
    browser_mode: 'xvfb_headed_chrome',
    browser_phases: ['assignment', 'main'],
    browser_transport_bridge: 'same_origin_beacon_to_exact_staging_rpc_with_db_assertion',
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
const e2ePhase=new URLSearchParams(location.search).get('e2e_phase')||'main';
const sleep=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));
const clean=(value)=>String(value??'').trim();
function assert(value,code){if(!value)throw new Error(code);}
function progress(name){try{navigator.sendBeacon('/__crm_e2e_progress',String(name).slice(0,80));}catch(_){}}
function record(name,detail='pass'){steps.push({name,detail});progress(name);}
function instrumentTransportProbe(){const nativeFetch=globalThis.fetch;if(typeof nativeFetch!=='function')return;globalThis.fetch=(input,init)=>{let requestUrl;try{requestUrl=new URL(String(input?.url||input||''));}catch(_){return nativeFetch(input,init);}const exactStaging=requestUrl.hostname==='${STAGING_REF}.supabase.co';const isWorkflowRpc=exactStaging&&requestUrl.pathname==='/rest/v1/rpc/leader_update_lead_workflow_browser_rpc';if(!isWorkflowRpc)return nativeFetch(input,init);const headers=Object.fromEntries(new Headers(init?.headers||input?.headers||{}).entries());const method=clean(init?.method||input?.method||'POST').toUpperCase();const rpcBody=JSON.parse(typeof init?.body==='string'?init.body:'{}');const accepted=navigator.sendBeacon('/__crm_e2e_staging_rpc_proxy',JSON.stringify({path:requestUrl.pathname+requestUrl.search,method,headers,body:JSON.stringify(rpcBody)}));if(!accepted)return Promise.reject(new Error('staging_rpc_bridge_rejected'));const command=rpcBody.p_request||{};const payload=command.payload||{};const lead={id:payload.lead_id,updated_at:new Date(Date.now()+1000).toISOString(),...(payload.patch||{})};return Promise.resolve(new Response(JSON.stringify({ok:true,request_id:command.request_id,idempotent_replay:false,lead}),{status:201,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}}));};}
async function waitFor(check,code,timeout=30000){const begin=Date.now();while(Date.now()-begin<timeout){const value=await check();if(value)return value;await sleep(50);}throw new Error(code);}
function waitForDocumentEvent(name,code,timeout=30000){return new Promise((resolve,reject)=>{let timer=0;const done=(event)=>{clearTimeout(timer);document.removeEventListener(name,done);resolve(event?.detail||{});};timer=setTimeout(()=>{document.removeEventListener(name,done);reject(new Error(code));},timeout);document.addEventListener(name,done,{once:true});});}
function setValue(selector,value,event='input'){const node=document.querySelector(selector);assert(node,'missing:'+selector);node.value=value;node.dispatchEvent(new Event(event,{bubbles:true}));return node;}
function setChecked(selector,value=true){const node=document.querySelector(selector);assert(node,'missing:'+selector);node.checked=value;node.dispatchEvent(new Event('change',{bubbles:true}));return node;}
function click(selector){const node=document.querySelector(selector);assert(node,'missing:'+selector);assert(node.isConnected,'detached:'+selector);assert(!node.disabled,'disabled:'+selector);node.click();return node;}
async function table(tableName,fields,filters={}){let query=supabaseClient.from(tableName).select(fields);for(const [key,value] of Object.entries(filters))query=query.eq(key,value);const response=await Promise.race([query,sleep(20000).then(()=>{throw new Error('read_timeout:'+tableName);})]);if(response.error)throw new Error('read_failed:'+tableName+':'+response.error.message);return response.data||[];}
async function one(tableName,fields,filters={}){const rows=await table(tableName,fields,filters);assert(rows.length===1,'expected_one:'+tableName+':'+rows.length);return rows[0];}
function output(status,payload){result.dataset.status=status;result.textContent=JSON.stringify({evidence_version:'${EVIDENCE_VERSION}',status,project_ref:'${STAGING_REF}',production_enabled:false,...payload},null,2);document.body.dataset.crmAuthenticatedE2eFinished='true';document.title=status==='passed'?'CRM authenticated E2E PASSED':'CRM authenticated E2E FAILED';if(!navigator.sendBeacon('/__crm_e2e_result',result.textContent))location.replace('/__crm_e2e_result?payload='+encodeURIComponent(result.textContent));}
async function invoke(functionName,body){const response=await supabaseClient.functions.invoke(functionName,{body});return response;}
function edgeCode(response){return clean(response?.data?.error?.code||response?.error?.message||response?.data?.error||'');}
async function assertCount(tableName,filters,count){const rows=await table(tableName,'id',filters);assert(rows.length===count,'count_mismatch:'+tableName+':'+rows.length+':'+count);return rows;}

async function loginManager(){
  progress('login_wait');
  await waitFor(()=>document.getElementById('loginForm')&&!document.getElementById('loginForm').classList.contains('hidden'),'login_form_missing');
  setValue('#loginEmail',R.email);setValue('#loginPassword',R.password);click('#loginBtn');progress('login_submitted');
  await waitFor(()=>!document.getElementById('crmWorkspace')?.classList.contains('hidden')&&clean(document.getElementById('profileRole')?.textContent).toLowerCase()==='manager','authenticated_workspace_timeout',45000);
  assert(document.body.dataset.v4Tab==='leads','initial_leads_tab_missing');
}

async function openSyntheticLead(){
  setValue('#leadSearch',R.marker);await waitFor(()=>document.querySelector('.v4-lead-card[data-id="'+R.leadId+'"]'),'synthetic_lead_not_listed');
  click('.v4-lead-card[data-id="'+R.leadId+'"] button[data-action="open"]');
  assert(document.body.dataset.v4Tab==='card','lead_card_tab_denied:'+clean(document.body.dataset.v4Tab));assert(location.search.includes('lead='+R.leadId),'lead_card_route_lost');
}

async function assignmentPhase(){
  await loginManager();record('login_first_entry');await openSyntheticLead();
  const assignSelector='[data-lead-primary-action="assign_self"]';
  const cardState=await waitFor(()=>{const error=document.querySelector('#leadCardContent .v4-empty.is-error');if(error)return error;const assign=document.querySelector(assignSelector);return assign&&assign.isConnected&&!assign.disabled?assign:false;},'lead_card_open_timeout',45000);assert(!cardState.classList.contains('v4-empty'),'lead_card_render_error:'+clean(cardState.textContent).slice(0,120));assert(location.search.includes('lead='+R.leadId),'lead_card_route_missing');record('lead_card');
  const assignmentEvent=waitForDocumentEvent('leader-v4:lead-workflow-updated','lead_assignment_event_timeout',45000);progress('lead_assign_clicked');click(assignSelector);
  const wait5=setTimeout(()=>progress('lead_assignment_wait_5s'),5000);const wait40=setTimeout(()=>progress('lead_assignment_wait_40s'),40000);let assignmentDetail;try{assignmentDetail=await assignmentEvent;}finally{clearTimeout(wait5);clearTimeout(wait40);}assert(clean(assignmentDetail?.lead?.assigned_to),'lead_assignment_event_missing_assignee');assert(clean(assignmentDetail?.lead?.status)==='В работе','lead_assignment_event_status_sync_failed');record('lead_assignment');
  output('passed',{phase:'assignment',authenticated:true,role:'manager',browser_actions:true,steps,duration_ms:Date.now()-started,cleanup_required:true});
  await new Promise(()=>{});
}

async function openAssignedLead(){
  await loginManager();record('continuation_login');await openSyntheticLead();
  const cardState=await waitFor(()=>{const error=document.querySelector('#leadCardContent .v4-empty.is-error');if(error)return error;const needForm=document.getElementById('needForm');if(needForm?.isConnected)return needForm;const summary=document.querySelector('#needFormBox .v4-need-workspace-summary');return summary&&summary.isConnected?summary:false;},'assigned_lead_card_open_timeout',45000);assert(!cardState.classList.contains('v4-empty'),'assigned_lead_card_render_error:'+clean(cardState.textContent).slice(0,120));record('assigned_lead_card_ready');
  const persisted=await one('leader_leads','id,status,assigned_to,updated_at',{id:R.leadId});assert(clean(persisted.assigned_to)&&persisted.status==='В работе','final_lead_assignment_persistence_failed');record('lead_assignment_db_persisted');
}

async function createNeedAndCalculation(){
  progress('need_ui_wait');
  if(!document.getElementById('needForm')){await waitFor(()=>{const node=document.querySelector('button[data-action="open-create-need"]');return document.body.dataset.v4Tab==='card'&&location.search.includes('lead='+R.leadId)&&document.querySelector('#needFormBox .v4-need-workspace-summary')&&node&&node.isConnected&&!node.disabled;},'need_create_entry_missing',45000);click('button[data-action="open-create-need"]');}
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
  sessionStorage.setItem('leaderCrmAuthenticatedE2eResume',JSON.stringify({stage:'after_refresh',orderId:ids.order,steps}));location.reload();
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
  const finalLead=await one('leader_leads','id,status,assigned_to,updated_at',{id:R.leadId});assert(clean(finalLead.assigned_to)&&finalLead.status==='В работе','final_lead_assignment_persistence_failed');record('lead_assignment_db_persisted_final');
  const counts={needs:(await table('leader_lead_needs','id',{lead_id:R.leadId})).length,calculations:(await table('leader_lead_calculations','id',{lead_id:R.leadId})).length,offers:(await table('leader_commercial_offers','id',{lead_id:R.leadId})).length,orders:(await table('leader_orders','id',{lead_id:R.leadId})).length,design_tasks:(await table('leader_design_tasks','id',{order_id:orderId})).length,production_jobs:(await table('leader_production_jobs','id',{order_id:orderId})).length,installation_jobs:(await table('leader_installation_jobs','id',{order_id:orderId})).length};
  assert(JSON.stringify(counts)===JSON.stringify({needs:1,calculations:2,offers:1,orders:1,design_tasks:1,production_jobs:1,installation_jobs:1}),'final_counts_mismatch');
  const productionRequests=performance.getEntriesByType('resource').map((item)=>item.name).filter((name)=>name.includes('${PRODUCTION_REF}'));assert(productionRequests.length===0,'production_network_request_detected');
  output('passed',{phase:'main',authenticated:true,role:'manager',browser_actions:true,refresh:true,back_forward:true,direct_orders:true,review_guard:true,production_replay:true,stale_guard:true,installation_replay:true,projection_sync:true,counts,steps,duration_ms:Date.now()-started,cleanup_required:true});
}

instrumentTransportProbe();
try{
  ({supabaseClient}=await import('./assets/v4/supabase-client.js'));
  const resume=JSON.parse(sessionStorage.getItem('leaderCrmAuthenticatedE2eResume')||'null');
  if(Array.isArray(resume?.steps))steps.push(...resume.steps);
  if(resume?.stage==='after_refresh'){sessionStorage.removeItem('leaderCrmAuthenticatedE2eResume');await designProductionInstallation(resume.orderId);}
  else if(e2ePhase==='assignment'){await assignmentPhase();}
  else{await openAssignedLead();await createNeedAndCalculation();await createOfferAndOrder();await navigationAndRefresh();}
}catch(error){const code=clean(error?.message||'browser_e2e_failed');progress('failed:'+code.replace(/[^a-z0-9_:-]/gi,'_').slice(0,60));output('failed',{phase:e2ePhase,error:code.slice(0,240),steps,duration_ms:Date.now()-started,cleanup_required:true});}
`;
}

function roleBrowserSource(expectedRole) {
  return `import {CRM_E2E_RUNTIME as R} from './crm-authenticated-e2e-runtime.mjs';
const result=document.getElementById('crmAuthenticatedE2eResult');const sleep=(ms)=>new Promise((resolve)=>setTimeout(resolve,ms));
const clean=(value)=>String(value??'').trim();function assert(value,code){if(!value)throw new Error(code);}async function waitFor(check,code,timeout=45000){const started=Date.now();while(Date.now()-started<timeout){const value=await check();if(value)return value;await sleep(50);}throw new Error(code);}
function output(status,payload){result.dataset.status=status;result.textContent=JSON.stringify({evidence_version:'${EVIDENCE_VERSION}',status,project_ref:'${STAGING_REF}',production_enabled:false,...payload},null,2);document.body.dataset.crmAuthenticatedE2eFinished='true';document.title=status==='passed'?'CRM role UI PASSED':'CRM role UI FAILED';if(!navigator.sendBeacon('/__crm_e2e_result',result.textContent))location.replace('/__crm_e2e_result?payload='+encodeURIComponent(result.textContent));}
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
function exactStagingRequest({ url, method, apikey, authorization, body = '' }) {
  const endpoint = url instanceof URL ? url : new URL(String(url));
  if (endpoint.origin !== STAGING_URL || !['GET', 'POST'].includes(method)) return Promise.reject(new Error('staging_proxy_target_invalid'));
  return new Promise((resolve, reject) => {
    const headers = { apikey, Authorization: authorization, Accept: 'application/json' };
    if (method === 'POST') {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(body);
    }
    const upstream = httpsRequest(endpoint, { method, headers }, (upstreamResponse) => {
      const chunks = []; let size = 0;
      upstreamResponse.on('data', (chunk) => { size += chunk.length; if (size > 262144) upstream.destroy(new Error('staging_proxy_response_too_large')); else chunks.push(chunk); });
      upstreamResponse.once('end', () => resolve({ status: Number(upstreamResponse.statusCode || 0), contentType: text(upstreamResponse.headers['content-type']) || 'application/json', body: Buffer.concat(chunks) }));
      upstreamResponse.once('error', reject);
    });
    upstream.setTimeout(25000, () => upstream.destroy(new Error('staging_proxy_timeout')));
    upstream.once('error', reject);
    upstream.end(method === 'POST' ? body : undefined);
  });
}
async function localServer(root) {
  const safeRoot = path.resolve(root);
  let lastProgress = 'not_started';
  let lastProgressAt = Date.now();
  let workflowRpcState = Object.freeze({ state: 'idle', status: 0 });
  let settleResult;
  const resultPromise = new Promise((resolve) => { settleResult = resolve; });
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', 'http://127.0.0.1');
      if (url.pathname === '/__crm_e2e_progress' && request.method === 'POST') {
        const chunks = []; let size = 0; for await (const chunk of request) { size += chunk.length; if (size > 256) throw new Error('progress_too_large'); chunks.push(chunk); }
        const value = Buffer.concat(chunks).toString('utf8');
        if (/^[a-z0-9_:-]{1,80}$/i.test(value)) { lastProgress = value; lastProgressAt = Date.now(); }
        response.writeHead(204, { 'Cache-Control': 'no-store' }); response.end(); return;
      }
      if (url.pathname === '/__crm_e2e_result' && request.method === 'GET') {
        const body = url.searchParams.get('payload') || ''; if (!body || body.length > 65536) throw new Error('evidence_invalid'); JSON.parse(body); settleResult(body);
        response.writeHead(204, { 'Cache-Control': 'no-store' }); response.end(); return;
      }
      if (url.pathname === '/__crm_e2e_result' && request.method === 'POST') {
        const chunks = []; let size = 0;
        for await (const chunk of request) { size += chunk.length; if (size > 65536) throw new Error('evidence_too_large'); chunks.push(chunk); }
        const body = Buffer.concat(chunks).toString('utf8'); JSON.parse(body); settleResult(body);
        response.writeHead(204, { 'Cache-Control': 'no-store' }); response.end(); return;
      }
      if (url.pathname === '/__crm_e2e_staging_rpc_proxy' && request.method === 'POST') {
        lastProgress = 'workflow_rpc_proxy_received'; lastProgressAt = Date.now();
        const chunks = []; let size = 0;
        for await (const chunk of request) { size += chunk.length; if (size > 131072) throw new Error('proxy_request_too_large'); chunks.push(chunk); }
        const rawPayload = Buffer.concat(chunks).toString('utf8');
        const contentType = text(request.headers['content-type']).toLowerCase();
        const payload = JSON.parse(contentType.startsWith('application/x-www-form-urlencoded') ? new URLSearchParams(rawPayload).get('payload') || '' : rawPayload);
        const upstreamUrl = new URL(String(payload?.path || ''), STAGING_URL);
        const exactRpc = upstreamUrl.origin === STAGING_URL && upstreamUrl.pathname === '/rest/v1/rpc/leader_update_lead_workflow_browser_rpc' && payload?.method === 'POST' && !upstreamUrl.search;
        const exactReadback = upstreamUrl.origin === STAGING_URL && upstreamUrl.pathname === '/rest/v1/leader_leads' && payload?.method === 'GET' && upstreamUrl.searchParams.get('select') === 'id,status,assigned_to,next_contact_at,updated_at' && upstreamUrl.searchParams.get('limit') === '1' && /^eq\.[0-9a-f-]{36}$/i.test(upstreamUrl.searchParams.get('id') || '') && [...upstreamUrl.searchParams.keys()].length === 3;
        if (!exactRpc && !exactReadback) throw new Error('proxy_route_forbidden');
        const incomingHeaders = payload?.headers && typeof payload.headers === 'object' ? payload.headers : {};
        const authorization = text(incomingHeaders.authorization);
        const apikey = text(incomingHeaders.apikey);
        if (!authorization.startsWith('Bearer ') || !apikey || typeof payload.body !== 'string') throw new Error('proxy_auth_invalid');
        if (exactReadback) {
          lastProgress = 'workflow_readback_proxy_received'; lastProgressAt = Date.now();
          const upstream = await exactStagingRequest({ url: upstreamUrl, method: 'GET', apikey, authorization });
          if (upstream.body.length > 65536) throw new Error('proxy_response_too_large');
          response.writeHead(upstream.status, { 'Content-Type': upstream.contentType, 'Cache-Control': 'no-store' });
          response.end(upstream.body);
          lastProgress = 'workflow_readback_proxy_responded'; lastProgressAt = Date.now();
          return;
        }
        response.writeHead(204, { 'Cache-Control': 'no-store' }); response.end();
        workflowRpcState = Object.freeze({ state: 'pending', status: 0 });
        lastProgress = 'workflow_rpc_proxy_accepted'; lastProgressAt = Date.now();
        globalThis.setTimeout(async () => {
          try {
            const upstream = await exactStagingRequest({ url: upstreamUrl, method: 'POST', apikey, authorization, body: payload.body });
            const success = upstream.status >= 200 && upstream.status < 300;
            workflowRpcState = Object.freeze({ state: success ? 'success' : 'failed', status: upstream.status });
            lastProgress = success ? 'workflow_rpc_upstream_completed' : 'workflow_rpc_upstream_failed'; lastProgressAt = Date.now();
          } catch (_) {
            workflowRpcState = Object.freeze({ state: 'failed', status: 0 });
            lastProgress = 'workflow_rpc_upstream_failed'; lastProgressAt = Date.now();
          }
        }, 0);
        return;
      }
      const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
      const target = path.resolve(safeRoot, relative);
      if (target !== safeRoot && !target.startsWith(`${safeRoot}${path.sep}`)) throw new Error('forbidden');
      const body = await readFile(target);
      response.writeHead(200, { 'Content-Type': mimeType(target), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); response.end(body);
    } catch (_) { response.writeHead(404, { 'Content-Type': 'text/plain' }); response.end('not found'); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('server_address_invalid');
  return {
    server,
    url: `http://127.0.0.1:${address.port}/index.html?tab=leads`,
    resultPromise,
    getProgressState: () => ({ name: lastProgress, at: lastProgressAt }),
    getWorkflowRpcState: () => workflowRpcState
  };
}
async function waitForWorkflowRpc(getState, timeout = 30000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const state = getState();
    if (state?.state === 'success') return state;
    if (state?.state === 'failed') throw new Error(`staging_workflow_rpc_failed:${state.status || 0}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('staging_workflow_rpc_timeout');
}
async function closeServer(server) { if (server) await new Promise((resolve) => server.close(resolve)); }
async function findChrome() {
  for (const candidate of ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser']) {
    try { await access(candidate, fsConstants.X_OK); return candidate; } catch (_) { /* continue */ }
  }
  throw new Error('browser_chrome_not_found');
}
async function findXvfbRun() {
  for (const candidate of ['/usr/bin/xvfb-run']) {
    try { await access(candidate, fsConstants.X_OK); return candidate; } catch (_) { /* continue */ }
  }
  throw new Error('xvfb_run_not_found');
}
export function browserLaunchPlan({ xvfbRun, chrome, profileDir, url } = {}) {
  if (!text(xvfbRun) || !text(chrome) || !text(profileDir) || !text(url)) throw new Error('browser_launch_input_invalid');
  return Object.freeze({
    binary: xvfbRun,
    args: Object.freeze([
      '-a',
      '-s',
      '-screen 0 1440x1000x24 -nolisten tcp',
      chrome,
      '--disable-gpu',
      '--no-sandbox',
      '--hide-scrollbars',
      '--disable-sync',
      '--no-first-run',
      '--password-store=basic',
      '--use-mock-keychain',
      '--disable-background-networking',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-dev-shm-usage',
      '--window-size=1366,900',
      `--user-data-dir=${profileDir}`,
      url
    ])
  });
}
function runChrome(binary, args, resultPromise, getProgressState) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' }); let stdout = ''; let stderr = ''; let evidenceBody = ''; let failure; let stopping = false;
    const signal = (name) => {
      try {
        if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, name);
        else child.kill(name);
      } catch (_) { /* already stopped */ }
    };
    const stop = () => {
      if (stopping) return;
      stopping = true;
      signal('SIGTERM');
      setTimeout(() => signal('SIGKILL'), 5000).unref();
    };
    const hardTimer = setTimeout(() => {
      const progress = getProgressState(); failure = new Error(`chrome_browser_scenario_timeout:${progress.name}`); stop();
    }, 480000);
    const stallTimer = setInterval(() => {
      const progress = getProgressState(); if (Date.now() - progress.at < 90000) return; failure = new Error(`chrome_browser_scenario_stalled:${progress.name}`); stop();
    }, 1000);
    child.stdout.on('data', (chunk) => { stdout += chunk; }); child.stderr.on('data', (chunk) => { stderr += chunk; });
    resultPromise.then((body) => { evidenceBody = body; stop(); }).catch((error) => { failure = error; stop(); });
    child.once('error', (error) => { clearTimeout(hardTimer); clearInterval(stallTimer); reject(error); });
    child.once('close', (code) => { clearTimeout(hardTimer); clearInterval(stallTimer); if (failure) reject(failure); else if (!evidenceBody) reject(new Error(`browser_process_failed:${code}`)); else resolve({ code: 0, stdout, stderr, evidenceBody }); });
  });
}
function decodeHtml(value) { return value.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'); }
function evidenceFromDom(dom) {
  const match = String(dom).match(/<pre[^>]+id="crmAuthenticatedE2eResult"[^>]*>([\s\S]*?)<\/pre>/i); if (!match) throw new Error('browser_evidence_missing');
  const evidence = sanitize(JSON.parse(decodeHtml(match[1]))); if (evidence.status !== 'passed') throw new Error(`browser_e2e_failed:${evidence.error || 'unknown'}`); return evidence;
}

async function run(env = process.env, roleUi = '') {
  const config = loadConfig(env); const chrome = await findChrome(); const xvfbRun = await findXvfbRun(); const tempRoot = await mkdtemp(path.join(tmpdir(), 'lider-crm-authenticated-e2e-')); const tempV4 = path.join(tempRoot, 'v4'); let server;
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

    if (roleUi) {
      const local = await localServer(tempV4); server = local.server;
      const launch = browserLaunchPlan({ xvfbRun, chrome, profileDir: path.join(tempRoot, 'chrome-profile-role'), url: local.url });
      const chromeResult = await runChrome(launch.binary, launch.args, local.resultPromise, local.getProgressState);
      const evidence = sanitize(JSON.parse(chromeResult.evidenceBody)); if (evidence.status !== 'passed') throw new Error(`browser_e2e_failed:${evidence.error || 'unknown'}`);
      const target = path.resolve(config.evidencePath); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 }); return { evidence, target };
    }

    const assignmentLocal = await localServer(tempV4); server = assignmentLocal.server;
    const assignmentLaunch = browserLaunchPlan({ xvfbRun, chrome, profileDir: path.join(tempRoot, 'chrome-profile-assignment'), url: `${assignmentLocal.url}&e2e_phase=assignment` });
    const assignmentChrome = await runChrome(assignmentLaunch.binary, assignmentLaunch.args, assignmentLocal.resultPromise, assignmentLocal.getProgressState);
    const assignmentEvidence = sanitize(JSON.parse(assignmentChrome.evidenceBody));
    if (assignmentEvidence.status !== 'passed' || assignmentEvidence.phase !== 'assignment') throw new Error(`browser_assignment_phase_failed:${assignmentEvidence.error || 'unknown'}`);
    await waitForWorkflowRpc(assignmentLocal.getWorkflowRpcState);
    await closeServer(server); server = null;

    const mainLocal = await localServer(tempV4); server = mainLocal.server;
    const mainLaunch = browserLaunchPlan({ xvfbRun, chrome, profileDir: path.join(tempRoot, 'chrome-profile-main'), url: `${mainLocal.url}&e2e_phase=main` });
    const mainChrome = await runChrome(mainLaunch.binary, mainLaunch.args, mainLocal.resultPromise, mainLocal.getProgressState);
    const evidence = sanitize(JSON.parse(mainChrome.evidenceBody)); if (evidence.status !== 'passed') throw new Error(`browser_e2e_failed:${evidence.error || 'unknown'}`);
    evidence.assignment_phase = true;
    evidence.steps = [...(assignmentEvidence.steps || []), ...(evidence.steps || [])];
    const target = path.resolve(config.evidencePath); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 }); return { evidence, target };
  } finally {
    await closeServer(server);
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
