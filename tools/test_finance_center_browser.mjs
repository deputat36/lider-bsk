import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const { chromium } = createRequire(import.meta.url)('playwright');
const root = process.cwd(), output = 'artifacts/finance-center';
await mkdir(output, { recursive: true });
const mockSource = `
const m=window.__financeMock;
class Query {
 constructor(table){this.table=table;this.start=0;this.end=99999;this.equal=[];this.one=false;}
 select(){return this;}order(){return this;}limit(n){this.end=n-1;return this;}
 eq(k,v){this.equal.push([k,v]);return this;}range(a,b){this.start=a;this.end=b;return this;}
 single(){this.one=true;return this.result();}
 async result(){
  m.reads.push({table:this.table,start:this.start});
  if(m.hold)await new Promise(r=>m.pending.push(r));
  if(m.failPage&&this.table==='leader_payments'&&this.start>=500)return{error:{message:'synthetic page failure'}};
  const rows=(m[this.table]||[]).filter(x=>this.equal.every(([k,v])=>x[k]===v)).slice(this.start,this.end+1);
  return{data:this.one?rows[0]:structuredClone(rows),error:null};
 }
 then(a,b){return this.result().then(a,b);}
}
export const supabaseClient={auth:{getSession:async()=>({data:{session:{user:(await import('./state.js')).v4State.user,access_token:'synthetic-fixture-token'}},error:null})},from:t=>new Query(t),functions:{invoke:async(name,{body})=>{
 if(name==='leader-crm-finance-adjustments')return{data:{ok:true,rows:[]}};
 m.writes.push({name,action:body.action});
 const p=body.payload||{},order=m.leader_orders.find(x=>x.id===p.order_id);
 if(body.action==='finance.payment.create')m.leader_payments.push({id:crypto.randomUUID(),order_id:order.id,amount:p.amount,payment_status:'Проведён',payment_type:'Приход',is_confirmed:true,payment_date:p.date,updated_at:'2026-10-14T05:00:01Z'});
 if(body.action==='finance.expense.create')m.leader_expenses.push({id:crypto.randomUUID(),order_id:order.id,amount:p.amount,status:'Проведён',category:p.category,expense_date:p.date,updated_at:'2026-10-14T05:00:01Z'});
 order.updated_at='2026-10-14T05:00:01.123456Z';
 return{data:{ok:true},error:null};
}}};`;
const functionsSource = `export async function invokeLeaderFunction(name,body){const m=window.__financeMock;m.details.push({name,action:body.action});return{order:structuredClone(m.leader_orders.find(x=>x.id===body.order_id)),items:[]};}`;
const fixture = role => `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/brand/leader-tokens.css"><style>body{margin:16px;font-family:Arial;max-width:1180px}button{font:inherit;min-height:44px;cursor:pointer}*{box-sizing:border-box}.v4-card{min-width:0}.v4-section-head{display:flex;gap:12px;justify-content:space-between}.v4-primary{background:#ff6a00!important;color:#111!important;border-color:#ff6a00!important}</style><body data-v4-tab="finance_control"><div id="crmWorkspace"></div><script type="module">
import {setState,v4State} from '/crm/v4/assets/v4/state.js';
const id='90000000-0000-4000-8000-000000000501',second='90000000-0000-4000-8000-000000000502';
window.__financeMock={reads:[],writes:[],details:[],pending:[],hold:new URL(location).searchParams.has('hold'),leader_orders:[
 {id,order_number:101,project_name:'Вывеска магазина',status:'Новый',client_total:10000,contractor_cost:5000,profit:5000,is_archived:false,payment_status:'Частично оплачено',updated_at:'2026-10-14T05:00:00.123456Z',data:{}},
 {id:second,order_number:102,project_name:'Таблички для офиса',status:'Закрыт',client_total:10000,contractor_cost:5000,profit:5000,is_archived:false,payment_status:'Оплачено',updated_at:'2026-10-14T05:00:00.123456Z',data:{}},
 {id:'90000000-0000-4000-8000-000000000503',order_number:103,project_name:'Длинное название заказа '.repeat(6)+'<img src=x onerror=alert(1)>',status:'Новый',client_total:3000,contractor_cost:1000,profit:2000,is_archived:false,updated_at:'2026-10-14T05:00:00.123456Z',data:{}}
],leader_payments:[{id:'payment-one',order_id:id,amount:2000,payment_status:'Проведён',payment_type:'Приход',is_confirmed:true,payment_date:'2026-10-13'},{id:'payment-two',order_id:second,amount:11000,payment_status:'Проведён',payment_type:'Приход',is_confirmed:true,payment_date:'2026-10-13'}],leader_expenses:[{id:'expense-one',order_id:id,amount:1000,status:'Проведён',expense_date:'2026-10-13'}]};
window.__setRole=(role,user='90000000-0000-4000-8000-000000000599')=>setState({user:{id:user},profile:{user_id:user,role,is_active:true},profileLoaded:true,crmReady:true});
window.__setRole('${role}');
const loader=await import('/crm/v4/assets/v4/crm-v4-tab-loader-v1.js');
window.__loadFinance=force=>loader.loadV4Tab('finance_control',{force});
window.__ready=await window.__loadFinance(false);
if(window.__ready)document.getElementById('financeControlSection').hidden=false;
</script></body></html>`;
const server = createServer(async (req, res) => {
 const url = new URL(req.url, 'http://localhost');
 if (req.method !== 'GET') { res.writeHead(403).end(); return; }
 if (url.pathname === '/fixture') { res.setHeader('Content-Type', 'text/html'); res.end(fixture(url.searchParams.get('role') || 'owner')); return; }
 const file = path.resolve(root, '.' + url.pathname);
 if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
 try {
  const name=path.basename(file);
  let body= name==='supabase-client.js'?mockSource:name==='functions-client.js'?functionsSource:name==='ui.js'?`export function toast(){} export function setStatus(){}`:name==='api.js'?`export const friendlyError=e=>e?.message||'Synthetic error';`:name==='router.js'?`export function openLeadRoute(){}`:await readFile(file);
  res.setHeader('Content-Type', ({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'})[path.extname(file)] || 'application/octet-stream'); res.end(body);
 } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({ executablePath: process.env.LEADER_BROWSER_EXECUTABLE || undefined });
const report={cases:[],externalBlocked:0};
async function context(width=1440){
 const c=await browser.newContext({viewport:{width,height:900}});
 await c.route('**/*',r=>{if(r.request().method()==='GET'&&r.request().url().startsWith(origin+'/'))return r.continue();report.externalBlocked++;return r.abort();});return c;
}
try {
 for(const role of ['owner','accountant'])for(const width of [1440,390,360]){
  const c=await context(width),page=await c.newPage(),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/fixture?role='+role);await page.waitForFunction(()=>window.__ready===true);
  const panel=page.locator('#financePlanActualPanelV1');
  assert.equal(await panel.locator('[data-finance-order]').count(),3);
  await panel.locator('[data-finance-search]').fill('101');assert.equal(await panel.locator('[data-finance-order]').count(),1);
  const debt=panel.locator('.v4-plan-actual-metric').filter({hasText:'Долг клиента'});
  assert.equal((await debt.textContent()).replace(/\s/g,''),'Долгклиента8000₽','Debt subtracts the confirmed partial payment');
  await panel.locator('[data-finance-search]').fill('');await panel.locator('[data-finance-filter]').selectOption('overpayment');
  assert.equal(await panel.locator('[data-finance-order]').count(),1);assert.ok((await panel.textContent()).includes('Переплата: 1'));
  await panel.locator('[data-finance-filter]').selectOption('expenses');assert.equal(await panel.locator('[data-finance-order]').count(),2);
  assert.equal(await panel.locator('img').count(),0,'Order titles are text');
  await panel.locator('[data-finance-filter]').selectOption('closed');assert.equal(await panel.locator('[data-finance-order]').count(),1);
  assert.ok((await panel.locator('[data-finance-order-list]').textContent()).includes('№102'));
  await panel.locator('[data-finance-filter]').selectOption('all');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:output+'/finance-'+role+'-'+width+'.png',fullPage:true});
  const first=panel.locator('[data-finance-order]').filter({hasText:'№101'});
  await first.locator('[data-order-finance-action="payment"]').click();
  await page.locator('[data-finance-form][data-kind="payment"]').waitFor();
  assert.equal(await page.locator('[name="amount"]').evaluate(e=>e===document.activeElement),true);
  assert.equal(await page.evaluate(()=>window.__financeMock.writes.length),0,'Opening a form does not save a payment');
  await page.screenshot({path:output+'/payment-'+role+'-'+width+'.png'});
  await page.locator('[data-finance-dismiss]').click();await page.keyboard.press('Escape');
  assert.ok(await first.locator('[data-order-finance-action="payment"]').evaluate(e=>e===document.activeElement),'Close restores the exact opener');
  await first.locator('[data-order-finance-action="expense"]').click();await page.locator('[data-finance-form][data-kind="expense"]').waitFor();
  await page.screenshot({path:output+'/expense-'+role+'-'+width+'.png'});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.locator('[data-finance-dismiss]').click();await page.keyboard.press('Escape');
  if(role==='owner'&&width===1440){
   await first.locator('[data-order-finance-action="payment"]').click();await page.locator('[data-finance-form]').waitFor();
   await page.locator('[name="amount"]').fill('8000');await page.locator('[name="method"]').selectOption('Перевод');
   await page.locator('[data-finance-form] button[type="submit"]').click();
   try { await page.locator('[data-finance-saved]').filter({hasText:'сохранена'}).waitFor(); }
   catch(error) { console.log(await page.evaluate(()=>({message:document.querySelector('[data-finance-message]')?.textContent,writes:window.__financeMock.writes})));throw error; }
   await page.keyboard.press('Escape');await page.waitForFunction(()=>document.querySelector('[data-finance-order="90000000-0000-4000-8000-000000000501"]')?.textContent.includes('10'));
   assert.equal(await page.evaluate(()=>window.__financeMock.writes.length),1,'Existing writer alone issues the command');
   await panel.locator('[data-finance-filter]').selectOption('debt');assert.equal(await panel.locator('[data-finance-order]').count(),1,'Financial list refreshes after save');
  }
  await panel.locator('[data-finance-filter]').selectOption('all');
  await first.locator('[data-order-finance-action="expense"]').click();await page.locator('[data-finance-form]').waitFor();
  await page.evaluate(()=>window.__setRole('manager'));
  assert.equal(await page.locator('[role="dialog"]').count(),0,'Role change also removes the open financial editor');
  assert.equal(await panel.textContent(),'','Role change immediately removes financial data');
  const reads=await page.evaluate(()=>window.__financeMock.reads.length);await page.evaluate(()=>window.__loadFinance(true));
  assert.equal(await page.evaluate(()=>window.__financeMock.reads.length),reads,'Forbidden refresh makes no queries');
  assert.deepEqual(errors,[]);report.cases.push({role,width,search:true,filters:true,actions:true,roleChange:true});await c.close();
 }
 for(const role of ['manager','designer','installer','contractor']){
  const c=await context(),page=await c.newPage();await page.goto(origin+'/fixture?role='+role);await page.waitForFunction(()=>window.__ready===false);
  assert.equal(await page.evaluate(()=>window.__financeMock.reads.length),0);report.cases.push({role,denied:true});await c.close();
 }
 const c=await context(),page=await c.newPage();await page.goto(origin+'/fixture');await page.waitForFunction(()=>window.__ready===true);
 await page.evaluate(()=>{const m=window.__financeMock;m.leader_payments=Array.from({length:1234},(_,i)=>({id:String(i),order_id:m.leader_orders[0].id,amount:1,payment_type:'Приход',payment_status:'Проведён',is_confirmed:true}));m.failPage=true;});
 await page.evaluate(()=>window.__loadFinance(true));assert.ok((await page.locator('#financePlanActualPanelV1').textContent()).includes('Не удалось'));
 assert.equal(await page.locator('[data-finance-order]').count(),0,'A failed page never produces a partial balance');
 await page.evaluate(()=>{window.__financeMock.failPage=false;});await page.locator('[data-plan-actual-refresh]').click();await page.locator('[data-finance-order]').first().waitFor();
 assert.ok(await page.evaluate(()=>window.__financeMock.reads.some(x=>x.table==='leader_payments'&&x.start===1000)),'Reads continue beyond 1000 rows');
 await page.evaluate(()=>{window.__financeMock.hold=true;window.__pendingLoad=window.__loadFinance(true);});
 await page.waitForFunction(()=>window.__financeMock.pending.length>0);
 await page.evaluate(()=>{window.__setRole('designer');const m=window.__financeMock;m.hold=false;m.pending.splice(0).forEach(r=>r());});
 await page.evaluate(()=>window.__pendingLoad);
 assert.equal(await page.locator('#financePlanActualPanelV1').textContent(),'','A late response cannot restore the previous user data');
 await page.evaluate(()=>window.__setRole('accountant'));
 await page.evaluate(()=>window.__loadFinance(true));
 assert.equal(await page.locator('[data-finance-order]').count(),3,'An allowed new context can load its own data');
 report.cases.push({pagination:1234,pageError:true,lateRoleResponse:true});await c.close();
 await writeFile(output+'/report.json',JSON.stringify(report,null,2)+'\n');
 console.log('PASS: finance center search, filters, existing forms, refresh, pagination, role guards and 360/390/1440 layout; all external HTTP blocked.');
} finally {await browser.close();await new Promise(r=>server.close(r));}
