# Accountant contract для `leader-crm-orders`

Дата: 16 июля 2026 года.

## Цель

Generic Edge source `leader-crm-orders` использует service-role REST для чтения и изменения заказов. Accountant должен работать с оплатами и финансовым контролем, но не получать широкий клиентский, производственный или внутренний payload заказа.

## Матрица действий

Accountant получает только:

- `list`;
- `update:payment_status`.

Accountant не получает:

- `update:status`;
- `update:layout_status`;
- `update:production_status`;
- `update:layout_comment`;
- `update:deadline`;
- `update:any`.

Смешанный update с `payment_status` и любым запрещённым полем полностью отклоняется до PATCH.

## Role-specific SELECT

Source использует `ORDER_FIELDS_BY_ROLE` и `orderFieldsForRole(profile)` как для list, так и для update response.

### Manager

Manager получает операционные данные:

- идентификатор и номер;
- даты;
- проект;
- имя и `client_phone`;
- статус, срок и источник;
- статусы макета, производства и монтажа;
- приоритет, этап, следующее действие и прогресс.

Manager не получает финансовые поля, включая `payment_status`, `client_total`, `contractor_cost`, `profit`, `prepayment` и `balance`.

### Accountant

Accountant получает:

- идентификатор и номер;
- даты;
- проект и статус;
- `payment_status`;
- срок;
- `client_total`;
- `contractor_cost`;
- `prepayment`;
- `balance`.

Accountant не получает client name/phone, lead/client IDs, источник, дизайн-, производственные и монтажные поля, комментарии, исполнителей, `profit` или JSON `data`.

### Owner/admin

Owner и admin сохраняют существующий административный `orderFields` contract. Этот пакет не расширяет их payload.

## Порядок защиты

Для list:

1. active profile;
2. permission `list`;
3. выбор projection по роли;
4. отказ при отсутствии projection;
5. service-role GET.

Для update:

1. active profile;
2. field-level permission для каждого запрошенного поля;
3. формирование whitelist patch;
4. `no_update_fields` при пустом patch;
5. выбор response projection;
6. service-role PATCH.

Matrix version обновлена до `20260716-edge-role-matrix-2`.

## Автоматическая проверка

`tools/check_crm_orders_accountant_projection.py` проверяет:

- точный accountant permission set;
- точные manager/accountant projections;
- запрет финансовых полей manager;
- запрет контактов и production/design data accountant;
- выбор projection до REST в list/update;
- согласованность с browser registry и RBAC specification.

## Граница

Production Supabase не изменён.

Live `leader-crm-orders` остаётся ACTIVE v2. Edge deploy, SQL, migrations, RLS, grants, Auth и данные не менялись. Перед production deploy необходимы staging role tests и отдельное явное разрешение.
