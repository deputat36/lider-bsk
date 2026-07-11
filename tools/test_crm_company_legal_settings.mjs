import assert from 'node:assert/strict';
import {
  COMPANY_LEGAL_SCHEMA_VERSION,
  companyLegalSettingsPreviewText,
  normalizeCompanyLegalSettingsDraft,
  validateCompanyLegalSettingsDraft
} from '../crm/v4/assets/v4/company-legal-settings-draft-v1.js';

assert.equal(COMPANY_LEGAL_SCHEMA_VERSION, 1);

const normalized = normalizeCompanyLegalSettingsDraft({
  legal_name: '  ИП Иванов  ',
  tax_mode: '',
  schema_version: '1'
});
assert.equal(normalized.legal_name, 'ИП Иванов');
assert.equal(normalized.tax_mode, 'Без НДС');
assert.equal(normalized.schema_version, 1);

const valid = validateCompanyLegalSettingsDraft({
  legal_name: 'ИП Иванов Иван Иванович',
  tax_id: '123456789012',
  legal_address: 'г. Борисоглебск',
  phone: '+7 900 000-00-00',
  email: 'office@example.test',
  bank_name: 'Тестовый банк',
  bank_account: '12345678901234567890',
  correspondent_account: '12345678901234567890',
  bank_code: '123456789',
  tax_mode: 'Без НДС',
  signatory_name: 'Иванов И. И.',
  signatory_role: 'Индивидуальный предприниматель',
  schema_version: 1
});
assert.equal(valid.valid, true);
assert.deepEqual(valid.errors, []);

assert.equal(validateCompanyLegalSettingsDraft({ tax_id: '123' }).valid, false);
assert.equal(validateCompanyLegalSettingsDraft({ email: 'wrong' }).valid, false);
assert.equal(validateCompanyLegalSettingsDraft({ bank_code: '123' }).valid, false);
assert.equal(validateCompanyLegalSettingsDraft({ schema_version: 2 }).valid, false);
assert.equal(validateCompanyLegalSettingsDraft({ api_token: 'forbidden' }).valid, false);

const preview = companyLegalSettingsPreviewText(valid.value);
assert.match(preview, /ИП Иванов Иван Иванович/);
assert.match(preview, /ИНН: 123456789012/);
assert.match(preview, /Подписант:/);
assert.doesNotMatch(preview, /api_token|password|secret/i);

console.log('CRM company legal settings draft validation is valid.');
