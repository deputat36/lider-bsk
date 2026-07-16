# Role-specific проекции `list_orders`

Дата: 16 июля 2026 года.

## Цель

Generic action `leader-crm-leads:list_orders` использует service-role чтение `leader_orders`. Один широкий SELECT нельзя безопасно применять для manager и accountant: этим ролям нужны разные данные.

## Допуск по ролям

- owner/admin — разрешён существующий административный набор полей;
- manager — разрешён `orders.read` и клиентско-операционная проекция;
- accountant — разрешён только action `list_orders` с permission `orders.read`;
- designer, installer, contractor и неизвестные роли — `403 forbidden`.

Accountant остаётся вне широкого набора `owner/admin/manager`. Узкое исключение действует только для `list_orders`. Dashboard, список заявок, изменение заявок, создание клиента и создание заказа для accountant запрещены.

## Проекция manager

Manager получает:

- ID и номер заказа;
- даты создания и изменения;
- название проекта;
- имя и `client_phone` для связи с клиентом;
- статус и срок;
- источник;
- статусы макета, производства и монтажа;
- приоритет, текущий этап, следующее действие и прогресс.

Manager не получает:

- `payment_status`;
- `client_total`;
- `contractor_cost`;
- `profit`;
- `prepayment`;
- `balance`;
- внутренний JSON заказа.

## Проекция accountant

Accountant получает:

- ID и номер заказа;
- даты создания и изменения;
- название проекта и статус;
- `payment_status`;
- срок;
- `client_total`;
- `contractor_cost`;
- `prepayment`;
- `balance`.

Accountant не получает телефон клиента, lead/client identifiers, источник, дизайн-, производственные и монтажные поля, комментарии, исполнителей, `profit` и JSON `data`.

## Порядок проверки

Edge source выполняет:

1. JWT и active-profile check;
2. narrow role/action gate;
3. canonical permission check `orders.read`;
4. выбор SELECT-проекции через `orderListFields(profile)`;
5. отказ при отсутствии проекции;
6. service-role REST-запрос только с выбранными полями.

## Автоматический контроль

`tools/check_crm_leads_order_list_projections.py` проверяет:

- точный набор manager и accountant fields;
- отсутствие финансовых полей у manager;
- отсутствие контактов и производственных полей у accountant;
- единственное accountant-исключение `list_orders`;
- выбор и проверку projection до REST;
- связь с RBAC specification и workflow.

## Граница

Production Supabase не изменён.

Не выполнялись Edge deploy, SQL, migrations, RLS, grants, Auth или изменения данных. Live функция остаётся `leader-crm-leads v12`. Перед production deploy необходимы staging role tests и отдельное явное разрешение.
