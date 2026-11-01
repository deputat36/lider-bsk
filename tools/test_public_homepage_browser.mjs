import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = process.cwd();
const landingCases = {
  signs: { path: '/vyveski-borisoglebsk.html', service: 'Вывеска / наружная реклама', cta: 'Рассчитать вывеску', relatedHeading: 'Баннеры в Борисоглебске' },
  banners: { path: '/bannery-borisoglebsk.html', service: 'Баннер', cta: 'Рассчитать баннер', relatedHeading: 'Вывески в Борисоглебске' },
  film: { path: '/pechat-na-plenke-borisoglebsk.html', service: 'Печать на плёнке', cta: 'Рассчитать печать на плёнке', relatedHeading: 'Наклейки и плоттерная резка в Борисоглебске' },
  stickers: { path: '/nakleyki-plotternaya-rezka-borisoglebsk.html', service: 'Наклейки', cta: 'Рассчитать наклейки', relatedHeading: 'Печать на плёнке в Борисоглебске' },
  windows: { path: '/oformlenie-vitrin-borisoglebsk.html', service: 'Печать на плёнке', cta: 'Рассчитать оформление витрины', relatedHeading: 'Печать на плёнке в Борисоглебске' },
};
const landingName = Object.keys(landingCases).find(name => process.argv.includes('--' + name));
const landing = landingCases[landingName];
const landingOnly = Boolean(landing);
const servicesOnly = process.argv.includes('--services');
const customerPath = process.argv.includes('--customer-path');
const types = { '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json', '.html': 'text/html; charset=utf-8' };
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
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined });
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
    if (customerPath) {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const samples = [
        '/index.html', '/uslugi.html', '/vizitki-borisoglebsk.html',
        '/menyu-dlya-kafe-borisoglebsk.html', '/prices.html', '/request.html',
        '/kontakty.html', '/privacy.html', '/poligrafiya-katalog.html',
        '/nashi-raboty.html', '/promoutery-borisoglebsk.html',
        '/reklama-v-soobshchestvah-borisoglebska.html',
      ];
      for (const sample of samples) {
        await page.goto(origin + sample);
        const nav = page.locator('#main-navigation');
        const button = page.getByRole('button', { name: 'Открыть меню', exact: true });
        assert.equal(await page.locator('.leader-site-header').count(), 1, sample);
        assert.deepEqual(await nav.locator('a').allTextContents(), ['Услуги', 'Решения', 'Работы', 'Цены', 'Контакты']);
        assert.equal(await nav.locator('a').nth(2).getAttribute('href'), 'nashi-raboty.html');
        assert.equal(await page.locator('.brand-logo').evaluate(el => el.complete && el.naturalWidth > 0), true, sample);
        assert.equal(await page.locator('.leader-header-actions .btn').isVisible(), true, sample + ' request link');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, sample + ' overflow');
        if (width <= 1060) {
          assert.equal(await nav.isVisible(), false, sample);
          await button.click();
          if (!await nav.isVisible()) {
            console.log(JSON.stringify({ sample, width, navigation: await page.locator('.leader-site-header').evaluate(el => ({ classes: el.className, expanded: el.querySelector('button').getAttribute('aria-expanded'), display: getComputedStyle(el.querySelector('nav')).display, focus: document.activeElement?.outerHTML, scripts: [...document.scripts].map(s => s.src).filter(s => s.includes('packages-link')) })) }));
            await page.screenshot({ path: `artifacts/public-homepage/customer-menu-failure-${width}.png` });
          }
          assert.equal(await nav.isVisible(), true, sample);
          await page.keyboard.press('Tab');
          assert.equal(await page.evaluate(() => document.activeElement.getAttribute('href')), 'uslugi.html');
          await page.keyboard.press('Escape');
          assert.equal(await nav.isVisible(), false, sample);
          assert.equal(await button.getAttribute('aria-expanded'), 'false');
        } else assert.equal(await nav.isVisible(), true, sample);
        if ([1440, 390].includes(width)) {
          await page.screenshot({ path: `artifacts/public-homepage/customer-${sample.slice(1)}-${width}.png` });
        }
      }
      // Page presets must preserve explicit routes and any subsequent choice.
      for (const [sample, expected] of [
        ['/menyu-dlya-kafe-borisoglebsk.html?service=campaign', 'Комплексная реклама'],
        ['/razdatochnye-materialy-borisoglebsk.html?scenario=cafe', 'Комплексная реклама'],
        ['/kontakty.html?service=maps', 'Яндекс Карты и 2ГИС'],
        ['/kontakty.html?service=unknown-service', 'Другое'],
      ]) {
        await page.goto(origin + sample);
        assert.equal(await page.locator('[name="service"]').inputValue(), expected, sample);
        await page.locator('[name="message"]').fill('Сохранить мои пожелания и выбранное направление.');
        await page.waitForTimeout(180);
        assert.equal(await page.locator('[name="service"]').inputValue(), expected, sample + ' delayed preset');
        assert.equal(await page.locator('[name="message"]').inputValue(), 'Сохранить мои пожелания и выбранное направление.');
      }
      for (const [sample, initial] of [
        ['/menyu-dlya-kafe-borisoglebsk.html', 'Полиграфия'],
        ['/kontakty.html', 'Другое'],
      ]) {
        await page.goto(origin + sample);
        assert.equal(await page.locator('[name="service"]').inputValue(), initial);
        await page.locator('[name="message"]').fill('Нужен комплексный заказ, текст оставить.');
        await page.locator('[name="service"]').selectOption('Комплексная реклама');
        await page.waitForTimeout(180);
        assert.equal(await page.locator('[name="service"]').inputValue(), 'Комплексная реклама');
        assert.equal(await page.locator('[name="message"]').inputValue(), 'Нужен комплексный заказ, текст оставить.');
      }
      // A page-specific timer used to replace the query/button choice after 700ms.
      await page.goto(origin + '/reklama-v-soobshchestvah-borisoglebska.html?service=campaign');
      await page.locator('[name="message"]').fill('Нужны публикации к открытию кафе, материалы готовы.');
      await page.waitForTimeout(850);
      assert.equal(await page.locator('[name="service"]').inputValue(), 'Комплексная реклама');
      await page.getByRole('link', { name: 'Рассчитать размещение', exact: true }).click();
      assert.equal(await page.locator('[name="service"]').inputValue(), 'Соцсети и контент');
      await page.getByRole('link', { name: 'Рассчитать комплекс', exact: true }).click();
      await page.waitForTimeout(850);
      assert.equal(await page.locator('[name="service"]').inputValue(), 'Комплексная реклама');
      assert.equal(await page.locator('[name="message"]').inputValue(), 'Нужны публикации к открытию кафе, материалы готовы.');
      const table = page.getByRole('region', { name: 'Сообщества для размещения рекламы', exact: true });
      if (await table.evaluate(el => el.scrollWidth > el.clientWidth)) {
        await table.focus();
        await page.keyboard.press('ArrowRight');
        await page.waitForFunction(() => document.querySelector('.table-wrap').scrollLeft > 0);
      }
      assert.equal(await page.locator('.hero-actions .btn').first().evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(255, 106, 0)');
      assert.equal(await page.locator('.community-price-card.main').first().evaluate(el => getComputedStyle(el).borderTopColor), 'rgb(255, 106, 0)');
      if ([1440, 390].includes(width)) await table.screenshot({ path: `artifacts/public-homepage/community-table-${width}.png` });
      await page.goto(origin + '/vizitki-borisoglebsk.html');
      await page.locator('[name="message"]').fill('Позвоните после 14 часов.');
      await page.locator('#card-qty').selectOption({ label: '1000 шт.' });
      await page.locator('#card-sides').selectOption({ label: 'Две стороны' });
      await page.locator('#send-card-summary').click();
      assert.equal(await page.locator('[name="quantity"]').inputValue(), '1000 шт.');
      assert.equal(await page.locator('[name="mockup"]').inputValue(), 'Макет готов');
      let message = await page.locator('[name="message"]').inputValue();
      assert(message.includes('Тираж: 1000 шт.') && message.includes('Позвоните после 14 часов.'));
      await page.locator('[name="message"]').fill(message + '\nБез глянцевой ламинации.');
      await page.locator('#card-qty').selectOption({ label: 'Другой тираж' });
      await page.locator('#card-custom-qty').fill('0');
      await page.locator('#send-card-summary').click();
      assert.equal(await page.locator('[name="quantity"]').inputValue(), '1000 шт.');
      await page.locator('#card-custom-qty').fill('1.5');
      assert.equal(await page.locator('#card-custom-qty').evaluate(el => el.checkValidity()), false);
      await page.locator('#card-custom-qty').fill('2500');
      await page.locator('#card-design').selectOption({ label: 'Нужен дизайн с нуля' });
      await page.locator('#send-card-summary').click();
      message = await page.locator('[name="message"]').inputValue();
      assert.equal(await page.locator('[name="quantity"]').inputValue(), '2500 шт.');
      assert.equal(await page.locator('[name="mockup"]').inputValue(), 'Макета нет, нужен дизайн');
      assert.equal(message.split('Заказ: визитки').length, 2, 'Repeated transfer must update its own block');
      assert(message.includes('Тираж: 2500 шт.') && message.includes('Без глянцевой ламинации.'));
      assert(message.includes('Позвоните после 14 часов.'));
      // A relevant real material must lead to the right service without losing notes.
      for (const [sample, material, kind, expectedService] of [
        ['vyveski-borisoglebsk.html', 'volume-letters-production', 'photo', 'Вывеска / наружная реклама'],
        ['dizayn-maketov.html', 'bormash-decal-design', 'layout', 'Дизайн макета'],
        ['podgotovka-maketov-k-pechati.html', 'bormash-decal-design', 'layout', 'Подготовка макетов к печати и ретушь'],
      ]) {
        await page.goto(origin + '/' + sample + '?service=campaign');
        const sampleBlock = page.locator('#work-sample');
        await sampleBlock.scrollIntoViewIfNeeded();
        await page.waitForFunction(() => { const image = document.querySelector('#work-sample img'); return image?.complete && image.naturalWidth > 0; });
        assert.equal(await sampleBlock.getAttribute('data-owner-material'), material);
        assert.equal(await sampleBlock.getAttribute('data-work-kind'), kind);
        assert.equal(await sampleBlock.locator('figcaption').isVisible(), true);
        assert.equal(await sampleBlock.locator('img').evaluate(el => getComputedStyle(el).objectFit), 'contain', 'Show the whole photograph or layout');
        assert.equal(await sampleBlock.locator('.service-actions a').evaluateAll(links => links.every(link => {
          const box = link.getBoundingClientRect();
          return link.getClientRects().length === 1 && box.height >= 44 && box.left >= 0 && box.right <= innerWidth;
        })), true, 'Each action has one complete touch target inside the viewport');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, sample + ' portfolio overflow');
        if ([1440, 390].includes(width)) await sampleBlock.screenshot({ path: `artifacts/public-homepage/work-${sample}-${width}.png` });
        await page.locator('[name="message"]').fill('Мои пожелания нужно сохранить при переходе от примера к заявке.');
        await sampleBlock.getByRole('link', { name: 'Обсудить похожую задачу', exact: true }).click();
        assert.equal(await page.locator('[name="service"]').inputValue(), expectedService);
        assert.equal(await page.locator('[name="message"]').inputValue(), 'Мои пожелания нужно сохранить при переходе от примера к заявке.');
        await sampleBlock.getByRole('link', { name: 'Все фото и макеты', exact: true }).click();
        assert.equal(new URL(page.url()).pathname, '/nashi-raboty.html');
        assert.equal(new URL(page.url()).hash, '#' + material);
        assert.equal(await page.locator('#' + material).getAttribute('data-work-kind'), kind);
      }
      await page.goto(origin + '/prices.html');
      assert.deepEqual(await page.locator('#price-examples .price').allTextContents(), ['1 000 ₽ за проект', '1 500 ₽ за проект', '2 500 ₽ за проект']);
      if (width <= 1060) await page.getByRole('button', { name: 'Открыть меню', exact: true }).click();
      await page.getByRole('navigation', { name: 'Основная навигация' }).getByRole('link', { name: 'Работы', exact: true }).click();
      assert.equal(new URL(page.url()).pathname, '/nashi-raboty.html');
      assert.equal(await page.getByRole('heading', { name: 'Объёмные буквы «ЦВЕТЫ»', exact: true }).count(), 1);
      assert.deepEqual(errors, []); assert.deepEqual(failed, []); assert.deepEqual(writes, []);
      const noScript = await browser.newPage({ viewport: { width, height: 900 }, javaScriptEnabled: false });
      await noScript.goto(origin + '/vizitki-borisoglebsk.html');
      assert.equal(await noScript.locator('#main-navigation').isVisible(), true, 'Navigation without JavaScript');
      assert.equal(await noScript.locator('.menu-btn').isVisible(), false, 'No inactive toggle without JavaScript');
      await noScript.close();
      console.log(JSON.stringify({ page: 'customer-path', width, navigationPages: samples.length, customQuantity: true, designSynced: true, notesPreserved: true, writes }));
      await page.close();
      continue;
    }
    await page.goto(origin + (landingOnly ? landing.path : servicesOnly ? '/uslugi.html' : '/'));
    if (landingOnly) {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const nav = page.getByRole('navigation', { name: 'Основная навигация' });
      const button = page.locator('.menu-btn');
      assert.equal(await page.locator('.brand-logo').evaluate(el => el.complete && el.naturalWidth > 0), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.equal(await page.locator('.hero .btn').evaluate(el => el.getBoundingClientRect().bottom <= innerHeight), true);
      assert.equal(await page.locator('#leader-lead-form form').count(), 1);
      assert.equal(await page.locator('[name="service"]').inputValue(), landing.service);
      await page.screenshot({ path: `artifacts/public-homepage/${landingName}-${width}.png` });
      assert.equal(await page.locator('.service-formats article').count(), 3);
      await page.locator('#formats').screenshot({ path: `artifacts/public-homepage/${landingName}-formats-${width}.png` });
      assert.equal(await page.locator('.service-related a').count(), 3);
      if (landingName === 'stickers') {
        assert.equal(await page.locator('input[type="file"]').count(), 0);
        assert.equal(await page.getByText('Куда отправить фото или макет?', { exact: true }).count(), 1);
        assert.equal(await page.getByText(/прикрепите фото/i).count(), 0);
      }
      const questions = page.locator('.service-questions details');
      assert.equal(await questions.count(), 4);
      for (const question of await questions.all()) {
        assert.equal(await question.locator('p').isVisible(), false);
        await question.locator('summary').focus();
        await page.keyboard.press('Enter');
        assert.equal(await question.locator('p').isVisible(), true);
      }
      await page.locator('#questions h2').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `artifacts/public-homepage/${landingName}-questions-${width}.png` });
      await page.locator('.service-related a').first().click();
      assert.equal(await page.locator('h1').innerText(), landing.relatedHeading);
      await page.goBack();

      if (width <= 1060) {
        assert.equal(await nav.isVisible(), false);
        await button.click();
        assert.equal(await nav.isVisible(), true);
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => document.activeElement.getAttribute('href')), 'uslugi.html');
        await page.keyboard.press('Escape');
        assert.equal(await nav.isVisible(), false);
        assert.equal(await button.getAttribute('aria-expanded'), 'false');
      } else assert.equal(await nav.isVisible(), true);
      await page.getByRole('link', { name: 'Что влияет на стоимость', exact: true }).click();
      const details = page.locator('.service-details');
      assert.equal(await details.locator('ul').isVisible(), false);
      await details.locator('summary').focus();
      await page.keyboard.press('Enter');
      assert.equal(await details.locator('ul').isVisible(), true);
      assert.equal(await page.locator('.header').evaluate(el => Math.abs(el.getBoundingClientRect().top) < 2), true);
      await page.screenshot({ path: `artifacts/public-homepage/${landingName}-estimate-${width}.png` });
      await page.getByRole('link', { name: 'Обсудить мой вариант', exact: true }).click();
      assert.equal(await page.locator('[name="service"]').isVisible(), true);
      await page.locator('[name="message"]').fill('Нужен расчёт, размер уточним позже');
      await page.getByRole('link', { name: landing.cta, exact: true }).click();
      assert.equal(await page.locator('[name="message"]').inputValue(), 'Нужен расчёт, размер уточним позже');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: `artifacts/public-homepage/${landingName}-form-${width}.png` });
      assert.deepEqual(errors, []); assert.deepEqual(failed, []); assert.deepEqual(writes, []);
      console.log(JSON.stringify({ page: landingName, width, menu: true, keyboardDetails: true, servicePrefill: true, draftPreserved: true, errors, failed, writes }));
      await page.close();
      continue;
    }
    if (servicesOnly) {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const nav = page.getByRole('navigation', { name: 'Основная навигация' });
      const button = page.locator('.menu-btn');
      assert.equal(await page.locator('.brand-logo').evaluate(el => el.complete && el.naturalWidth > 0), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      assert.equal(await page.locator('.service-more').count(), 4);
      assert.equal(await page.locator('.service-list a').count(), 56);
      assert.equal(await page.locator('.service-cards a[data-service-explanation]').count(), 27, 'All services and the creative design cross-link are visible in the catalog');
      assert.equal(await page.locator('#leader-lead-form form').count(), 1);
      const search = page.locator('#service-search-input');
      await search.waitFor({ state: 'visible' });
      for (const [query, expected] of [
        ['1000 визиток', 'vizitki-borisoglebsk.html'],
        ['вывеска', 'vyveski-borisoglebsk.html'],
        ['оформить вход', 'oformlenie-vhoda-borisoglebsk.html'],
        ['реклама в группе', 'reklama-v-soobshchestvah-borisoglebska.html'],
        ['QR меню для кафе', 'qr-katalogi-onlayn-zapis.html'],
        ['растяжка', 'bannery-borisoglebsk.html'],
      ]) {
        await search.fill(query);
        assert.equal(await page.locator('#service-search-results a').first().getAttribute('href'), expected, query);
      }
      await search.fill('визитки1000');
      await page.locator('#service-search-results a').first().click();
      assert.equal(new URL(page.url()).pathname, '/vizitki-borisoglebsk.html');
      await page.goBack();
      assert.equal(await page.locator('#service-search-input').inputValue(), 'визитки1000', 'Back restores the catalog search without exposing it in the URL');
      await page.locator('#service-search-input').fill('облачные драконы');
      assert.equal(await page.locator('#service-search-results a').getAttribute('href'), '#request');
      await page.locator('[data-search-clear]').click();
      assert.equal(await page.locator('#service-search-input').inputValue(), '');
      assert.equal(await page.locator('#service-search-results').isVisible(), false);
      assert.equal(await page.evaluate(() => document.activeElement.id), 'service-search-input');
      for (const sample of ['vizitki-borisoglebsk.html', 'menyu-dlya-kafe-borisoglebsk.html', 'razdatochnye-materialy-borisoglebsk.html']) {
        await page.goto(origin + '/' + sample);
        const related = page.locator('#leader-related-services a');
        assert.equal(await related.count(), 4, sample);
        for (const href of await related.evaluateAll(nodes => nodes.map(node => node.getAttribute('href')))) assert.notEqual(href, sample, 'Related services must not link to the current page');
      }
      await page.goto(origin + '/uslugi.html');
      assert.equal(await page.locator('.quick-links a[href="#creative"]').count(), 1);
      await page.screenshot({ path: `artifacts/public-homepage/services-${width}.png` });
      if (width <= 1060) {
        assert.equal(await nav.isVisible(), false);
        await button.click();
        assert.equal(await nav.isVisible(), true);
        await page.keyboard.press('Tab');
        assert.equal(await page.evaluate(() => document.activeElement.getAttribute('href')), 'uslugi.html');
        await page.keyboard.press('Escape');
        assert.equal(await nav.isVisible(), false);
        assert.equal(await button.getAttribute('aria-expanded'), 'false');
      } else {
        assert.equal(await nav.isVisible(), true);
        assert.equal(await button.isVisible(), false);
      }
      for (const group of ['promotion', 'branding', 'automation', 'production']) {
        const details = page.locator(`#${group} details`);
        const extra = details.locator('a').first();
        assert.equal(await extra.isVisible(), false);
        await details.locator('summary').focus();
        await page.keyboard.press('Enter');
        assert.equal(await extra.isVisible(), true);
        await details.locator('summary').press('Enter');
        assert.equal(await extra.isVisible(), false);
      }
      await page.locator('.quick-links a[href="#branding"]').click();
      assert.equal(await page.locator('.header').evaluate(el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.top < 2 && r.bottom > 0; }), true, 'Services header must stay available after category navigation');
      await page.screenshot({ path: `artifacts/public-homepage/services-group-${width}.png` });
      await page.getByRole('link', { name: 'Подобрать услугу', exact: true }).click();
      assert.equal(await page.locator('#leader-lead-form [name="service"]').isVisible(), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: `artifacts/public-homepage/services-form-${width}.png` });
      assert.deepEqual(errors, []); assert.deepEqual(failed, []); assert.deepEqual(writes, []);
      console.log(JSON.stringify({ page: 'services', width, searchAliases: true, searchBack: true, noSelfRelated: true, menu: true, detailsKeyboard: true, formMounted: true, errors, failed, writes }));
      await page.close();
      continue;
    }
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior), 'auto');
    assert.equal(await page.locator('.hero__actions a').count(), 2);
    assert.equal(await page.locator('.hero__actions .btn--accent').evaluate(el => {
      const r = el.getBoundingClientRect();
      return r.top >= 0 && r.bottom <= innerHeight - 70 && r.width >= 44 && r.height >= 44;
    }), true, `Primary hero action must be on the first screen at ${width}px`);
    assert.equal(await page.locator('.hero-card').evaluate(el => getComputedStyle(el).boxShadow), 'none');
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
      assert.equal(await page.evaluate(() => document.activeElement.getAttribute('href')), 'uslugi.html');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('.menu-btn').getAttribute('aria-expanded'), 'false');
      assert.equal(await page.evaluate(() => document.activeElement.classList.contains('menu-btn')), true);
      await button.click();
      await nav.getByRole('link', { name: 'Услуги', exact: true }).click();
      assert.equal(new URL(page.url()).pathname, '/uslugi.html');
      await page.goBack();
      assert.equal(await nav.isVisible(), false);
      await button.click();
      await page.screenshot({ path: `artifacts/public-homepage/menu-${width}.png`, fullPage: false });
      await page.keyboard.press('Escape');
      await button.click();
      await page.locator('#services h2').click();
      assert.equal(await nav.isVisible(), false);
      await button.click();
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.waitForFunction(() => document.querySelector('.menu-btn').getAttribute('aria-expanded') === 'false');
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
    assert.equal(await page.locator('#services .business-goals article').count(), 4);
    for (const direction of ['promotion', 'branding', 'automation', 'production']) {
      assert.equal(await page.locator(`#services a[href="uslugi.html#${direction}"]`).count(), 1);
    }
    await page.locator('#leader-lead-form [name="message"]').fill('');
    await page.locator('[data-scenario="shop"]').click();
    assert.equal(await page.locator('#leader-lead-form [name="service"]').inputValue(), 'Комплексная реклама');
    assert.match(await page.locator('#leader-lead-form [name="message"]').inputValue(), /магазин/);
    await page.getByRole('link', { name: 'РА Лидер — на главную', exact: true }).click();
    await page.waitForFunction(() => scrollY === 0);
    await page.screenshot({ path: `artifacts/public-homepage/${width}.png`, fullPage: false });
    assert.deepEqual(errors, []); assert.deepEqual(failed, []); assert.deepEqual(writes, []);
    console.log(JSON.stringify({ width, logoLoaded: true, menu: true, formMounted: true, overflow: false, errors, failed, writes, externalRequestsBlocked: blocked.length }));
    await page.close();
  }
  const noJs = await browser.newPage({ javaScriptEnabled: false, viewport: { width: 390, height: 900 } });
  await noJs.goto(origin + (landingOnly ? landing.path : servicesOnly ? '/uslugi.html' : '/'));
  assert.equal(await noJs.getByRole('navigation', { name: 'Основная навигация' }).isVisible(), true);
  if (landingOnly) {
    await noJs.locator('.service-questions summary').first().click();
    assert.equal(await noJs.locator('.service-questions details').first().locator('p').isVisible(), true);
    await noJs.locator('.service-details summary').click();
    assert.equal(await noJs.locator('.service-details ul').isVisible(), true);
    assert.equal(await noJs.locator('a[href="tel:+79802457471"]').count() > 0, true);
  } else if (servicesOnly) {
    await noJs.locator('#branding summary').click();
    assert.equal(await noJs.locator('#branding details a').first().isVisible(), true);
    assert.equal(await noJs.locator('.service-list a').count(), 56);
    assert.equal(await noJs.locator('.service-cards a[data-service-explanation]').count(), 27);
  } else assert.equal(await noJs.locator('#service-pages a').count(), 6);
  console.log('No-JavaScript commercial navigation: PASS');
  await noJs.close();
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
