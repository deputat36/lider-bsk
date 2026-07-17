import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import vm from 'node:vm';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NORMALIZATION = resolve(ROOT, 'crm/v4/assets/v4/lead-analytics-normalization.js');
const BADGES = resolve(ROOT, 'crm/v4/assets/v4/lead-analytics-badges-v1.js');
const SUMMARY = resolve(ROOT, 'crm/v4/assets/v4/lead-analytics-summary-v1.js');
const LEADS = resolve(ROOT, 'crm/v4/assets/v4/leads.js');

const normalization = await import(`${pathToFileURL(NORMALIZATION).href}?runtime-test=1`);
const {
  deriveLeadAnalytics,
  leadAnalyticsSearchText,
  normalizeLeadServiceCategory,
  normalizeLeadSourceCategory,
} = normalization;

function assertJsonEqual(actual, expected, message) {
  assert.equal(JSON.stringify(actual), JSON.stringify(expected), message);
}

function loadFunctions(path, names, contextValues = {}) {
  const source = readFileSync(path, 'utf8')
    .replace(/^import\s+[^;]+;\s*$/gm, '')
    .split('\nfunction boot()')[0];
  const context = vm.createContext({ ...contextValues });
  const expose = `globalThis.__runtimeTest = { ${names.join(', ')} };`;
  new vm.Script(`${source}\n${expose}`, { filename: path }).runInContext(context);
  return context.__runtimeTest;
}

function testNormalization() {
  const serviceCases = new Map([
    ['Баннер', 'Баннеры'],
    ['Срочный баннер', 'Баннеры'],
    ['Праздничный баннер', 'Баннеры'],
    ['Афиши и наклейки', 'Наклейки'],
    ['Наклейка на авто', 'Наклейки'],
    ['Печать / таблички', 'Таблички'],
    ['Вывеска', 'Вывески'],
    ['изделия из пвх', 'ПВХ изделия'],
    ['', 'Не указано'],
    ['Монтаж', 'Другое'],
  ]);
  for (const [raw, expected] of serviceCases) {
    assert.equal(normalizeLeadServiceCategory(raw), expected, `service category for ${raw || '(empty)'}`);
  }

  const sourceCases = [
    ['Сайт', '', 'Сайт'],
    ['', 'https://www.lider-bsk.ru/request.html', 'Сайт'],
    ['Форма сайта', '', 'Сайт'],
    ['VK', '', 'ВКонтакте'],
    ['ВКонтакте', '', 'ВКонтакте'],
    ['Одноклассники', '', 'Одноклассники'],
    ['Telegram', '', 'Telegram'],
    ['MAX', '', 'MAX'],
    ['QR', '', 'QR-код'],
    ['Яндекс', '', 'Поиск'],
    ['Вручную', '', 'Ручной ввод'],
    ['Звонок', '', 'Ручной ввод'],
    ['Офис', '', 'Ручной ввод'],
    ['Рекомендация', '', 'Ручной ввод'],
    ['Email', '', 'Email'],
    ['', '', 'Не указано'],
  ];
  for (const [source, pageUrl, expected] of sourceCases) {
    assert.equal(normalizeLeadSourceCategory(source, pageUrl), expected, `source category for ${source || pageUrl || '(empty)'}`);
  }
  assert.equal(normalizeLeadSourceCategory('Сайт', '/banner/', 'vk'), 'ВКонтакте', 'UTM source must win over intake mechanism');
  assert.equal(normalizeLeadSourceCategory('VK', 'https://www.lider-bsk.ru/banner/'), 'ВКонтакте', 'explicit source must win over fallback page host');

  assertJsonEqual(
    deriveLeadAnalytics({ service: 'Баннер', source: 'VK' }),
    { serviceCategory: 'Баннеры', sourceCategory: 'ВКонтакте' },
    'derived analytics pair',
  );
  assert.equal(leadAnalyticsSearchText({ service: 'Баннер', source: 'VK' }), 'Баннеры ВКонтакте');
}

function testActualLeadHaystack() {
  const source = readFileSync(LEADS, 'utf8');
  const match = source.match(/function leadHaystack\(lead\) \{[\s\S]*?\n\}/);
  assert.ok(match, 'leadHaystack function must be present in leads.js');
  const context = vm.createContext({ leadAnalyticsSearchText });
  new vm.Script(`${match[0]}\nglobalThis.__leadHaystack = leadHaystack;`, { filename: LEADS }).runInContext(context);
  const haystack = context.__leadHaystack({
    name: 'Тест',
    phone: '+70000000000',
    source: 'VK',
    service: 'Баннер',
    message: 'Печать',
    city: 'Борисоглебск',
    status: 'Новая',
  });
  assert.ok(haystack.includes('баннеры'), 'actual leadHaystack must include derived service category');
  assert.ok(haystack.includes('вконтакте'), 'actual leadHaystack must include derived source category');
}

function testSummaryRuntime() {
  const state = { leadFilters: { search: '' } };
  const filterCalls = [];
  const input = { value: '' };
  let renderCalls = 0;
  const functions = loadFunctions(
    SUMMARY,
    ['countBy', 'renderPills', 'applySummarySearch', 'clearSummarySearch'],
    {
      v4State: state,
      setLeadFilters(value) { filterCalls.push(value); },
      renderLeads() { renderCalls += 1; },
      document: { getElementById(id) { return id === 'leadSearch' ? input : null; } },
      deriveLeadAnalytics,
    },
  );

  const rows = functions.countBy(
    [{ key: 'Баннеры' }, { key: 'Сайт' }, { key: 'Баннеры' }, { key: 'Другое' }, { key: 'Баннеры' }, { key: 'Сайт' }],
    (item) => item.key,
  );
  assertJsonEqual(rows, [['Баннеры', 3], ['Сайт', 2], ['Другое', 1]], 'summary count order');

  const pills = functions.renderPills([['Баннеры', 4], ['Сайт', 3], ['<Другое>', 1]], 'баннеры');
  assert.ok(pills.includes('data-lead-analytics-search="Баннеры"'));
  assert.ok(pills.includes('aria-pressed="true"'));
  assert.ok(pills.includes('&lt;Другое&gt;'), 'summary labels must be escaped');
  assert.equal(functions.renderPills([], ''), '<span class="lead-analytics-summary-empty">Нет данных</span>');

  functions.applySummarySearch('Баннеры');
  assert.equal(input.value, 'Баннеры');
  assertJsonEqual(filterCalls.at(-1), { search: 'Баннеры' }, 'summary click applies search');
  assert.equal(renderCalls, 1);

  state.leadFilters.search = 'Баннеры';
  functions.applySummarySearch('баннеры');
  assert.equal(input.value, '');
  assertJsonEqual(filterCalls.at(-1), { search: '' }, 'active summary click toggles search off');
  assert.equal(renderCalls, 2);

  input.value = 'Сайт';
  functions.clearSummarySearch();
  assert.equal(input.value, '');
  assertJsonEqual(filterCalls.at(-1), { search: '' }, 'clear button clears search');
  assert.equal(renderCalls, 3);
}

function testBadgeRuntime() {
  const state = { leads: [{ id: 'lead-1', service: 'Баннер', source: 'VK' }] };
  let hints = null;
  let inserted = 0;
  const titleRow = {
    insertAdjacentElement(position, element) {
      assert.equal(position, 'afterend');
      hints = element;
    },
  };
  const documentMock = {
    createElement(tag) {
      assert.equal(tag, 'div');
      return {
        className: '',
        html: '',
        insertAdjacentHTML(position, html) {
          assert.equal(position, 'beforeend');
          this.html += html;
          inserted += 1;
        },
      };
    },
  };
  const card = {
    dataset: { id: 'lead-1' },
    querySelector(selector) {
      if (selector === '.v4-lead-inline-hints') return hints;
      if (selector === '.v4-lead-title-row') return titleRow;
      return null;
    },
  };

  const functions = loadFunctions(BADGES, ['leadById', 'ensureHintsContainer', 'decorateCard'], {
    v4State: state,
    deriveLeadAnalytics,
    document: documentMock,
  });

  assert.equal(functions.leadById('lead-1').service, 'Баннер');
  functions.decorateCard(card);
  assert.equal(card.dataset.analyticsBadges, '1');
  assert.equal(inserted, 1);
  assert.ok(hints.html.includes('Услуга: Баннеры'));
  assert.ok(hints.html.includes('Источник: ВКонтакте'));

  functions.decorateCard(card);
  assert.equal(inserted, 1, 'decorating the same card twice must not duplicate badges');
  assert.equal(functions.ensureHintsContainer(card), hints, 'existing hints container must be reused');
}

testNormalization();
testActualLeadHaystack();
testSummaryRuntime();
testBadgeRuntime();

console.log('CRM lead analytics runtime harness passed: normalization, derived search, summary toggle and badge idempotency are valid.');
