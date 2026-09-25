# Специальные цены — #526

Первый расчёт и новые версии принимают цену 0 и отрицательную прибыль. Пользователь подтверждает бесплатную работу, убыток или работу в ноль; отмена не отправляет команду. Прибыль не заменяется нулём. Количество, конечность чисел, диапазоны цен, права, optimistic lock и idempotency обязательны.

## Staging

`20260925170826_calculation_special_prices.sql` заменяет только тела двух существующих функций после проверки точного md5 их определений. Владелец функций, invoker security, search_path и grants сохраняются. Исторические migrations остаются историческими, новый patch применяется после них.

Initial RPC дополнительно отклоняет null/NaN/Infinity и значения вне диапазонов version RPC. Оба RPC записывают `warning_level` и `warnings`; существующие расчёты, позиции и receipts не меняются. Audit использует существующие триггеры и command receipts.

## Production candidate и preflight

Production не изменялся. Перед rollout нужны отдельное разрешение и готовые prerequisites #202/#204: canonical server commands, роли, RLS, server-only grants, маршрут браузера. Не применять staging patch к production, в котором этих функций нет. Проверить `to_regprocedure`, определения/владельцев/grants, constraints и migration history; сделать согласованный backup функций и затрагиваемых таблиц. Этот patch — согласованное правило цен для общего rollout, а не самостоятельное разрешение deploy.

## Postflight

Проверить 0/убыток/ноль прибыли/положительную прибыль, отказ для qty=0, negative/NaN/Infinity/null prices; server warnings; immutable source; replay без дубля; stale reject; запрет прямого вызова private helper для anon/authenticated; wrong/inactive role. В staging пройти UI до заказа, производства и монтажа, затем cleanup с нулевым residue.

## Rollback

`supabase/staging-migrations/calculation_special_prices_rollback.sql` восстанавливает **точные прежние тела функций** после проверки md5 новых. Таблицы, grants, receipts и принятые версии не удаляются. Сохранённые специальные цены остаются валидными историческими записями. Перед rollback прекратить новые записи через изменяемые команды и сохранить определения функций. После rollback повторить permission/replay probes и сравнить исходные md5: initial `ba8ad5920edc71f1f6a9e4316dc3bd37`, version `7a68e970d4e0f528a46c83fc36d5b130`. При несовпадении preflight остановится; не отключать его.
