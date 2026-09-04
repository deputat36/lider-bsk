import { supabaseClient } from './supabase-client.js';
import { timeout, friendlyError } from './api.js';
import { v4State, setState, subscribeState } from './state.js';
import { byId, setStatus, toast } from './ui.js';
import { CRM_V4_ACTIONS, canPerformV4Action, requireV4Action } from './action-permissions-v1.js';
import {
  offerCalculationAvailability,
  offerEligibleCalculations,
  preferredOfferCalculationId
} from './calculation-offer-next-action-model-v1.js';
import {
  calculationStatusForOfferStatus,
  leadStatusForOfferStatus,
  offerStatusTargetForAction,
  offerStatusUiModel,
  rawOfferStatus,
  validateOfferStatusTransition
} from './offer-status-ui-model-v1.js';
import { V4_CONFIG } from './config.js';
import { invokeStagingWorkflow, isStagingWorkflowEnvironment } from './workflow-staging-transport-v1.js';
import { offerVisibilityVersion, publicOfferRows, shortOfferItemNames } from './offer-visibility-v1.js';

const OFFER_FIELDS = 'id,lead_id,calculation_id,client_id,order_id,offer_number,offer_type,title,short_text,full_text,total_sum,valid_until,status,sent_at,approved_at,rejected_at,created_by,updated_by,created_at,updated_at';
const CALC_FIELDS = 'id,lead_id,need_id,client_id,title,status,version_number,client_total,contractor_cost,profit,margin_percent,warning_level,warnings,public_comment,internal_comment,commercial_offer_id,order_id,created_by,updated_by,created_at,updated_at';
const ITEM_FIELDS = 'id,calculation_id,lead_id,catalog_id,category,item_type,name,unit,qty,contractor_price,contractor_sum,markup_percent,client_price,client_sum,profit,margin_percent,comment,data,sort_order,created_at,updated_at';
const LEAD_FIELDS = 'id,name,phone,source,message,page_url,status,payload,created_at,updated_at,service,contact_preference,city,budget,utm_source,utm_medium,utm_campaign,utm_content,utm_term,assigned_to,converted_order_id,converted_client_id,last_contact_at,next_contact_at,converted_at,reject_reason,lead_quality,estimated_amount';
const NEED_FIELDS = 'id,lead_id,title,need_type,description,structured_data,deadline_text,deadline_date,need_design,need_installation,status,created_at,updated_at';

let activeOfferId = null;
let createBusy = false;
let offersLoadSequence = 0;
let previousCalculations = null;
let selectedCalculationId = '';

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}

function money(value) {
  return `${Math.round(Number(value || 0)).toLocaleString('ru-RU')} ₽`;
}

function formatDate(value) {
  if (!value) return '—';
  try { return new Date(value).toLocaleDateString('ru-RU'); } catch (_) { return String(value); }
}

function validUntilDefault() {
  const date = new Date();
  date.setDate(date.getDate() + 3);
  return date.toISOString().slice(0, 10);
}

function calculationOptions(selected = '') {
  const calculations = offerEligibleCalculations(v4State.calculations || [], v4State.offers || []);
  if (!calculations.length) return '<option value="">Нет свободного расчёта</option>';
  const resolved = preferredOfferCalculationId(calculations, selected);
  const placeholder = resolved ? '' : '<option value="">Выберите расчёт</option>';
  return [placeholder, ...calculations.map((calc) => `<option value="${esc(calc.id)}" ${calc.id === resolved ? 'selected' : ''}>v${Number(calc.version_number || 1)} · ${esc(calc.title || 'Расчёт')} — ${money(calc.client_total)}</option>`)].join('');
}

function needDescription(need) {
  if (!need) return '';
  const data = need.structured_data && typeof need.structured_data === 'object' ? need.structured_data : {};
  const lines = [];
  if (need.title) lines.push(need.title);
  if (need.description) lines.push(need.description);
  if (data.width || data.height) lines.push(`Размер: ${data.width || '—'} × ${data.height || '—'}`);
  if (data.quantity) lines.push(`Количество: ${data.quantity}`);
  if (data.print_run) lines.push(`Тираж / формат: ${data.print_run}`);
  if (data.material) lines.push(`Материал: ${data.material}`);
  if (need.deadline_text) lines.push(`Желаемый срок: ${need.deadline_text}`);
  if (need.need_design) lines.push('Требуется дизайн или подготовка макета.');
  if (need.need_installation) lines.push('Монтаж предусмотрен или требует согласования.');
  return lines.join('\n');
}

function publicItems(items) {
  return publicOfferRows(items);
}

function buildOfferTexts({ calculation, items, lead, need, validUntil, extraComment }) {
  const visibleItems = publicItems(items);
  const shortNames = shortOfferItemNames(items, 8);
  const shortLines = [
    `Здравствуйте${lead?.name ? `, ${lead.name}` : ''}! Подготовили расчёт по вашей заявке.`,
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
    `Дата: ${new Date().toLocaleDateString('ru-RU')}`,
    '',
    `Клиент: ${lead?.name || 'не указано'}`
  ];
  if (lead?.phone) fullLines.push(`Телефон: ${lead.phone}`);
  fullLines.push('', 'Задача клиента');
  fullLines.push(needDescription(need) || calculation.title || lead?.service || 'Работы по заявке');
  fullLines.push('', 'Состав предложения');
  if (visibleItems.length) {
    visibleItems.forEach((item) => {
      const qty = Number(item.qty || 0);
      const unit = item.unit || '';
      fullLines.push(`— ${item.name}${qty ? ` — ${qty.toLocaleString('ru-RU')} ${unit}` : ''} — ${money(item.client_sum)}`);
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

function offerStatusActionButtons(status) {
  const model = offerStatusUiModel(status);
  if (!model.known) return `<div class="v4-status-registry-warning" data-unknown-offer-status="${esc(model.raw)}">${esc(model.warning)}</div>`;
  return model.actions.map((item) => `<button type="button" data-action="${esc(item.action)}"${item.danger ? ' class="is-danger"' : ''}>${esc(item.label)}</button>`).join('');
}

function mergeLeadState(lead) {
  if (!lead) return;
  setState({
    currentLead: v4State.currentLead?.id === lead.id ? { ...v4State.currentLead, ...lead } : v4State.currentLead,
    leads: (v4State.leads || []).map((item) => item.id === lead.id ? { ...item, ...lead } : item)
  });
}

async function updateLeadStatusFromOffer(leadId, status) {
  if (!leadId) return null;
  const leadStatus = leadStatusForOfferStatus(status);
  const response = await timeout(
    supabaseClient
      .from('leader_leads')
      .update({ status: leadStatus, updated_at: new Date().toISOString() })
      .eq('id', leadId)
      .select(LEAD_FIELDS)
      .single(),
    12000,
    'Статус заявки не синхронизировался за 12 секунд'
  );
  if (response.error) throw response.error;
  mergeLeadState(response.data);
  return response.data;
}

function renderOfferCard(offer) {
  const isActive = offer.id === activeOfferId;
  const statusModel = offerStatusUiModel(offer.status);
  const statusTitle = statusModel.known ? `Registry: ${statusModel.key}` : statusModel.warning;
  return `<article class="v4-offer-card" data-id="${esc(offer.id)}"><div><div class="v4-offer-title-row"><h4>${esc(offer.title || 'Коммерческое предложение')}</h4><span class="${esc(statusModel.cssClass)}" title="${esc(statusTitle)}">${esc(statusModel.label)}</span></div><div class="v4-offer-meta"><span><b>Сумма:</b> ${money(offer.total_sum)}</span><span><b>Действует до:</b> ${formatDate(offer.valid_until)}</span><span><b>Создано:</b> ${formatDate(offer.created_at)}</span></div></div><div class="v4-offer-actions"><button type="button" data-action="preview-offer">${isActive ? 'Скрыть' : 'Показать'}</button><button type="button" data-action="copy-short-offer">Копировать короткое</button><button type="button" data-action="copy-full-offer">Копировать полное</button>${offerStatusActionButtons(offer.status)}</div>${isActive ? `<div class="v4-offer-preview"><div><h5>Подробное КП</h5><pre>${esc(offer.full_text || '')}</pre></div><div><h5>Короткое сообщение</h5><pre>${esc(offer.short_text || '')}</pre></div></div>` : ''}</article>`;
}

function renderCreateForm() {
  if (!canPerformV4Action(CRM_V4_ACTIONS.OFFERS_WRITE)) return '<div class="v4-empty">У вашей роли нет права формировать КП.</div>';
  if (v4State.offersError) return '<div class="v4-empty is-error">Новое КП недоступно, пока не проверен список существующих предложений.</div>';
  const availability = offerCalculationAvailability(v4State.calculations || [], v4State.offers || []);
  if (!availability.available) return `<div class="v4-empty">${esc(availability.message)}</div>`;
  const selected = preferredOfferCalculationId(v4State.calculations || [], selectedCalculationId, v4State.offers || []);
  return `<div id="offerCreateForm" class="v4-offer-form"><div class="v4-offer-form-head"><div><span>Следующее действие</span><h4>Сформировать КП из расчёта</h4></div><p>${esc(availability.message)}</p></div><div class="v4-form-grid"><label>Расчёт<select id="offerCalculationId">${calculationOptions(selected)}</select></label><label>Название КП<input id="offerTitle" placeholder="Например: КП на изготовление баннера"></label><label>Действует до<input id="offerValidUntil" type="date" value="${validUntilDefault()}"></label><label class="wide">Дополнительные условия для клиента<textarea id="offerExtraComment" rows="2" placeholder="Предоплата, доставка, сроки, особенности монтажа"></textarea></label></div><div class="v4-form-actions"><button id="createOfferBtn" type="button" class="v4-primary" ${selected && !createBusy ? '' : 'disabled'}>${createBusy ? 'Формирую КП...' : 'Сформировать КП'}</button></div><p class="v4-muted">В клиентском тексте не показываются себестоимость, прибыль, маржа и цены подрядчиков. Правила отображения: ${esc(offerVisibilityVersion())}.</p></div>`;
}

export function renderOffers() {
  const box = byId('offersBox');
  if (!box) return;
  if (!v4State.route.leadId) { box.innerHTML = ''; return; }
  if (!canPerformV4Action(CRM_V4_ACTIONS.OFFERS_READ)) {
    box.innerHTML = '<section class="v4-subcard"><div class="v4-empty">У вашей роли нет доступа к коммерческим предложениям.</div></section>';
    return;
  }
  if (v4State.offersBusy) { box.innerHTML = '<div class="v4-empty">Загружаю коммерческие предложения...</div>'; return; }
  selectedCalculationId = preferredOfferCalculationId(v4State.calculations || [], selectedCalculationId, v4State.offers || []);
  const offers = v4State.offers || [];
  box.innerHTML = `<section class="v4-subcard v4-offers-section"><div class="v4-subcard-head"><div><h3>Коммерческие предложения</h3><p>КП формируется только из сохранённого расчёта. При отправке, согласовании или отклонении статус заявки обновится автоматически.</p></div><span class="v4-muted">КП: ${offers.length}</span></div><div class="v4-offers-list">${v4State.offersError ? `<div class="v4-empty is-error">${esc(v4State.offersError)}</div>` : offers.length ? offers.map(renderOfferCard).join('') : '<div class="v4-empty">Коммерческих предложений пока нет.</div>'}</div>${renderCreateForm()}</section>`;
}

export async function loadOffers(leadId = v4State.route.leadId) {
  if (!canPerformV4Action(CRM_V4_ACTIONS.OFFERS_READ)) {
    setState({ offers: [], offersBusy: false, offersError: null });
    renderOffers();
    return [];
  }
  if (!leadId || !v4State.crmReady) {
    setState({ offers: [], offersBusy: false, offersError: null });
    renderOffers();
    return [];
  }
  const requestSequence = ++offersLoadSequence;
  setState({ offersBusy: true, offersError: null });
  renderOffers();
  try {
    const response = await timeout(
      supabaseClient
        .from('leader_commercial_offers')
        .select(OFFER_FIELDS)
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(50),
      12000,
      'Коммерческие предложения не загрузились за 12 секунд'
    );
    if (response.error) throw response.error;
    if (requestSequence !== offersLoadSequence || v4State.route.leadId !== leadId) return [];
    setState({ offers: response.data || [], offersBusy: false, offersError: null });
    renderOffers();
    return response.data || [];
  } catch (error) {
    if (requestSequence !== offersLoadSequence || v4State.route.leadId !== leadId) return [];
    const message = friendlyError(error);
    setState({ offers: [], offersBusy: false, offersError: message });
    renderOffers();
    setStatus(`Ошибка загрузки КП: ${message}`, 'error');
    return [];
  }
}

async function loadCalculationBundle(calculationId) {
  const calculationResponse = await timeout(
    supabaseClient.from('leader_lead_calculations').select(CALC_FIELDS).eq('id', calculationId).single(),
    12000,
    'Расчёт не загрузился за 12 секунд'
  );
  if (calculationResponse.error) throw calculationResponse.error;
  const calculation = calculationResponse.data;

  const itemsResponse = await timeout(
    supabaseClient
      .from('leader_lead_calculation_items')
      .select(ITEM_FIELDS)
      .eq('calculation_id', calculationId)
      .order('sort_order', { ascending: true })
      .limit(160),
    12000,
    'Позиции расчёта не загрузились за 12 секунд'
  );
  if (itemsResponse.error) throw itemsResponse.error;

  let lead = v4State.currentLead;
  if (!lead || lead.id !== calculation.lead_id) {
    const leadResponse = await supabaseClient.from('leader_leads').select(LEAD_FIELDS).eq('id', calculation.lead_id).single();
    if (leadResponse.error) throw leadResponse.error;
    lead = leadResponse.data;
  }

  let need = null;
  if (calculation.need_id) {
    const needResponse = await supabaseClient.from('leader_lead_needs').select(NEED_FIELDS).eq('id', calculation.need_id).maybeSingle();
    if (needResponse.error) throw needResponse.error;
    need = needResponse.data || null;
  }

  return { calculation, items: itemsResponse.data || [], lead, need };
}

async function writeOfferEvent({ offerId, leadId, calculationId, eventType, newStatus, comment }) {
  try {
    await supabaseClient.from('leader_commercial_offer_events').insert({
      offer_id: offerId,
      lead_id: leadId,
      calculation_id: calculationId,
      event_type: eventType,
      new_status: newStatus,
      comment: comment || '',
      created_by: v4State.user?.id || null,
      created_by_email: v4State.user?.email || null
    });
  } catch (error) {
    console.warn('CRM v4 offer event warning:', error);
  }
}

async function createOffer() {
  if (createBusy) return;
  if (!requireV4Action(CRM_V4_ACTIONS.OFFERS_WRITE)) { toast('У вашей роли нет права формировать КП'); return; }
  const calculationId = byId('offerCalculationId')?.value || '';
  if (!calculationId) { toast('Выберите сохранённый расчёт'); return; }
  const eligible = offerEligibleCalculations(v4State.calculations || [], v4State.offers || []);
  if (!eligible.some((calculation) => calculation.id === calculationId)) {
    toast('Для этого расчёта КП уже создано или не указана сумма клиенту');
    return;
  }
  createBusy = true;
  const button = byId('createOfferBtn');
  if (button) button.disabled = true;
  try {
    setStatus('Формирую коммерческое предложение...', 'warn');
    const bundle = await loadCalculationBundle(calculationId);
    const calculation = bundle.calculation;
    const visibleItems = publicItems(bundle.items);
    if (Number(calculation.client_total || 0) <= 0) throw new Error('Сумма клиенту должна быть больше 0 ₽');
    if (!visibleItems.length) throw new Error('В расчёте нет позиций с клиентской стоимостью');

    const validUntil = byId('offerValidUntil')?.value || validUntilDefault();
    const extraComment = byId('offerExtraComment')?.value?.trim() || '';
    const texts = buildOfferTexts({ ...bundle, validUntil, extraComment });
    const title = byId('offerTitle')?.value?.trim() || `КП: ${calculation.title || 'Расчёт'}`;

    if (isStagingWorkflowEnvironment(V4_CONFIG.supabaseUrl)) {
      const invoked = await supabaseClient.functions.invoke('leader-crm-offers', { body: {
        action: 'offer.create_from_calculation',
        request_id: globalThis.crypto.randomUUID(),
        expected_updated_at: calculation.updated_at,
        payload: {
          calculation_id: calculation.id,
          idempotency_key: `offer.create_from_calculation:${calculation.id}:v1`,
          title,
          valid_until: validUntil,
          extra_comment: extraComment || null
        }
      } });
      if (invoked.error || invoked.data?.ok !== true) {
        throw new Error(invoked.data?.error?.code || invoked.error?.message || 'offer_create_failed');
      }
      const offer = invoked.data.entity;
      const updatedCalculation = invoked.data.calculation;
      const updatedLead = invoked.data.lead;
      activeOfferId = offer.id;
      selectedCalculationId = '';
      setState({
        offers: [offer, ...(v4State.offers || []).filter((item) => item.id !== offer.id)],
        calculations: (v4State.calculations || []).map((calc) => calc.id === updatedCalculation?.id ? { ...calc, ...updatedCalculation } : calc),
        currentLead: updatedLead ? { ...(v4State.currentLead || {}), ...updatedLead } : v4State.currentLead,
        leads: updatedLead ? (v4State.leads || []).map((lead) => lead.id === updatedLead.id ? { ...lead, ...updatedLead } : lead) : v4State.leads
      });
      renderOffers();
      setStatus(invoked.data.idempotent_replay ? 'КП уже было сформировано — дубль не создан' : 'Коммерческое предложение сформировано атомарно в staging.', 'good');
      toast(invoked.data.idempotent_replay ? 'КП восстановлено без дубля' : 'КП сформировано');
      return;
    }

    const response = await timeout(
      supabaseClient
        .from('leader_commercial_offers')
        .insert({
          lead_id: calculation.lead_id,
          calculation_id: calculation.id,
          client_id: calculation.client_id || null,
          order_id: calculation.order_id || null,
          offer_type: 'Подробное + короткое',
          title,
          short_text: texts.shortText,
          full_text: texts.fullText,
          total_sum: calculation.client_total,
          valid_until: validUntil,
          status: 'Черновик'
        })
        .select(OFFER_FIELDS)
        .single(),
      14000,
      'Коммерческое предложение не сохранилось за 14 секунд'
    );
    if (response.error) throw response.error;
    const offer = response.data;
    if (!(v4State.offers || []).some((item) => item.id === offer.id)) {
      setState({ offers: [offer, ...(v4State.offers || [])] });
      renderOffers();
    }

    const calcUpdate = await supabaseClient
      .from('leader_lead_calculations')
      .update({ commercial_offer_id: offer.id, status: 'КП сформировано', updated_at: new Date().toISOString() })
      .eq('id', calculation.id)
      .select(CALC_FIELDS)
      .single();
    if (calcUpdate.error) throw calcUpdate.error;

    const updatedLead = await updateLeadStatusFromOffer(calculation.lead_id, 'Черновик');

    await writeOfferEvent({
      offerId: offer.id,
      leadId: calculation.lead_id,
      calculationId: calculation.id,
      eventType: 'Создано КП',
      newStatus: 'Черновик',
      comment: 'КП сформировано из сохранённого расчёта'
    });

    activeOfferId = offer.id;
    selectedCalculationId = '';
    setState({
      offers: (v4State.offers || []).some((item) => item.id === offer.id) ? v4State.offers : [offer, ...(v4State.offers || [])],
      calculations: (v4State.calculations || []).map((calc) => calc.id === calculation.id ? { ...calc, ...calcUpdate.data } : calc),
      currentLead: updatedLead ? { ...(v4State.currentLead || {}), ...updatedLead } : v4State.currentLead,
      leads: updatedLead ? (v4State.leads || []).map((lead) => lead.id === updatedLead.id ? { ...lead, ...updatedLead } : lead) : v4State.leads
    });
    renderOffers();
    setStatus('Коммерческое предложение сформировано. Статус заявки обновлён.', 'good');
    toast('КП сформировано');
  } catch (error) {
    setStatus(`Ошибка формирования КП: ${friendlyError(error)}`, 'error');
    toast(friendlyError(error));
  } finally {
    createBusy = false;
    const currentButton = byId('createOfferBtn');
    if (currentButton) currentButton.disabled = !(byId('offerCalculationId')?.value || '');
  }
}

async function updateOfferStatus(offerId, status) {
  if (!requireV4Action(CRM_V4_ACTIONS.OFFERS_TRANSITION)) throw new Error('Недостаточно прав для изменения статуса КП');
  const current = (v4State.offers || []).find((offer) => offer.id === offerId);
  if (!current) return;
  const transition = validateOfferStatusTransition(current.status, status);
  if (!transition.ok) throw new Error(`Переход КП «${rawOfferStatus(current.status)} → ${rawOfferStatus(status)}» не разрешён registry (${transition.reason}).`);

  const targetStatus = transition.label;

  if (isStagingWorkflowEnvironment(V4_CONFIG.supabaseUrl)) {
    const result = await invokeStagingWorkflow({
      client: supabaseClient,
      supabaseUrl: V4_CONFIG.supabaseUrl,
      action: 'offer.transition',
      entity: current,
      status: targetStatus
    });
    const updated = result.offer;
    const updatedCalculation = result.calculation;
    const updatedLead = result.lead;
    setState({
      offers: (v4State.offers || []).map((offer) => offer.id === offerId ? updated : offer),
      calculations: updatedCalculation ? (v4State.calculations || []).map((calc) => calc.id === updatedCalculation.id ? { ...calc, ...updatedCalculation } : calc) : v4State.calculations,
      currentLead: updatedLead ? { ...(v4State.currentLead || {}), ...updatedLead } : v4State.currentLead,
      leads: updatedLead ? (v4State.leads || []).map((lead) => lead.id === updatedLead.id ? { ...lead, ...updatedLead } : lead) : v4State.leads
    });
    renderOffers();
    setStatus(`КП: ${targetStatus}. Проекции синхронизированы атомарно.`, targetStatus === 'Отклонено' ? 'warn' : 'good');
    toast(result.idempotent_replay ? 'Безопасный повтор перехода КП' : `Статус КП: ${targetStatus}`);
    return;
  }

  const patch = { status: targetStatus, updated_at: new Date().toISOString() };
  if (transition.timestampField) patch[transition.timestampField] = new Date().toISOString();

  const response = await timeout(
    supabaseClient.from('leader_commercial_offers').update(patch).eq('id', offerId).select(OFFER_FIELDS).single(),
    12000,
    'Статус КП не обновился за 12 секунд'
  );
  if (response.error) throw response.error;
  const updated = response.data;

  const calculationStatus = calculationStatusForOfferStatus(targetStatus);
  let updatedCalculation = null;
  if (updated.calculation_id) {
    const calcResponse = await supabaseClient
      .from('leader_lead_calculations')
      .update({ status: calculationStatus, updated_at: new Date().toISOString() })
      .eq('id', updated.calculation_id)
      .select(CALC_FIELDS)
      .single();
    if (calcResponse.error) throw calcResponse.error;
    updatedCalculation = calcResponse.data;
  }

  const updatedLead = await updateLeadStatusFromOffer(updated.lead_id, targetStatus);

  await writeOfferEvent({
    offerId,
    leadId: updated.lead_id,
    calculationId: updated.calculation_id,
    eventType: 'Изменение статуса КП',
    newStatus: targetStatus,
    comment: `Статус изменён на ${targetStatus}. Статус заявки: ${leadStatusForOfferStatus(targetStatus)}`
  });

  setState({
    offers: (v4State.offers || []).map((offer) => offer.id === offerId ? updated : offer),
    calculations: updatedCalculation ? (v4State.calculations || []).map((calc) => calc.id === updatedCalculation.id ? { ...calc, ...updatedCalculation } : calc) : v4State.calculations,
    currentLead: updatedLead ? { ...(v4State.currentLead || {}), ...updatedLead } : v4State.currentLead,
    leads: updatedLead ? (v4State.leads || []).map((lead) => lead.id === updatedLead.id ? { ...lead, ...updatedLead } : lead) : v4State.leads
  });
  renderOffers();
  const statusModel = offerStatusUiModel(targetStatus);
  setStatus(`КП: ${targetStatus}. Заявка: ${leadStatusForOfferStatus(targetStatus)}`, statusModel.key === 'rejected' ? 'warn' : 'good');
  toast(`Статус КП: ${targetStatus}`);
}

async function copyText(text) {
  if (!text) throw new Error('Текст КП пуст');
  if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return; }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

function bindOfferEvents() {
  byId('leadCardSection')?.addEventListener('click', async (event) => {
    if (event.target.closest('#createOfferBtn')) { await createOffer(); return; }
    const actionButton = event.target.closest('button[data-action]');
    const card = actionButton?.closest('.v4-offer-card');
    const offerId = card?.dataset.id;
    if (!actionButton || !offerId) return;
    const offer = (v4State.offers || []).find((item) => item.id === offerId);
    if (!offer) return;
    try {
      const action = actionButton.dataset.action;
      if (action === 'preview-offer') { activeOfferId = activeOfferId === offerId ? null : offerId; renderOffers(); }
      if (action === 'copy-short-offer') { await copyText(offer.short_text || ''); toast('Короткое КП скопировано'); }
      if (action === 'copy-full-offer') { await copyText(offer.full_text || ''); toast('Подробное КП скопировано'); }
      const targetStatus = offerStatusTargetForAction(action);
      if (targetStatus) await updateOfferStatus(offerId, targetStatus);
    } catch (error) {
      toast(friendlyError(error));
      setStatus(`Ошибка работы с КП: ${friendlyError(error)}`, 'error');
    }
  });

  byId('leadCardSection')?.addEventListener('change', (event) => {
    if (event.target?.id !== 'offerCalculationId') return;
    selectedCalculationId = event.target.value || '';
    const button = byId('createOfferBtn');
    if (button) button.disabled = !selectedCalculationId || createBusy;
    const calculation = (v4State.calculations || []).find((item) => item.id === selectedCalculationId);
    const title = byId('offerTitle');
    if (calculation && title && !title.value.trim()) title.value = `КП: ${calculation.title || 'Расчёт'}`;
  });

  document.addEventListener('leader-v4:create-offer-from-calculation', (event) => {
    if (!requireV4Action(CRM_V4_ACTIONS.OFFERS_WRITE)) { toast('У вашей роли нет права формировать КП'); return; }
    const calculationId = event.detail?.calculationId || '';
    const eligible = offerEligibleCalculations(v4State.calculations || [], v4State.offers || []);
    if (!eligible.some((calculation) => calculation.id === calculationId)) {
      toast('Для этого расчёта КП уже создано или не указана сумма клиенту');
      return;
    }
    selectedCalculationId = calculationId;
    renderOffers();
    requestAnimationFrame(() => {
      byId('offerCreateForm')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
      byId('offerTitle')?.focus();
    });
  });

  document.addEventListener('leader-v4:lead-card-rendered', () => renderOffers());
  document.addEventListener('leader-v4:route-change', (event) => {
    activeOfferId = null;
    selectedCalculationId = '';
    const id = event.detail?.leadId || null;
    if (id) loadOffers(id);
    else { setState({ offers: [], offersBusy: false, offersError: null }); renderOffers(); }
  });
  document.addEventListener('leader-v4:crm-ready', () => { if (v4State.route.leadId) loadOffers(v4State.route.leadId); });
  subscribeState((state) => {
    if (state.calculations === previousCalculations) return;
    previousCalculations = state.calculations;
    if (byId('offersBox')) renderOffers();
  });
}

export function bootOffers() {
  if (window.LeaderV4OffersBooted) return;
  window.LeaderV4OffersBooted = true;
  previousCalculations = v4State.calculations;
  bindOfferEvents();
  renderOffers();
  if (v4State.crmReady && v4State.route.leadId) loadOffers(v4State.route.leadId);
}

document.addEventListener('DOMContentLoaded', bootOffers);
