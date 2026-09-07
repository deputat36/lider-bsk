export const OFFER_CLIENT_PRIVACY_V1 = 'offer-client-privacy-v1-20260907';

function text(value) {
  return String(value ?? '').trim();
}

export function normalizeIncludeClientDetails(value) {
  return value === true;
}

export function offerGreeting(lead = {}, includeClientDetails = false) {
  const name = text(lead?.name);
  return normalizeIncludeClientDetails(includeClientDetails) && name
    ? `Здравствуйте, ${name}!`
    : 'Здравствуйте!';
}

export function offerClientIdentityLines(lead = {}, includeClientDetails = false) {
  if (!normalizeIncludeClientDetails(includeClientDetails)) return [];
  const lines = [];
  const name = text(lead?.name);
  const phone = text(lead?.phone);
  if (name) lines.push(`Клиент: ${name}`);
  if (phone) lines.push(`Телефон: ${phone}`);
  return lines;
}

export function storedOfferClientDetails(offer = {}) {
  const fullText = String(offer?.full_text ?? '');
  const result = { include: false, name: '', phone: '' };
  for (const line of fullText.split(/\r?\n/)) {
    const normalized = line.trim();
    if (!result.name && normalized.startsWith('Клиент:')) {
      result.name = normalized.slice('Клиент:'.length).trim();
      result.include = true;
    }
    if (!result.phone && normalized.startsWith('Телефон:')) {
      result.phone = normalized.slice('Телефон:'.length).trim();
      result.include = true;
    }
  }
  return result;
}

export function storedOfferIncludesClientDetails(offer = {}) {
  return storedOfferClientDetails(offer).include;
}

export function offerClientPrivacyLabel(includeClientDetails = false) {
  return normalizeIncludeClientDetails(includeClientDetails)
    ? 'С данными клиента'
    : 'Без данных клиента';
}

export function offerCreateSummary({ calculation = null, includeClientDetails = false, validUntil = '' } = {}) {
  return {
    calculationTitle: text(calculation?.title) || 'Расчёт не выбран',
    total: Number(calculation?.client_total || 0),
    privacyLabel: offerClientPrivacyLabel(includeClientDetails),
    validUntil: text(validUntil),
    ready: Boolean(calculation?.id) && Number(calculation?.client_total || 0) > 0,
  };
}
