import assert from 'node:assert/strict';
import fs from 'node:fs';
import '../assets/leader-service-catalog.js';
import { normalizeLeadServiceCategory } from '../crm/v4/assets/v4/lead-analytics-normalization.js';
import { firstContactServiceProfile } from '../crm/v4/assets/v4/lead-first-contact-model-v1.js';
import { leadDirectionLabel } from '../crm/v4/assets/v4/lead-client-context-v1.js';

const { services, directions, find, forPage } = globalThis.LeaderServiceCatalog;
assert.equal(new Set(services.map(s => s.id)).size, services.length);
assert.equal(new Set(services.map(s => s.label)).size, services.length);
const allPages = services.flatMap(s => s.pages);
assert.equal(new Set(allPages).size, allPages.length, 'One canonical service per page');
for (const service of services) {
  assert.ok(directions[service.direction]);
  assert.equal(normalizeLeadServiceCategory(service.label), service.category);
  assert.equal(leadDirectionLabel({service:service.label}), directions[service.direction]);
  assert.equal(find(service.id), service);
  for (const page of service.pages) {
    assert.ok(fs.existsSync(page), page);
    assert.equal(forPage('/' + page), service);
  }
}
const catalog = fs.readFileSync('uslugi.html', 'utf8');
const sitemap = fs.readFileSync('sitemap.xml', 'utf8');
for (const copy of JSON.parse(fs.readFileSync('data/commercial-services.json', 'utf8'))) {
  const service = find(copy.id), page = service.pages[0];
  const html = fs.readFileSync(page, 'utf8');
  assert.ok(catalog.includes(`href="${page}"`));
  assert.ok(sitemap.includes('https://www.lider-bsk.ru/' + page));
  assert.ok(html.includes('Демонстрационный пример'));
  assert.ok(html.includes('Не является выполненным проектом.'));
  assert.ok(html.includes('rel="canonical" href="https://www.lider-bsk.ru/' + page + '"'));
  assert.equal((html.match(/<h1>/g) || []).length, 1);
  assert.equal(firstContactServiceProfile(service.label).questions.length, 4);
}
assert.ok(!firstContactServiceProfile('CRM и автоматизация').questions.join(' ').includes('кузова'));
for (const page of fs.readdirSync('.').filter(p => p.endsWith('.html'))) {
  const html = fs.readFileSync(page, 'utf8');
  if (html.includes('src="assets/public-lead-form.js')) {
    assert.ok(html.includes('src="assets/public-lead-form.js?v=30"'), page);
    assert.ok(html.indexOf('src="assets/leader-service-catalog.js?v=1"') >= 0, page);
    assert.ok(html.indexOf('src="assets/leader-service-catalog.js?v=1"') < html.indexOf('src="assets/public-lead-form.js'), page);
  }
}
console.log('PASS: shared site/form/CRM/analytics catalog, all page mappings, explicit demo labels and service-specific first contact.');
