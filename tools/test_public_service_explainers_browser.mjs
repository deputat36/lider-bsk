import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=process.cwd();
const data=JSON.parse(await readFile('data/service-explainers.json','utf8'));
const useCases=JSON.parse(await readFile('data/service-use-cases.json','utf8')).cases;
await import('../assets/leader-service-catalog.js');
const catalog=globalThis.LeaderServiceCatalog;
const report={pages:[],catalog:[],useCases:[],analytics:[],externalBlocked:0};
const server=createServer(async(req,res)=>{
  const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
  if(!file.startsWith(root+path.sep)||req.method!=='GET'){res.writeHead(403).end();return;}
  try{
    res.setHeader('Content-Type',({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webp':'image/webp','.jpg':'image/jpeg'})[path.extname(file)]||'application/octet-stream');
    res.end(await readFile(file));
  }catch{res.writeHead(404).end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:process.env.LEADER_BROWSER_EXECUTABLE||undefined});
const output='artifacts/public-lead/service-explainers';
await mkdir(output,{recursive:true});

function mockMetrika(){
  window.__ymCalls=[];
  window.ym=(...args)=>window.__ymCalls.push(args);
  document.addEventListener('click',event=>{
    const link=event.target.closest?.('a');
    if(link&&(link.id.startsWith('test-')||/^(tel:|mailto:|https?:)/.test(link.getAttribute('href')||'')))event.preventDefault();
  },true);
}
async function count(page,name){return page.evaluate(goal=>window.__ymCalls.filter(c=>c[1]==='reachGoal'&&c[2]===goal).length,name);}
async function noOverflow(page,label){
  const size=await page.evaluate(()=>({width:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth}));
  if(size.document>size.width+1||size.body>size.width+1){
    const offenders=await page.evaluate(()=>[...document.querySelectorAll('body *')].map(el=>{
      const box=el.getBoundingClientRect();
      return {tag:el.tagName,id:el.id,className:typeof el.className==='string'?el.className:'',left:box.left,right:box.right,width:box.width};
    }).filter(el=>el.width>0&&(el.left < -1||el.right>innerWidth+1)).slice(0,12));
    const name=label.replace(/[^a-z0-9-]/gi,'_');
    await writeFile(output+'/overflow-'+name+'.json',JSON.stringify({size,offenders},null,2));
    await page.screenshot({path:output+'/overflow-'+name+'.png'});
    size.offenders=offenders;
  }
  assert.ok(size.document<=size.width+1&&size.body<=size.width+1,label+': '+JSON.stringify(size));
}
const shotPages=new Set(['bannery-borisoglebsk.html','vizitki-borisoglebsk.html','dizayn-maketov.html','3d-vizualizaciya-reklamy.html','3d-modelirovanie-konstrukciy.html','animaciya-motion-dizayn.html','yandex-karty-2gis.html','sozdanie-saytov.html','suvenirnaya-produkciya.html']);

try{
  for(const width of [1440,390]){
    const context=await browser.newContext({viewport:{width,height:900}});
    await context.addInitScript(mockMetrika);
    await context.route('**/*',route=>{
      if(route.request().method()==='GET'&&route.request().url().startsWith(origin+'/'))return route.continue();
      report.externalBlocked++;return route.abort();
    });
    const page=await context.newPage();
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    for(const name of new Set(data.services.map(item=>item.page))){
      await page.goto(origin+'/'+name);
      await page.locator('[data-leader-lead-widget]').waitFor();
      assert.equal(await count(page,'form_view'),0,'Below-fold form must not count as viewed: '+name);
      for(const item of data.services.filter(item=>item.page===name)){
        const block=page.locator('.service-explainer[data-service-explanation="'+item.id+'"]');
        await block.locator('img').scrollIntoViewIfNeeded();
        await page.waitForFunction(id=>{
          const img=document.querySelector('.service-explainer[data-service-explanation="'+id+'"] img');
          return img?.complete&&img.naturalWidth>0;
        },item.id);
        assert.ok((await block.locator('figcaption').textContent()).includes('не фотография выполненной работы'));
        assert.ok((await block.textContent()).includes(item.prepare));
        assert.ok((await block.textContent()).includes(item.boundary));
        await noOverflow(page,item.id+' '+width);
        if(shotPages.has(name)&&(width===390||['3d-vizualizaciya-reklamy.html','sozdanie-saytov.html'].includes(name))&&item.id!=='plotter'){
          await block.screenshot({path:output+'/'+item.id+'-'+width+'.png'});
        }
        await block.locator('.service-explainer-action').click();
        assert.equal(await page.locator('[name="service"]').inputValue(),catalog.find(item.id).label,'CTA selects the exact service');
        await page.waitForFunction(()=>window.__ymCalls.some(c=>c[2]==='form_view'));
        assert.equal(await count(page,'form_view'),1,'Form view is counted once when seen');
        report.pages.push({page:name,service:item.id,width,imageLoaded:true,overflow:false,selected:true});
      }
    }
    await page.goto(origin+'/uslugi.html');
    const cards=page.locator('.service-cards a[data-service-explanation]');
    const ids=await cards.evaluateAll(elements=>elements.map(el=>el.dataset.serviceExplanation));
    assert.deepEqual([...new Set(ids)].sort(),data.services.map(item=>item.id).sort(),'Every real service has an explanation in the catalog');
    await noOverflow(page,'catalog '+width);
    await page.locator('#promotion').scrollIntoViewIfNeeded();
    await page.screenshot({path:output+'/catalog-'+width+'.png'});
    await page.locator('#creative').scrollIntoViewIfNeeded();
    await page.screenshot({path:output+'/creative-catalog-'+width+'.png'});
    const plotter=page.locator('.service-cards a[data-service-explanation="plotter"]');
    await plotter.click();
    await page.locator('[data-leader-lead-widget]').waitFor();
    assert.equal(await page.locator('[name="service"]').inputValue(),catalog.find('plotter').label,'Shared sticker page accepts the plotter deep link');
    assert.equal(new URL(page.url()).hash,'#plotternaya-rezka');
    report.catalog.push({width,uniqueServices:new Set(ids).size,plotterDeepLink:true});

    for(const item of useCases){
      await page.goto(origin+'/uslugi.html');
      await page.locator('[data-service-use-case-link="'+item.id+'"]').click();
      const block=page.locator('[data-service-use-case="'+item.id+'"]');
      await block.locator('img').scrollIntoViewIfNeeded();
      await page.waitForFunction(id=>{
        const img=document.querySelector('[data-service-use-case="'+id+'"] img');
        return img?.complete&&img.naturalWidth>0;
      },item.id);
      assert.equal(new URL(page.url()).hash,'#'+item.id);
      assert.ok((await block.locator('figcaption').textContent()).includes('не фотография выполненной работы'));
      assert.equal(await block.locator('details').count(),item.faq.length);
      const question=block.locator('summary').first();
      await question.focus();await page.keyboard.press('Enter');
      assert.equal(await block.locator('details').first().getAttribute('open'),'');
      assert.ok((await block.locator('details').first().textContent()).includes(item.faq[0].answer));
      await noOverflow(page,item.id+' '+width);
      await block.screenshot({path:output+'/use-case-'+item.id+'-'+width+'.png'});
      await block.locator('.service-explainer-action').click();
      await page.locator('[data-leader-lead-widget]').waitFor();
      assert.equal(await page.locator('[name="service"]').inputValue(),catalog.find(item.service_id).label);
      const note=page.locator('[data-leader-offer-note]');
      assert.equal(await note.isVisible(),true);
      assert.ok((await note.textContent()).includes(item.label));
      assert.equal(new URL(page.url()).searchParams.get('offer'),item.id);
      await page.locator('[name="message"]').fill('Synthetic local customer task');
      await page.locator('[name="service"]').selectOption('Полиграфия');
      assert.equal(await note.isVisible(),false,'A different service clears the offer');
      assert.equal(await page.locator('[name="message"]').inputValue(),'Synthetic local customer task');
      report.useCases.push({id:item.id,width,imageLoaded:true,questions:item.faq.length,selected:true,incompatibleCleared:true});
    }

    await page.goto(origin+'/bannery-borisoglebsk.html?email=private@example.test');
    await page.locator('[data-leader-lead-widget]').waitFor();
    assert.equal(await count(page,'form_view'),0);
    const calls=await page.evaluate(()=>window.__ymCalls);
    assert.equal(calls.filter(c=>c[1]==='init').length,1,'One initialization of the existing counter');
    assert.equal(calls[0][0],109387236);
    assert.equal(calls[0][2].webvisor,true);
    const phone=width===390?page.locator('#leader-mobile-sticky-cta a[href^="tel:"]'):page.locator('header a[href^="tel:"]').first();
    await phone.click();
    assert.equal(await count(page,'phone_click'),1,'A single phone click produces one canonical goal');
    const phoneParams=await page.evaluate(()=>window.__ymCalls.find(c=>c[2]==='phone_click')[3]);
    assert.equal(phoneParams.placement,width===390?'mobile':'header');
    await page.locator('[name="service"]').selectOption('3D-визуализация');
    const masked=await page.locator('[data-leader-lead-widget]').evaluate(form=>({
      submit:form.classList.contains('ym-disable-submit'),
      fields:[...form.querySelectorAll('input,textarea')].every(field=>field.classList.contains('ym-disable-keys')),
      reference:form.querySelector('[data-leader-lead-status]').classList.contains('ym-hide-content'),
    }));
    assert.deepEqual(masked,{submit:true,fields:true,reference:true},'Mask both ordinary fields and dynamic briefs for Webvisor');
    await page.evaluate(()=>{
      const links=[['test-messenger','https://vk.me/synthetic',''],['test-community','https://vk.com/synthetic',''],['test-email','mailto:private@example.test',''],['test-service','/3d-modelirovanie-konstrukciy.html?email=private@example.test','']];
      for(const [id,href] of links){const a=document.createElement('a');a.id=id;a.href=href;a.textContent='Synthetic local link';document.body.appendChild(a);}
    });
    for(const id of ['test-messenger','test-community','test-email','test-service'])await page.locator('#'+id).click();
    assert.equal(await count(page,'messenger_click'),1,'Direct message link is a contact intent');
    assert.equal(await count(page,'community_click'),1,'Community navigation stays separate from contact conversion');
    assert.equal(await count(page,'email_click'),1);
    assert.equal(await count(page,'service_page_click'),1);
    const goalCalls=await page.evaluate(()=>window.__ymCalls.filter(c=>c[1]==='reachGoal'));
    assert.ok(!JSON.stringify(goalCalls).includes('private@example.test'));
    assert.ok(goalCalls.every(call=>call[0]===109387236));
    for(const call of goalCalls){
      assert.ok(!('href' in call[3])&&!('text' in call[3])&&!('page' in call[3])&&!('request_id' in call[3]),'No raw contacts, link text, full URL or request ID');
    }
    assert.equal(await count(page,'lead_confirmed'),0,'Clicks and field changes are not an accepted lead');
    report.analytics.push({width,counter:109387236,singleInit:true,phone:1,messenger:1,community:1,email:1,customerDataInGoals:false,masked});
    assert.deepEqual(errors,[]);
    await context.close();
  }
  const fallback=await browser.newContext({viewport:{width:390,height:900}});
  await fallback.addInitScript(()=>{window.IntersectionObserver=undefined;});
  await fallback.addInitScript(mockMetrika);
  await fallback.route('**/*',route=>{
    if(route.request().method()==='GET'&&route.request().url().startsWith(origin+'/'))return route.continue();
    report.externalBlocked++;return route.abort();
  });
  const page=await fallback.newPage();
  await page.goto(origin+'/bannery-borisoglebsk.html');
  await page.locator('[data-leader-lead-widget]').waitFor();
  assert.equal(await count(page,'form_view'),0);
  await page.locator('[data-leader-lead-widget]').scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>window.__ymCalls.some(c=>c[2]==='form_view'));
  await page.evaluate(()=>{window.dispatchEvent(new Event('scroll'));window.dispatchEvent(new Event('resize'));});
  assert.equal(await count(page,'form_view'),1,'Fallback observation is also once-only');
  await fallback.close();
  await writeFile(output+'/report.json',JSON.stringify(report,null,2)+'\n');
  console.log('PASS: 26 service explanations, 3 use cases and 17 illustrations at desktop/mobile; exact selections, keyboard FAQ, visible forms and safe Metrika calls; all external HTTP blocked.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
