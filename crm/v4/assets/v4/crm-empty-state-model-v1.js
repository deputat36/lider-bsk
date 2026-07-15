const TEXT = Object.freeze({
  leads: Object.freeze({
    loading: ['Загружаю заявки', 'Получаем последние обращения и применяем сохранённые фильтры.'],
    error: ['Заявки не загрузились', 'Проверьте соединение и повторите загрузку. Данные в CRM не изменялись.'],
    initial: ['Заявки ещё не загружены', 'После входа список загрузится автоматически. Можно запустить загрузку вручную.'],
    filtered: ['По этим условиям заявок нет', 'Сбросьте фильтры или измените поиск, чтобы увидеть остальные обращения.'],
    empty: ['Заявок пока нет', 'Новые обращения с сайта и вручную созданные заявки появятся в этом списке.']
  }),
  orders: Object.freeze({
    loading: ['Загружаю связанные заказы', 'Проверяем связи заявки, расчёта и коммерческого предложения.'],
    error: ['Заказ не загрузился', 'Связи сохранены. Вернитесь к заявке и повторите открытие карточки.'],
    initial: ['Заказы появятся в карточке заявки', 'Откройте заявку, чтобы увидеть связанный заказ и контроль его выполнения.'],
    filtered: ['Заказ ещё нельзя создать', 'Сначала подготовьте расчёт и согласуйте коммерческое предложение.'],
    empty: ['Связанный заказ ещё не создан', 'После согласования КП форма создания заказа появится ниже.']
  }),
  finance: Object.freeze({
    loading: ['Загружаю финансовый контроль', 'Собираем суммы, себестоимость, прибыль, оплаты и финансовые риски.'],
    error: ['Финансовые данные загрузились не полностью', 'Обновите раздел. Уже сохранённые заказы и оплаты не изменялись.'],
    initial: ['Финансовый контроль ещё не загружен', 'Нажмите «Обновить финансы», чтобы получить актуальную сводку по заказам.'],
    filtered: ['В этой группе нет заказов', 'Это хороший знак: сейчас нет заказов, требующих внимания по этому критерию.'],
    empty: ['Финансовых данных пока нет', 'Сводка появится после создания заказов и заполнения сумм.']
  }),
  audit: Object.freeze({
    loading: ['Загружаю аудит заявок', 'Проверяем последние события публичной формы и номера обращений.'],
    error: ['Аудит заявок не загрузился', 'Повторите загрузку. Публичные заявки и журнал аудита не изменялись.'],
    initial: ['Аудит ещё не загружен', 'Откройте раздел повторно или нажмите «Обновить аудит».'],
    filtered: ['По этому фильтру событий нет', 'Очистите поиск или покажите все статусы аудита.'],
    empty: ['Событий аудита пока нет', 'После отправки публичной формы здесь появятся принятые, повторные и отклонённые события.']
  })
});

function normalized(value) {
  return String(value || '').trim().toLowerCase().replace(/ё/g, 'е');
}

export function crmEmptyStateContext({ containerId = '', financeColumn = false } = {}) {
  if (containerId === 'leadsList') return 'leads';
  if (containerId === 'ordersBox') return 'orders';
  if (containerId === 'financeControlContent' || financeColumn) return 'finance';
  if (containerId === 'publicLeadAuditContent') return 'audit';
  return '';
}

export function crmEmptyStateKind({ context = '', text = '', isError = false, financeColumn = false } = {}) {
  const value = normalized(text);
  if (isError || value.includes('ошиб') || value.includes('не загрузил') || value.includes('не загрузился') || value.includes('не загрузились')) return 'error';
  if (value.includes('загружаю') || value.includes('загрузка')) return 'loading';
  if (financeColumn) return 'filtered';
  if (value.includes('еще не загруж') || value.includes('ещё не загруж') || value.includes('загрузится при открытии') || value.includes('загрузятся после открытия') || value.includes('загрузятся автоматически')) return 'initial';
  if (value.includes('по выбранным условиям') || value.includes('не найдено') || value.includes('в этой группе') || value.includes('в группе пока нет')) return 'filtered';
  if (context === 'orders' && (value.includes('сначала согласуйте') || value.includes('повторное создание заблокировано'))) return 'filtered';
  return 'empty';
}

function defaultAction(context, kind) {
  if (context === 'leads' && ['error', 'initial', 'empty'].includes(kind)) {
    return Object.freeze({ label: 'Обновить заявки', attribute: 'data-retry-leads' });
  }
  if (context === 'leads' && kind === 'filtered') {
    return Object.freeze({ label: 'Сбросить фильтры', attribute: 'data-reset-lead-filters' });
  }
  if (context === 'finance' && ['error', 'initial', 'empty'].includes(kind)) {
    return Object.freeze({ label: 'Обновить финансы', attribute: 'data-finance-control-refresh' });
  }
  if (context === 'audit' && ['error', 'initial', 'empty'].includes(kind)) {
    return Object.freeze({ label: 'Обновить аудит', attribute: 'data-public-lead-audit-refresh' });
  }
  if (context === 'audit' && kind === 'filtered') {
    return Object.freeze({ label: 'Очистить фильтр', attribute: 'data-public-lead-audit-clear-empty' });
  }
  return null;
}

export function crmEmptyStateModel({
  context = '',
  text = '',
  isError = false,
  financeColumn = false,
  columnTitle = ''
} = {}) {
  const safeContext = Object.prototype.hasOwnProperty.call(TEXT, context) ? context : '';
  if (!safeContext) return null;
  const kind = crmEmptyStateKind({ context: safeContext, text, isError, financeColumn });
  const [title, description] = TEXT[safeContext][kind] || TEXT[safeContext].empty;
  const icon = kind === 'loading' ? '↻' : kind === 'error' ? '!' : kind === 'filtered' && financeColumn ? '✓' : kind === 'filtered' ? '⌕' : '○';
  const tone = kind === 'error' ? 'error' : kind === 'loading' ? 'loading' : financeColumn ? 'positive' : 'neutral';
  const rawDetail = String(text || '').trim();
  const showRawDetail = kind === 'error' || (kind === 'filtered' && !financeColumn);
  const detail = showRawDetail && rawDetail && rawDetail !== title ? rawDetail : '';
  const resolvedTitle = financeColumn && columnTitle ? `Нет: ${String(columnTitle).trim().toLowerCase()}` : title;
  return Object.freeze({
    context: safeContext,
    kind,
    tone,
    icon,
    title: resolvedTitle,
    description,
    detail,
    compact: financeColumn,
    action: defaultAction(safeContext, kind)
  });
}

export const CRM_EMPTY_STATE_CONTEXTS = Object.freeze(['leads', 'orders', 'finance', 'audit']);
