import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
const root=process.cwd(),output=path.join(root,'artifacts/crm-recovery');
const ids=Array.from({length:8},(_,i)=>'90000000-0000-4000-8000-0000000008'+String(i).padStart(2,'0'));
const mock=`
import { v4State } from '/crm/v4/assets/v4/state.js';
const row={id:'${ids[0]}',name:'Печать',category:'Печать',unit:'м²',contractor_price:100,markup_percent:30,default_client_price:null,min_client_price:0,is_active:true,sort_order:0,description:'Параметры',item_type:'Изготовление',calculation_mode:'markup',updated_at:'2026-10-22T09:00:00.123456Z'};
globalThis.mock={row,commands:[],receipts:new Map(),lose:false,stale:false,hold:false,release:null,holdRead:false,releaseRead:null,task:null,quotes:[],template:null};
const failure=code=>({error:{context:new Response(JSON.stringify({ok:false,error:{code}}),{status:409})}});
export const supabaseClient={auth:{getSession:async()=>({data:{session:{user:{id:v4State.user.id},access_token:'fixture-'+v4State.user.id}}})},from:table=>{
 let single=false;const q={select(){return q},eq(){return q},order(){return q},limit(){return q},single(){single=true;return q},then(resolve,reject){const result={data:table==='leader_catalog'?(single?{...mock.row}:[{...mock.row}]):[],error:null};if(mock.holdRead&&table==='leader_catalog'){mock.holdRead=false;return new Promise(r=>mock.releaseRead=()=>r(result)).then(resolve,reject);}return Promise.resolve(result).then(resolve,reject)}};return q;
},functions:{invoke:async(slug,options)=>{
 const cmd=structuredClone(options.body);mock.commands.push({slug,cmd,header:options.headers.Authorization});
 if(mock.hold){mock.hold=false;await new Promise(r=>mock.release=r);}
 if(slug==='leader-crm-catalog'){
  if(mock.stale){mock.stale=false;Object.assign(mock.row,{name:'Чужое название',category:'Новая категория',updated_at:'2026-10-22T10:00:00.654321Z'});return failure('source_changed');}
  const key=cmd.request_id;let data=mock.receipts.get(key);
  if(!data){Object.assign(mock.row,cmd.payload.patch);mock.row.updated_at='2026-10-22T11:00:00.654321Z';data={ok:true,catalog:{...mock.row},changed:true};mock.receipts.set(key,data);}
  if(mock.lose){mock.lose=false;throw Error('synthetic lost response');}return{data};
 }
 let data;
 switch(cmd.operation){
 case 'list':data={ok:true,rows:mock.task?[mock.task]:[],has_more:false};break;
 case 'assignees':data={ok:true,rows:[{id:'${ids[2]}',name:'Подрядчик в CRM'}]};break;
 case 'detail':data={ok:true,task:{...mock.task},quotes:mock.quotes,events:[]};break;
 case 'template.list':data={ok:true,rows:mock.template?[mock.template]:[],has_more:false};break;
 case 'template.get':data={ok:true,template:mock.template};break;
 case 'selection':data={ok:true,...cmd.payload,lead_id:'${ids[3]}',vendor_name:mock.task.vendor_name,items:mock.quotes.at(-1).items.filter(i=>cmd.payload.item_ids.includes(i.id))};break;
 default:
  if(mock.receipts.has(cmd.request_id))return{data:{...mock.receipts.get(cmd.request_id),replay:true}};
  if(mock.stale){mock.stale=false;mock.task.revision++;mock.task.brief='ТЗ изменил менеджер';return failure('source_changed');}
  if(cmd.operation==='create')mock.task={...cmd.payload,id:cmd.payload.task_id,revision:1,brief_version:1,status:'new'};
  if(cmd.operation==='respond'){const q={id:crypto.randomUUID(),version:mock.quotes.length+1,brief_version:mock.task.brief_version,items:cmd.payload.items,note:cmd.payload.note,valid_until:cmd.payload.valid_until,lead_time:cmd.payload.lead_time};mock.quotes.push(q);Object.assign(mock.task,{status:'review',current_quote_id:q.id,revision:mock.task.revision+1});}
  if(cmd.operation==='accept'){mock.task.status='accepted';mock.task.revision++;}
  if(cmd.operation==='template.save')mock.template={id:crypto.randomUUID(),name:cmd.payload.name,category:cmd.payload.category,vendor_name:mock.task.vendor_name,items:mock.quotes.at(-1).items.filter(i=>cmd.payload.item_ids.includes(i.id)),source_quote_id:mock.task.current_quote_id,cost_date:'2026-10-22T10:00:00Z',valid_until:'2026-10-01T10:00:00Z'};
  data={ok:true,task_id:mock.task.id,revision:mock.task.revision};mock.receipts.set(cmd.request_id,data);
  if(mock.lose){mock.lose=false;throw Error('synthetic lost response');}
 }
 return{data};
}}};`;
const html=kind=>`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CRM recovery check</title><link rel="stylesheet" href="/crm/v4/assets/v4/calculations.css"><style>*{box-sizing:border-box}body{margin:0;background:#f7f8fa;font:16px Arial;color:#162033}main{max-width:1240px;padding:16px;margin:auto}button,input,select,textarea{font:inherit}button{padding:10px;border:1px solid #bdc4d0;border-radius:8px;background:#fff;min-height:44px}.v4-card{background:#fff;padding:16px;border:1px solid #ddd;border-radius:16px;margin-bottom:16px}.v4-primary{background:#ff7900}.v4-empty{padding:12px}</style></head><body data-v4-tab="production"><main id="crmWorkspace"><nav id="v4LayoutTabs"></nav><section id="leadCardSection"><div id="calculationsBox"></div></section></main><script type="module">import{setState,v4State}from'/crm/v4/assets/v4/state.js';globalThis.changeActor=(role='owner')=>setState({user:{id:role==='owner'?'${ids[1]}':'${ids[2]}'},session:{access_token:'fixture'},profileLoaded:true,crmReady:true,profile:{role,is_active:true},route:{leadId:'${ids[3]}'},leadNeeds:[]});changeActor();globalThis.api=await import('/crm/v4/assets/v4/${kind==='catalog'?'catalog-management':'quote-workspace'}-v1.js');await api.mount();await api.load();document.querySelectorAll('[data-v4-managed-section]').forEach(n=>n.hidden=false);if('${kind}'==='quotes'){const calc=await import('/crm/v4/assets/v4/calculations.js');calc.bootCalculations();}globalThis.ready=true;</script></body></html>`;
let testProduction=false;
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost'),p=url.pathname;res.setHeader('Cache-Control','no-store');
 if(p==='/test'){testProduction=url.searchParams.has('production');res.setHeader('Content-Type','text/html');res.end(html(url.searchParams.get('kind')));return;}
 if(p.endsWith('/supabase-client.js')){res.setHeader('Content-Type','text/javascript');res.end(mock);return;}
 if(p.endsWith('/config.js')){res.setHeader('Content-Type','text/javascript');res.end("export const V4_CONFIG={supabaseUrl:'https://"+(testProduction?'ofewxuqfjhamgerwzull':'otulfnouybahfnsycxqn')+".supabase.co'};");return;}
 if(p.endsWith('/api.js')){res.setHeader('Content-Type','text/javascript');res.end("export const timeout=async p=>await p;export const friendlyError=e=>e?.message||String(e);");return;}
 if(p.endsWith('/ui.js')){res.setHeader('Content-Type','text/javascript');res.end("export const byId=id=>document.getElementById(id);export const toast=()=>{};export const setStatus=()=>{};");return;}
 try{const file=path.resolve(root,'.'+p);if(!file.startsWith(root+path.sep))throw Error();res.setHeader('Content-Type',p.endsWith('.js')?'text/javascript':p.endsWith('.css')?'text/css':'text/plain');res.end(await readFile(file));}catch(_){res.statusCode=404;res.end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.LEADER_BROWSER_EXECUTABLE||undefined}),report=[];
try{
 await mkdir(output,{recursive:true});
 for(const width of [360,390,1440]){
  const context=await browser.newContext({viewport:{width,height:1000}});await context.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/test?kind=catalog`);await page.waitForFunction(()=>globalThis.ready);
  await page.click('[data-catalog-id]');await page.click('#catalogManagementEditBtn');await page.fill('#catalogManagementEditor [name=name]','Моё название');await page.fill('[name=description]','Параметры без потери');await page.fill('[name=reason]','Новый прайс');
  await page.fill('#catalogManagementSearch','Печать');assert.equal(await page.inputValue('[name=name]'),'Моё название','filter render preserves unsaved fields');
  await page.evaluate(()=>mock.stale=true);await page.click('#catalogManagementEditor [type=submit]');await page.waitForFunction(()=>document.querySelector('.v4-catalog-note.is-error')?.textContent.includes('Ваши поля сохранены'));
  assert.equal(await page.inputValue('[name=reason]'),'Новый прайс');await page.click('#catalogReviewCurrent');await page.waitForSelector('#catalogKeepMine');assert.equal(await page.inputValue('[name=category]'),'Новая категория','untouched server field retained');await page.click('#catalogKeepMine');
  await page.evaluate(()=>mock.lose=true);await page.click('#catalogManagementEditor [type=submit]');await page.waitForFunction(()=>document.querySelector('#catalogManagementEditor [type=submit]')?.textContent==='Повторить сохранение');assert.equal(await page.isDisabled('[name=name]'),true);await page.click('#catalogManagementEditor [type=submit]');await page.waitForSelector('#catalogManagementEditBtn');
  const writes=await page.evaluate(()=>mock.commands.filter(c=>c.slug==='leader-crm-catalog'));
  assert.deepEqual(writes.at(-1).cmd,writes.at(-2).cmd,'uncertain repeat keeps the exact command');assert.equal(writes.at(-1).cmd.expected_updated_at,'2026-10-22T10:00:00.654321Z');assert.equal(writes.at(-1).header,'Bearer fixture-'+ids[1]);
  await page.fill('#catalogManagementSearch','');await page.click('[data-catalog-id]');await page.click('#catalogManagementEditBtn');await page.fill('[name=name]','Проверка отмены');page.once('dialog',d=>d.dismiss());await page.click('#catalogManagementReloadBtn');assert.equal(await page.inputValue('[name=name]'),'Проверка отмены');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(output,'catalog-'+width+'.png'),fullPage:true});
  await page.evaluate(()=>mock.hold=true);await page.click('#catalogManagementEditor [type=submit]');await page.waitForFunction(()=>mock.release);await page.evaluate(()=>{changeActor('contractor');mock.release()});await page.waitForTimeout(30);assert.equal(await page.locator('#catalogManagementContent').textContent(),'','late response cannot repaint for another actor');
  await page.goto(`http://127.0.0.1:${server.address().port}/test?kind=quotes`);await page.waitForFunction(()=>globalThis.ready);
  await page.click('[data-quote-action=create]');await page.waitForSelector('#quoteEditor');await page.fill('[name=title]','Вывеска — уточнить материал');await page.fill('[name=vendor_name]','Подрядчик');await page.fill('[name=brief]','Проверить объёмы, материал и сроки');await page.selectOption('[name=assignee_id]',ids[2]);await page.click('#quoteEditor [type=submit]');await page.waitForSelector('[data-quote-action=respond]');
  await page.click('[data-quote-action=respond]');await page.fill('[name=name_0]','Печать');await page.fill('[name=unit_0]','м');await page.fill('[name=qty_0]','2,5');await page.fill('[name=cost_0]','120,50');await page.fill('[name=specification_0]','Материал согласован');await page.fill('[name=note]','Внутренние условия не для клиента');await page.fill('[name=source_note]','Письмо от подрядчика');
  await page.evaluate(()=>mock.stale=true);await page.click('#quoteEditor [type=submit]');await page.waitForFunction(()=>document.querySelector('#quoteEditor [type=submit]')?.disabled);await page.click('[data-quote-action=reload-detail]');await page.waitForSelector('[data-quote-action=confirm-source]');assert.equal(await page.inputValue('[name=qty_0]'),'2,5');await page.click('[data-quote-action=confirm-source]');
  await page.evaluate(()=>mock.lose=true);await page.click('#quoteEditor [type=submit]');await page.waitForFunction(()=>document.querySelector('#quoteEditor [type=submit]')?.textContent==='Повторить тот же запрос');await page.click('#quoteEditor [type=submit]');await page.waitForSelector('[data-quote-action=accept]');
  const responses=await page.evaluate(()=>mock.commands.filter(c=>c.cmd.operation==='respond'));assert.deepEqual(responses.at(-1).cmd,responses.at(-2).cmd);assert.equal(responses.at(-1).cmd.expected_revision,2);
  page.once('dialog',d=>d.accept());await page.click('[data-quote-action=accept]');await page.waitForSelector('[data-quote-item]');await page.check('[data-quote-item]');await page.click('[data-quote-action=transfer]');await page.waitForSelector('#calcDraftItems [data-calc-row-field=qty]');assert.equal(await page.inputValue('#calcDraftItems [data-calc-row-field=qty]'),'2.5');assert.equal(await page.inputValue('#calcDraftItems [data-calc-row-field=contractor_price]'),'120.5');assert(!String(await page.textContent('#calcDraftItems')).includes('Внутренние условия'));
  await page.click('[data-quote-action=transfer]');assert.equal(await page.locator('#calcDraftItems tr').count(),1,'double click does not duplicate items');
  await page.click('[data-quote-action="template.save"]');await page.fill('#quoteEditor [name=name]','Печать на плёнке');await page.click('#quoteEditor [type=submit]');await page.waitForFunction(()=>!document.querySelector('#quoteEditor'));await page.click('[data-quote-action=templates]');await page.waitForSelector('[data-quote-action^="template-"]');await page.click('[data-quote-action^="template-"]');await page.waitForSelector('#quoteTemplateConfirm');await page.check('[data-quote-item]');await page.click('[data-quote-action=transfer-template]');assert.equal(await page.locator('#calcDraftItems tr').count(),1,'template needs current-price confirmation');await page.check('#quoteTemplateConfirm');await page.click('[data-quote-action=transfer-template]');await page.waitForFunction(()=>document.querySelectorAll('#calcDraftItems tr').length===2);
  await page.screenshot({path:path.join(output,'quotes-'+width+'.png'),fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.evaluate(()=>changeActor('contractor'));assert.equal(await page.locator('#quoteWorkspaceSection').count(),0);await page.evaluate(async()=>{await api.load();document.getElementById('quoteWorkspaceSection').hidden=false;});assert.equal(await page.locator('[data-quote-action=create]').count(),0);assert.equal(await page.locator('[data-quote-action=templates]').count(),0);
  await page.evaluate(()=>changeActor('designer'));await page.evaluate(()=>api.load());assert.equal(await page.locator('#quoteWorkspaceSection').count(),0);
  await page.goto(`http://127.0.0.1:${server.address().port}/test?kind=quotes&production=1`);await page.waitForFunction(()=>globalThis.ready);assert.equal(await page.locator('#quoteWorkspaceSection').count(),0);assert.equal(await page.evaluate(()=>mock.commands.length),0,'production quote UI makes no requests');
  assert.deepEqual(errors,[]);report.push({width,catalogDraft:true,exactRetry:true,conflict:true,actorChange:true,quoteRequest:true,staleResponse:true,selectedTransfer:true,template:true,permissions:true,noPageErrors:true});await context.close();
 }
 await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,cases:report.length}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
