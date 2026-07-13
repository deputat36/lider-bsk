import {
  companyLegalDetailsText,
  companyLegalName,
  loadCompanyLegalSettings
} from './company-legal-settings-v1.js';
import { CRM_V4_ACTIONS, canPerformV4Action, requireV4Action } from './action-permissions-v1.js';
import { toast } from './ui.js';
import {
  COMPANY_LEGAL_SCHEMA_VERSION,
  COMPANY_LEGAL_TAX_MODES,
  companyLegalSettingsPreviewText,
  validateCompanyLegalSettingsDraft
} from './company-legal-settings-draft-v1.js';

const HOST_ID = 'companyLegalSettingsPreviewV1';
const STYLE_ID = 'companyLegalSettingsPreviewV1Styles';
const esc = (value) => String(value ?? '').replace(/[&<>\"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[character]));

const FIELD_GROUPS = Object.freeze([
  {
    title: 'Организация',
    fields: [
      ['brand_name', 'Фирменное наименование'],
      ['legal_name', 'Юридическое наименование'],
      ['tax_id', 'ИНН'],
      ['registration_number', 'ОГРН / регистрационный номер'],
      ['legal_address', 'Юридический адрес', 'textarea'],
      ['postal_address', 'Почтовый адрес', 'textarea']
    ]
  },
  {
    title: 'Контакты и банк',
    fields: [
      ['phone', 'Телефон'],
      ['email', 'Email', 'email'],
      ['bank_name', 'Банк'],
      ['bank_account', 'Расчётный счёт'],
      ['correspondent_account', 'Корреспондентский счёт'],
      ['bank_code', 'БИК']
    ]
  },
  {
    title: 'Документы',
    fields: [
      ['tax_mode', 'Налогообложение', 'select'],
      ['signatory_name', 'ФИО подписанта'],
      ['signatory_role', 'Должность подписанта']
    ]
  }
]);

function host() {
  let element = document.getElementById(HOST_ID);
  if (!element) {
    element = document.createElement('div');
    element.id = HOST_ID;
    document.body.appendChild(element);
  }
  return element;
}

function closePreview() {
  host().innerHTML = '';
}

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `.v4-company-settings-modal{position:fixed;inset:0;z-index:790;background:rgba(15,23,42,.72);display:grid;place-items:center;padding:14px}.v4-company-settings-card{width:min(1040px,100%);max-height:94vh;overflow:auto;background:#fff;border-radius:24px;padding:18px;box-shadow:0 32px 100px rgba(15,23,42,.48)}.v4-company-settings-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;border-bottom:1px solid #e2e8f0;padding-bottom:12px}.v4-company-settings-head h2{margin:0}.v4-company-settings-head p{margin:6px 0 0;color:#64748b}.v4-company-settings-head button,.v4-company-settings-actions button,.v4-company-settings-open{border:1px solid #fdba74;background:#fff7ed;color:#9a3412;border-radius:12px;padding:10px 14px;font-weight:900;cursor:pointer}.v4-company-settings-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:14px}.v4-company-settings-group{border:1px solid #e2e8f0;border-radius:18px;padding:12px}.v4-company-settings-group h3{margin:0 0 10px}.v4-company-settings-group label{display:grid;gap:5px;margin-top:9px;color:#334155;font-size:12px;font-weight:900}.v4-company-settings-group input,.v4-company-settings-group textarea,.v4-company-settings-group select{width:100%;border:1px solid #cbd5e1;border-radius:11px;padding:9px;font:inherit}.v4-company-settings-group textarea{min-height:66px;resize:vertical}.v4-company-settings-result{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px}.v4-company-settings-preview,.v4-company-settings-validation{border:1px solid #dbeafe;background:#f8fafc;border-radius:16px;padding:12px}.v4-company-settings-preview pre{white-space:pre-wrap;margin:8px 0 0;font:12px/1.5 Arial,sans-serif}.v4-company-settings-validation ul{margin:7px 0 0;padding-left:20px}.v4-company-settings-validation.is-error{border-color:#fecaca;background:#fff1f2;color:#991b1b}.v4-company-settings-validation.is-warn{border-color:#fde68a;background:#fffbeb;color:#92400e}.v4-company-settings-note{margin-top:12px;border:1px dashed #94a3b8;background:#f8fafc;border-radius:12px;padding:10px;color:#475569;font-size:12px;font-weight:800}.v4-company-settings-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.v4-company-settings-actions .primary{background:#ea580c;border-color:#ea580c;color:#fff}@media(max-width:860px){.v4-company-settings-grid{grid-template-columns:1fr}.v4-company-settings-result{grid-template-columns:1fr}.v4-company-settings-card{border-radius:16px;padding:12px}}`;
  document.head.appendChild(style);
}

function fieldHtml([name, label, type = 'text'], settings) {
  if (type === 'textarea') return `<label>${esc(label)}<textarea data-company-setting-field="${name}">${esc(settings[name])}</textarea></label>`;
  if (type === 'select') {
    const options = COMPANY_LEGAL_TAX_MODES.map((option) => `<option${settings[name] === option ? ' selected' : ''}>${esc(option)}</option>`).join('');
    return `<label>${esc(label)}<select data-company-setting-field="${name}">${options}</select></label>`;
  }
  return `<label>${esc(label)}<input type="${type}" value="${esc(settings[name])}" data-company-setting-field="${name}"></label>`;
}

function readDraft() {
  const draft = { schema_version: COMPANY_LEGAL_SCHEMA_VERSION };
  document.querySelectorAll(`#${HOST_ID} [data-company-setting-field]`).forEach((element) => {
    draft[element.dataset.companySettingField] = element.value;
  });
  return draft;
}

function renderResult() {
  const result = validateCompanyLegalSettingsDraft(readDraft());
  const preview = document.querySelector(`#${HOST_ID} [data-company-settings-preview-text]`);
  const validation = document.querySelector(`#${HOST_ID} [data-company-settings-validation]`);
  if (preview) preview.textContent = companyLegalSettingsPreviewText(result.value);
  if (!validation) return result;

  const messages = result.errors.length ? result.errors : result.warnings;
  validation.className = `v4-company-settings-validation ${result.errors.length ? 'is-error' : result.warnings.length ? 'is-warn' : ''}`;
  validation.innerHTML = messages.length
    ? `<b>${result.errors.length ? 'Нужно исправить' : 'Можно дополнить'}</b><ul>${messages.map((message) => `<li>${esc(message)}</li>`).join('')}</ul>`
    : '<b>Проверка пройдена</b><p>Обязательные форматы заполнены корректно.</p>';
  return result;
}

function applyToOpenAct(settings) {
  const set = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.value = value || '';
  };
  set('actDraftExecutor', companyLegalName(settings));
  set('actDraftExecutorDetails', companyLegalDetailsText(settings));
  set('actDraftTax', settings.tax_mode);
  set('actDraftSignatory', settings.signatory_name);
  set('actDraftSignatoryRole', settings.signatory_role);
}

function applyToOpenContract(settings) {
  const set = (id, value) => {
    const element = document.getElementById(id);
    if (element) element.value = value || '';
  };
  set('contractDraftExecutor', companyLegalName(settings));
  set('contractDraftExecutorDetails', companyLegalDetailsText(settings));
  set('contractDraftTaxMode', settings.tax_mode);
  set('contractDraftExecutorRepresentative', settings.signatory_name);
  set('contractDraftExecutorRole', settings.signatory_role);
}

function applyToOpenDocument(settings) {
  applyToOpenAct(settings);
  applyToOpenContract(settings);
}

async function openPreview() {
  if (!requireV4Action(CRM_V4_ACTIONS.SETTINGS_MANAGE)) {
    toast('Настройки реквизитов доступны только владельцу или администратору');
    return;
  }
  ensureStyles();
  const settings = await loadCompanyLegalSettings();
  const groups = FIELD_GROUPS.map((group) => `<section class="v4-company-settings-group"><h3>${esc(group.title)}</h3>${group.fields.map((field) => fieldHtml(field, settings)).join('')}</section>`).join('');
  host().innerHTML = `<div class="v4-company-settings-modal"><div class="v4-company-settings-card"><header class="v4-company-settings-head"><div><h2>Проверка реквизитов организации</h2><p>Форма только проверяет и показывает реквизиты. Сохранение в production отключено.</p></div><button type="button" data-company-settings-close>Закрыть</button></header><form id="companyLegalSettingsPreviewForm"><div class="v4-company-settings-grid">${groups}</div><div class="v4-company-settings-result"><section class="v4-company-settings-preview"><b>Предпросмотр блока исполнителя</b><pre data-company-settings-preview-text></pre></section><section data-company-settings-validation class="v4-company-settings-validation"></section></div><div class="v4-company-settings-note">Данные не записываются в <code>leader_settings</code>. Кнопка ниже применит проверенные значения только к открытому несохранённому черновику акта или договора.</div><div class="v4-company-settings-actions"><button type="submit" class="primary">Применить к текущему черновику</button><button type="button" data-company-settings-close>Отмена</button></div></form></div></div>`;
  renderResult();
}

function injectOpenButton() {
  const forms = [
    document.getElementById('orderActDraftForm'),
    document.getElementById('orderContractDraftForm')
  ].filter(Boolean);
  if (!forms.length) return;
  if (!canPerformV4Action(CRM_V4_ACTIONS.SETTINGS_MANAGE)) {
    forms.forEach((form) => form.querySelector('[data-company-settings-open]')?.remove());
    return;
  }
  forms.forEach((form) => {
    if (form.querySelector('[data-company-settings-open]')) return;
    const submit = form.querySelector('button[type="submit"]');
    if (!submit) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'v4-company-settings-open';
    button.dataset.companySettingsOpen = '1';
    button.textContent = 'Проверить реквизиты';
    submit.before(button);
  });
}

function boot() {
  ensureStyles();
  injectOpenButton();
  new MutationObserver(injectOpenButton).observe(document.body, { childList: true, subtree: true });
  document.addEventListener('leader-v4:crm-ready', injectOpenButton);
  document.addEventListener('click', (event) => {
    if (event.target.closest?.('[data-company-settings-open]')) {
      event.preventDefault();
      openPreview();
      return;
    }
    if (event.target.closest?.('[data-company-settings-close]')) {
      event.preventDefault();
      closePreview();
    }
  }, true);
  document.addEventListener('input', (event) => {
    if (event.target.closest?.('#companyLegalSettingsPreviewForm')) renderResult();
  });
  document.addEventListener('submit', (event) => {
    if (event.target?.id !== 'companyLegalSettingsPreviewForm') return;
    event.preventDefault();
    if (!requireV4Action(CRM_V4_ACTIONS.SETTINGS_MANAGE)) return;
    const result = renderResult();
    if (!result.valid) {
      toast('Исправьте ошибки в реквизитах');
      return;
    }
    applyToOpenDocument(result.value);
    closePreview();
    toast('Реквизиты применены только к открытому черновику');
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
