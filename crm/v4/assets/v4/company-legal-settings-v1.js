import { supabaseClient } from './supabase-client.js';

export const COMPANY_LEGAL_SETTINGS_KEY = 'company_legal_details_v1';

export const DEFAULT_COMPANY_LEGAL_SETTINGS = Object.freeze({
  configured: false,
  brand_name: 'Рекламное агентство «Лидер»',
  legal_name: '',
  tax_id: '',
  registration_number: '',
  legal_address: '',
  postal_address: '',
  phone: '',
  email: '',
  bank_name: '',
  bank_account: '',
  correspondent_account: '',
  bank_code: '',
  tax_mode: 'Без НДС',
  signatory_name: '',
  signatory_role: 'Представитель исполнителя',
  schema_version: 1
});

let cached = null;
let pending = null;

function clean(value, max = 500) {
  return String(value ?? '').trim().slice(0, max);
}

export function normalizeCompanyLegalSettings(raw) {
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    configured: Boolean(Object.keys(value).length),
    brand_name: clean(value.brand_name || DEFAULT_COMPANY_LEGAL_SETTINGS.brand_name, 200),
    legal_name: clean(value.legal_name, 300),
    tax_id: clean(value.tax_id, 40),
    registration_number: clean(value.registration_number, 80),
    legal_address: clean(value.legal_address, 500),
    postal_address: clean(value.postal_address, 500),
    phone: clean(value.phone, 80),
    email: clean(value.email, 200),
    bank_name: clean(value.bank_name, 300),
    bank_account: clean(value.bank_account, 80),
    correspondent_account: clean(value.correspondent_account, 80),
    bank_code: clean(value.bank_code, 40),
    tax_mode: clean(value.tax_mode || DEFAULT_COMPANY_LEGAL_SETTINGS.tax_mode, 80),
    signatory_name: clean(value.signatory_name, 200),
    signatory_role: clean(value.signatory_role || DEFAULT_COMPANY_LEGAL_SETTINGS.signatory_role, 200),
    schema_version: Number(value.schema_version || 1) || 1
  };
}

export function companyLegalName(settings = DEFAULT_COMPANY_LEGAL_SETTINGS) {
  return clean(settings.legal_name || settings.brand_name || DEFAULT_COMPANY_LEGAL_SETTINGS.brand_name, 300);
}

export function companyLegalDetailsText(settings = DEFAULT_COMPANY_LEGAL_SETTINGS) {
  const lines = [];
  if (settings.tax_id) lines.push(`ИНН: ${settings.tax_id}`);
  if (settings.registration_number) lines.push(`Регистрационный номер: ${settings.registration_number}`);
  if (settings.legal_address) lines.push(`Адрес: ${settings.legal_address}`);
  if (settings.postal_address && settings.postal_address !== settings.legal_address) lines.push(`Почтовый адрес: ${settings.postal_address}`);
  if (settings.phone) lines.push(`Телефон: ${settings.phone}`);
  if (settings.email) lines.push(`Email: ${settings.email}`);
  if (settings.bank_name) lines.push(`Банк: ${settings.bank_name}`);
  if (settings.bank_account) lines.push(`Р/с: ${settings.bank_account}`);
  if (settings.correspondent_account) lines.push(`К/с: ${settings.correspondent_account}`);
  if (settings.bank_code) lines.push(`БИК: ${settings.bank_code}`);
  return lines.join('\n');
}

export async function loadCompanyLegalSettings({ force = false } = {}) {
  if (!force && cached) return cached;
  if (!force && pending) return pending;

  pending = (async () => {
    try {
      const response = await supabaseClient
        .from('leader_settings')
        .select('value')
        .eq('key', COMPANY_LEGAL_SETTINGS_KEY)
        .maybeSingle();
      if (response.error) throw response.error;
      cached = response.data?.value
        ? normalizeCompanyLegalSettings(response.data.value)
        : { ...DEFAULT_COMPANY_LEGAL_SETTINGS };
    } catch (error) {
      console.warn('CRM company legal settings read warning:', error);
      cached = { ...DEFAULT_COMPANY_LEGAL_SETTINGS };
    } finally {
      pending = null;
    }
    return cached;
  })();

  return pending;
}

export function clearCompanyLegalSettingsCache() {
  cached = null;
  pending = null;
}
