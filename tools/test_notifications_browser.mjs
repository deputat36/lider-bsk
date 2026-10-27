import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
const root = process.cwd(), actor = '90000000-0000-4000-8000-000000000901', second = '90000000-0000-4000-8000-000000000904', device = '90000000-0000-4000-8000-000000000905';
const mockState = `export const v4State={status:'Проверяю вход',user:null,profile:null,profileLoaded:false,crmReady:false};const subscribers=[];export function subscribeState(fn){subscribers.push(fn)};window.setFixtureAuth=(value)=>{Object.assign(v4State,value);subscribers.forEach(fn=>fn(v4State))};`;
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/crm/v4/widget-fixture.html') { res.setHeader('Content-Type','text/html');res.end('<meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/crm/v4/assets/v4/styles.css"><link rel="stylesheet" href="/crm/v4/assets/v4/ui-polish.css"><main id="crmWorkspace" class="v4-workspace"></main><script type="module">import {initNotificationsPwa} from "./assets/v4/notifications-pwa-v1.js";initNotificationsPwa();window.fixtureReady=true;</script>');return; }
    if (url.pathname.endsWith('/state.js')) {res.setHeader('Content-Type','text/javascript');res.end(mockState);return;}
    if (url.pathname.endsWith('/supabase-client.js')) {res.setHeader('Content-Type','text/javascript');res.end('export const supabaseClient={auth:{getSession:async()=>({data:{session:{user:{id:window.fixtureActor},access_token:"synthetic"}}})}}');return;}
    if (url.pathname.endsWith('/config.js')) {res.setHeader('Content-Type','text/javascript');res.end('export const V4_CONFIG={supabaseUrl:"https://fixture.invalid",supabasePublishableKey:"synthetic"};');return;}
    const file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+path.sep))throw Error('invalid path');
    res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(await fs.readFile(file));
  } catch {res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true});
await fs.mkdir('artifacts/notifications',{recursive:true});
try {
 for(const width of [360,390,1440]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage();
  let subscribed=false, failTest=true, testIds=[];
  await page.addInitScript(()=>{
   window.fixtureActor='90000000-0000-4000-8000-000000000901';window.fixtureMetrics={register:0,unsubscribe:0,permission:0,messages:[]};let sub=null;
   window.PushManager=function(){};window.Notification={permission:'default',requestPermission:async()=>{window.fixtureMetrics.permission++;window.Notification.permission='granted';return 'granted'}};
   const reg={active:{postMessage:value=>window.fixtureMetrics.messages.push(value)},pushManager:{getSubscription:async()=>sub,subscribe:async()=>{sub={endpoint:'https://fcm.googleapis.com/fcm/send/synthetic',toJSON:()=>({endpoint:'https://fcm.googleapis.com/fcm/send/synthetic',keys:{p256dh:'synthetic',auth:'synthetic'}}),unsubscribe:async()=>{window.fixtureMetrics.unsubscribe++;sub=null;return true}};return sub}}};
   Object.defineProperty(navigator,'serviceWorker',{value:{register:async()=>{window.fixtureMetrics.register++;return reg},ready:Promise.resolve(reg)}});
  });
  await page.route('**/*',async route=>{
   if(route.request().url().startsWith(origin))return route.continue();
   if(!route.request().url().includes('fixture.invalid/functions/v1/leader-crm-notifications'))return route.abort();
   const body=route.request().postDataJSON();let result={ok:true};let status=200;
   if(body.action==='status')result={ok:true,enabled:true,public_key:'B'+'A'.repeat(86),device_id:subscribed?device:null};
   if(body.action==='subscribe')subscribed=true;
   if(body.action==='unsubscribe')subscribed=false;
   if(body.action==='test'){testIds.push(body.payload.request_id);if(failTest){failTest=false;status=503;result={ok:false,error:'notification_service_unavailable'}}}
   return route.fulfill({status,contentType:'application/json',body:JSON.stringify(result)});
  });
  await page.goto(origin+'/crm/v4/widget-fixture.html');await page.waitForFunction(()=>window.fixtureReady);
  assert.equal(await page.evaluate(()=>window.fixtureMetrics.unsubscribe),0,'Unresolved startup is not logout');
  await page.evaluate(id=>window.setFixtureAuth({user:{id},profile:{role:'owner',is_active:true},profileLoaded:true,crmReady:true,status:'CRM готова'}),actor);
  await page.locator('#crmNotifications summary').click();await page.waitForFunction(()=>!document.querySelector('[data-notification-enable]').disabled);
  await page.locator('[data-notification-enable]').click();await page.waitForFunction(()=>!document.querySelector('[data-notification-test]').disabled);
  assert.equal(await page.evaluate(()=>window.fixtureMetrics.permission),1);
  await page.locator('[data-notification-test]').click();await page.getByText('Сервис уведомлений временно не отвечает.',{exact:false}).waitFor();
  await page.locator('[data-notification-test]').click();await page.getByText('Проверка поставлена в очередь.',{exact:false}).waitFor();
  assert.equal(testIds[0],testIds[1],'Unknown test outcome retries the same request');
  await page.evaluate(()=>window.setFixtureAuth({profile:null,profileLoaded:false,crmReady:false}));
  assert.equal(await page.evaluate(()=>window.fixtureMetrics.unsubscribe),0,'Profile retry preserves subscription');
  await page.evaluate(()=>window.setFixtureAuth({profile:{role:'owner',is_active:true},profileLoaded:true,crmReady:true}));
  await page.waitForFunction(()=>!document.querySelector('[data-notification-test]').disabled);
  await page.screenshot({path:`artifacts/notifications/widget-${width}.png`,fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
  subscribed=false;
  await page.evaluate(id=>{window.fixtureActor=id;window.setFixtureAuth({user:{id},profile:{role:'manager',is_active:true},crmReady:true})},second);
  await page.waitForFunction(()=>window.fixtureMetrics.unsubscribe===1);
  await page.evaluate(()=>window.setFixtureAuth({user:null,profile:null,profileLoaded:false,crmReady:false,status:'Нужен вход'}));
  await page.waitForFunction(()=>document.getElementById('crmNotifications').hidden);
  await page.waitForFunction(()=>window.fixtureMetrics.messages.at(-1)?.actor===null);
  await context.close();
 }
 const native=await browser.newContext();await native.grantPermissions(['notifications'],{origin});
 const first=await native.newPage();await first.goto(origin+'/crm/v4/widget-fixture.html');
 const waiting=native.waitForEvent('serviceworker');
 await first.evaluate(async id=>{await navigator.serviceWorker.register('/crm/v4/sw.js',{scope:'/crm/v4/'});const reg=await navigator.serviceWorker.ready;reg.active.postMessage({type:'leader:set-actor',actor:id})},actor);
 const worker=await waiting;
 await worker.evaluate(async id=>{for(let n=0;n<30;n++){if(await identity()===id)return;await new Promise(r=>setTimeout(r,20))}throw Error('actor not persisted')},actor);
 await first.close();
 const pushed=await worker.evaluate(async ({actor,origin})=>{
  const send=async id=>{const event=new PushEvent('push',{data:JSON.stringify({actor_id:id,title:'Лидер — тест',body:'Откройте CRM',tag:'leader-native-proof',url:origin+'/crm/v4/?tab=leads&lead=90000000-0000-4000-8000-000000000904'})});let done;event.waitUntil=value=>{done=value};self.dispatchEvent(event);await done};
  await send(actor);let notices=await self.registration.getNotifications();const one=notices.length===1&&notices[0].data.actor_id===actor;
  await send('90000000-0000-4000-8000-000000000999');notices=await self.registration.getNotifications();return {one,afterOtherActor:notices.length};
 },{actor,origin});
 assert.deepEqual(pushed,{one:true,afterOtherActor:1},'Actual SW receives a synthetic push without an open tab and rejects another actor');
 const secondPage=await native.newPage();await secondPage.goto(origin+'/crm/v4/widget-fixture.html');
 await secondPage.evaluate(async()=>{const reg=await navigator.serviceWorker.ready;reg.active.postMessage({type:'leader:set-actor',actor:null})});
 await worker.evaluate(async()=>{for(let n=0;n<30;n++){if(await identity()===null&&(await self.registration.getNotifications()).length===0)return;await new Promise(r=>setTimeout(r,20))}throw Error('logout did not clear notification')});
 await native.close();
 console.log('Actual notification widget: 360/390/1440, permission, exact retry, profile/actor/logout and mobile layout PASS. Native service worker: synthetic PushEvent with the tab closed, persisted actor, other-actor rejection and logout cleanup PASS; remote push-service/Android delivery remains a separate device check.');
}finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
