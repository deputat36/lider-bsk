import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { stripTypeScriptTypes } from 'node:module';
import { catalogManagementWriteAvailability, checkCatalogManagementAccess, clearCatalogManagementAccess, invokeStagingCatalogManagement } from '../crm/v4/assets/v4/catalog-management-staging-transport-v1.js';

const actor='15200000-0000-4000-8000-000000000201', other='15200000-0000-4000-8000-000000000202';
const prod='https://ofewxuqfjhamgerwzull.supabase.co';
let user=actor, mode='ok', calls=0, release;
const client={auth:{getSession:async()=>({data:{session:{user:{id:user},access_token:'synthetic-'+user}}})},functions:{invoke:async(slug,options)=>{
 calls++; assert.equal(slug,'leader-crm-catalog');assert.equal(options.headers.Authorization,'Bearer synthetic-'+actor);
 if(mode==='hold')await new Promise(r=>{release=r});
 if(mode==='fail')throw Error('synthetic network failure');
 const c=options.body;
 if(c.action==='catalog.access')return {data:{ok:true,can_manage:true,actor_id:mode==='wrong-actor'?other:actor,request_id:mode==='wrong-nonce'?other:c.request_id,project_ref:mode==='wrong-project'?'other':'ofewxuqfjhamgerwzull',contract:mode==='wrong-contract'?'other':'leader-catalog-access-v1'}};
 return {data:{ok:true,operation:'create',request_id:c.request_id,catalog:{id:other}}};
}}};
const options={client,supabaseUrl:prod,canManage:true,actorId:actor};
assert.equal(catalogManagementWriteAvailability(options).enabled,false);
for(const supabaseUrl of [prod+'.evil.test','http://ofewxuqfjhamgerwzull.supabase.co','https://other.supabase.co']){
 const n=calls;assert.equal((await checkCatalogManagementAccess({...options,supabaseUrl})).ok,false);assert.equal(calls,n);
}
assert.equal((await checkCatalogManagementAccess({...options,canManage:false})).ok,false);assert.equal(calls,0);
for(mode of ['fail','wrong-actor','wrong-project','wrong-nonce','wrong-contract']){
 clearCatalogManagementAccess(client);assert.equal((await checkCatalogManagementAccess(options)).ok,false);assert.equal(catalogManagementWriteAvailability(options).enabled,false);
}
mode='ok';assert.equal((await checkCatalogManagementAccess(options)).ok,true);assert.equal(catalogManagementWriteAvailability(options).enabled,true);
assert.equal(catalogManagementWriteAvailability({...options,actorId:other}).enabled,false);
assert.equal(catalogManagementWriteAvailability({...options,canManage:false}).enabled,false);
const saved=await invokeStagingCatalogManagement({...options,operation:'create',idempotencyKey:'access-unit-create',patch:{name:'Synthetic',category:'Synthetic',unit:'шт'}});
assert.equal(saved.ok,true);
clearCatalogManagementAccess(client);mode='hold';const pending=checkCatalogManagementAccess(options);
while(!release)await new Promise(r=>setImmediate(r));user=other;release();assert.equal((await pending).ok,false);assert.equal(catalogManagementWriteAvailability(options).enabled,false);
user=actor;mode='hold';release=null;const stale=checkCatalogManagementAccess(options);
while(!release)await new Promise(r=>setImmediate(r));clearCatalogManagementAccess(client);release();assert.equal((await stale).ok,false);
const stuckClient={auth:{getSession:()=>new Promise(()=>{})}};
assert.equal((await checkCatalogManagementAccess({...options,client:stuckClient})).ok,false,'a stalled session cannot block access checking indefinitely');

// Execute the actual generated production handler and staging handler with
// synthetic Auth/service fetches. No HTTP request leaves this process.
execFileSync('python3',['tools/build_catalog_production_package.py']);
const encode=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const originalFetch=globalThis.fetch,originalDeno=globalThis.Deno;
try{
 for(const [directory,ref] of [['supabase/functions/leader-crm-catalog','otulfnouybahfnsycxqn'],['build/crm-catalog-production-package/edge/leader-crm-catalog','ofewxuqfjhamgerwzull']]){
  let handler,allowed=true,authenticated=true,rpcMode='ok',rpcPayloads=[];
  globalThis.Deno={env:{get:name=>({SUPABASE_URL:'https://'+ref+'.supabase.co',SUPABASE_ANON_KEY:'synthetic-anon',SUPABASE_SERVICE_ROLE_KEY:'synthetic-service'})[name]},serve:fn=>{handler=fn}};
  globalThis.fetch=async(url,init)=>{
   if(url.endsWith('/auth/v1/user'))return Response.json({id:actor,email:'synthetic@example.invalid'},{status:authenticated?200:401});
   assert.equal(init.headers.Authorization,'Bearer synthetic-service');
   if(url.endsWith('/rpc/leader_actor_has_crm_action_rpc'))return Response.json(allowed);
   assert(url.endsWith('/rpc/leader_manage_catalog_rpc'));
   const body=JSON.parse(init.body);rpcPayloads.push(body);
   if(rpcMode==='stopped')return Response.json({}, {status:403});
   if(rpcMode==='bad')return Response.json({ok:true});
   if(!Object.keys(body.p_payload).length)return Response.json({ok:false,error:{code:'invalid_payload'}});
   assert.equal(body.p_payload.actor_id,actor);return Response.json({ok:true,operation:'create',catalog:{id:other}});
  };
  const contract=encode(stripTypeScriptTypes(readFileSync(directory+'/contract.ts','utf8')));
  const source=readFileSync(directory+'/index.ts','utf8').replace(/^import 'jsr:[^\n]+\n/,'').replace("'./contract.ts'",JSON.stringify(contract));
  await import(encode(stripTypeScriptTypes(source)));
  const probe={action:'catalog.access',request_id:actor};
  const request=body=>new Request('https://'+ref+'.supabase.co/functions/v1/leader-crm-catalog',{method:'POST',headers:{Authorization:'Bearer synthetic-user','Content-Type':'application/json'},body:JSON.stringify(body)});
  let response=await handler(request(probe));assert.equal(response.status,200);const ack=await response.json();assert.equal(ack.actor_id,actor);assert.equal(ack.project_ref,ref);assert.equal(ack.contract,'leader-catalog-access-v1');assert.deepEqual(rpcPayloads,[{p_payload:{}}]);
  rpcPayloads=[];allowed=false;response=await handler(request(probe));assert.equal(response.status,403);assert.equal(rpcPayloads.length,0);
  allowed=true;authenticated=false;response=await handler(request(probe));assert.equal(response.status,401);assert.equal(rpcPayloads.length,0);
  authenticated=true;for(rpcMode of ['stopped','bad']){response=await handler(request(probe));assert.equal(response.status,503);}
  rpcPayloads=[];rpcMode='ok';response=await handler(request({...probe,actor_id:other}));assert.equal(response.status,400);assert.equal(rpcPayloads.length,0);
  response=await handler(request({action:'catalog.manage',request_id:actor,payload:{operation:'create',idempotency_key:'unchanged-business-path',patch:{name:'Synthetic',category:'Synthetic',unit:'шт'}}}));assert.equal(response.status,201);
 }
}finally{globalThis.fetch=originalFetch;globalThis.Deno=originalDeno;}
console.log('Catalog access: actor/project/nonce proof, fail-closed production, late response rejection and real staging/production Edge handlers PASS');
