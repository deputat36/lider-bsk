import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();
const types = { '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.html': 'text/html; charset=utf-8' };
const server = createServer(async (req, res) => {
  let file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (file === root) file = path.join(root, 'index.html');
  try {
    if (!file.startsWith(root + path.sep)) throw new Error('invalid path');
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.statusCode = 404; res.end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
try {
  await mkdir('artifacts/public-homepage', { recursive: true });
  for (const width of [1440, 1024, 768, 390, 360]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [], failed = [], blocked = [], writes = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('response', res => { if (res.status() >= 400) failed.push(res.url()); });
    await page.route('**/*', route => {
      const req = route.request();
      if (req.method() !== 'GET') writes.push(req.url());
      if (req.url().startsWith(origin + '/') && req.method() === 'GET') return route.continue();
      blocked.push(req.url());
      // Analytics is deliberately isolated; unexpected network still fails below.
      if (req.url() === 'https://mc.yandex.ru/metrika/tag.js' && req.method() === 'GET') {
        return route.fulfill({ status: 200, contentType: 'text/javascript', body: '/* analytics disabled in isolated UI test */' });
      }
      return route.abort();
    });
    await page.goto(origin + '/');
    const nav = page.getByRole('navigation', { name: 'Основная навигация' });
    const button = page.locator('.menu-btn');
    assert.equal(await page.locator('.brand-logo').evaluate(el => el.complete && el.naturalWidth > 0), true);
    assert.equal(await page.locator('#leader-lead-form form').count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.equal(await page.locator('#main-navigation a').count(), 5);
    if (width <= 1060) {
      assert.equal(await nav.isVisible(), false);
      await button.click();
      assert.equal(await button.getAttribute('aria-expanded'), 'true');
      assert.equal(await nav.isVisible(), true);
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.getAttribute('href')), '#services');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('.menu-btn').getAttribute('aria-expanded'), 'false');
      assert.equal(await page.evaluate(() => document.activeElement.classList.contains('menu-btn')), true);
      await button.click();
      await nav.getByRole('link', { name: 'Услуги', exact: true }).click();
      assert.equal(await page.evaluate(() => document.activeElement.id), 'services');
      assert.equal(await nav.isVisible(), false);
      await button.click();
      await page.screenshot({ path: `artifacts/public-homepage/menu-${width}.png`, fullPage: false });
      await page.keyboard.press('Escape');
      await button.click();
      await page.locator('#services h2').click();
      assert.equal(await nav.isVisible(), false);
      await button.click();
      await page.setViewportSize({ width: 1440, height: 900 });
      assert.equal(await nav.isVisible(), true);
      assert.equal(await button.getAttribute('aria-expanded'), 'false');
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await nav.isVisible(), false);
    } else {
      assert.equal(await nav.isVisible(), true);
      assert.equal(await button.isVisible(), false);
    }
    assert.equal(await page.locator('.menu-btn use').getAttribute('href'), 'assets/brand/leader-icons.svg#icon-menu');
    await page.getByRole('link', { name: 'РА Лидер — на главную', exact: true }).click();
    // The former helper rewrote content at 80/500/1200 ms, including after user interaction.
    const before = await page.locator('#main-navigation').innerHTML();
    await page.waitForTimeout(1300);
    assert.equal(await page.locator('#main-navigation').innerHTML(), before);
    assert.equal(await page.locator('#leader-ui-fix-v10').count(), 0);
    for (const service of ['Вывеска / наружная реклама', 'Печать на плёнке', 'Плоттерная резка', 'Дизайн макета', 'Соцсети и контент', 'Яндекс Карты и 2ГИС']) {
      await page.locator(`#services [data-service="${service}"]`).click();
      assert.equal(await page.locator('#leader-lead-form [name="service"]').inputValue(), service);
    }
    // Existing client text must survive service selection, and scenario prefill needs an empty draft.
    assert.match(await page.locator('#leader-lead-form [name="message"]').inputValue(), /Вывеска/);
    await page.locator('#leader-lead-form [name="message"]').fill('');
    await page.locator('[data-scenario="shop"]').click();
    assert.equal(await page.locator('#leader-lead-form [name="service"]').inputValue(), 'Комплексная реклама');
    assert.match(await page.locator('#leader-lead-form [name="message"]').inputValue(), /магазин/);
    await page.getByRole('link', { name: 'РА Лидер — на главную', exact: true }).click();
    await page.screenshot({ path: `artifacts/public-homepage/${width}.png`, fullPage: false });
    assert.deepEqual(errors, []); assert.deepEqual(failed, []); assert.deepEqual(writes, []);
    console.log(JSON.stringify({ width, logoLoaded: true, menu: true, formMounted: true, overflow: false, errors, failed, writes, externalRequestsBlocked: blocked.length }));
    await page.close();
  }
  const noJs = await browser.newPage({ javaScriptEnabled: false, viewport: { width: 390, height: 900 } });
  await noJs.goto(origin + '/');
  assert.equal(await noJs.getByRole('navigation', { name: 'Основная навигация' }).isVisible(), true);
  assert.equal(await noJs.locator('#service-pages a').count(), 6);
  console.log('No-JavaScript commercial navigation: PASS');
  await noJs.close();
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
