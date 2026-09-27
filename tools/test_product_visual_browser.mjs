import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const axePath = process.env.AXE_CORE_PATH || require.resolve('axe-core/axe.min.js');
const root = process.cwd();
const out = path.join(root, 'artifacts/product-system');
const mime = { '.css':'text/css', '.js':'text/javascript', '.html':'text/html; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.webp':'image/webp', '.woff2':'font/woff2' };
const server = createServer(async (req, res) => {
  let file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  try {
    if (file !== root && !file.startsWith(root + path.sep)) throw new Error('path');
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.statusCode = 404; res.end('Not found'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined});
const results = [];
try {
  await mkdir(out, {recursive:true});
  for (const [name, url] of [['home','/'], ['services','/uslugi.html'], ['service','/vyveski-borisoglebsk.html'], ['request','/request.html'], ['crm','/crm/v4/brand-preview.html']]) {
    for (const width of [360,390,768,1024,1440]) {
      const page = await browser.newPage({viewport:{width,height:1000}, reducedMotion:'reduce'});
      const errors = [], unexpected = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.route('**/*', route => {
        const req = route.request();
        if (req.url().startsWith(origin + '/') && req.method() === 'GET') return route.continue();
        if (req.url() === 'https://mc.yandex.ru/metrika/tag.js' && req.method() === 'GET') return route.fulfill({status:200,contentType:'text/javascript',body:'/* isolated UI test */'});
        unexpected.push(req.url()); return route.abort();
      });
      await page.goto(origin + url);
      await page.evaluate(() => document.fonts.ready);
      const layout = await page.evaluate(() => ({
        overflow:document.documentElement.scrollWidth > innerWidth,
        fontReady:document.fonts.check('16px Manrope'),
        h1:document.querySelector('h1')?.textContent,
        fontBytes:performance.getEntriesByType('resource').filter(r=>r.name.includes('.woff2')).reduce((n,r)=>n+r.decodedBodySize,0),
        transferred:performance.getEntriesByType('resource').reduce((n,r)=>n+r.transferSize,0)
      }));
      await page.addScriptTag({path:axePath});
      const violations = await page.evaluate(async () => (await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})));
      if (width===360 || width===1440) await page.screenshot({path:path.join(out,`${name}-${width}.png`),fullPage:true});
      results.push({name,width,...layout,errors,unexpected,violations});
      console.log(JSON.stringify({name,width,...layout,errors,unexpected,violations:violations.map(v=>({id:v.id,nodes:v.nodes.length}))}));
      await page.close();
    }
  }
  if (process.argv.includes('--render-assets')) {
    const page = await browser.newPage({viewport:{width:1200,height:630}});
    await page.goto(origin+'/assets/og-lider-default.svg');
    await page.screenshot({path:path.join(root,'assets/og-lider-default.png')});
    await page.setViewportSize({width:324,height:296});
    await page.goto(origin+'/assets/brand/logo-lider-header.svg');
    await page.locator('svg').screenshot({path:path.join(out,'logo.png'),omitBackground:true});
    await page.close();
  }
  await writeFile(path.join(out,'report.json'),JSON.stringify(results,null,2));
  for (const result of results) {
    assert.equal(result.overflow,false,`${result.name} ${result.width}: overflow`);
    assert.equal(result.fontReady,true,`${result.name}: local Manrope missing`);
    assert.ok(result.fontBytes <= 40000,`${result.name}: font budget exceeded`);
    assert.ok(result.transferred < 250000,`${result.name}: initial local resource budget exceeded`);
    assert.deepEqual(result.errors,[],`${result.name}: browser errors`);
    assert.deepEqual(result.unexpected,[],`${result.name}: unexpected external request`);
    assert.deepEqual(result.violations,[],`${result.name} ${result.width}: WCAG violations`);
  }
} finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
