import '../../../../assets/leader-service-catalog.js?v=1';

export function leadDirectionLabel(lead = {}) {
  const service = globalThis.LeaderServiceCatalog.find(lead.service);
  return service ? globalThis.LeaderServiceCatalog.directions[service.direction] : '';
}

// Public forms append technical attribution before the client's own words.
// Keep the complete message available, but start the card with the actual task.
export function leadCustomerTask(lead = {}) {
  const message = String(lead.message || '').trim();
  if (!message.startsWith('Источник: сайт РА Лидер\n')) return message || lead.service || 'Уточните задачу при первом контакте.';
  const match = message.match(/(?:^|\n)Задача клиента:\s*([\s\S]*?)(?=\n(?:Город|Бизнес\/объект|Удобная связь|Контакт для выбранного способа|Количество\/формат|Срок|Макет|Доставка\/монтаж|Бюджет):|$)/);
  return match?.[1]?.trim() || lead.service || 'Уточните задачу при первом контакте.';
}
