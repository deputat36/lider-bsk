# Staging-проверка «заявка → заказ» — 2026-07-30

## Фактический результат

Подготовлен единый транзакционный acceptance-сценарий для staging-проекта
`otulfnouybahfnsycxqn`. Он проверяет заявку, ответственного и следующий контакт,
повторное чтение потребности, две неизменяемые версии расчёта, изменение цены и
скидки, себестоимость, дополнительный расход, итог клиенту, КП из точной версии,
атомарное создание заказа, перенос позиций и ключевых реквизитов, повтор команды
без дубля и повторное чтение заказа.

Сценарий использует только UUID, телефон и тексты с префиксом
`LIDER-E2E-20260730`, выполняется внутри `BEGIN`/`ROLLBACK`, а после rollback
отдельно проверяет нулевой остаток по заявке, клиенту, расчётам, КП и заказу.

## Статус запуска

Source-проверка сценария проходит. Фактический удалённый запуск заблокирован
окружением исполнителя: в контейнере отсутствуют `psql`, Supabase CLI, staging
database URL/JWT и временный staging Auth user. Ранее зафиксированный staging
deployment также указывает на отсутствие Auth users. Поэтому утверждать, что
цепочка фактически дошла до заказа или что удалённая очистка состоялась, нельзя.

Точная следующая операция: запустить файл через `psql -v ON_ERROR_STOP=1` с
временным staging-доступом. Успешный запуск заканчивается notice
`cleanup verified: zero residue`. Production-проект `ofewxuqfjhamgerwzull` не
использовался и не изменялся; production cutover не выполнялся.

## Компоненты цепочки

- карточка заявки и потребности: `leader_leads`, `leader_lead_needs`, CRM v4;
- версии: `leader_create_calculation_version_rpc`, `leader_lead_calculations`,
  `leader_lead_calculation_items`;
- КП: `leader_create_offer_from_calculation_rpc`, `leader_commercial_offers`;
- заказ: `leader_create_order_from_offer_rpc`, `leader_orders`,
  `leader_order_items`, события КП и история статуса заказа.

Новых production-изменений, DDL/DML, тестовых production-строк и изменений
`nav_*`/`parket_*` нет.
