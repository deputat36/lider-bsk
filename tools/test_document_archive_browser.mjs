import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
const root=process.cwd(),actor='90000000-0000-4000-8000-000000000651',order='90000000-0000-4000-8000-000000000652';
const state=`export const v4State={user:{id:'${actor}'},profile:{role:'owner',is_active:true},profileLoaded:true,crmReady:true,status:'CRM готова'};const listeners=[];export const subscribeState=fn=>listeners.push(fn);window.changeFixtureActor=()=>{v4State.user={id:'90000000-0000-4000-8000-000000000659'};listeners.forEach(fn=>fn(v4State))};`;
const client=`import{v4State}from'./state.js';window.mock={commands:[],lose:true,hold:false,release:null};export const supabaseClient={auth:{getSession:async()=>({data:{session:{user:v4State.user,access_token:'synthetic'}}})},functions:{invoke:async(slug,{body,headers})=>{if(slug!=='leader-crm-documents'||headers.Authorization!=='Bearer synthetic')throw Error('wrong transport');mock.commands.push(body);if(mock.hold){mock.hold=false;await new Promise(r=>mock.release=r);}const receipts=JSON.parse(sessionStorage.getItem('fixture-receipts')||'{}');if(body.operation==='save'){if(receipts[body.request_id])return{data:{...receipts[body.request_id],replay:true}};const result={ok:true,id:crypto.randomUUID(),group_id:crypto.randomUUID(),version:1,number:body.payload.register?'АВР-2026-0001':null,status:body.payload.register?'generated':'draft'};receipts[body.request_id]=result;sessionStorage.setItem('fixture-receipts',JSON.stringify(receipts));if(mock.lose){mock.lose=false;throw Error('lost response');}return{data:result};}if(body.operation==='list')return{data:{ok:true,rows:Object.values(receipts).map(r=>({...r,document_group_id:r.group_id,document_type:'act',document_number:r.number,document_date:'2026-10-28',total:100})),has_more:false}};return{data:{ok:true}};}}};`;
const html=`<!doctype html><html lang="ru"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{font:16px Arial;background:#f8fafc;margin:16px;color:#172033}form{background:white;padding:18px;border-radius:14px;max-width:900px}input{display:block;margin:10px 0;padding:10px;max-width:100%}button{min-height:44px;padding:10px;margin:4px;max-width:100%}.document-draft-controls{overflow-wrap:anywhere}p{line-height:1.5}</style><form id="fixture"><h1>Акт заказа</h1><label>Заказчик<input id="customer" value="Synthetic customer" required></label></form><script type="module">import{v4State}from'/crm/v4/assets/v4/state.js';import{openDocumentArchive}from'/crm/v4/assets/v4/document-archive-v1.js';window.openFixtureArchive=()=>openDocumentArchive('${order}');document.dispatchEvent(new CustomEvent('leader-v4:document-editor-ready',{detail:{form:document.getElementById('fixture'),order:{id:'${order}',updated_at:'2026-10-28T00:00:00Z'},kind:'act',getDraft:()=>({date:'2026-10-28',executor:'Synthetic company',customer:document.getElementById('customer').value,tax:'Без НДС',items:[{name:'Печать',quantity:1,unit:'шт',price:100,sum:100}]})}}));window.fixtureReady=true;</script></html>`;
const server=createServer(async(req,res)=>{const url=new URL(req.url,'http://localhost');res.setHeader('Cache-Control','no-store');
 if(url.pathname==='/test'){res.setHeader('Content-Type','text/html');res.end(html);return;}
 res.setHeader('Content-Type','text/javascript');
 if(url.pathname.endsWith('/state.js')){res.end(state);return;}
 if(url.pathname.endsWith('/supabase-client.js')){res.end(client);return;}
 if(url.pathname.endsWith('/config.js')){res.end("export const V4_CONFIG={supabaseUrl:'https://ofewxuqfjhamgerwzull.supabase.co'};");return;}
 if(url.pathname.endsWith('/action-permissions-v1.js')){res.end("export const canPerformV4Action=()=>true;");return;}
 if(url.pathname.endsWith('/document-draft-session-v1.js')){res.end('export const registerDocumentPreview=()=>{};');return;}
 try{const file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+path.sep))throw Error();res.end(await fs.readFile(file));}catch{res.statusCode=404;res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true});await fs.mkdir('artifacts/document-archive',{recursive:true});
try{
 for(const width of [360,1440]){
  const context=await browser.newContext({viewport:{width,height:900}});await context.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/test');await page.waitForFunction(()=>window.fixtureReady);
  await page.click('[data-document-save]');await page.getByText('Сервер не подтвердил результат.',{exact:false}).waitFor();
  const original=await page.evaluate(()=>mock.commands.find(c=>c.operation==='save'));assert.equal(original.payload.draft.taxMode,'Без НДС');assert.equal(original.payload.draft.tax,undefined);assert.equal(await page.isDisabled('#customer'),true);
  await page.reload();await page.waitForFunction(()=>window.fixtureReady);assert.equal(await page.isDisabled('#customer'),true,'Unknown operation survives reload');
  await page.click('[data-document-save]');await page.getByText('Сохранено в архиве:',{exact:false}).waitFor();
  assert.deepEqual(await page.evaluate(()=>mock.commands.find(c=>c.operation==='save')),original,'Reload repeats the exact command');assert.equal(await page.evaluate(()=>Object.keys(JSON.parse(sessionStorage.getItem('fixture-receipts'))).length),1);
  assert.equal(await page.isDisabled('#customer'),false);await page.click('[data-document-list]');await page.getByRole('dialog',{name:'Архив документов'}).waitFor();await page.getByText('Черновик · версия 1',{exact:false}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:`artifacts/document-archive/archive-${width}.png`,fullPage:true});
  await page.click('[data-archive-close]');await page.evaluate(()=>{mock.hold=true;mock.lose=false;});await page.click('[data-document-save]');await page.waitForFunction(()=>mock.release);
  await page.evaluate(()=>{changeFixtureActor();mock.release();});await page.waitForTimeout(50);
  assert.equal(await page.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.startsWith('leader-document-pending-v1:90000000-0000-4000-8000-000000000651:')).length),0,'Account change clears only the old actor command');
  assert.deepEqual(errors,[]);await context.close();
 }
 console.log('Document archive browser: mobile/desktop, exact retry after reload, numbering boundary, private fields and actor change PASS.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
