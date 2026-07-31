# Staging-проверка «заявка → заказ» — 2026-07-30

## Фактический результат

31 июля 2026 года фактически проверен staging-сценарий проекта
`otulfnouybahfnsycxqn`:

`заявка → потребность → расчёт v1 → расчёт v2 → КП → заказ`.

Перед запуском применены две staging-only migration:

- `lead_to_order_status_history_compat_20260730`;
- `lead_to_order_acceptance_compat_20260730`.

Они добавили только недостающий staging-контракт: историю статусов заказа,
`leader_clients`, `leader_order_items`, поля `client_id` и `need_installation`
потребности и канонический `leader_create_order_from_offer_rpc(jsonb)`.

Новые таблицы защищены RLS, закрыты от `anon` и `authenticated`, а доступ для
staging harness предоставлен только `service_role`.

## Что подтверждено runtime-проверкой

- заявка сохраняет ответственного и следующий контакт;
- потребность повторно читается без потери структурированных данных;
- расчёт v1 остаётся неизменным после создания v2;
- расчёт v2 получает номер версии 2;
- клиентская сумма v2 равна 2400;
- себестоимость v2 равна 1700;
- скидка и дополнительный расход сохраняются в снимках позиций;
- КП создаётся из точной версии v2;
- фактический ответ RPC КП корректно читается через `entity.id`;
- заказ получает правильную сумму, себестоимость, ответственного и источник;
- в заказ перенесены две позиции расчёта;
- повторный вызов создания заказа возвращает существующий заказ и не создаёт дубль;
- заказ повторно читается после создания.

## Очистка

Acceptance выполнялся внутри `BEGIN`/`ROLLBACK` с синтетическим префиксом
`LIDER-E2E-20260730`.

После rollback отдельно подтверждён нулевой остаток:

- заявок — 0;
- клиентов — 0;
- расчётов — 0;
- коммерческих предложений — 0;
- заказов — 0.

Итог runtime-проверки:

`lead-to-order acceptance: OK; cleanup verified: zero residue`.

## Компоненты цепочки

- заявка и потребность: `leader_leads`, `leader_lead_needs`;
- версии расчёта: `leader_create_calculation_version_rpc`,
  `leader_lead_calculations`, `leader_lead_calculation_items`;
- КП: `leader_create_offer_from_calculation_rpc`, `leader_commercial_offers`;
- заказ: `leader_create_order_from_offer_rpc`, `leader_orders`,
  `leader_order_items`, `leader_order_status_history`.

Catalog preflight прошёл перед acceptance. GitHub Actions, включая
`Staging lead-to-order acceptance contract`, прошли после исправления фактического
контракта ответа КП.

Production-проект `ofewxuqfjhamgerwzull` не изменялся. Production cutover не
выполнялся. Объекты `nav_*` и `parket_*` не затрагивались.
