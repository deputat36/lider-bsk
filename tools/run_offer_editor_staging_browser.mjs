// Actual offer editor + actual staging API. Only the Auth fixture and client adapter are injected.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const url='https://otulfnouybahfnsycxqn.supabase.co';
const key=process.env.OFFER_STAGING_KEY,token=process.env.OFFER_STAGING_TOKEN,actor=process.env.OFFER_STAGING_ACTOR,offer=process.env.OFFER_STAGING_ID;
assert(key&&token&&actor&&offer,'synthetic_staging_environment_required');
const root=process.cwd(),out=path.resolve('artifacts/offer-editor-staging');
const adapter=`const url=${JSON.stringify(url)},key=${JSON.stringify(key)},token=${JSON.stringify(token)},actor=${JSON.stringify(actor)};
const headers={apikey:key,Authorization:'Bearer '+token,'Content-Type':'application/json'};
export const supabaseClient={auth:{getSession:async()=>({data:{session:{access_token:token,user:{id:actor}}}})},functions:{invoke:async(name,{body})=>{const r=await fetch(url+'/functions/v1/'+name,{method:'POST',headers,body:JSON.stringify(body)});const data=await r.json();return {data,error:r.ok?null:{message:data.error?.code||'http_error'}};}},from(table){const params=new URLSearchParams();let single=false;const q={select(v){params.set('select',v);return q},eq(k,v){params.set(k,'eq.'+v);return q},order(k,o){params.set('order',k+(o?.ascending===false?'.desc':'.asc'));return q},limit(v){params.set('limit',v);return q},single(){single=true;return q},maybeSingle(){single=true;return q},then(resolve,reject){return fetch(url+'/rest/v1/'+table+'?'+params,{headers}).then(async r=>{const data=await r.json();return r.ok?{data:single?data[0]||null:data,error:null}:{data:null,error:{message:data.message||'read_failed'}}}).then(resolve,reject)}};return q}};`;
const html=`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Staging editor acceptance</title><style>body{font:16px Arial;margin:0}button,input,textarea{font:inherit;min-height:44px;box-sizing:border-box;max-width:100%}button{padding:8px}.v4-form-grid{display:grid;grid-template-columns:1fr;gap:10px}.v4-form-grid label{display:grid;gap:4px}*:focus-visible{outline:3px solid #ea580c}</style><main><h1>Проверка редактора КП</h1><button id="open" data-open-offer-card="${offer}">Открыть КП</button></main><div id="toast"></div><script type="module">import{setState}from'/crm/v4/assets/v4/state.js';setState({user:{id:${JSON.stringify(actor)}},session:{access_token:${JSON.stringify(token)}},profileLoaded:true,profile:{user_id:${JSON.stringify(actor)},role:'manager',is_active:true}});await import('/crm/v4/assets/v4/offer-card-v1.js');await import('/crm/v4/assets/v4/offer-order-create-v1.js');globalThis.ready=true;</script></html>`;
const server=createServer(async(req,res)=>{
 const p=new URL(req.url,'http://localhost').pathname;
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','text/javascript');
 if(p==='/test'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return}
 if(p.endsWith('/supabase-client.js')){res.end(adapter);return}
 if(p.endsWith('/config.js')){res.end('export const V4_CONFIG='+JSON.stringify({supabaseUrl:url,supabasePublishableKey:key}));return}
 try{const f=path.resolve(root,'.'+p);assert(f.startsWith(root+path.sep));res.end(await readFile(f))}catch{res.statusCode=404;res.end('missing')}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch();
let page;const errors=[],writes=[],failed=[];
try{
 await mkdir(out,{recursive:true});
 page=await browser.newPage({viewport:{width:390,height:900}});
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(r.status()>=400)failed.push({path:new URL(r.url()).pathname,status:r.status()})});
 await page.route('**/*',route=>{
  const request=route.request(),target=new URL(request.url());
  if(target.origin===url){if(!['GET','OPTIONS'].includes(request.method())){assert.equal(target.pathname,'/functions/v1/leader-crm-offer-transitions');writes.push(target.pathname)}return route.continue()}
  if(target.hostname==='127.0.0.1'&&request.method()==='GET')return route.continue();
  return route.abort();
 });
 await page.goto(`http://127.0.0.1:${server.address().port}/test`);await page.waitForFunction(()=>globalThis.ready);
 await page.click('#open');await page.waitForSelector('[data-edit-type="offer"]:not([disabled])');
 assert.equal(await page.getByText(/маржа/).count(),0);
 await page.locator('[data-edit-type="offer"]').focus();await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.tagName),'SUMMARY','additional actions remain keyboard reachable');
 await page.click('[data-edit-type="offer"]');
 const title='Synthetic UI edit',short='Synthetic short text',full='Полный текст: '+ 'Я'.repeat(3000);
 await page.locator('#offerEditForm [name=title]').fill(title);await page.locator('#offerEditForm [name=short_text]').fill(short);await page.locator('#offerEditForm [name=full_text]').fill(full);await page.locator('#offerEditForm [name=valid_until]').fill('2030-01-01');
 await page.locator('#offerEditForm [type=submit]').click();await page.waitForSelector('[data-offer-edit-saved]');
 await page.screenshot({path:path.join(out,'saved-390.png'),fullPage:true});
 // A successful save closes the editor and reloads the card; reopen it from that state.
 await page.click('[data-offer-card-close]');await page.click('#open');await page.waitForSelector('[data-edit-type="offer"]:not([disabled])');await page.click('[data-edit-type="offer"]');
 assert.equal(await page.locator('#offerEditForm [name=title]').inputValue(),title);
 assert.equal(await page.locator('#offerEditForm [name=short_text]').inputValue(),short);
 assert.equal(await page.locator('#offerEditForm [name=full_text]').inputValue(),full);
 assert.equal(await page.locator('#offerEditForm [name=valid_until]').inputValue(),'2030-01-01');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.deepEqual(errors,[]);assert.equal(writes.length,1);
 const evidence={ok:true,real_staging_api:true,actual_editor:true,saved_and_reopened:true,full_text_length:full.length,one_write:true,margin_hidden:true,errors:[]};
 await writeFile(path.join(out,'browser.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
}catch(error){
 if(page){await page.screenshot({path:path.join(out,'failure-390.png'),fullPage:true}).catch(()=>{});await writeFile(path.join(out,'failure.json'),JSON.stringify({message:error.message.slice(0,300),errors,failed,text:(await page.locator('body').innerText().catch(()=>'' )).slice(0,5000)},null,2));}
 throw error;
}finally{await browser.close();await new Promise(r=>server.close(r))}
