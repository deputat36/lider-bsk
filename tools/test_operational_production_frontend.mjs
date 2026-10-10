import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { isExactOperationalProductionUrl, operationalProductionAvailable } from '../crm/v4/assets/v4/operational-production-gate-v1.js';
import { installationJobPersistenceRoute } from '../crm/v4/assets/v4/installation-job-save-route-v1.js';
import { productionStagingTransportAvailability, invokeStagingProductionJob } from '../crm/v4/assets/v4/production-job-staging-transport-v1.js';
import { installationStagingTransportAvailability, invokeStagingInstallationJob } from '../crm/v4/assets/v4/installation-job-staging-transport-v1.js';
import { installationStagingReadAvailability, invokeStagingInstallationJobRead } from '../crm/v4/assets/v4/installation-job-staging-read-transport-v1.js';

const url = 'https://ofewxuqfjhamgerwzull.supabase.co';
const id = '11111111-1111-4111-8111-111111111111';
const timestamp = '2026-10-09T06:00:00.123456Z';
const draft = {command:'production_job.create_from_order',order_id:id,idempotency_key:`production_job.create_from_order:${id}:v1`,job:{title:'Вывеска',priority:'Обычная',layout_status:'Макет согласован'}};
const base = {supabaseUrl:url,productionEnabled:true,canWrite:true,canRead:true,expectedUpdatedAt:timestamp,draft,job:{id},jobId:id,patch:{install_status:'В работе'},idempotencyKey:`installation-job:${id}:${id}`,cryptoObject:{randomUUID:()=>id}};
const availability = [productionStagingTransportAvailability, installationStagingTransportAvailability, installationStagingReadAvailability];
assert.equal(operationalProductionAvailable(url),true);
assert.equal(installationJobPersistenceRoute(url,true).mode,'production_edge');
assert.equal(installationJobPersistenceRoute(url).enabled,false);
for (const check of availability) {
  assert.equal(check(base).enabled,true);
  assert.equal(check({...base,productionEnabled:false}).enabled,false);
  assert.equal(check({...base,canWrite:false,canRead:false}).enabled,false);
}
for (const unsafe of ['http://ofewxuqfjhamgerwzull.supabase.co',url+'/rest/v1',url+'?x=1',url+'#x',url+':444',url.replace('https://','https://user@'),url+'.evil.example','not-a-url']) {
  assert.equal(isExactOperationalProductionUrl(unsafe),false,unsafe);
  for (const check of availability) assert.equal(check({...base,supabaseUrl:unsafe}).enabled,false,unsafe);
}
const calls=[];
const client={auth:{getSession:async()=>({data:{session:{access_token:'mock-user-token'}}})},functions:{invoke:async(slug,options)=>{calls.push({slug,options});return {data:{ok:true,job:{id},entity:{id},events:[],items:[]},error:null}}}};
for (const invoke of [invokeStagingProductionJob,invokeStagingInstallationJob,invokeStagingInstallationJobRead]) {
  assert.equal((await invoke({...base,client})).ok,true);
  const n=calls.length;
  assert.equal((await invoke({...base,productionEnabled:false,client})).ok,false);
  assert.equal(calls.length,n);
}
assert.deepEqual(calls.map(x=>x.slug),['leader-crm-production-create','leader-crm-installation','leader-crm-installation']);
assert.equal(calls[2].options.body.action,'installation_job.read');

// Execute the actual production create form with a minimal DOM and mocked API.
const listeners={}; const elements={}; const fields={}; const requests=[]; const notices=[];
const order={id,updated_at:timestamp,project_name:'Вывеска',installation_address:null,installer_name:null};
globalThis.document={
  getElementById:key=>elements[key],
  createElement:()=>({dataset:{},remove(){delete elements[this.id]},querySelector:selector=>({value:fields[selector.slice(1)]||''})}),
  body:{appendChild:el=>{elements[el.id]=el}},
  addEventListener:(type,fn)=>{listeners[type]=fn},querySelector:()=>null
};
globalThis.window={};
let createAllowed=true;
globalThis.__createFixture={CRM_V4_ACTIONS:{INSTALLATION_WRITE:'installation.write',ORDERS_READ:'orders.read'},canPerformV4Action:()=>createAllowed,V4_CONFIG:{supabaseUrl:url},operationalProductionAvailable,friendlyError:e=>e.message,toast:t=>notices.push(t),isStagingInstallationEnvironment:()=>false,
  supabaseClient:{from:table=>({select(){return this},eq(){return this},single:async()=>({data:table==='leader_orders'?order:{id,order_id:id,production_status:'Готово',updated_at:timestamp}})}),functions:{invoke:async(slug,options)=>{requests.push({slug,options});return {data:{ok:true,entity:{id},idempotent_replay:requests.length>1}}}}}
};
let source=await readFile(new URL('../crm/v4/assets/v4/installation-job-staging-create-v1.js',import.meta.url),'utf8');
source=source.replace(/^import .*;\n/gm,'');
source='const {CRM_V4_ACTIONS,canPerformV4Action,V4_CONFIG,operationalProductionAvailable,friendlyError,toast,isStagingInstallationEnvironment,supabaseClient}=globalThis.__createFixture;\n'+source;
await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const click=selector=>listeners.click({preventDefault(){},target:{closest:query=>query===selector?{dataset:{installationOrder:id,installationStagingCreate:id}}:null}});
createAllowed=false;
click('[data-installation-staging-create]');
assert.equal(elements.installationStagingCreateV1,undefined);
createAllowed=true;
click('[data-installation-staging-create]');
await new Promise(resolve=>setImmediate(resolve));
const modal=elements.installationStagingCreateV1;
assert.doesNotMatch(modal.innerHTML,/Synthetic/);
assert.match(modal.innerHTML,/installationCreateSchedule[^>]*value=""/);
click('[data-installation-staging-confirm]');
await new Promise(resolve=>setImmediate(resolve));
assert.equal(requests.length,0);
assert.match(notices.at(-1),/адрес/);
Object.assign(fields,{installationCreateTitle:'Монтаж вывески',installationCreateAddress:'Воронеж, адрес клиента',installationCreateSchedule:'2026-10-15T10:00',installationCreateInstaller:'Исполнитель',installationCreateTask:'По согласованному макету'});
createAllowed=false;
click('[data-installation-staging-confirm]');
assert.equal(requests.length,0);
createAllowed=true;
click('[data-installation-staging-confirm]');
await new Promise(resolve=>setImmediate(resolve));
assert.equal(requests.length,2);
assert.equal(requests[0].slug,'leader-crm-installation-create');
assert.equal(requests[0].options.body.payload.job.address,fields.installationCreateAddress);
assert.equal(requests[0].options.body.payload.job.scheduled_at,new Date(fields.installationCreateSchedule).toISOString());
assert.equal(requests[0].options.body.payload.job.installer_name,fields.installationCreateInstaller);
assert.equal('installer_cost' in requests[0].options.body.payload.job,false);
assert.equal('client_price' in requests[0].options.body.payload.job,false);
assert.deepEqual(requests[0].options.body.payload,requests[1].options.body.payload);
assert.notEqual(requests[0].options.body.request_id,requests[1].options.body.request_id);
assert.equal(elements.installationStagingCreateV1,undefined);
console.log('Production opt-in, exact URL, permission gates, Edge routes, actual form validation and replay PASS.');
