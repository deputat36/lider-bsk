#!/usr/bin/env python3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OFFERS = ROOT / 'crm/v4/assets/v4/offers.js'
PRINT = ROOT / 'crm/v4/assets/v4/offer-print-brand-v4.js'


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected 1 occurrence, got {count}')
    return text.replace(old, new, 1)


def replace_between(text, start_marker, end_marker, replacement, label):
    start = text.find(start_marker)
    if start < 0:
        raise RuntimeError(f'{label}: start marker not found')
    end = text.find(end_marker, start)
    if end < 0:
        raise RuntimeError(f'{label}: end marker not found')
    return text[:start] + replacement + text[end:]


offers = OFFERS.read_text(encoding='utf-8')
offers = replace_once(
    offers,
    "import { offerVisibilityVersion, publicOfferRows, shortOfferItemNames } from './offer-visibility-v1.js';",
    "import { offerVisibilityVersion, publicOfferRows, shortOfferItemNames } from './offer-visibility-v1.js';\nimport {\n  offerClientIdentityLines,\n  offerClientPrivacyLabel,\n  offerCreateSummary,\n  offerGreeting,\n  storedOfferIncludesClientDetails\n} from './offer-client-privacy-v1.js';",
    'privacy import'
)

build_texts = r'''function buildOfferTexts({ calculation, items, lead, need, validUntil, extraComment, includeClientDetails = false }) {
  const visibleItems = publicItems(items);
  const shortNames = shortOfferItemNames(items, 8);
  const shortLines = [
    offerGreeting(lead, includeClientDetails),
    '',
    'Подготовили расчёт по вашей заявке.',
    '',
    `${calculation.title || 'Работы по заявке'} — ${money(calculation.client_total)}.`
  ];
  if (shortNames.length) {
    shortLines.push('', 'В стоимость входит:');
    shortNames.forEach((name) => shortLines.push(`— ${name}`));
  }
  shortLines.push('', 'Срок выполнения уточняется после согласования макета и предоплаты.');
  shortLines.push('Для запуска нужно подтвердить заказ и внести предоплату.');
  if (extraComment) shortLines.push('', extraComment);

  const fullLines = [
    'КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ',
    'РА «Лидер»',
    `Дата: ${new Date().toLocaleDateString('ru-RU')}`
  ];
  const identityLines = offerClientIdentityLines(lead, includeClientDetails);
  if (identityLines.length) fullLines.push('', ...identityLines);
  fullLines.push('', 'Задача клиента');
  fullLines.push(needDescription(need) || calculation.title || lead?.service || 'Работы по заявке');
  fullLines.push('', 'Состав предложения');
  if (visibleItems.length) {
    visibleItems.forEach((item) => {
      const qty = Number(item.qty || 0);
      const unit = item.unit || '';
      fullLines.push(`— ${item.name}${qty ? ` — ${qty.toLocaleString('ru-RU')} ${unit}` : ''} — ${money(item.client_sum)}`);
      if (item.description) fullLines.push(`  ${item.description}`);
    });
  } else {
    fullLines.push('— Работы по согласованной заявке');
  }
  fullLines.push('', `Итоговая стоимость: ${money(calculation.client_total)}`);
  fullLines.push('', 'Условия запуска');
  fullLines.push('1. Подтвердить состав работ и стоимость.');
  fullLines.push('2. Внести предоплату.');
  fullLines.push('3. Передать материалы или согласовать разработку дизайна.');
  fullLines.push('4. Согласовать финальный макет перед производством.');
  if (calculation.public_comment) fullLines.push('', `Примечание: ${calculation.public_comment}`);
  if (extraComment) fullLines.push('', `Дополнительные условия: ${extraComment}`);
  fullLines.push('', `Срок действия предложения: до ${formatDate(validUntil)}.`);
  fullLines.push('Срок выполнения зависит от согласования макета, наличия материалов и загрузки производства.');

  return { shortText: shortLines.join('\n'), fullText: fullLines.join('\n') };
}

'''
offers = replace_between(offers, 'function buildOfferTexts(', 'function offerStatusActionButtons(', build_texts, 'buildOfferTexts')

card_and_helpers = r'''function renderOfferCard(offer) {
  const isActive = offer.id === activeOfferId;
  const statusModel = offerStatusUiModel(offer.status);
  const statusTitle = statusModel.known ? `Registry: ${statusModel.key}` : statusModel.warning;
  const includeClientDetails = storedOfferIncludesClientDetails(offer);
  const privacyLabel = offerClientPrivacyLabel(includeClientDetails);
  return `<article class="v4-offer-card" data-id="${esc(offer.id)}">
    <div>
      <div class="v4-offer-title-row"><h4>${esc(offer.title || 'Коммерческое предложение')}</h4><span class="${esc(statusModel.cssClass)}" title="${esc(statusTitle)}">${esc(statusModel.label)}</span></div>
      <div class="v4-offer-meta">
        <span><b>Сумма:</b> ${money(offer.total_sum)}</span>
        <span><b>Действует до:</b> ${formatDate(offer.valid_until)}</span>
        <span class="v4-offer-privacy ${includeClientDetails ? 'is-personalized' : 'is-anonymous'}"><b>Клиент:</b> ${esc(privacyLabel)}</span>
      </div>
    </div>
    <div class="v4-offer-actions">
      <button type="button" data-action="preview-offer">${isActive ? 'Скрыть предпросмотр' : 'Предпросмотр'}</button>
      <button type="button" data-action="copy-short-offer">Скопировать сообщение</button>
      <button type="button" data-action="copy-full-offer">Скопировать КП</button>
      ${offerStatusActionButtons(offer.status)}
    </div>
    ${isActive ? `<div class="v4-offer-preview"><div><h5>КП для клиента</h5><pre>${esc(offer.full_text || '')}</pre></div><div><h5>Короткое сообщение</h5><pre>${esc(offer.short_text || '')}</pre></div></div>` : ''}
  </article>`;
}

function offerCreateSummaryMarkup(calculationId = '', includeClientDetails = false, validUntil = '') {
  const calculation = (v4State.calculations || []).find((item) => item.id === calculationId) || null;
  const summary = offerCreateSummary({ calculation, includeClientDetails, validUntil });
  const lead = v4State.currentLead || {};
  const identity = includeClientDetails
    ? [lead.name, lead.phone].filter(Boolean).join(' · ') || 'данные клиента не заполнены'
    : 'имя и телефон не попадут в КП';
  return `<div class="v4-offer-summary-grid">
    <div><span>Расчёт</span><b>${esc(summary.calculationTitle)}</b></div>
    <div><span>Сумма</span><b>${money(summary.total)}</b></div>
    <div><span>Данные клиента</span><b>${esc(summary.privacyLabel)}</b><small>${esc(identity)}</small></div>
    <div><span>Действует до</span><b>${esc(formatDate(summary.validUntil) || '—')}</b></div>
  </div>`;
}

function renderOfferCreateSummary() {
  const box = byId('offerCreateSummary');
  if (!box) return;
  box.innerHTML = offerCreateSummaryMarkup(
    byId('offerCalculationId')?.value || '',
    Boolean(byId('offerIncludeClientDetails')?.checked),
    byId('offerValidUntil')?.value || ''
  );
}

'''
offers = replace_between(offers, 'function renderOfferCard(', 'function renderCreateForm()', card_and_helpers, 'offer card and summary helpers')

create_form = r'''function renderCreateForm() {
  if (!canPerformV4Action(CRM_V4_ACTIONS.OFFERS_WRITE)) return '<div class="v4-empty">У вашей роли нет права формировать КП.</div>';
  if (v4State.offersError) return '<div class="v4-empty is-error">Новое КП недоступно, пока не проверен список существующих предложений.</div>';
  const availability = offerCalculationAvailability(v4State.calculations || [], v4State.offers || []);
  if (!availability.available) return `<div class="v4-empty">${esc(availability.message)}</div>`;
  const selected = preferredOfferCalculationId(v4State.calculations || [], selectedCalculationId, v4State.offers || []);
  const calculation = (v4State.calculations || []).find((item) => item.id === selected) || null;
  const validUntil = validUntilDefault();
  const defaultTitle = calculation ? `КП: ${calculation.title || 'Расчёт'}` : '';
  return `<div id="offerCreateForm" class="v4-offer-form">
    <div class="v4-offer-form-head">
      <div><span>Следующее действие</span><h4>Создать коммерческое предложение</h4></div>
      <p>Проверьте, что увидит клиент. Персональные данные по умолчанию скрыты.</p>
    </div>
    <div class="v4-offer-create-flow">
      <section class="v4-offer-step">
        <div class="v4-offer-step-head"><span>1</span><div><h5>Выберите расчёт</h5><p>CRM возьмёт из него клиентские позиции и итоговую сумму.</p></div></div>
        <label>Расчёт<select id="offerCalculationId">${calculationOptions(selected)}</select></label>
      </section>
      <section class="v4-offer-step">
        <div class="v4-offer-step-head"><span>2</span><div><h5>Что увидит клиент</h5><p>Название можно изменить. Имя и телефон добавляются только по вашему решению.</p></div></div>
        <label>Название КП<input id="offerTitle" value="${esc(defaultTitle)}" placeholder="Например: КП на изготовление вывески"></label>
        <label class="v4-offer-privacy-toggle">
          <input id="offerIncludeClientDetails" type="checkbox">
          <span><b>Показывать имя и контакты клиента в КП</b><small>По умолчанию выключено. Если включить, в КП попадут сохранённые имя и телефон из заявки.</small></span>
        </label>
      </section>
      <section class="v4-offer-step">
        <div class="v4-offer-step-head"><span>3</span><div><h5>Срок и условия</h5><p>Срок действия нужен всегда. Дополнительные условия можно не заполнять.</p></div></div>
        <label>Действует до<input id="offerValidUntil" type="date" value="${validUntil}"></label>
        <details class="v4-offer-optional">
          <summary>Дополнительные условия для клиента</summary>
          <label>Условия<textarea id="offerExtraComment" rows="3" placeholder="Предоплата, доставка, сроки, особенности монтажа"></textarea></label>
        </details>
      </section>
    </div>
    <div id="offerCreateSummary" class="v4-offer-create-summary" aria-live="polite">${offerCreateSummaryMarkup(selected, false, validUntil)}</div>
    <div class="v4-form-actions"><button id="createOfferBtn" type="button" class="v4-primary" ${selected && !createBusy ? '' : 'disabled'}>${createBusy ? 'Создаю КП...' : 'Создать КП'}</button></div>
    <p class="v4-muted">В КП никогда не показываются себестоимость, прибыль, маржа и цены подрядчиков. Персональные данные добавляются только при включённой опции. Правила отображения: ${esc(offerVisibilityVersion())}.</p>
  </div>`;
}

'''
offers = replace_between(offers, 'function renderCreateForm()', 'export function renderOffers()', create_form, 'renderCreateForm')

offers = replace_once(
    offers,
    "    const validUntil = byId('offerValidUntil')?.value || validUntilDefault();\n    const extraComment = byId('offerExtraComment')?.value?.trim() || '';\n    const texts = buildOfferTexts({ ...bundle, validUntil, extraComment });",
    "    const validUntil = byId('offerValidUntil')?.value || validUntilDefault();\n    const extraComment = byId('offerExtraComment')?.value?.trim() || '';\n    const includeClientDetails = Boolean(byId('offerIncludeClientDetails')?.checked);\n    const texts = buildOfferTexts({ ...bundle, validUntil, extraComment, includeClientDetails });",
    'create offer privacy values'
)
offers = replace_once(
    offers,
    "          valid_until: validUntil,\n          extra_comment: extraComment || null",
    "          valid_until: validUntil,\n          extra_comment: extraComment || null,\n          include_client_details: includeClientDetails",
    'staging payload privacy'
)

old_change = r'''  byId('leadCardSection')?.addEventListener('change', (event) => {
    if (event.target?.id !== 'offerCalculationId') return;
    selectedCalculationId = event.target.value || '';
    const button = byId('createOfferBtn');
    if (button) button.disabled = !selectedCalculationId || createBusy;
    const calculation = (v4State.calculations || []).find((item) => item.id === selectedCalculationId);
    const title = byId('offerTitle');
    if (calculation && title && !title.value.trim()) title.value = `КП: ${calculation.title || 'Расчёт'}`;
  });
'''
new_change = r'''  byId('leadCardSection')?.addEventListener('change', (event) => {
    const targetId = event.target?.id || '';
    if (targetId === 'offerCalculationId') {
      selectedCalculationId = event.target.value || '';
      const button = byId('createOfferBtn');
      if (button) button.disabled = !selectedCalculationId || createBusy;
      const calculation = (v4State.calculations || []).find((item) => item.id === selectedCalculationId);
      const title = byId('offerTitle');
      if (calculation && title && !title.value.trim()) title.value = `КП: ${calculation.title || 'Расчёт'}`;
    }
    if (['offerCalculationId', 'offerIncludeClientDetails', 'offerValidUntil'].includes(targetId)) {
      renderOfferCreateSummary();
    }
  });
'''
offers = replace_once(offers, old_change, new_change, 'offer form change listener')
OFFERS.write_text(offers, encoding='utf-8')

print_source = PRINT.read_text(encoding='utf-8')
print_source = replace_once(
    print_source,
    "import { publicOfferRows } from './offer-visibility-v1.js';",
    "import { publicOfferRows } from './offer-visibility-v1.js';\nimport { storedOfferClientDetails } from './offer-client-privacy-v1.js';",
    'print privacy import'
)
print_source = replace_once(print_source, "const LEAD_FIELDS = 'id,name,phone,city,service';\n", '', 'remove print lead fields')
print_source = replace_once(
    print_source,
    "function taskText(lead, calc, offer) {\n  return [lead?.service, calc?.title].filter(Boolean).join('. ') || offer.title || 'Работы по согласованной заявке';\n}",
    "function taskText(calc, offer) {\n  return calc?.title || offer.title || 'Работы по согласованной заявке';\n}",
    'print task text'
)

client_helpers = r'''function clientBusinessCard(offer) {
  const details = storedOfferClientDetails(offer);
  if (!details.include) return '';
  const fields = [
    details.name ? `<div class="field"><span class="label">Имя</span><b>${esc(details.name)}</b></div>` : '',
    details.phone ? `<div class="field"><span class="label">Телефон</span><b>${esc(details.phone)}</b></div>` : ''
  ].filter(Boolean).join('');
  return fields ? `<section class="card"><div class="title"><h2>Клиент</h2><span>по настройке КП</span></div><div class="grid">${fields}</div></section>` : '';
}
function clientPresentationCard(offer) {
  const details = storedOfferClientDetails(offer);
  if (!details.include) return '';
  const fields = [
    details.name ? `<div class="field"><span class="label">Имя</span><b>${esc(details.name)}</b></div>` : '',
    details.phone ? `<div class="field"><span class="label">Телефон</span><b>${esc(details.phone)}</b></div>` : ''
  ].filter(Boolean).join('');
  return fields ? `<div class="card"><h3>Клиент</h3>${fields}</div>` : '';
}
'''
print_source = replace_once(print_source, 'function business(bundle) {', client_helpers + 'function business(bundle) {', 'print client helper insert')

old_business = "  const { offer, calculation, items, lead } = bundle;"
print_source = replace_once(print_source, old_business, "  const { offer, calculation, items } = bundle;", 'business destructure')
print_source = replace_once(print_source, old_business, "  const { offer, calculation, items } = bundle;", 'presentation destructure')
print_source = replace_once(print_source, '${esc(taskText(lead, calculation, offer))}', '${esc(taskText(calculation, offer))}', 'business task call')
print_source = replace_once(print_source, '${esc(taskText(lead, calculation, offer))}', '${esc(taskText(calculation, offer))}', 'presentation task call')

business_client = '<section class="card"><div class="title"><h2>Клиент</h2><span>данные заявки</span></div><div class="grid"><div class="field"><span class="label">Имя</span><b>${esc(lead?.name || \'Не указано\')}</b></div><div class="field"><span class="label">Телефон</span><b>${esc(lead?.phone || \'Не указано\')}</b></div><div class="field"><span class="label">Город</span><b>${esc(lead?.city || \'Борисоглебск\')}</b></div><div class="field"><span class="label">Услуга</span><b>${esc(lead?.service || calculation?.title || \'Рекламные работы\')}</b></div></div></section>'
print_source = replace_once(print_source, business_client, '${clientBusinessCard(offer)}', 'business client card')
presentation_client = '<div class="card"><h3>Клиент</h3><div class="field"><span class="label">Имя</span><b>${esc(lead?.name || \'Не указано\')}</b></div><div class="field"><span class="label">Телефон</span><b>${esc(lead?.phone || \'Не указано\')}</b></div></div>'
print_source = replace_once(print_source, presentation_client, '${clientPresentationCard(offer)}', 'presentation client card')

old_load = r'''async function loadBundle(offer) {
  let calculation = null, items = [], lead = v4State.currentLead || null;
  if (offer.calculation_id) {
    const calc = await timeout(supabaseClient.from('leader_lead_calculations').select(CALC_FIELDS).eq('id', offer.calculation_id).maybeSingle(), 12000, 'Расчёт для печати не загрузился за 12 секунд');
    if (calc.error) throw calc.error;
    calculation = calc.data || null;
    const rowsRes = await timeout(supabaseClient.from('leader_lead_calculation_items').select(ITEM_FIELDS).eq('calculation_id', offer.calculation_id).order('sort_order', { ascending: true }).limit(160), 12000, 'Позиции КП для печати не загрузились за 12 секунд');
    if (rowsRes.error) throw rowsRes.error;
    items = rowsRes.data || [];
  }
  const leadId = offer.lead_id || calculation?.lead_id || lead?.id;
  if (leadId && (!lead || lead.id !== leadId)) {
    const leadRes = await timeout(supabaseClient.from('leader_leads').select(LEAD_FIELDS).eq('id', leadId).maybeSingle(), 12000, 'Заявка для печати не загрузилась за 12 секунд');
    if (leadRes.error) throw leadRes.error;
    lead = leadRes.data || lead;
  }
  return { offer, calculation, items, lead };
}
'''
new_load = r'''async function loadBundle(offer) {
  let calculation = null, items = [];
  if (offer.calculation_id) {
    const calc = await timeout(supabaseClient.from('leader_lead_calculations').select(CALC_FIELDS).eq('id', offer.calculation_id).maybeSingle(), 12000, 'Расчёт для печати не загрузился за 12 секунд');
    if (calc.error) throw calc.error;
    calculation = calc.data || null;
    const rowsRes = await timeout(supabaseClient.from('leader_lead_calculation_items').select(ITEM_FIELDS).eq('calculation_id', offer.calculation_id).order('sort_order', { ascending: true }).limit(160), 12000, 'Позиции КП для печати не загрузились за 12 секунд');
    if (rowsRes.error) throw rowsRes.error;
    items = rowsRes.data || [];
  }
  return { offer, calculation, items };
}
'''
print_source = replace_once(print_source, old_load, new_load, 'print load bundle')
PRINT.write_text(print_source, encoding='utf-8')

print('Issue 516 offer privacy UX source patch applied.')
