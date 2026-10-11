import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = process.cwd();
await import('../assets/leader-service-catalog.js');
const commercial = JSON.parse(await readFile('data/commercial-services.json', 'utf8'));
const catalog = globalThis.LeaderServiceCatalog;
const publicForms=[];
for(const name of (await readdir(root)).filter(name=>name.endsWith('.html')).sort()){
  if((await readFile(name,'utf8')).includes('assets/public-lead-form.js?v=36'))publicForms.push(name);
}
assert.equal(publicForms.length,64,'Exercise the actual release on all public form pages');
const server = createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  try {
    res.setHeader('Content-Type', ({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({executablePath:process.env.LEADER_BROWSER_EXECUTABLE || undefined});
await mkdir('artifacts/public-lead', {recursive:true});
async function assertConfirmation(page,requestId){
  const status=page.locator('[data-leader-lead-status].ok');
  await status.waitFor();
  assert.ok((await status.textContent()).includes('Номер обращения: '+requestId+'.'),'Show the accepted server reference');
  assert.equal(await status.getAttribute('role'),'status');
  assert.equal(await status.getAttribute('tabindex'),'-1','No permanent tab stop');
  assert.equal(await status.evaluate(el=>el===document.activeElement),true,'Focus follows the confirmed result');
  const bounds=await status.evaluate(el=>{
    const box=el.getBoundingClientRect();
    const header=document.querySelector('header');
    const fixedHeader=header&&['fixed','sticky'].includes(getComputedStyle(header).position)?header.getBoundingClientRect().bottom:0;
    const bars=[...document.querySelectorAll('.mobile-cta,#leader-mobile-sticky-cta')].map(item=>item.getBoundingClientRect()).filter(item=>item.width&&item.height&&item.top<innerHeight);
    return {top:box.top,bottom:box.bottom,left:box.left,right:box.right,header:Math.max(0,fixedHeader),actions:Math.min(innerHeight,...bars.map(item=>item.top)),width:innerWidth,height:innerHeight};
  });
  assert.ok(bounds.top>=bounds.header+3&&bounds.bottom<=bounds.actions-3,'Entire confirmation clears the header and fixed actions: '+JSON.stringify(bounds));
  assert.ok(bounds.left>=0&&bounds.right<=bounds.width,'Reference stays within the viewport');
}
try {
  for (const width of [1440,390]) {
    const context = await browser.newContext({viewport:{width,height:900}});
    await context.addInitScript(()=>{window.__leaderTestGoals=[];window.addEventListener('leader:goal',event=>window.__leaderTestGoals.push(event.detail));});
    const page = await context.newPage();
    const payloads = [];
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let rejectNext = true;
    let nextResponse = null;
    await context.route('**/*', route => {
      const request = route.request();
      if (request.url().startsWith(origin + '/') && request.method() === 'GET') return route.continue();
      if (request.url() === 'https://ofewxuqfjhamgerwzull.supabase.co/functions/v1/leader-public-lead' && request.method() === 'POST') {
        const payload = request.postDataJSON(); payloads.push(payload);
        // Never forward to production; both outcomes are local fixtures.
        if (rejectNext) { rejectNext = false; return route.fulfill({status:503,contentType:'application/json',body:'{"ok":false}'}); }
        const response=nextResponse||{ok:true,request_id:payload.request_id};nextResponse=null;
        return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(response)});
      }
      return route.abort();
    });
    await page.goto(origin + '/?utm_source=vk&utm_medium=social&utm_campaign=opening');
    await page.locator('[name="service"]').waitFor();
    await page.goto(origin + '/bannery-borisoglebsk.html?service=Баннер');
    await page.locator('[name="service"]').selectOption('Наклейки');
    await page.locator('[name="phone"]').fill('+7 900 000-00-00');
    await page.locator('[name="message"]').fill('Synthetic local browser test');
    await page.locator('button[type="submit"]').click();
    await page.locator('[data-leader-lead-status].err').waitFor();
    await page.locator('button[type="submit"]').click();
    await page.locator('[data-leader-lead-status].ok').waitFor();
    assert.equal(payloads.length, 2);
    assert.equal(payloads[0].request_id, payloads[1].request_id);
    assert.equal(payloads[1].service, 'Наклейки');
    assert.equal(payloads[1].utm_source, 'vk');
    assert.equal(payloads[1].utm_campaign, 'opening');
    await assertConfirmation(page,payloads[1].request_id);
    await page.locator('[data-leader-lead-status]').press('Enter');
    assert.equal(payloads.length,2,'Enter on the confirmation does not resubmit');
    assert.equal(errors.length, 0, errors.join('\n'));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({path:`artifacts/public-lead/submission-${width}.png`});
    for (const item of commercial) {
      const service = catalog.find(item.id);
      await page.goto(origin + '/' + service.pages[0]);
      await page.locator('[name="service"]').waitFor();
      assert.equal(await page.locator('[name="service"]').inputValue(), service.label);
      assert.equal(await page.locator('[name="service"] option').count(), catalog.services.length);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.equal(await page.locator('.hero .btn').evaluate(el => el.getBoundingClientRect().bottom <= innerHeight - 70), true, service.id + ' CTA visible');
      await page.screenshot({path:`artifacts/public-lead/${service.id}-${width}.png`});
      if (['automation','promoters','websites'].includes(service.id)) {
        await page.locator('#demo').screenshot({path:`artifacts/public-lead/${service.id}-demo-${width}.png`});
      }
      const question=page.locator('.service-questions details').first();
      await question.locator('summary').focus();
      await page.keyboard.press('Enter');
      assert.equal(await question.locator('p').isVisible(), true);
      await page.locator('.hero .btn').click();
      if (service.brief) {
        await page.locator('[data-leader-more]').click();
        assert.equal(await page.locator('[data-leader-more]').getAttribute('aria-expanded'), 'true');
        const questions = page.locator('[data-leader-service-brief] label');
        assert.equal(await questions.count(), 4);
        assert.deepEqual(await questions.allTextContents(), service.questions);
        for (let i=0;i<4;i++) await page.locator(`[name="brief_${i}"]`).fill(`Ответ ${service.id} ${i}`);
        const other = catalog.find(service.id === 'animation' ? 'visualization-3d' : 'animation');
        await page.locator('[name="service"]').selectOption(other.label);
        assert.equal(await page.locator('[name="brief_0"]').inputValue(), '', 'New service starts with its own brief');
        await page.locator('[name="brief_0"]').fill('Не переносить в другую услугу');
        await page.locator('[name="service"]').selectOption(service.label);
        assert.equal(await page.locator('[name="brief_0"]').inputValue(), `Ответ ${service.id} 0`, 'Restore the selected service draft');
        assert.notEqual(await page.locator('[data-leader-more]').evaluate(el=>getComputedStyle(el).backgroundColor), await page.locator('button[type="submit"]').evaluate(el=>getComputedStyle(el).backgroundColor), 'Separate optional details from submission');
        for(const photo of await page.locator('main img').all()){await photo.scrollIntoViewIfNeeded(); await photo.evaluate(el=>el.decode());}
        await page.evaluate(()=>window.scrollTo(0,0));
        await page.screenshot({path:`artifacts/public-lead/${service.id}-brief-${width}.png`,fullPage:true});
      }
      await page.locator('[name="phone"]').fill('+7 900 000-00-00');
      await page.locator('[name="message"]').fill('Synthetic task ' + service.id);
      await page.locator('button[type="submit"]').click();
      await page.locator('[data-leader-lead-status].ok').waitFor();
      const submitted=payloads.at(-1);
      await assertConfirmation(page,submitted.request_id);
      assert.equal(submitted.service, service.label);
      assert.equal(submitted.direction, service.direction);
      assert.equal(submitted.utm_source, 'vk');
      assert.equal(submitted.page_path, '/' + service.pages[0]);
      assert.ok(submitted.message.includes('Задача клиента: Synthetic task ' + service.id));
      if (service.brief) {
        for (let i=0;i<4;i++) assert.ok(submitted.message.includes(`Бриф — ${service.questions[i]} Ответ ${service.id} ${i}`));
        assert.ok(!submitted.message.includes('Не переносить в другую услугу'));
        assert.equal(await page.locator('[name="brief_0"]').inputValue(), '', 'Successful submit clears the answers');
      }
      assert.equal(await page.locator('[name="service"]').inputValue(), service.label, 'Keep service after success');
      assert.equal(errors.length, 0, errors.join('\n'));
    }
    for (const name of ['dizayn-3d-animaciya.html','nashi-raboty.html','dizayn-maketov.html']) {
      await page.goto(origin + '/' + name);
      await page.locator('[name="service"]').waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, name);
      assert.equal(await page.locator('h1').count(),1);
      const photos=page.locator('main img');
      for (const photo of await photos.all()) { await photo.scrollIntoViewIfNeeded(); await photo.evaluate(el=>el.decode()); assert.ok(await photo.evaluate(el=>el.naturalWidth>0)); }
      if (name === 'nashi-raboty.html') {
        const layout=page.locator('.work-card[data-work-kind="layout"] img');
        assert.equal(await layout.evaluate(el=>getComputedStyle(el).objectFit),'contain','Show the complete 2D layout');
        assert.equal(await layout.evaluate(el=>{ const img=el.getBoundingClientRect(); const card=el.closest('.work-card').getBoundingClientRect(); return img.left>=card.left && img.right<=card.right; }),true,'Keep the image inside its card');
      }
      await page.evaluate(()=>window.scrollTo(0,0));
      await page.screenshot({path:`artifacts/public-lead/${name.replace('.html','')}-${width}.png`,fullPage:true});
    }
    for(const [index,offer] of catalog.offers.entries()){
      await page.goto(origin+'/dizayn-3d-animaciya.html?utm_source=vk&utm_campaign=creative-offers');
      await page.locator('.creative-packages .btn').nth(index).click();
      const note=page.locator('[data-leader-offer-note]');
      await note.waitFor({state:'visible'});
      const service=catalog.find(offer.service_id);
      assert.equal(await page.locator('[name="service"]').inputValue(),service.label);
      assert.ok((await note.textContent()).includes(offer.label));
      await page.locator('[name="phone"]').fill('+7 900 000-00-00');
      const task='Synthetic selected offer '+offer.id;
      await page.locator('[name="message"]').fill(task);
      await page.locator('[data-leader-lead-widget]').screenshot({path:`artifacts/public-lead/offer-${offer.id}-${width}.png`});
      rejectNext=true;
      await page.locator('button[type="submit"]').click();
      await page.locator('[data-leader-lead-status].err').waitFor();
      const failed=payloads.at(-1);
      await page.locator('button[type="submit"]').click();
      await page.locator('[data-leader-lead-status].ok').waitFor();
      const sent=payloads.at(-1);
      assert.equal(sent.request_id,failed.request_id);
      assert.equal(sent.service_id,offer.service_id);
      assert.equal(sent.utm_campaign,'creative-offers');
      assert.ok(sent.message.includes('Состав заказа: '+offer.label));
      assert.ok(sent.message.includes('Задача клиента: '+task));
      await page.locator('[name="phone"]').fill('+7 900 000-00-00');
      await page.locator('[name="message"]').fill('Synthetic changed service');
      await page.locator('[name="service"]').selectOption('Полиграфия');
      assert.equal(await note.isVisible(),false,'A different service clears the selected offer');
      assert.equal(await page.locator('[name="message"]').inputValue(),'Synthetic changed service');
      await page.locator('button[type="submit"]').click();
      await page.locator('[data-leader-lead-status].ok').waitFor();
      assert.ok(!payloads.at(-1).message.includes('Состав заказа:'));
    }
    for(const query of ['service=design&offer=onsite-preview','service=design&offer=unknown']){
      await page.goto(origin+'/dizayn-maketov.html?'+query);
      await page.locator('[name="service"]').waitFor();
      assert.equal(await page.locator('[data-leader-offer-note]').isVisible(),false);
    }
    for(const service of catalog.services.filter(item=>item.brief)){
      await page.goto(origin+'/'+service.pages[0]);
      await page.locator('[name="phone"]').fill('+7 900 000-00-00');
      const originalTask='Полное ТЗ '+ 'т'.repeat(1988)+'🔶';
      await page.locator('[name="message"]').fill(originalTask);
      await page.locator('[data-leader-more]').click();
      const answers=[];
      for(let i=0;i<4;i++){
        answers.push('Ответ '+i+' '+ 'б'.repeat(172));
        await page.locator(`[name="brief_${i}"]`).fill(answers[i]);
      }
      const budget=page.locator('[data-leader-message-budget]');
      await budget.waitFor({state:'visible'});
      const match=(await budget.textContent()).match(/на (\d+) символ/);
      assert.ok(match,'Describe the exact excess before submit');
      const excess=Number(match[1]);
      const message=page.locator('[name="message"]');
      assert.equal(await message.getAttribute('aria-describedby'),await budget.getAttribute('id'));
      assert.equal(await page.locator('[name="brief_3"]').getAttribute('aria-describedby'),await budget.getAttribute('id'));
      await page.locator('[name="service"]').selectOption('Наклейки');
      assert.equal(await budget.isVisible(),false,'Changing service recalculates the active brief');
      assert.equal(await message.inputValue(),originalTask);
      await page.locator('[name="service"]').selectOption(service.label);
      assert.equal(await page.locator('[name="brief_3"]').inputValue(),answers[3]);
      assert.equal(await budget.isVisible(),true);
      const postsBefore=payloads.length;
      const pendingBefore=await page.evaluate(()=>sessionStorage.getItem('leader_public_lead_pending_v1'));
      await page.locator('button[type="submit"]').click();
      await page.locator('[data-leader-lead-status].err').waitFor();
      assert.equal(payloads.length,postsBefore,'An overlong message produces no HTTP request');
      assert.equal(await page.evaluate(()=>sessionStorage.getItem('leader_public_lead_pending_v1')),pendingBefore);
      assert.equal(await message.inputValue(),originalTask);
      assert.equal(await message.evaluate(el=>el===document.activeElement),true,'Focus the described text field');
      assert.equal(await budget.evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight}),true,'The length hint is visible in the actual viewport after focus');
      for(let i=0;i<4;i++)assert.equal(await page.locator(`[name="brief_${i}"]`).inputValue(),answers[i]);
      await page.screenshot({path:`artifacts/public-lead/budget-viewport-${service.id}-${width}.png`});
      await page.locator('[data-leader-lead-widget]').screenshot({path:`artifacts/public-lead/budget-${service.id}-${width}.png`});
      const corrected=originalTask.slice(0,originalTask.length-excess);
      await message.fill(corrected);
      assert.equal(await page.locator('[data-leader-lead-status]').textContent(),'','A corrected length clears the validation error');
      rejectNext=true;
      await page.locator('button[type="submit"]').click();
      await page.locator('[data-leader-lead-status].err').waitFor();
      const failed=payloads.at(-1);
      assert.equal(failed.message.length,3000);
      assert.ok(failed.message.includes('Задача клиента: '+corrected));
      for(let i=0;i<4;i++)assert.ok(failed.message.includes('Бриф — '+service.questions[i]+' '+answers[i]));
      await page.locator('button[type="submit"]').click();
      await page.locator('[data-leader-lead-status].ok').waitFor();
      assert.equal(payloads.at(-1).request_id,failed.request_id,'Corrected message keeps its request ID on retry');
      assert.equal(await message.inputValue(),'');
      assert.equal(await budget.isVisible(),false,'Success resets the budget and answers');
      assert.equal(await page.locator('[name="service"]').inputValue(),service.label);
    }
    for(const name of publicForms){
      await page.goto(origin+'/'+name);
      const form=page.locator('[data-leader-lead-widget]');
      const detail=page.locator('[name="contact_detail"]');
      const method=page.locator('[name="contact_method"]');
      const more=page.locator('[data-leader-more]');
      const hint=page.locator('[data-leader-contact-hint]');
      await page.locator('[name="phone"]').fill('+7 900 000-00-00');
      const task='Synthetic contact task '+name;
      await page.locator('[name="message"]').fill(task);
      await more.click();
      const postsBefore=payloads.length;
      const pending=await page.evaluate(()=>sessionStorage.getItem('leader_public_lead_pending_v1'));
      for(const choice of ['Написать на email','Написать ВКонтакте']){
        await method.selectOption(choice);
        assert.equal(await detail.getAttribute('aria-required'),'true');
        assert.equal(await detail.getAttribute('aria-describedby'),await hint.getAttribute('id'));
        await more.click();
        assert.equal(await more.getAttribute('aria-expanded'),'false');
        // Native HTML5 validation can prevent the submit event itself.
        await form.evaluate(el=>el.requestSubmit());
        assert.equal(await more.getAttribute('aria-expanded'),'true');
        assert.equal(await detail.evaluate(el=>el===document.activeElement),true);
        assert.equal(await detail.getAttribute('aria-invalid'),'true');
        assert.ok((await hint.textContent()).startsWith('Укажите'));
        assert.equal(await hint.isVisible(),true);
        assert.equal(payloads.length,postsBefore,name+' missing '+choice+' never posts');
        assert.equal(await page.evaluate(()=>sessionStorage.getItem('leader_public_lead_pending_v1')),pending);
        assert.equal(await page.locator('[name="message"]').inputValue(),task);
      }
      assert.equal(await page.evaluate(()=>window.__leaderTestGoals.filter(event=>event.goal==='contact_detail_missing').length),2,'One event per native validation attempt');
      for(const choice of ['Позвонить по указанному номеру','Написать в MAX по указанному номеру','Любой удобный способ']){
        await method.selectOption(choice);
        assert.equal(await detail.getAttribute('aria-required'),'false');
        assert.equal(await detail.evaluate(el=>el.validity.valid),true);
        assert.equal(await page.locator('[data-leader-lead-status]').textContent(),'');
      }
      rejectNext=false;
      await form.evaluate(el=>el.requestSubmit());
      await page.locator('[data-leader-lead-status].ok').waitFor();
      assert.equal(payloads.length,postsBefore+1,name+' has one accepted request');
      await assertConfirmation(page,payloads.at(-1).request_id);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,name);
    }
    for(const [name,choice,valid] of [
      ['3d-vizualizaciya-reklamy.html?service=visualization-3d&offer=onsite-preview','Написать на email','synthetic@example.test'],
      ['request.html?service=modeling-3d','Написать ВКонтакте','vk.com/id123'],
    ]){
      await page.goto(origin+'/'+name);
      const form=page.locator('[data-leader-lead-widget]');
      const detail=page.locator('[name="contact_detail"]');
      const method=page.locator('[name="contact_method"]');
      const hint=page.locator('[data-leader-contact-hint]');
      const more=page.locator('[data-leader-more]');
      await page.locator('[name="phone"]').fill('+7 900 000-00-00');
      await page.locator('[name="message"]').fill('Synthetic full contact brief');
      await more.click();
      for(let i=0;i<4;i++)await page.locator(`[name="brief_${i}"]`).fill('Сохранить ответ '+i);
      const service=await page.locator('[name="service"]').inputValue();
      const postsBefore=payloads.length;
      await method.selectOption(choice);
      for(const invalid of choice==='Написать на email'?['   ','not-an-email','name@']:['   ','https://vk.com/','https://vk.com.evil.example/id123']){
        await detail.fill(invalid);
        await page.locator('button[type="submit"]').click();
        assert.equal(payloads.length,postsBefore,'Malformed contact never posts');
        assert.equal(await detail.evaluate(el=>el===document.activeElement),true);
        assert.equal(await hint.isVisible(),true);
        assert.equal(await page.locator('[name="brief_3"]').inputValue(),'Сохранить ответ 3');
      }
      const bounds=await detail.evaluate(el=>{const field=el.getBoundingClientRect(),label=el.closest('.leader-lead-span-12').querySelector('label').getBoundingClientRect(),hint=el.parentElement.querySelector('[data-leader-contact-hint]').getBoundingClientRect();return {labelTop:label.top,fieldBottom:field.bottom,hintTop:hint.top,hintBottom:hint.bottom,viewport:innerHeight,scrollBehavior:getComputedStyle(document.documentElement).scrollBehavior};});
      await page.screenshot({path:`artifacts/public-lead/contact-${choice==='Написать на email'?'email':'vk'}-${width}.png`});
      assert.ok(bounds.hintTop>=0&&bounds.hintBottom<bounds.viewport-70,'Contact guidance stays clear of fixed actions: '+choice+' @'+width+' '+JSON.stringify(bounds));
      assert.ok(bounds.labelTop>=0&&bounds.fieldBottom<bounds.viewport-70,'Contact label and whole input stay visible: '+choice+' @'+width+' '+JSON.stringify(bounds));
      await detail.fill(valid);
      assert.equal(await detail.getAttribute('aria-invalid'),'false');
      assert.equal(await page.locator('[data-leader-lead-status]').textContent(),'');
      rejectNext=true;
      await page.locator('button[type="submit"]').click();
      await page.locator('[data-leader-lead-status].err').waitFor();
      const failed=payloads.at(-1);
      assert.equal(failed.contact_detail,valid);assert.equal(failed.contact_method,choice);
      assert.equal(failed.service,service);assert.ok(failed.message.includes('Задача клиента: Synthetic full contact brief'));
      for(let i=0;i<4;i++)assert.ok(failed.message.includes('Сохранить ответ '+i));
      if(choice==='Написать на email')assert.ok(failed.message.includes('Состав заказа: Увидеть на объекте'));
      await page.locator('button[type="submit"]').click();
      await page.locator('[data-leader-lead-status].ok').waitFor();
      assert.equal(payloads.at(-1).request_id,failed.request_id);
      await assertConfirmation(page,failed.request_id);
      assert.equal(await method.inputValue(),'Позвонить по указанному номеру');
      assert.equal(await detail.inputValue(),'');
      assert.equal(await detail.getAttribute('aria-required'),'false');
      assert.equal(await detail.getAttribute('type'),'text');
      assert.equal(await page.locator('[name="service"]').inputValue(),service);
      assert.equal(await page.locator('[name="brief_0"]').inputValue(),'');
      await method.selectOption('Написать в MAX по указанному номеру');
      assert.equal(await detail.evaluate(el=>el.validity.valid),true);
      const validationGoals=await page.evaluate(()=>window.__leaderTestGoals.filter(event=>event.goal==='contact_detail_missing'||event.goal==='lead_validation_error'));
      assert.ok(!JSON.stringify(validationGoals).includes(valid),'Validation goals contain no customer contacts');
    }
    if(width===390)for(const [name,w,h] of [
      ['index.html',320,568],
      ['request.html?service=modeling-3d',390,667],
      ['3d-vizualizaciya-reklamy.html?service=visualization-3d&offer=onsite-preview',1040,390],
    ]){
      await page.setViewportSize({width:w,height:h});
      await page.goto(origin+'/'+name);
      await page.locator('[name="phone"]').fill('+7 900 000-00-00');
      await page.locator('[name="message"]').fill('Synthetic duplicate confirmation');
      rejectNext=false;
      // A long fixture ID also verifies wrapping; this is never sent to production.
      const requestId='web-confirmed-'+ 'r'.repeat(80);
      nextResponse={ok:true,request_id:requestId,duplicate:true};
      const before=payloads.length;
      await page.locator('button[type="submit"]').focus();
      await page.keyboard.press('Enter');
      await assertConfirmation(page,requestId);
      assert.equal(payloads.length,before+1);
      assert.ok((await page.locator('[data-leader-lead-status]').textContent()).startsWith('Заявка уже была отправлена ранее.'));
      assert.equal(await page.locator('[data-leader-lead-widget]').getAttribute('data-last-request-id'),requestId);
      assert.equal(await page.evaluate(()=>sessionStorage.getItem('leader_public_lead_pending_v1')),null);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      await page.screenshot({path:`artifacts/public-lead/confirmation-duplicate-${w}-${h}.png`});
    }
    assert.equal(errors.length,0,errors.join('\n'));
    await context.close();
  }
  console.log('PASS: all 64 forms on desktop/mobile, fully visible focused confirmations, server references and duplicate responses on small/landscape screens, native contact validation, correction/reset/retry, full message/brief, campaign and service selection; zero production requests forwarded.');
} finally { await browser.close(); server.close(); }
