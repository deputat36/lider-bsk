export const COMPANY_LEGAL_SCHEMA_VERSION = 1;

export const COMPANY_LEGAL_TAX_MODES = Object.freeze([
  'Без НДС',
  'НДС не облагается',
  'НДС 5%',
  'НДС 20%'
]);

const LIMITS = Object.freeze({
  brand_name: 200,
  legal_name: 300,
  tax_id: 40,
  registration_number: 80,
  legal_address: 500,
  postal_address: 500,
  phone: 80,
  email: 200,
  bank_name: 300,
  bank_account: 80,
  correspondent_account: 80,
  bank_code: 40,
  tax_mode: 80,
  signatory_name: 200,
  signatory_role: 200
});

const SECRET_FIELD = /(password|secret|token|private[_-]?key|service[_-]?role|api[_-]?key)/i;
const clean = (value, max) => String(value ?? '').trim().slice(0, max);
const digits = (value) => String(value || '').replace(/\D/g, '');

export function normalizeCompanyLegalSettingsDraft(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const normalized = {};
  Object.entries(LIMITS).forEach(([field, max]) => {
    normalized[field] = clean(source[field], max);
  });
  normalized.brand_name ||= 'Рекламное агентство «Лидер»';
  normalized.tax_mode ||= 'Без НДС';
  normalized.signatory_role ||= 'Представитель исполнителя';
  normalized.schema_version = Number(source.schema_version || COMPANY_LEGAL_SCHEMA_VERSION);
  return normalized;
}

export function validateCompanyLegalSettingsDraft(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const value = normalizeCompanyLegalSettingsDraft(source);
  const errors = [];
  const warnings = [];

  const forbidden = Object.keys(source).filter((key) => SECRET_FIELD.test(key));
  if (forbidden.length) errors.push(`Запрещённые поля: ${forbidden.join(', ')}`);
  if (value.schema_version !== COMPANY_LEGAL_SCHEMA_VERSION) errors.push('Поддерживается только schema_version = 1');
  if (!value.legal_name && !value.brand_name) errors.push('Укажите юридическое или фирменное наименование');
  if (value.tax_id && ![10, 12].includes(digits(value.tax_id).length)) errors.push('ИНН должен содержать 10 или 12 цифр');
  if (value.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email)) errors.push('Email указан в неверном формате');
  if (value.bank_account && digits(value.bank_account).length !== 20) errors.push('Расчётный счёт должен содержать 20 цифр');
  if (value.correspondent_account && digits(value.correspondent_account).length !== 20) errors.push('Корреспондентский счёт должен содержать 20 цифр');
  if (value.bank_code && digits(value.bank_code).length !== 9) errors.push('БИК должен содержать 9 цифр');
  if (!COMPANY_LEGAL_TAX_MODES.includes(value.tax_mode)) errors.push('Выберите поддерживаемый режим налогообложения');

  if (!value.tax_id) warnings.push('ИНН не указан');
  if (!value.legal_address) warnings.push('Юридический адрес не указан');
  if (!value.phone && !value.email) warnings.push('Не указан телефон или email исполнителя');
  if (!value.signatory_name) warnings.push('ФИО подписанта не указано');
  if (!value.bank_name && !value.bank_account) warnings.push('Банковские реквизиты не заполнены');

  return { valid: errors.length === 0, value, errors, warnings };
}

export function companyLegalSettingsPreviewText(raw) {
  const { value } = validateCompanyLegalSettingsDraft(raw);
  const lines = [value.legal_name || value.brand_name];
  if (value.tax_id) lines.push(`ИНН: ${value.tax_id}`);
  if (value.registration_number) lines.push(`Регистрационный номер: ${value.registration_number}`);
  if (value.legal_address) lines.push(`Адрес: ${value.legal_address}`);
  if (value.phone) lines.push(`Телефон: ${value.phone}`);
  if (value.email) lines.push(`Email: ${value.email}`);
  if (value.bank_name) lines.push(`Банк: ${value.bank_name}`);
  if (value.bank_account) lines.push(`Р/с: ${value.bank_account}`);
  if (value.correspondent_account) lines.push(`К/с: ${value.correspondent_account}`);
  if (value.bank_code) lines.push(`БИК: ${value.bank_code}`);
  lines.push(value.tax_mode);
  lines.push(`Подписант: ${value.signatory_role}${value.signatory_name ? ` — ${value.signatory_name}` : ''}`);
  return lines.join('\n');
}
