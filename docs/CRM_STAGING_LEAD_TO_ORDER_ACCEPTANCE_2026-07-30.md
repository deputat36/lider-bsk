# Staging-проверка «заявка → заказ» — 2026-07-30

## Фактический результат

Подготовлены staging-only compatibility migration, read-only schema preflight и
единый транзакционный acceptance-сценарий для проекта `otulfnouybahfnsycxqn`.
Migration добавляет отсутствующие минимальные таблицы `leader_clients`,
`leader_order_items`, две колонки потребности и канонический
`leader_create_order_from_offer_rpc(jsonb)` из main. Сценарий проверяет заявку, ответственного и следующий контакт,
повторное чтение потребности, две неизменяемые версии расчёта, изменение цены и
скидки, себестоимость, дополнительный расход, итог клиенту, КП из точной версии,
атомарное создание заказа, перенос позиций и ключевых реквизитов, повтор команды
без дубля и повторное чтение заказа.

Сценарий использует только UUID, телефон и тексты с префиксом
`LIDER-E2E-20260730`, выполняется внутри `BEGIN`/`ROLLBACK`, а после rollback
отдельно проверяет нулевой остаток по заявке, клиенту, расчётам, КП и заказу.

## Статус запуска

Source-проверка файлов проходит. По указанию технической приёмки migration и
acceptance SQL удалённо не запускались. Поэтому документ не утверждает, что
runtime-цепочка дошла до заказа или что удалённая очистка уже состоялась.

Точная следующая операция: применить compatibility migration, выполнить catalog
preflight и только затем запустить acceptance SQL. Успешный запуск заканчивается notice
`cleanup verified: zero residue`. Production-проект `ofewxuqfjhamgerwzull` не
использовался и не изменялся; production cutover не выполнялся.

## Компоненты цепочки

- карточка заявки и потребности: `leader_leads`, `leader_lead_needs`, CRM v4;
- версии: `leader_create_calculation_version_rpc`, `leader_lead_calculations`,
  `leader_lead_calculation_items`;
- КП: `leader_create_offer_from_calculation_rpc`, `leader_commercial_offers`;
- заказ: `leader_create_order_from_offer_rpc`, `leader_orders`,
  `leader_order_items`, события КП и история статуса заказа.

Preflight читает системный каталог staging и останавливает запуск с перечнем
отсутствующих таблиц, колонок и RPC. Текстовая source-проверка отдельно доказывает,
что определение order RPC дословно взято из канонической migration main.

Новых production-изменений, DDL/DML, тестовых production-строк и изменений
`nav_*`/`parket_*` нет.
