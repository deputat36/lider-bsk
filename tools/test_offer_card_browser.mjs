import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=process.cwd(), out=path.join(root,'artifacts/offer-card');
const mock=`
const offer={id:'offer-1',lead_id:'lead-1',calculation_id:'calc-1',title:'Вывеска для магазина',status:'Черновик',total_sum:1700,valid_until:'2026-11-05',updated_at:'2026-10-31T12:00:00.123456Z',full_text:'Описание предложения',short_text:'Краткое предложение'};
const calc={id:'calc-1',lead_id:'lead-1',title:'Вывеска',client_total:1700,is_current_revision:true};
globalThis.mock={offer,calc,delay:true,requests:[],mode:'ok',actorId:'actor-1',writes:0,receipts:new Map()};
export const supabaseClient={auth:{getSession:async()=>({data:{session:{user:{id:mock.actorId}}}})},functions:{invoke:async(name,{body})=>{
  mock.requests.push(structuredClone(body));
  if(body.action==='offer.update'){
    if(mock.mode==='conflict'){mock.mode='ok';offer.title='КП коллеги';offer.full_text='Условия коллеги';offer.updated_at='2026-10-31T12:01:00.654321Z';return{error:{context:{status:409,clone:()=>({json:async()=>({ok:false,error:{code:'conflict'}})})}}};}
    if(mock.receipts.has(body.request_id))return{data:{...mock.receipts.get(body.request_id),idempotent_replay:true}};
    Object.assign(offer,body.payload.patch,{updated_at:new Date().toISOString()});mock.writes++;
    const result={ok:true,offer:{...offer}};mock.receipts.set(body.request_id,result);
    if(mock.mode==='pending')return new Promise(resolve=>mock.release=()=>{mock.release=null;mock.released=true;resolve({data:result});});
    if(mock.mode==='lost'){mock.mode='ok';return{error:new Error('response lost')}};
    return{data:result};
  }
  offer.status=body.payload.status;offer.updated_at=new Date().toISOString();return{data:{ok:true,offer:{...offer},lead:{id:'lead-1',status:offer.status}}};
}},from(table){const query={select(){return this},eq(){return this},order(){return this},limit(){return this},single(){return this},maybeSingle(){return this},async then(resolve){
  if(mock.delay&&table==='leader_commercial_offers'){mock.delay=false;await new Promise(r=>setTimeout(r,500))}
  const data=table==='leader_commercial_offers'?{...offer}:table==='leader_lead_calculations'?calc:table==='leader_leads'?{id:'lead-1',name:'Клиент',status:'Новая'}:table==='leader_lead_calculation_items'?[{id:'item-1',name:'Вывеска',qty:1,client_sum:1700,client_price:1700}]:[];
  return resolve({data,error:null});}};return query}};
`;
const html=`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Карточка КП</title><style>body{font:16px Arial;margin:0}button,input,select,textarea{font:inherit;min-height:44px;max-width:100%;box-sizing:border-box}button{padding:8px;background:white;border:1px solid #777;color:#172033;border-radius:6px}.v4-form-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px}.v4-form-grid label{display:grid;gap:4px}.wide{grid-column:1/-1}*:focus-visible{outline:3px solid #b51721}</style></head><body><main><h1>Коммерческие предложения</h1><button id="open" data-open-offer-card="offer-1">Карточка КП</button></main><script type="module">import{v4State,setState}from'/crm/v4/assets/v4/state.js';v4State.user={id:'actor-1'};v4State.profileLoaded=true;v4State.profile={role:new URLSearchParams(location.search).get('role')||'manager',is_active:true};globalThis.testState=v4State;globalThis.changeActor=(id,role)=>{mock.actorId=id;setState({user:{id},profileLoaded:true,profile:{role,is_active:true}});};await import('/crm/v4/assets/v4/offer-card-v1.js');globalThis.ready=true;</script></body></html>`;
const server=createServer(async(req,res)=>{
  const p=new URL(req.url,'http://localhost').pathname;res.setHeader('Content-Type','text/javascript');
  if(p==='/test'){res.setHeader('Content-Type','text/html');res.end(html);return;}
  if(p.endsWith('/supabase-client.js')){res.end(mock);return;}
  if(p.endsWith('/config.js')){res.end("export const V4_CONFIG={supabaseUrl:'https://otulfnouybahfnsycxqn.supabase.co'}");return;}
  try{const f=path.resolve(root,'.'+p);if(!f.startsWith(root+'/'))throw 0;res.end(await readFile(f));}catch{res.statusCode=404;res.end('missing');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH});
const results=[];
const url=`http://127.0.0.1:${server.address().port}/test`;
async function edit(page){await page.click('.v4-offer-actions-line > details > summary');await page.click('[data-edit-type="offer"]');await page.waitForSelector('#offerEditForm');}
try {
  await mkdir(out,{recursive:true});
  for(const role of ['manager','owner']) for(const width of [360,390,768,1024,1440]) {
    const page=await browser.newPage({viewport:{width,height:1000}}), errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
    await page.goto(url+'?role='+role);await page.waitForFunction(()=>globalThis.ready);await page.click('#open');await edit(page);
    const title=`Новое КП ${role} ${width}`;
    const full='Подробные условия\nРазмер 3000 × 2000 мм\n'+ 'Текст без усечения. '.repeat(130);
    await page.fill('[name=title]',title);await page.fill('[name=full_text]',full);
    if(role==='manager'&&width===360) {
      await page.keyboard.press('Escape');await page.waitForSelector('[role=dialog]',{state:'detached'});
      await page.reload();await page.waitForFunction(()=>globalThis.ready);await page.click('#open');await edit(page);
      assert.equal(await page.inputValue('[name=title]'),title,'draft survives close and reload');
      assert.equal(await page.inputValue('[name=full_text]'),full);
      await page.evaluate(()=>mock.mode='lost');
      await page.click('#offerEditForm [type=submit]');
      await page.waitForFunction(()=>document.querySelector('[data-offer-edit-notice]')?.textContent.includes('Подтверждение не получено'));
      assert.equal(await page.inputValue('[name=full_text]'),full);
      await page.click('#offerEditForm [type=submit]');
      await page.waitForSelector('[data-offer-edit-saved]');
      assert.equal(await page.evaluate(()=>mock.writes),1);
      const requests=await page.evaluate(()=>mock.requests.filter(r=>r.action==='offer.update'));
      assert.deepEqual(requests[0],requests[1],'lost response retries the exact command');
    } else if(role==='owner'&&width===1440) {
      await page.evaluate(()=>mock.mode='conflict');await page.click('#offerEditForm [type=submit]');
      await page.waitForSelector('[data-offer-edit-reviewed]');
      assert.equal(await page.inputValue('[name=title]'),title);
      assert.match(await page.locator('[data-offer-comparison]').innerText(),/КП коллеги/);
      assert.equal(await page.locator('#offerEditForm [type=submit]').isDisabled(),true);
      await page.check('[data-offer-edit-reviewed]');await page.click('#offerEditForm [type=submit]');
      await page.waitForSelector('[data-offer-edit-saved]');
      assert.equal(await page.evaluate(()=>mock.requests.at(-1).expected_updated_at),'2026-10-31T12:01:00.654321Z');
    } else {await page.click('#offerEditForm [type=submit]');await page.waitForSelector('[data-offer-edit-saved]');}
    assert.equal(await page.evaluate(()=>mock.offer.full_text),full);
    assert.equal(await page.evaluate(()=>mock.offer.title),title);
    assert.equal(await page.evaluate(()=>mock.offer.total_sum),1700);
    await edit(page);assert.equal(await page.inputValue('[name=full_text]'),full);
    await page.click('[data-offer-edit-close]');await page.waitForSelector('#offerEditForm',{state:'detached'});
    await page.click('[data-offer-transition="Отправлено"]');await page.click('[data-offer-transition="Согласовано"]');
    await page.waitForSelector('[data-create-order-from-offer]');
    assert.equal(await page.locator('[data-edit-type="offer"]').count(),0,'agreed snapshot has no editable controls');
    assert.equal(await page.locator('#offerOrderCreateBox').count(),1,'order creation no longer depends on the edit button');
    for(const id of ['offerOrderPrepayment','offerOrderPaymentStatus']) assert.equal(await page.locator('#'+id).count(),role==='owner'?1:0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    if(width===360||width===1440) await page.screenshot({path:path.join(out,`offer-${role}-${width}.png`),fullPage:true});
    await page.keyboard.press('Escape');await page.waitForSelector('[role=dialog]',{state:'detached'});
    assert.equal(await page.evaluate(()=>document.activeElement.id),'open');assert.deepEqual(errors,[]);
    results.push({role,width,editSaveReadback:true,fullText:true,approvalReadOnly:true,orderAvailable:true,overflow:false,errors});await page.close();
  }
  for(const role of ['accountant','designer','installer','contractor']) {
    const page=await browser.newPage({viewport:{width:390,height:900}});await page.goto(url+'?role='+role);await page.waitForFunction(()=>globalThis.ready);await page.click('#open');
    assert.equal(await page.locator('[role=dialog]').count(),0,'a role without offers.read cannot open the cached card entry');
    assert.equal(await page.locator('[data-edit-type="offer"]').count(),0);assert.equal(await page.locator('[data-offer-transition]').count(),0);
    assert.equal(await page.evaluate(()=>mock.requests.length),0);
    results.push({role,editDenied:true});await page.close();
  }
  {
    const page=await browser.newPage({viewport:{width:390,height:900}}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url+'?role=owner');await page.waitForFunction(()=>globalThis.ready);await page.click('#open');await edit(page);
    await page.fill('[name=full_text]','Несохранённые правки первого пользователя');
    await page.evaluate(()=>changeActor('actor-2','owner'));
    assert.equal(await page.locator('[role=dialog]').count(),0,'old actor card is cleared synchronously');
    await page.click('#open');await edit(page);
    assert.equal(await page.inputValue('[name=full_text]'),'Описание предложения','draft is isolated by actor');
    await page.evaluate(()=>changeActor('actor-1','owner'));
    await page.click('#open');await edit(page);
    assert.equal(await page.inputValue('[name=full_text]'),'Несохранённые правки первого пользователя','returning actor can restore their own draft');
    await page.evaluate(()=>mock.mode='pending');await page.click('#offerEditForm [type=submit]');
    await page.waitForFunction(()=>typeof mock.release==='function');
    await page.evaluate(()=>changeActor('actor-2','designer'));
    assert.equal(await page.locator('[role=dialog]').count(),0);
    await page.evaluate(()=>mock.release());await page.waitForFunction(()=>mock.released===true);
    assert.equal(await page.locator('[role=dialog]').count(),0,'late successful write does not reopen the old actor card');
    assert.equal(await page.evaluate(()=>testState.offers.length),0,'late response does not apply to the new actor state');
    assert.deepEqual(errors,[]);results.push({actorChange:true,draftIsolated:true,lateResponseIgnored:true});await page.close();
  }
  await writeFile(path.join(out,'browser-report.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
} finally {await browser.close();await new Promise(r=>server.close(r));}
