import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {createOperationalCommandRetry} from '../crm/v4/assets/v4/operational-command-retry-v1.js';
import {invokeStagingInstallationJob} from '../crm/v4/assets/v4/installation-job-staging-transport-v1.js';
const id='11111111-1111-4111-8111-111111111111';
const actor='22222222-2222-4222-8222-222222222222';
const stamp='2026-10-10T07:00:00.123456Z';
const url='https://ofewxuqfjhamgerwzull.supabase.co';
const retry=createOperationalCommandRetry();
const context={actorId:actor,supabaseUrl:url,action:'production_job.update',jobId:id,expectedUpdatedAt:stamp,patch:{title:'Задание',contractor_comment:'Текст'}};
const first=retry.prepare(context);
assert.equal(retry.prepare({...context,patch:{contractor_comment:'Текст',title:'Задание'}}),first);
for(const modified of [{actorId:id},{supabaseUrl:'https://otulfnouybahfnsycxqn.supabase.co'},{expectedUpdatedAt:'2026-10-10T08:00:00Z'},{patch:{title:'Изменено'}}]) {
  assert.notEqual(retry.prepare({...context,...modified}).payload.idempotency_key,first.payload.idempotency_key);
}
assert.equal(first.expected_updated_at,stamp);
retry.confirm(first);
assert.notEqual(retry.prepare(context).request_id,first.request_id);
assert.throws(()=>retry.prepare({...context,actorId:null}),/context_invalid/);
assert.throws(()=>retry.prepare({...context,patch:{title:'Uncached'}},{randomUUID:()=> 'unsafe'}),/secure_request_id/);

// Run each real save function against a receipt/revision API double. The first
// request commits remotely but loses its response; retry must recover that receipt.
for(const kind of ['production','installation']) {
  const source=await readFile(new URL(`../crm/v4/assets/v4/${kind}-job-card-v2.js`,import.meta.url),'utf8');
  const start=source.indexOf('function field(id)');
  const end=source.indexOf(kind==='production'?'async function printJob':'async function addComment',start);
  assert(end>start);
  let revision=stamp, permitted=true;
  const requests=[],receipts=new Map(),messages=[];
  const old={id,order_id:id,title:'Задание',production_status:'В работе',install_status:'В работе',layout_status:'Макет согласован',priority:'Обычная',updated_at:stamp};
  const values={prodJobStatus:'В работе',installJobStatus:'В работе',prodJobTitle:'Задание',installJobTitle:'Задание',prodJobContractorComment:'Первая правка',installJobComment:'Первая правка'};
  const backend={auth:{getSession:async()=>({data:{session:{access_token:'mock-user-token'}}})},functions:{invoke:async(slug,{body})=>{
    requests.push(JSON.parse(JSON.stringify(body)));
    const key=body.payload.idempotency_key;
    if(receipts.has(key)) return {data:{ok:true,idempotent_replay:true,job:{id},order:{id}},error:null};
    if(body.expected_updated_at!==revision) return {data:{ok:false,error:{code:'conflict'}},error:null};
    revision='2026-10-10T0'+(receipts.size+8)+':00:00Z'; receipts.set(key,body);
    if(requests.length===1) return {error:{message:'response lost'},data:null};
    return {data:{ok:true,job:{id},order:{id}},error:null};
  }}};
  const vmContext={busy:false,currentBundle:{job:{...old}},commandRetry:createOperationalCommandRetry(),
    canOpenV4ProductionKind:()=>true,canPerformV4Action:()=>permitted,
    CRM_V4_ACTIONS:{PRODUCTION_WRITE:'production.write',INSTALLATION_WRITE:'installation.write'},
    v4State:{user:{id:actor}},V4_CONFIG:{supabaseUrl:url},OPERATIONAL_PRODUCTION_ENABLED:true,
    operationalProductionAvailable:()=>true,isStagingProductionEnvironment:()=>false,stagingEdgeEnabled:()=>true,
    canViewV4InternalNotes:()=>false,supabaseClient:backend,invokeStagingInstallationJob,
    validateProductionStatusTransition:()=>({ok:true,storedValue:'В работе'}),
    validateInstallationStatusTransition:()=>({ok:true,storedValue:'В работе'}),
    productionStatusTimestampPatch:()=>({}),installationStatusTimestampPatch:()=>({}),nowIso:()=>new Date().toISOString(),
    toast:x=>messages.push(x),setStatus:()=>{},friendlyError:e=>e.message,
    fetchBundle:async()=>({job:{...old,updated_at:revision}}),
    renderCard:bundle=>{vmContext.currentBundle=bundle},
    document:{getElementById:key=>({value:values[key]||''}),dispatchEvent(){}},CustomEvent:class{},crypto:globalThis.crypto
  };
  const save=runInNewContext(source.slice(start,end)+';saveJob',vmContext);
  await save(id);
  assert.equal(receipts.size,1,kind);
  assert.equal(vmContext.currentBundle.job.updated_at,stamp,kind);
  await save(id);
  assert.deepEqual(requests[1],requests[0],kind+' retry preserves whole command');
  assert.equal(receipts.size,1,kind+' no second mutation');
  assert.equal(vmContext.currentBundle.job.updated_at,revision);
  values[kind==='production'?'prodJobContractorComment':'installJobComment']='Вторая правка';
  await save(id);
  assert.equal(receipts.size,2,kind+' same-status edit works');
  assert.notEqual(requests[2].payload.idempotency_key,requests[0].payload.idempotency_key);
  permitted=false; await save(id); assert.equal(requests.length,3,kind+' fresh UI permission');
  assert.match(source,/canPerformV4Action\(CRM_V4_ACTIONS\.[A-Z]+_WRITE\) \? '' : 'disabled'/);
}
// Contractor reads must never query orders without the orders tab permission.
const production=await readFile(new URL('../crm/v4/assets/v4/production-job-card-v2.js',import.meta.url),'utf8');
const queries=[];
const fetchSource=production.slice(production.indexOf('async function fetchBundle'),production.indexOf('function renderItems'));
const fetchBundle=runInNewContext(fetchSource+';fetchBundle',{
  canOpenV4ProductionKind:()=>true,canOpenV4Tab:()=>false,
  V4_CONFIG:{supabaseUrl:url},isStagingProductionEnvironment:()=>false,operationalProductionAvailable:()=>true,
  jobFields:()=> 'id,order_id',orderFields:()=> 'id',eventFields:()=> 'id',
  supabaseClient:{from(table){queries.push(table);assert.notEqual(table,'leader_orders');return {
    select(){return this},eq(){return this},order(){return this},limit(){return this},
    single:async()=>({data:{id,order_id:id}}),then:resolve=>resolve({data:[]})
  }}}
});
assert.equal((await fetchBundle(id)).order,null);
assert.deepEqual(queries,['leader_production_jobs','leader_production_events']);
console.log('Actual production/installation save: lost response replay, same-status edits, actor/revision isolation and write denial PASS.');
