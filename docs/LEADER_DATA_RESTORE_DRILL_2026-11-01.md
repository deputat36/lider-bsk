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
8. Cleanup migration проверяет точный marker namespace и запрещает удаление
   при внешнем FK/view/function dependency; удаляет только созданный namespace.
   После unknown outcome — readback. Подтвердить ноль остатков и advisors.

## Установочный receipt

До фактического выполнения ниже не заявляются установленный snapshot,
успешный staging restore, cleanup или время восстановления. Финальные hashes,
coverage/exclusions, версии migration history и результаты добавляются после
readback; приватные ID/данные/ключи не публикуются в GitHub.

## Источники

- https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
- https://www.postgresql.org/docs/current/pgcrypto.html
