# Action permission registry для `leader-crm-leads`

Дата: 16 июля 2026 года.

## Цель

Каждое business action generic Edge source получает явный canonical permission key через `ACTION_PERMISSION`.

Mapping:

- dashboard → leads.read;
- list → leads.read;
- list_orders → orders.read;
- create → leads.create;
- update → leads.update;
- ensure_client → clients.write;
- create_order → orders.create;
- create_order_from_offer → orders.create.

`owner` и `admin` используют wildcard. `manager` получает значения текущего registry. `accountant` получает только `orders.read`, которое можно использовать исключительно через narrow action `list_orders` и role-specific financial projection.

После active-profile и role/action gate функция:

1. находит permission по action;
2. возвращает `unknown_action`, если mapping отсутствует;
3. проверяет permission до ownerId и business dispatch;
4. возвращает `403 forbidden`, если роль не имеет permission.

Так новые или забытые команды fail closed и не получают доступ автоматически.

`ensure_profile` остаётся отдельным pending-profile bootstrap и не входит в business registry.

## Проверка

`tools/check_crm_leads_action_permissions.py` сверяет:

- точный action → permission mapping;
- соответствие mapping реальным dispatch-командам;
- наличие permission keys в browser registry;
- owner/admin/manager contract;
- accountant → только orders.read;
- порядок guards до бизнес-вызовов;
- наличие раннего и финального `unknown_action`.

Role-specific SELECT fields для manager и accountant отдельно контролирует `tools/check_crm_leads_order_list_projections.py`.

## Граница

Source-only. Production Supabase не изменяется.

Live функция остаётся `leader-crm-leads v12`. Deploy, SQL, RLS, Auth, grants и данные не меняются. Отдельными этапами остаются staging role tests, generic `leader-crm-orders` accountant write contract и production approval.
