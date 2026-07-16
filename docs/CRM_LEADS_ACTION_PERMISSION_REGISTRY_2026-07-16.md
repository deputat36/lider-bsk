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

`owner` и `admin` используют wildcard. `manager` получает только значения из текущего registry.

После active-profile и office-role gate функция:

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
- owner/admin/manager role contract;
- порядок guards до бизнес-вызовов;
- наличие раннего и финального `unknown_action`.

## Граница

Source-only. Production Supabase не изменяется.

Live функция остаётся `leader-crm-leads v12`. Deploy, SQL, RLS, Auth, grants и данные не меняются. Отдельными этапами остаются role-specific response projections, staging role tests и production approval.
