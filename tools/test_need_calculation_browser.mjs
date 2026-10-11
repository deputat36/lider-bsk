import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=process.cwd(),out=path.join(root,'artifacts/need-calculation');
const index=await readFile('crm/v4/index.html','utf8');
const css=[...index.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(item=>`<link rel="stylesheet" href="/crm/v4/${item[1]}">`).join('');
const mock=`globalThis.__crmTest={reads:[],writes:[]};
export const supabaseClient={from(table){__crmTest.reads.push(table);const query=new Proxy({}, {get(_target,key){if(key==='then')return resolve=>resolve({data:[],error:null});return(...args)=>{if(['insert','update','delete','upsert'].includes(key)){__crmTest.writes.push({table,key});throw Error('Unexpected mutation');}return query;};}});return query;},functions:{async invoke(...args){__crmTest.writes.push(args);throw Error('Unexpected command');}}};`;
const server=createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/test'){
    res.setHeader('Content-Type','text/html; charset=utf-8');
    return res.end(`<!doctype html><html lang="ru"><head><meta name="viewport" content="width=device-width,initial-scale=1">${css}<style>body{margin:0}#leadCardSection{max-width:1140px;margin:16px auto;padding:0 12px}</style></head><body><section id="leadCardSection"><div id="calculationsBox"></div></section><div id="crmToast"></div><script type="module">
      import {setState,v4State} from '/crm/v4/assets/v4/state.js';
      import {creativeNeedDraft} from '/crm/v4/assets/v4/creative-need-draft-v1.js';
      import * as calc from '/crm/v4/assets/v4/calculations.js';
      const ids=['design','modeling-3d','visualization-3d','animation','prepress'];
      const needs=ids.map(id=>{const service=LeaderServiceCatalog.find(id);const lead={id:'lead-a',service:service.label,message:'Источник: сайт РА Лидер\\nЗадача клиента: '+service.label+' для рекламного проекта\\nКонтакт для выбранного способа: synthetic@example.test\\n'+service.questions.map((q,i)=>'Бриф — '+q+' Ответ '+i).join('\\n')+'\\n<img src=x onerror=window.__xss=1>'};const draft=creativeNeedDraft(lead,'lead-a');return{id:'need-'+id,lead_id:'lead-a',need_type:draft.needType,title:draft.title,description:draft.description,status:'Новая',structured_data:{quantity:'4 шт'}};});
      needs.push({id:'need-custom',lead_id:'lead-a',need_type:'Вывеска',title:'Входная группа по чертежу',description:'Уточнить крепление\\nи материал',status:'Новая',structured_data:{quantity:'2,5'}});
      needs.push({id:'archived',lead_id:'lead-a',need_type:'Дизайн',title:'Архивный бриф',description:'Не показывать',status:'Архив'});
      setState({user:{id:'manager-a'},profileLoaded:true,profile:{role:'manager',is_active:true},route:{leadId:'lead-a'},leadNeeds:needs,currentLead:{id:'lead-a'},calculations:[],crmReady:false});
      calc.bootCalculations();
      globalThis.__testApi={calc,v4State,setState,needs,handoff(id){document.dispatchEvent(new CustomEvent('leader-v4:calculate-need',{detail:{need:needs.find(item=>item.id===id)}}));}};
      globalThis.__ready=true;
    </script></body></html>`);
  }
  res.setHeader('Content-Type',pathname.endsWith('.css')?'text/css':pathname.endsWith('.js')?'text/javascript':'application/octet-stream');
  if(pathname.endsWith('/supabase-client.js'))return res.end(mock);
  try{const file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep))throw Error('Outside root');res.end(await readFile(file));}catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:process.env.LEADER_BROWSER_EXECUTABLE||undefined});
try{
  await mkdir(out,{recursive:true});
  for(const width of [1440,390]){
    const context=await browser.newContext({viewport:{width,height:900}});
    await context.route('**/*',route=>route.request().method()==='GET'&&route.request().url().startsWith(origin+'/')?route.continue():route.abort());
    const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
    for(const id of ['design','modeling-3d','visualization-3d','animation','prepress','custom']){
      await page.goto(origin+'/test');await page.waitForFunction(()=>window.__ready);
      await page.locator('#calcPublicComment').fill('Условия согласованы вручную');
      await page.evaluate(id=>__testApi.handoff('need-'+id),id);
      const title=await page.locator('#calcTitle').inputValue();
      assert.equal(await page.locator('#calcNeedId').inputValue(),'need-'+id);
      assert.equal(await page.locator('#calcPublicComment').inputValue(),'Условия согласованы вручную');
      const custom=id==='custom',name=page.locator(custom?'#calcCustomName':'#calcServiceName'),qty=page.locator(custom?'#calcCustomQty':'#calcServiceQty');
      assert.equal(await name.inputValue(),title,'Exact need title reaches its billable item');
      assert.equal(await qty.inputValue(),custom?'2.5':'4');
      const brief=page.locator('#calcNeedContext');assert.equal(await brief.isVisible(),true);
      await brief.locator('summary').focus();await page.keyboard.press('Enter');
      assert.equal(await brief.locator('.v4-calc-need-description').isVisible(),true);
      if(!custom){assert.ok((await brief.textContent()).includes('Ответ 3'));assert.ok((await brief.textContent()).includes('synthetic@example.test'));}
      assert.equal(await brief.locator('img').count(),0,'Brief is rendered as text');assert.equal(await page.evaluate(()=>window.__xss||false),false);
      await brief.screenshot({path:path.join(out,`brief-${id}-${width}.png`)});
      const overflow=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,wide:[...document.querySelectorAll('#calculationsBox *')].map(el=>({tag:el.tagName,id:el.id,className:el.className,right:Math.round(el.getBoundingClientRect().right)})).filter(el=>el.right>innerWidth+1).slice(0,10)}));
      if(overflow.scrollWidth>overflow.width)await page.screenshot({path:path.join(out,`overflow-${id}-${width}.png`)});
      assert.equal(overflow.scrollWidth>overflow.width,false,`${id} at ${width}: ${JSON.stringify(overflow)}`);
      await page.locator(custom?'#calcCustomCost':'#calcServiceCost').fill('100');
      await page.locator(custom?'#calcCustomClient':'#calcServiceClient').fill('200');
      await page.locator('#addSmartCalcItemBtn').click();
      const row=page.locator('#calcDraftItems tr').first();assert.ok((await row.textContent()).includes(title));
      assert.equal(await row.locator('[data-calc-row-field="qty"]').inputValue(),custom?'2.5':'4');
      assert.ok((await page.locator('#calcDraftTotals').textContent()).includes(custom?'500':'800'),'Total includes the actual quantity');
      assert.equal(await page.locator('#calcPublicComment').inputValue(),'Условия согласованы вручную');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${id} at ${width}: added item must fit the page`);
      await page.locator('#calcModeFields').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`position-${id}-${width}.png`)});
      const before=await name.inputValue();await page.evaluate(()=>__testApi.handoff('archived'));assert.equal(await name.inputValue(),before,'Archive cannot replace the draft');
      await page.evaluate(()=>document.dispatchEvent(new CustomEvent('leader-v4:calculate-need',{detail:{need:{id:'foreign',lead_id:'other-lead',title:'Чужая заявка'}}})));assert.equal(await name.inputValue(),before);
      await page.locator('#calcNeedId').selectOption('');assert.equal(await brief.isVisible(),false,'General calculation clears the old brief');
      await page.locator('#calcNeedId').selectOption('need-'+id);assert.equal(await brief.isVisible(),true);
      await page.evaluate(()=>{__testApi.setState({profile:{role:'designer',is_active:true}});__testApi.handoff('need-design');__testApi.calc.renderCalculations();});
      assert.equal(await brief.isVisible(),false,'Renderer hides the context after permission loss');
      assert.equal(await brief.textContent(),'','Renderer removes the internal brief after permission loss');
      assert.equal(await page.evaluate(()=>__crmTest.writes.length),0,'Draft review and guards do not write to the backend');
    }
    assert.deepEqual(errors,[]);await context.close();
  }
  console.log('PASS: real calculation UI on 1440/390 preserves all five creative/custom names, quantities and totals, internal brief/manual client note, escaped text and permission/archive/foreign guards; zero backend writes or production requests.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
