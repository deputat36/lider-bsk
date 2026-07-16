# Generic-доступ к заявкам только для офисных ролей

Дата: 16 июля 2026 года.

## Изменение

Source функции `leader-crm-leads` разрешает широкий набор бизнес-действий только ролям `owner/admin/manager`.

Канонический список ролей остаётся полным: owner, admin, manager, accountant, designer, installer, contractor.

Для accountant действует единственное узкое исключение: `list_orders` с permission `orders.read` и отдельной финансовой проекцией. Accountant не добавлен в широкий allowlist и не получает dashboard, лиды, клиентов или действия создания заказа.

Designer, installer, contractor и неизвестные значения получают `403 forbidden` до обработки заявок, клиентов и заказов.

## `ensure_profile`

`ensure_profile` остаётся отдельным bootstrap-действием перед role gate. Оно требует пользователя Supabase Auth и создаёт только ожидающий профиль с `role=manager` и `is_active=false`. Такой профиль не получает доступ к данным до отдельной активации.

## Автоматическая проверка

`tools/check_crm_leads_restrict_generic_roles.py` проверяет:

- точный список семи канонических ролей;
- широкий allowlist `owner/admin/manager`;
- единственное accountant-исключение `list_orders`;
- порядок `ensure_profile → checkUser → role guard → action dispatch`;
- сохранение `is_active=false` для нового профиля;
- отказ restricted-ролям до бизнес-действий;
- сохранение ответа `unknown_action` для разрешённых ролей.

## Граница

Source-only. Production Supabase не изменяется.

Live функция остаётся `leader-crm-leads v12`. Edge deployment, SQL, RLS, Auth, grants и данные не меняются. Следующие отдельные этапы: staging role tests, generic `leader-crm-orders` accountant update contract и production approval.
