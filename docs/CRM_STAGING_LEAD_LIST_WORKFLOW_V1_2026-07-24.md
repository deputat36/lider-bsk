# CRM staging lead list workflow v1

Дата: 24.07.2026

## Проблема

После перевода карточки заявки на staging Edge кнопки в общем списке заявок продолжали использовать старый browser-write маршрут:

- `Взять` напрямую обновляла `leader_leads`;
- браузер отдельно создавал событие истории;
- `В работу` также выполняла прямой update;
- список не содержал `updated_at`, необходимый для optimistic concurrency.

Это позволяло обойти уже проверенные серверные правила, если сотрудник начинал работу не из карточки, а из списка.

## Исправление

Точный staging-контур теперь перехватывает в capture phase:

- `button[data-action="take"]`;
- `button[data-action="work"]`.

Production-конфигурация не перехватывается и сохраняет прежнее поведение.

Перед командой staging UI:

1. Находит заявку в уже загруженном списке.
2. Дочитывает с сервера `id,status,assigned_to,next_contact_at,updated_at`.
3. Повторно строит действие по свежему состоянию.
4. Создаёт UUID idempotency key.
5. Отправляет allowlisted patch в `leader-crm-leads-staging`.
6. Обновляет локальное состояние только из серверного ответа.
7. Открывает карточку и обновляет список.

Старый bubble-обработчик останавливается через `stopImmediatePropagation`, поэтому browser-write и ручное событие истории на staging не выполняются.

## Серверные ограничения

Edge/RPC по-прежнему обеспечивает:

- self-assignment только текущему пользователю;
- запрет захвата уже назначенной заявки;
- optimistic concurrency по `expected_updated_at`;
- идемпотентность команды;
- атомарное изменение заявки и создание одного события;
- отсутствие browser-дубликата истории.

## Автоматические проверки

Добавлены:

- `lead-workflow-staging-list-model-v1.js` — чистая модель действий списка;
- `test_lead_workflow_staging_list_model.mjs` — сценарии take/work и отказов;
- `check_crm_staging_lead_list_workflow.py` — интеграционный контракт capture interception, свежей версии и production fallback;
- `crm-staging-lead-list-workflow-check.yml` — syntax, model и integration проверки.

## Граница изменения

Изменение активно только при точном staging URL `otulfnouybahfnsycxqn.supabase.co`.

Production `ofewxuqfjhamgerwzull` не изменён и не переключён.