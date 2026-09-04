import assert from 'node:assert/strict';
import {
  CATALOG_MANAGEMENT_STAGING_TRANSPORT,
  buildCatalogManagementCommand,
  catalogManagementIdempotencyKey,
  catalogManagementWriteAvailability,
  invokeStagingCatalogManagement,
  isStagingCatalogManagementEnvironment
} from '../crm/v4/assets/v4/catalog-management-staging-transport-v1.js';

const stagingUrl = 'https://otulfnouybahfnsycxqn.supabase.co';
const productionUrl = 'https://ofewxuqfjhamgerwzull.supabase.co';
const uuids = [
  '15200000-0000-4000-8000-000000000101',
  '15200000-0000-4000-8000-000000000102',
  '15200000-0000-4000-8000-000000000103'
];
let uuidIndex = 0;
const cryptoObject = { randomUUID: () => uuids[uuidIndex++] };

assert.equal(isStagingCatalogManagementEnvironment(stagingUrl), true);
assert.equal(isStagingCatalogManagementEnvironment(productionUrl), false);
assert.deepEqual(
  catalogManagementWriteAvailability({ supabaseUrl: productionUrl, canManage: true }),
  { enabled: false, staging: false, reason: 'production_locked', functionSlug: 'leader-crm-catalog', permission: 'catalog.manage' }
);
assert.equal(catalogManagementWriteAvailability({ supabaseUrl: stagingUrl, canManage: false }).reason, 'forbidden');
assert.equal(catalogManagementWriteAvailability({ supabaseUrl: stagingUrl, canManage: true }).enabled, true);

const key = catalogManagementIdempotencyKey('create', '', cryptoObject);
assert.equal(key, 'catalog:create:new:15200000-0000-4000-8000-000000000101');
const create = buildCatalogManagementCommand({
  operation: 'create',
  idempotencyKey: key,
  requestId: '15200000-0000-4000-8000-000000000111',
  patch: { name: 'Баннер', category: 'Печать', unit: 'м²', contractor_price: 350 }
});
assert.equal(create.action, 'catalog.manage');
assert.equal(create.expected_updated_at, null);
assert.equal(create.payload.catalog_id, null);
assert.equal(create.payload.patch.contractor_price, 350);

const update = buildCatalogManagementCommand({
  operation: 'update',
  catalogId: '15200000-0000-4000-8000-000000000120',
  expectedUpdatedAt: '2026-09-04T10:00:00.123456Z',
  idempotencyKey: 'catalog:update:test',
  requestId: '15200000-0000-4000-8000-000000000112',
  reason: 'Новый прайс',
  patch: { contractor_price: 400, is_active: false }
});
assert.equal(update.payload.catalog_id, '15200000-0000-4000-8000-000000000120');
assert.equal(update.expected_updated_at, '2026-09-04T10:00:00.123456Z');

let invoked = null;
const client = {
  auth: { getSession: async () => ({ data: { session: { access_token: 'synthetic-token' } }, error: null }) },
  functions: {
    invoke: async (slug, options) => {
      invoked = { slug, options };
      return {
        data: {
          ok: true,
          request_id: options.body.request_id,
          operation: 'create',
          changed: true,
          catalog: { id: '15200000-0000-4000-8000-000000000130', name: 'Баннер' }
        },
        error: null
      };
    }
  }
};
const result = await invokeStagingCatalogManagement({
  client,
  supabaseUrl: stagingUrl,
  canManage: true,
  operation: 'create',
  idempotencyKey: 'catalog:create:invoke-test',
  patch: { name: 'Баннер', category: 'Печать', unit: 'м²' },
  cryptoObject
});
assert.equal(result.ok, true);
assert.equal(result.status, 201);
assert.equal(invoked.slug, CATALOG_MANAGEMENT_STAGING_TRANSPORT.functionSlug);
assert.equal(invoked.options.body.action, 'catalog.manage');
assert.equal(invoked.options.body.request_id, '15200000-0000-4000-8000-000000000102');

const locked = await invokeStagingCatalogManagement({
  client,
  supabaseUrl: productionUrl,
  canManage: true,
  operation: 'create',
  idempotencyKey: 'never-sent',
  patch: { name: 'x', category: 'x', unit: 'шт' },
  cryptoObject
});
assert.equal(locked.ok, false);
assert.equal(locked.kind, 'production_locked');

console.log('Catalog staging transport is exact-staging-only, Edge-only and preserves update CAS timestamps.');
