import '../../../../assets/leader-service-catalog.js?v=2';

// A reviewable first-need draft; it neither assigns a designer nor saves a record.
export function creativeNeedDraft(lead = {}, leadId = '') {
  if (!leadId || String(lead.id || '') !== String(leadId)) return null;
  const service = globalThis.LeaderServiceCatalog.find(lead.service);
  if (!service?.brief) return null;
  return {
    needType: 'Дизайн',
    title: service.label,
    description: String(lead.message || '').trim().slice(0, 3000),
    needDesign: true,
    designReason: `Результат по услуге «${service.label}». Согласовать форматы, состав исходников, срок и порядок правок.`,
    needInstallation: false
  };
}
