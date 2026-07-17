function positiveTotal(calculation) {
  return Number(calculation?.client_total || 0) > 0;
}

function linkedOffer(calculation, offers = []) {
  if (calculation?.commercial_offer_id) {
    return { id: calculation.commercial_offer_id };
  }
  return (Array.isArray(offers) ? offers : [])
    .find((offer) => offer?.calculation_id === calculation?.id) || null;
}

export function calculationOfferNextAction(calculation = {}, offers = []) {
  if (!calculation?.id) return { kind: 'unavailable', label: 'Расчёт недоступен', enabled: false };
  if (calculation.order_id) return { kind: 'order', label: 'Заказ уже создан', enabled: false, targetId: calculation.order_id };
  const offer = linkedOffer(calculation, offers);
  if (offer) return { kind: 'offer', label: 'КП уже сформировано', enabled: false, targetId: offer.id };
  if (!positiveTotal(calculation)) return { kind: 'blocked', label: 'Укажите сумму клиенту', enabled: false };
  return { kind: 'create', label: 'Сформировать КП', enabled: true, calculationId: calculation.id };
}

export function offerEligibleCalculations(calculations = [], offers = []) {
  return (Array.isArray(calculations) ? calculations : [])
    .filter((calculation) => calculationOfferNextAction(calculation, offers).kind === 'create');
}

export function preferredOfferCalculationId(calculations = [], requestedId = '', offers = []) {
  const eligible = offerEligibleCalculations(calculations, offers);
  if (requestedId && eligible.some((calculation) => calculation.id === requestedId)) return requestedId;
  return eligible.length === 1 ? eligible[0].id : '';
}

export function offerCalculationAvailability(calculations = [], offers = []) {
  const source = Array.isArray(calculations) ? calculations : [];
  const eligible = offerEligibleCalculations(source, offers);
  if (eligible.length) {
    return {
      available: true,
      count: eligible.length,
      message: eligible.length === 1
        ? 'Единственный доступный расчёт выбран автоматически.'
        : 'Выберите версию расчёта, для которой ещё не создано КП.'
    };
  }
  if (!source.length) return { available: false, count: 0, message: 'Сначала сохраните расчёт.' };
  if (source.every((calculation) => ['offer', 'order'].includes(calculationOfferNextAction(calculation, offers).kind))) {
    return { available: false, count: 0, message: 'Для всех сохранённых расчётов уже создано КП или заказ.' };
  }
  return { available: false, count: 0, message: 'Нет свободного расчёта с положительной суммой клиенту.' };
}
