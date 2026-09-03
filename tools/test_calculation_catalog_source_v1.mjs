import assert from 'node:assert/strict';
import {
  CATALOG_SELECT_FIELDS,
  catalogRowToDraftItem,
  legacyCatalogFallbackRows,
  loadCalculationCatalog,
  normalizeCatalogRows
} from '../crm/v4/assets/v4/calculation-catalog-source-v1.js';
import { repriceAutomaticItems } from '../crm/v4/assets/v4/calculation-pricing-model-v1.js';

function fakeClient({ data = [], error = null } = {}) {
  const calls = [];
  const query = {
    eq(column, value) { calls.push(['eq', column, value]); return this; },
    order(column, options) { calls.push(['order', column, options]); return this; },
    then(resolve) { resolve({ data, error }); }
  };
  return {
    calls,
    from(table) {
      calls.push(['from', table]);
      return {
        select(fields) {
          calls.push(['select', fields]);
          return query;
        }
      };
    }
  };
}

const fallback = [
  { category: 'Печать', name: 'Баннер fallback', unit: 'м²', price: 350 }
];

{
  const client = fakeClient({ data: [
    { id: 'b', category: 'Монтаж', name: 'Монтаж', unit: 'услуга', contractor_price: 1000, markup_percent: 50, sort_order: 20, is_active: true },
    { id: 'a', category: 'Печать', name: 'Баннер', unit: 'м²', contractor_price: 300, markup_percent: 40, sort_order: 10, is_active: true }
  ] });
  const result = await loadCalculationCatalog({ supabaseClient: client, fallbackRows: fallback });
  assert.equal(result.source, 'remote');
  assert.equal(result.warning, null);
  assert.deepEqual(result.rows.map((row) => row.id), ['a', 'b']);
  assert.equal(client.calls[0][1], 'leader_catalog');
  assert.ok(client.calls.some((call) => call[0] === 'select' && call[1] === CATALOG_SELECT_FIELDS));
}

{
  const client = fakeClient({ error: { code: '42P01', message: 'relation leader_catalog does not exist' } });
  const result = await loadCalculationCatalog({ supabaseClient: client, fallbackRows: fallback });
  assert.equal(result.source, 'fallback');
  assert.equal(result.warning, 'catalog_table_unavailable');
  assert.equal(result.rows[0].name, 'Баннер fallback');
  assert.equal(result.rows[0].default_client_price, 350);
}

{
  const result = await loadCalculationCatalog({ fallbackRows: fallback });
  assert.equal(result.source, 'fallback');
  assert.equal(result.warning, 'catalog_client_unavailable');
}

{
  const rows = normalizeCatalogRows([
    { name: 'B', category: 'B', sort_order: 2, is_active: true },
    { name: 'A', category: 'A', sort_order: 1, is_active: true },
    { name: 'Hidden', is_active: false }
  ]);
  assert.deepEqual(rows.map((row) => row.name), ['A', 'B']);
}

{
  const rows = legacyCatalogFallbackRows([{ name: 'Legacy', price: 500, unit: 'шт' }]);
  assert.equal(rows[0].contractor_price, 500);
  assert.equal(rows[0].default_client_price, 500);
  assert.equal(rows[0].settings.legacy_fallback, true);
}

{
  const item = catalogRowToDraftItem({
    id: 'catalog-1',
    category: 'Печать',
    name: 'Баннер',
    unit: 'м²',
    contractor_price: 300,
    markup_percent: 50,
    is_active: true
  }, 2);
  assert.equal(item.catalog_id, 'catalog-1');
  assert.equal(item.qty, 2);
  assert.equal(item.contractor_price, 300);
  assert.equal(item.client_price, 450);
  assert.equal(item.data.mode, 'catalog');
  assert.equal(item.data.price_source, 'catalog');
  assert.equal(item.data.catalog_client_price, 450);
  assert.ok(item.data.catalog_source_version);

  const repriced = repriceAutomaticItems([item], {
    fixedMarkup: 10,
    roundStep: 10
  });
  assert.equal(repriced[0].client_price, 450, 'global markup must not overwrite catalog pricing');
  assert.equal(repriced[0].data.price_source, 'catalog');
}

console.log('calculation catalog source v1 tests: PASS');
