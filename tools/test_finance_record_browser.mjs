import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const root = process.cwd(), output = path.join(root, 'artifacts/finance-records');
const orderId = '90000000-0000-4000-8000-000000000501';
const actorId = '90000000-0000-4000-8000-000000000502';
const now = '2026-09-28T12:00:00Z';
const mock = `
const order={id:'${orderId}',order_number:123,project_name:'Вывеска и оформление входной группы — проверка длинного названия заказа',client_name:'Тестовый клиент',client_total:1700,contractor_cost:1000,profit:700,status:'Принят в работу',payment_status:'Частично оплачено',updated_at:'${now}',created_at:'${now}',data:{}};
const data={leader_orders:[order],leader_order_items:[{name:'Вывеска с длинным описанием материалов и способа монтажа',quantity:1,client_sum:1700,contractor_sum:1000}],leader_payments:[{id:'${actorId}',order_id:order.id,amount:1000.25,payment_type:'Приход',payment_status:'Проведён',is_confirmed:true,method:'Перевод',payment_date:'2026-09-28',created_at:'${now}',updated_at:'${now}'}],leader_expenses:[]};
globalThis.__financeMock={reads:[],fail:false};
export const supabaseClient={from(table){globalThis.__financeMock.reads.push(table);const query={select(){return this},eq(){return this},order(){return this},single(){return Promise.resolve({data:data[table][0]})},limit(){return this},range(){return this},then(resolve,reject){return Promise.resolve(globalThis.__financeMock.fail&&table==='leader_payments'?{error:new Error('synthetic_read_failure')}:{data:data[table]}).then(resolve,reject)}};return query},auth:{getSession:async()=>({data:{session:{access_token:'synthetic-test'}}})},functions:{invoke:async()=>({error:new Error('synthetic-network-error')})}};
`;
const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Проверка финансов заказа</title><link rel="stylesheet" href="/assets/brand/design-tokens.css"><style>body{margin:0;font-family:Arial,sans-serif;color:#182334}main{padding:20px}button{font:inherit}h1{font-size:24px}</style></head><body><main><h1>Заказы</h1><button data-open-order="${orderId}">Открыть тестовый заказ</button></main><script type="module">import {v4State} from '/crm/v4/assets/v4/state.js';v4State.profileLoaded=true;v4State.profile={user_id:'${actorId}',role:'owner',is_active:true};await import('/crm/v4/assets/v4/order-card-v1.js');globalThis.financeReady=true;</script></body></html>`;
const types = { '.js':'text/javascript', '.css':'text/css', '.html':'text/html', '.woff2':'font/woff2', '.svg':'image/svg+xml' };
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/test') { res.setHeader('Content-Type', 'text/html'); res.end(html); return; }
  if (url.pathname.endsWith('/supabase-client.js')) { res.setHeader('Content-Type','text/javascript'); res.end(mock); return; }
  if (url.pathname.endsWith('/config.js')) { res.setHeader('Content-Type','text/javascript'); res.end("export const V4_CONFIG={supabaseUrl:'https://otulfnouybahfnsycxqn.supabase.co'};"); return; }
  try {
    const file = path.resolve(root, '.' + url.pathname); if (!file.startsWith(root + '/')) throw new Error('path');
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream'); res.end(await readFile(file));
  } catch { res.statusCode=404; res.end('not found'); }
});
await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
const browser = await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined});
const results = [];
try {
  await mkdir(output,{recursive:true});
  for (const width of [360,390,768,1024,1440]) {
    const page = await browser.newPage({viewport:{width,height:1000},reducedMotion:'reduce'});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/test`);
    await page.waitForFunction(()=>globalThis.financeReady);
    await page.click('[data-open-order]'); await page.waitForSelector('[data-finance-new="expense"]');
    assert.match(await page.textContent('[data-finance-total="debt"]'),/699,75/);
    await page.click('[data-finance-new="expense"]');
    await page.fill('[name="amount"]','400,10');await page.selectOption('[name="method"]','Наличные');
    await page.fill('[name="comment"]','Материалы для вывески. Тестовая запись.');
    const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,dialogOverflow:document.querySelector('[role="dialog"]').scrollWidth>document.querySelector('[role="dialog"]').clientWidth+1}));
    await page.addScriptTag({path:process.env.AXE_CORE_PATH || require.resolve('axe-core/axe.min.js')});
    const violations=await page.evaluate(async()=>(await axe.run(document.querySelector('[role="dialog"]'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})));
    await page.locator('[data-finance-editor]').scrollIntoViewIfNeeded();
    if(width===360||width===1440) await page.screenshot({path:path.join(output,`expense-${width}.png`)});
    await page.keyboard.press('Escape');assert.equal(await page.locator('[role="dialog"]').count(),0);
    assert.equal(await page.locator('[data-open-order]').evaluate(node=>node===document.activeElement),true);
    await page.evaluate(()=>{globalThis.__financeMock.fail=true;});
    await page.click('[data-open-order]');await page.waitForSelector('[data-order-finance-reload]');
    assert.equal(await page.locator('[data-finance-total]').count(),0,'read failure must not show false zero totals');
    assert.match(await page.textContent('[role="dialog"]'),/Вывеска/);
    await page.keyboard.press('Escape');
    await page.evaluate(async()=>{const{v4State}=await import('/crm/v4/assets/v4/state.js');v4State.profile.role='manager';globalThis.__financeMock.reads=[];});
    await page.click('[data-open-order]');await page.waitForSelector('#orderCardTitle');
    assert.equal(await page.locator('[data-order-finance]').count(),0);
    assert.deepEqual(await page.evaluate(()=>globalThis.__financeMock.reads.filter(table=>['leader_payments','leader_expenses'].includes(table))),[]);
    results.push({width,...layout,violations,errors,keyboard:true,financeFailureIsolated:true,managerPrivateReadsSkipped:true});
    console.log(JSON.stringify(results.at(-1)));
    await page.close();
  }
  await writeFile(path.join(output,'browser-report.json'),JSON.stringify(results,null,2));
  for(const result of results){assert.equal(result.overflow,false);assert.equal(result.dialogOverflow,false);assert.deepEqual(result.violations,[]);assert.deepEqual(result.errors,[]);}
} finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
