import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();
const server = createServer(async (req, res) => {
  let file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!file.startsWith(root + path.sep)) file = path.join(root, 'index.html');
  try { if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html'); }
  catch { file = path.join(root, '404.html'); res.statusCode = 404; }
  const type = file.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8';
  res.setHeader('Content-Type', type);
  res.end(await readFile(file));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
try {
  await mkdir('artifacts/public-404', { recursive: true });
  for (const width of [1440, 1024, 768, 390, 360]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = [], failedAssets = [], blocked = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', r => { if (r.request().resourceType() === 'stylesheet' && r.status() !== 200) failedAssets.push(r.url()); });
    await page.route('**/*', route => {
      if (route.request().url().startsWith(origin + '/') && route.request().method() === 'GET') return route.continue();
      blocked.push(route.request().url()); return route.abort();
    });
    const response = await page.goto(origin + '/a/b/missing/');
    assert.equal(response.status(), 404);
    const state = await page.evaluate(() => ({
      styled: [...document.querySelectorAll('link[rel="stylesheet"]')].every(el => !!el.sheet),
      overflow: document.documentElement.scrollWidth > innerWidth,
      links: [...document.querySelectorAll('a')].map(el => el.getAttribute('href'))
    }));
    assert.equal(state.styled, true); assert.equal(state.overflow, false);
    assert(state.links.every(href => href.startsWith('/') || href.startsWith('tel:')));
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.getAttribute('href')), '/');
    await page.screenshot({ path: `artifacts/public-404/${width}.png`, fullPage: true });
    await page.getByRole('link', { name: 'Все услуги' }).click();
    assert.equal(page.url(), origin + '/uslugi.html');
    assert.equal(await page.getByRole('heading', { name: 'Такой страницы нет', exact: true }).count(), 0);
    assert.deepEqual(errors, []); assert.deepEqual(failedAssets, []);
    console.log(JSON.stringify({ width, styled: state.styled, overflow: state.overflow, recovery: true, pageErrors: errors, failedAssets, externalRequestsBlocked: blocked.length }));
    await page.close();
  }
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
