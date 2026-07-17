import { deriveLeadAnalytics, normalizeLeadLandingPage } from './lead-analytics-normalization.js';

function id(value) {
  return String(value || '').trim();
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function leadIdSet(rows = []) {
  return new Set(rows.map((row) => id(row?.lead_id)).filter(Boolean));
}

function ordersByLead(rows = []) {
  const result = new Map();
  rows.forEach((order) => {
    const leadId = id(order?.lead_id);
    if (!leadId) return;
    if (!result.has(leadId)) result.set(leadId, []);
    result.get(leadId).push(order);
  });
  return result;
}

function groupRows(rows, getLabel) {
  const groups = new Map();
  rows.forEach((row) => {
    const label = String(getLabel(row) || 'Не указано');
    if (!groups.has(label)) {
      groups.set(label, { label, leads: 0, calculations: 0, offers: 0, orders: 0, plannedRevenue: 0 });
    }
    const group = groups.get(label);
    group.leads += 1;
    group.calculations += row.hasCalculation ? 1 : 0;
    group.offers += row.hasOffer ? 1 : 0;
    group.orders += row.hasOrder ? 1 : 0;
    group.plannedRevenue += row.plannedRevenue;
  });

  return [...groups.values()]
    .map((group) => Object.freeze({
      ...group,
      orderConversionPercent: group.leads ? Math.round((group.orders / group.leads) * 100) : 0,
    }))
    .sort((a, b) => b.orders - a.orders
      || b.plannedRevenue - a.plannedRevenue
      || b.offers - a.offers
      || b.calculations - a.calculations
      || b.leads - a.leads
      || a.label.localeCompare(b.label, 'ru'));
}

export function buildLeadAttributionFunnel(leads = [], calculations = [], offers = [], orders = []) {
  const calculationLeadIds = leadIdSet(calculations);
  const offerLeadIds = leadIdSet(offers);
  const linkedOrders = ordersByLead(orders);
  const rows = leads.map((lead) => {
    const leadId = id(lead?.id);
    const analytics = deriveLeadAnalytics(lead);
    const leadOrders = linkedOrders.get(leadId) || [];
    return Object.freeze({
      leadId,
      sourceCategory: analytics.sourceCategory,
      landingPage: normalizeLeadLandingPage(lead),
      hasCalculation: calculationLeadIds.has(leadId),
      hasOffer: offerLeadIds.has(leadId),
      hasOrder: leadOrders.length > 0,
      plannedRevenue: leadOrders.reduce((sum, order) => sum + number(order?.client_total), 0),
      hasRequestId: Boolean(id(lead?.request_id)),
      hasPageReference: Boolean(id(lead?.source_page_path) || id(lead?.page_url)),
      hasUtmSource: Boolean(id(lead?.utm_source)),
    });
  });

  const totalLeads = rows.length;
  const calculationLeads = rows.filter((row) => row.hasCalculation).length;
  const offerLeads = rows.filter((row) => row.hasOffer).length;
  const orderLeads = rows.filter((row) => row.hasOrder).length;
  const plannedRevenue = rows.reduce((sum, row) => sum + row.plannedRevenue, 0);

  return Object.freeze({
    totalLeads,
    calculationLeads,
    offerLeads,
    orderLeads,
    plannedRevenue,
    orderConversionPercent: totalLeads ? Math.round((orderLeads / totalLeads) * 100) : 0,
    coverage: Object.freeze({
      requestId: rows.filter((row) => row.hasRequestId).length,
      pageReference: rows.filter((row) => row.hasPageReference).length,
      utmSource: rows.filter((row) => row.hasUtmSource).length,
    }),
    bySource: Object.freeze(groupRows(rows, (row) => row.sourceCategory)),
    byPage: Object.freeze(groupRows(rows, (row) => row.landingPage)),
  });
}
