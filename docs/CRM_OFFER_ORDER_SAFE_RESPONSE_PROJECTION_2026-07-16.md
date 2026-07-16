# Безопасная проекция ответа создания заказа из КП

Дата: 16 июля 2026 года.

## Задача

Action `create_order_from_offer` вызывает `leader_create_order_from_offer_rpc` через service-role transport. Исторический RPC возвращает полные записи заказа и клиента. В них могут присутствовать клиентские контакты, финансовые показатели, внутренние комментарии, исполнители и JSON `data`.

Браузерный модуль `offer-order-create-v1.js` не нуждается в полном результате. Для продолжения интерфейсного сценария используются:

- `order.id`;
- операционные статусы заказа;
- `already_created`;
- `items_created`;
- необязательный список `link_errors`.

## Реализованный source-контракт

GitHub source `leader-crm-leads` больше не возвращает сырой результат RPC. Ответ проходит через `projectOfferOrderResult`.

Допустимые поля `order`:

- `id`;
- `order_number`;
- `project_name`;
- `status`;
- `deadline`;
- `layout_status`;
- `production_status`;
- `installation_status`;
- `created_at`;
- `updated_at`.

Допустимые поля верхнего уровня:

- `ok`;
- `already_created`;
- `order`;
- `items_created`;
- `link_errors`.

Если RPC не вернул успешный объект или в нём отсутствует ID заказа, Edge source возвращает `order_from_offer_projection_failed` вместо передачи необработанного результата.

## Что удалено из ответа

В браузер не передаются, среди прочего:

- `client_name` и `client_phone`;
- `client` целиком;
- `owner_id`, `client_id`, `lead_id`;
- `payment_status`, `client_total`, `contractor_cost`, `profit`, `prepayment`, `balance`;
- `layout_link`, комментарии и адрес монтажа;
- данные подрядчика и монтажника;
- внутренний JSON `data`.

Это не меняет саму транзакцию и не изменяет содержимое таблиц. Ограничение применяется только к HTTP-ответу Edge Function.

## Совместимость

Текущий browser caller продолжает:

- проверять `result.order?.id`;
- обновлять локальные связи по ID заказа;
- использовать `result.already_created`;
- показывать предупреждение при наличии `result.link_errors`;
- отправлять событие `leader-v4-order-updated` с минимальным объектом заказа.

Слушатели события либо используют `id/status`, либо запускают повторную загрузку данных.

## Автоматический контроль

`tools/check_crm_offer_order_safe_projection.py` проверяет:

- точный whitelist полей заказа и результата;
- отсутствие чувствительных полей внутри projection helper;
- запрет сырого `return json(200, await res.json())`;
- сохранение caller-совместимости;
- наличие focused workflow.

## Граница изменений

Production Supabase не изменён.

Не выполнялись:

- deploy `leader-crm-leads`;
- изменение RPC;
- SQL, DDL или DML;
- изменение RLS, grants, Auth или данных.

Перед production deploy необходимы staging-проверка action `create_order_from_offer`, проверка already-created сценария и отдельное явное разрешение.
