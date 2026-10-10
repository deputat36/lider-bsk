import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = process.cwd();
await import('../assets/leader-service-catalog.js');
const commercial = JSON.parse(await readFile('data/commercial-services.json', 'utf8'));
const catalog = globalThis.LeaderServiceCatalog;
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
try {
  for (const width of [1440,390]) {
    const context = await browser.newContext({viewport:{width,height:900}});
    const page = await context.newPage();
    const payloads = [];
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let rejectNext = true;
    await context.route('**/*', route => {
      const request = route.request();
      if (request.url().startsWith(origin + '/') && request.method() === 'GET') return route.continue();
      if (request.url() === 'https://ofewxuqfjhamgerwzull.supabase.co/functions/v1/leader-public-lead' && request.method() === 'POST') {
        const payload = request.postDataJSON(); payloads.push(payload);
        // Never forward to production; both outcomes are local fixtures.
        if (rejectNext) { rejectNext = false; return route.fulfill({status:503,contentType:'application/json',body:'{"ok":false}'}); }
        return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,request_id:payload.request_id})});
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
      }
      await page.locator('[name="phone"]').fill('+7 900 000-00-00');
      await page.locator('[name="message"]').fill('Synthetic task ' + service.id);
      await page.locator('button[type="submit"]').click();
      await page.locator('[data-leader-lead-status].ok').waitFor();
      const submitted=payloads.at(-1);
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
      await page.screenshot({path:`artifacts/public-lead/${name.replace('.html','')}-${width}.png`,fullPage:true});
    }
    await context.close();
  }
  console.log('PASS: desktop/mobile submit, campaign navigation, user service selection, retry; zero production requests forwarded.');
} finally { await browser.close(); server.close(); }
