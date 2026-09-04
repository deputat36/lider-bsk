import assert from 'node:assert/strict';
import {
  catalogCreateValidation,
  createCalculationCatalogItem,
  normalizeCatalogCreateInput
} from '../crm/v4/assets/v4/calculation-catalog-create-v1.js';

function fakeClient({ data = null, error = null } = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      calls.push(['from', table]);
      return {
        insert(payload) {
          calls.push(['insert', payload]);
          return {
            select(fields) {
              calls.push(['select', fields]);
              return {
                async single() {
                  calls.push(['single']);
                  return { data, error };
                }
              };
            }
          };
        }
      };
    }
  };
}

{
  const payload = normalizeCatalogCreateInput({
    category: ' Печать ',
    name: ' Новая услуга ',
    unit: 'шт',
    contractor_price: '1 250,50',
    markup_percent: '40',
    min_client_price: '1800',
    default_client_price: '2000'
  });
  assert.equal(payload.category, 'Печать');
  assert.equal(payload.name, 'Новая услуга');
  assert.equal(payload.contractor_price, 1250.5);
  assert.equal(payload.markup_percent, 40);
  assert.equal(payload.default_client_price, 2000);
  assert.equal(payload.calculation_mode, 'fixed');
  assert.equal(payload.is_active, true);
}

{
  const validation = catalogCreateValidation({ category: 'Печать', unit: 'шт' });
  assert.equal(validation.ok, false);
  assert.equal(validation.code, 'catalog_name_required');
}

{
  const client = fakeClient();
  const result = await createCalculationCatalogItem({
    supabaseClient: client,
    input: { category: 'Печать', name: 'Тест', unit: 'шт' },
    allowWrite: false
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'catalog_write_not_allowed');
  assert.equal(client.calls.length, 0, 'write-disabled path must not touch Supabase');
}

{
  const client = fakeClient({ data: {
    id: 'catalog-new',
    category: 'Печать',
    name: 'Новая услуга',
    unit: 'шт',
    contractor_price: 500,
    markup_percent: 30,
    min_client_price: 0,
    default_client_price: null,
    calculation_mode: 'markup',
    settings: {},
    sort_order: 0,
    is_active: true
  } });
  const result = await createCalculationCatalogItem({
    supabaseClient: client,
    input: { category: 'Печать', name: 'Новая услуга', unit: 'шт', contractor_price: 500 },
    allowWrite: true
  });
  assert.equal(result.ok, true);
  assert.equal(result.row.id, 'catalog-new');
  assert.equal(result.row.contractor_price, 500);
  assert.deepEqual(client.calls[0], ['from', 'leader_catalog']);
  assert.equal(client.calls[1][0], 'insert');
  assert.equal(client.calls[1][1].name, 'Новая услуга');
}

{
  const client = fakeClient({ error: { code: '23505', message: 'duplicate key value' } });
  const result = await createCalculationCatalogItem({
    supabaseClient: client,
    input: { category: 'Печать', name: 'Дубль', unit: 'шт' },
    allowWrite: true
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'catalog_duplicate');
  assert.match(result.error.message, /уже есть/);
}

{
  const client = fakeClient({ error: { code: '42501', message: 'permission denied' } });
  const result = await createCalculationCatalogItem({
    supabaseClient: client,
    input: { category: 'Печать', name: 'Запрещено', unit: 'шт' },
    allowWrite: true
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'catalog_forbidden');
}

console.log('calculation catalog create v1 tests: PASS');
