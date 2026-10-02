// Real staging login and UI; evidence contains booleans and step names only.
export function clientsBrowserSource(loginSource) {
 const prefix=loginSource.slice(0,loginSource.indexOf('const visible='));
 if(!prefix||prefix===loginSource)throw new Error('client_login_anchor_missing');
 return prefix+String.raw`
const {supabaseClient:client}=await import('./assets/v4/supabase-client.js');
const {v4State:state}=await import('./assets/v4/state.js');
const steps=[];const record=name=>{steps.push(name);progress(name);};
const select=s=>{const n=document.querySelector(s);assert(n,'registry_node_missing:'+s);return n;};
const click=s=>{const n=select(s);assert(!n.disabled,'registry_disabled:'+s);n.click();};
const fill=(name,value)=>{const n=select('#clientEditForm [name="'+name+'"]');n.value=value;n.dispatchEvent(new Event('input',{bubbles:true}));};
click('[data-v4-tab-button="clients"]');await waitFor(()=>document.querySelector('[data-client-new]'),'registry_missing');
click('[data-client-new]');fill('name',R.marker+' client');fill('phone','+7 900 000 05 01');fill('comment','Synthetic registry test');
const originalFetch=globalThis.fetch;let lost=false;const keys=[];
globalThis.fetch=async(input,init)=>{const url=String(typeof input==='string'?input:input.url);let body;try{body=JSON.parse(init?.body||'null');}catch(_){}const response=await originalFetch(input,init);if(url.includes('/functions/v1/leader-crm-clients')&&body?.action==='client.create'){keys.push(body.request_id);if(response.ok&&!lost){lost=true;throw new TypeError('Synthetic response loss');}}return response;};
select('#clientEditForm').requestSubmit();await waitFor(()=>document.querySelector('#clientSaveNotice')?.dataset.error==='true','registry_loss_not_shown');assert(select('[name="name"]').disabled,'registry_uncertain_editable');
select('#clientEditForm').requestSubmit();await waitFor(()=>document.querySelector('[data-client-edit]'),'registry_retry_not_saved');globalThis.fetch=originalFetch;
assert(lost&&keys.length===2&&keys[0]===keys[1],'registry_retry_key_changed');record('registry_ui_response_loss_replay');
const found=await client.from('leader_clients').select('id,name,phone,updated_at').eq('owner_id',state.user.id).eq('phone','+7 900 000 05 01');assert(!found.error&&found.data.length===1,'registry_duplicate_after_retry');const row=found.data[0];
select('#clientSearch').value='8 (900) 000-05-01';select('#clientSearchForm').requestSubmit();await waitFor(()=>document.querySelector('[data-client-open="'+row.id+'"]'),'registry_normalized_search_failed');
click('[data-client-edit]');fill('comment','Edited through UI');fill('address','Synthetic address');select('#clientEditForm').requestSubmit();await waitFor(()=>document.querySelector('[data-client-edit]')&&document.getElementById('clientDetail').textContent.includes('Edited through UI'),'registry_edit_not_saved');record('registry_ui_edit_search');
const unwrap=async body=>{const r=await client.functions.invoke('leader-crm-clients',{body});if(r.error){try{return await r.error.context.clone().json();}catch(_){return {};}}return r.data;};
const duplicate=await unwrap({action:'client.create',request_id:crypto.randomUUID(),payload:{name:R.marker+' duplicate',phone:'8 900 000 05 01'}});assert(duplicate.error?.code==='duplicate_phone'&&duplicate.existing_client_id===row.id,'registry_phone_duplicate_allowed');
const stale=await unwrap({action:'client.update',request_id:crypto.randomUUID(),expected_updated_at:row.updated_at,payload:{client_id:row.id,name:R.marker+' stale',phone:row.phone}});assert(stale.error?.code==='source_changed','registry_stale_allowed');
const rpc=await client.rpc('leader_client_registry_rpc',{p_payload:{actor_id:state.user.id,request:{action:'client.list',payload:{}}}});assert(rpc.error,'registry_service_rpc_open');
const direct=await client.from('leader_clients').update({name:'Synthetic forbidden'}).eq('id',row.id).select('id');assert(direct.error,'registry_direct_patch_allowed');
const detail=await unwrap({action:'client.get',payload:{client_id:row.id}});assert(detail.ok&&detail.history.length===2&&!('owner_id' in detail.client),'registry_audit_or_privacy_failed');assert(detail.history.every(e=>Array.isArray(e.data.fields)),'registry_audit_fields_missing');record('registry_duplicate_stale_direct_api_guards');
assert(document.documentElement.scrollWidth<=innerWidth,'registry_mobile_overflow');
output('passed',{authenticated:true,role:'manager',registry_ui:true,retry_no_duplicate:true,normalized_search:true,edited:true,optimistic_lock:true,direct_writes_denied:true,audited:true,steps,cleanup_required:true});
}catch(error){output('failed',{error:clean(error?.message).slice(0,180),cleanup_required:true});}`;
}
