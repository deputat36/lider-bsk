# Проверка восстановления данных Leader — 01.11.2026

Этот пакет создаёт защищённый снимок 67 таблиц Leader и проверяет сохранность
данных в отдельном закрытом namespace staging. Это **data restore drill**;
проверка строк/типов/FK не доказывает полноценное аварийное восстановление CRM,
Auth, файлов, Edge, исходящих интеграций или полный RTO.

## Снимок

`tools/recovery/leader_data_restore.py:snapshot_sql` формирует один read-only
MVCC SELECT: актуальные данные/метаданные/ACL, исходники SQL functions,
триггеры/представления, миграционные версии Leader и cron. Исходные таблицы
и Auth не меняются. Числа внутри `data_json` остаются строковым представлением
PostgreSQL: JavaScript/Python float не используются для переноса numeric.

`pg_sequence` учитывает и обычную последовательность заказов, и скрытую для
старой information_schema inventory IDENTITY-последовательность номеров КП.
Последовательности не MVCC; их значения и максимальные сохранённые номера
проверяются отдельно, nextval вызывается только на восстановленных копиях.

Экспорт шифруется в PostgreSQL OpenPGP AES256 с MDC и случайным одноразовым
ключом данных. Через защищённый ответ этот ключ сразу оборачивается локальным
RSA-3072-OAEP-SHA256; закрытый RSA-ключ никогда не передаётся в SQL. Временный
ответ нельзя печатать, коммитить или сохранять в публичные artifacts. Для
получившегося ciphertext проверяются bytes/SHA256, затем независимые decrypt
GPG и SHA256 всего исходного payload. Закрытый ключ сохраняется отдельным
приватным файлом, в комплект ciphertext не включается. Один аккаунт хранения
не считается независимым каналом контроля доступа или внеплатформенной копией.

Локальный gpg-agent не может создавать сокеты в этой среде. Симметричный GPG
с explicit passphrase и отключённым cache работает без агента; это проверено
на synthetic probe. Поэтому RSA-оборачивание выполняется библиотекой
cryptography, а не обходом ограничений среды или скачиванием зависимостей.

## Изолированное испытание

1. Сохранить source remote и пройти CI текущего SHA. Native PostgreSQL proof
   встроен в существующий crm-recovery-check, отдельная БД leader_restore_test.
   Никакие рабочие записи или секреты туда не попадают.
2. Проверить source prod ofewxuqfjhamgerwzull и target stage otulfnouybahfnsycxqn,
   отсутствие leader_restore_drill_20261101, исходные counts и advisors.
3. По расшифрованному снимку `build` генерирует private prepare/load/finalize/
   verify/cleanup SQL. Каждый identifier/type/CHECK/FK проверяется; target может
   быть только leader_restore_drill_YYYYMMDD. Произвольный schema не принимается.
4. Через отдельную MCP migration создать только этот namespace и typed tables;
   атомарно закрыть schema/table/sequence ACL для PUBLIC/anon/authenticated/
   service_role, включить RLS. Source triggers/functions/rules/policies и
   нечисловые defaults не устанавливаются. Все FK remap структурно в namespace.
5. Private DML загружает явные значения колонок. Архивные backups, live config/
   salt/push keys и исходящие очереди исключены из **испытания**, но остаются в
   шифрованном snapshot. Полный список причин — EXCLUDED в инструменте/receipt.
   После неизвестного результата сначала verify, не повторять load вслепую.
6. Отдельной migration добавить/валидировать все FK после загрузки, в том числе
   циклические. Сравнить число и hash полного набора колонок каждой таблицы,
   NULL/JSON/arrays/numeric/микросекунды; проверить оба следующих номера,
   document counters и реальные отрицательные SELECT трёх ролей.
7. Убедиться, что нет ссылок/defaults/triggers на настоящее приложение,
   исходящих функций/cron или browser grants. Сверить настоящие staging/prod
   таблицы и cron с preflight.
8. Cleanup migration проверяет точный marker и удаляет точный список своих
   таблиц/последовательностей/schema только RESTRICT в одной транзакции. Любая
   внешняя зависимость (включая DEFAULT/rowtype/function) или неизвестный объект
   блокирует очистку целиком; CASCADE не используется.
   После unknown outcome — readback. Подтвердить ноль остатков и advisors.

## Установочный receipt

Защищённый snapshot создан одним SELECT 01.11.2026 06:55:03 UTC / 09:55 МСК:
67 таблиц,301 строка,79 SQL function sources,2 последовательности. Целый payload
1383478bytes/SHA256edac2e5e13eb160debb5c6ede5b93b589cd0c979553c5e245eae7a963631449e
прошёл независимый GPG decrypt и hash. Ciphertext и закрытый RSA key сохранены
раздельно и приватно. Приватные ссылки/строки/ключи в GitHub не включены.

Native exact source head5a9c181d:19/19 success; PostgreSQL run41283418373,
job124779788481. Исправлены обнаруженные тестами пропуск JSONB и совпадение
SQL alias с именем колонки; теперь проверяется полный состав row objects.
По независимому review cleanup использует только RESTRICT; environment guard,
оба counters и создание файлов0600/O_EXCL включены до реального испытания.

Реальное восстановление:67 typed tables/RLS,58 выбранных таблиц/290 строк;
9 таблиц/11 строк исключены из испытания (архивы,live config/queues), сохранены
в зашифрованном snapshot. Полные поля/hash,78 FK validated и оба sequence
state/parameters/next>max exact. Три реальные role-denials; schema/table/sequence
access отсутствует, включая service_role BYPASSRLS. Source triggers/functions/
views/rules и внешние default/CHECK dependencies0. На изолированной копии
следующие номера1006 и25 выше текущих максимумов1002 и24. Document tables и
counters пусты как в источнике; положительный выпуск реального документа не
проверялся этим сценарием.

Staging migration history: prepare20261101070747 / validate20261101070834 /
cleanup20261101085258. Первый запрос подтверждения cleanup истёк; readback
подтвердил наличие namespace и отсутствие cleanup history. Повторён тот же
ограниченный запрос; после подтверждения выполнен успешно. На08:54:34 UTC
namespace/relations0,Auth users0,50 настоящих staging таблиц и действующий
cron совпали с preflight. Все67 production таблиц/301 строка совпали со снимком;
production DML не выполнялся. Security/performance findings одинаковы до/после
(исключены только observed_at). Ожидание подтверждения не является RTO.

Machine receipt: contracts/leader-data-restore-drill-20261101.json. Это проверка
сохранности данных; Auth/файлы/Edge/config activation и полноценное восстановление
рабочей CRM остаются отдельными задачами.

## Источники

- https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
- https://www.postgresql.org/docs/current/pgcrypto.html
