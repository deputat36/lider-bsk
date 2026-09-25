import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = process.cwd();
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
const browser = await chromium.launch();
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
    await context.close();
  }
  console.log('PASS: desktop/mobile submit, campaign navigation, user service selection, retry; zero production requests forwarded.');
} finally { await browser.close(); server.close(); }
