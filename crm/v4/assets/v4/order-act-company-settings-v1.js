import {
  companyLegalDetailsText,
  companyLegalName,
  loadCompanyLegalSettings
} from './company-legal-settings-v1.js';

let applying = false;

function setIfBlank(id, value) {
  const element = document.getElementById(id);
  if (!element || !value) return;
  const current = String(element.value || '').trim();
  if (!current) element.value = value;
}

function setExecutorName(value) {
  const element = document.getElementById('actDraftExecutor');
  if (!element || !value) return;
  const current = String(element.value || '').trim();
  if (!current || current === 'Рекламное агентство «Лидер»') element.value = value;
}

function setSelectValue(id, value) {
  const element = document.getElementById(id);
  if (!element || !value) return;
  const option = [...element.options].find((item) => item.value === value || item.textContent === value);
  if (option) element.value = option.value;
}

async function applyCompanySettings() {
  const form = document.getElementById('orderActDraftForm');
  if (!form || form.dataset.companySettingsApplied === '1' || applying) return;
  applying = true;
  try {
    const settings = await loadCompanyLegalSettings();
    if (!document.getElementById('orderActDraftForm')) return;
    setExecutorName(companyLegalName(settings));
    setIfBlank('actDraftExecutorDetails', companyLegalDetailsText(settings));
    setIfBlank('actDraftSignatory', settings.signatory_name);
    setIfBlank('actDraftSignatoryRole', settings.signatory_role);
    setSelectValue('actDraftTax', settings.tax_mode);
    form.dataset.companySettingsApplied = '1';
    form.dataset.companySettingsConfigured = settings.configured ? '1' : '0';
  } finally {
    applying = false;
  }
}

function boot() {
  applyCompanySettings();
  new MutationObserver(applyCompanySettings).observe(document.body, { childList: true, subtree: true });
  document.addEventListener('leader-v4:crm-ready', applyCompanySettings);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
