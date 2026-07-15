import assert from 'node:assert/strict';
import {
  COMPANY_LEGAL_SETTINGS_ENTRY_MODES,
  companyLegalSettingsEntryCopy,
  companyLegalSettingsEntryMode,
  companyLegalSettingsJson
} from '../crm/v4/assets/v4/company-legal-settings-entry-v1.js';

assert.equal(
  companyLegalSettingsEntryMode({ actOpen: true, contractOpen: false }),
  COMPANY_LEGAL_SETTINGS_ENTRY_MODES.DOCUMENT
);
assert.equal(
  companyLegalSettingsEntryMode({ actOpen: false, contractOpen: true }),
  COMPANY_LEGAL_SETTINGS_ENTRY_MODES.DOCUMENT
);
assert.equal(
  companyLegalSettingsEntryMode({ actOpen: false, contractOpen: false }),
  COMPANY_LEGAL_SETTINGS_ENTRY_MODES.STANDALONE
);

const documentCopy = companyLegalSettingsEntryCopy(COMPANY_LEGAL_SETTINGS_ENTRY_MODES.DOCUMENT);
assert.equal(documentCopy.action, 'Применить к текущему черновику');
assert.match(documentCopy.note, /не записываются/i);

const standaloneCopy = companyLegalSettingsEntryCopy(COMPANY_LEGAL_SETTINGS_ENTRY_MODES.STANDALONE);
assert.equal(standaloneCopy.action, 'Проверка завершена');
assert.match(standaloneCopy.note, /Сохранение в CRM отключено/i);

const json = companyLegalSettingsJson({ schema_version: 1, legal_name: 'ООО «Лидер»' });
assert.match(json, /"schema_version": 1/);
assert.match(json, /ООО «Лидер»/);
assert.equal(companyLegalSettingsJson(null), '{}');

console.log('CRM company legal settings entry model is document-aware and standalone-safe.');
