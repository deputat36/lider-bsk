#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  catalogManagementCategories,
  catalogManagementSummary,
  catalogPriceLogChanges,
  filterCatalogManagementRows,
  normalizeCatalogManagementRow
} from '../crm/v4/assets/v4/catalog-management-model-v1.js';

const rows = [
  { id: '1', category: 'Баннеры', name: 'Баннер 340', unit: 'м²', contractor_price: 500, markup_percent: 50, min_client_price: 900, default_client_price: null, sort_order: 2, is_active: true, updated_at: '2026-09-01T10:00:00Z' },
  { id: '2', category: 'Плёнка', name: 'Плёнка белая', unit: 'м²', contractor_price: 600, markup_percent: 20, min_client_price: 0, default_client_price: 800, sort_order: 1, is_active: false, updated_at: '2026-09-02T10:00:00Z' },
  { id: '3', category: 'Баннеры', name: 'Люверс', unit: 'шт', contractor_price: 15, markup_percent: 100, min_client_price: 0, default_client_price: null, sort_order: 3, is_active: true, updated_at: '2026-09-03T10:00:00Z' }
];

const banner = normalizeCatalogManagementRow(rows[0]);
assert.equal(banner.calculated_client_price, 900, 'minimum client price must win over markup calculation');
assert.equal(normalizeCatalogManagementRow(rows[1]).calculated_client_price, 800, 'fixed client price must be used');
assert.deepEqual(catalogManagementSummary(rows), { total: 3, active: 2, inactive: 1, categories: 2 });
assert.deepEqual(catalogManagementCategories(rows), ['Баннеры', 'Плёнка']);
assert.deepEqual(filterCatalogManagementRows(rows, { category: 'Баннеры' }).map((row) => row.id), ['1', '3']);
assert.deepEqual(filterCatalogManagementRows(rows, { status: 'inactive' }).map((row) => row.id), ['2']);
assert.deepEqual(filterCatalogManagementRows(rows, { search: 'люверс' }).map((row) => row.id), ['3']);
assert.deepEqual(filterCatalogManagementRows(rows, { sort: 'cost_desc' }).map((row) => row.id), ['2', '1', '3']);
assert.deepEqual(filterCatalogManagementRows(rows, { sort: 'updated_desc' }).map((row) => row.id), ['3', '2', '1']);

const changes = catalogPriceLogChanges({
  old_contractor_price: 500,
  new_contractor_price: 550,
  old_markup_percent: 50,
  new_markup_percent: 40,
  old_min_client_price: 900,
  new_min_client_price: 900,
  old_default_client_price: null,
  new_default_client_price: 1000,
  old_is_active: true,
  new_is_active: false
});
assert.deepEqual(changes, [
  'Себестоимость: 500 ₽ → 550 ₽',
  'Наценка: 50% → 40%',
  'Цена клиенту: — → 1000 ₽',
  'Статус: активна → выключена'
]);

console.log('Catalog management model filters, sorts, summaries and price-history changes deterministically.');
