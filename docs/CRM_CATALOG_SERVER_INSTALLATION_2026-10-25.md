# Сервер управления прайсом установлен — 25.10.2026

Владелец ответил «Разрешаю» на конкретный запрос установки серверного пакета
прайса #587 в production `ofewxuqfjhamgerwzull`, с резервной копией и сохранением
69 цен. Это разрешение использовано для catalog SQL/ACL и JWT Edge. Прежняя
остановка установки `Invalid or expired requestState` в этом выполнении не
повторилась. Общий RBAC/receipt core повторно не устанавливался.

## Точный установленный пакет

- Исходный runtime checkpoint: main `485d43dde0ddbf8ee3581897b56a48ba1c30e46e`.
- Candidate: `supabase/production-candidates/20261014095201_catalog_management_production_v1.sql`.
  SHA256 `bf1a2cc9f425c1d0b0414d052fd217b157d08221b9ee79d9ac072649ed0ebd2f`.
- Повторная offline-сборка совпала побайтно; candidate/builder/RPC/Edge inputs
  не менялись с проверенного PR #587. Exact package/stop PostgreSQL proof этого
  PR остаётся применимым; новый production SQL не придумывался.
- Native migration history: version `20261025155115`, name
  `catalog_management_production_v1`; `apply_migration` вернул success.
- Перед изменениями создан private snapshot `catalog-management-20261014-v1`.
  Его каталог/price logs совпали с текущими после установки и после probe.
  Snapshot содержит данные и ACL/RLS/column metadata. Browser и service roles
  не могут читать backup.

## Права и совпадение функций

`public.leader_manage_catalog_rpc(jsonb)` — SECURITY INVOKER, фиксированный
пустой search_path, EXECUTE только service_role. MD5 фактического prosrc:
`df8f6a655667c66b81a6b0b9953be961`, совпадает с точным candidate.

`leader_private.leader_discard_catalog_command_receipt(uuid,uuid)` — узкий private
SECURITY DEFINER helper, фиксированный пустой search_path, EXECUTE только
service_role. MD5 prosrc `732357a66497bb3499aa6dff48ee461d`, совпадает с candidate.
Общий table-level DELETE для receipts не выдан. Роль/активность actor проверяются
canonical helper до replay; catalog.manage остаётся только owner/admin.

У anon/authenticated закрыты прямые table/column INSERT/UPDATE и DELETE двух
таблиц, а также EXECUTE обеих функций. RLS включён. SELECT каталога сохранён;
SELECT price logs использует canonical catalog.read. Нативный authenticated
RLS probe подтвердил чтение каталога/истории владельцем и отказ при browser
UPDATE и прямом RPC.

## JWT Edge

`leader-crm-catalog` v1 ACTIVE, verify_jwt=true. Production files `index.ts` и
`contract.ts`, полученные после deploy, побайтно совпали с проверенной сборкой.
Production project gate точный; staging ref в этих файлах отсутствует.
Deployed bundle SHA256:
`8d695dc35dd170de5a4760807fb979a9d056f870645d5a3e4b38cb54d93aae37`.
POST без Authorization получил HTTP 401 `UNAUTHORIZED_NO_AUTH_HEADER`.
Секреты не извлекались и не добавлялись в репозиторий.

## Нативные проверки и откат тестовых данных

`supabase/production-tests/20261025_catalog_management_postflight.sql` выполнил
через реально установленный RPC под service_role:

- create и exact replay без второго каталожного ряда/события;
- отказ при изменении payload с прежним ключом;
- update с проверкой старой/новой цены, наценки и actor в журнале;
- source_changed для заведомо старой revision и очистку in-progress receipt;
- forbidden для неизвестного actor и replay существующими неуправляющими ролями;
- чтение под authenticated RLS и запрет прямого browser write/RPC.

Использован существующий активный owner/admin. Профили, роли, Auth users и
пароли не менялись. Единственная новая позиция имеет случайное имя и существует
только внутри BEGIN/ROLLBACK вместе со своими logs/receipts. Внешний Auth/Edge
этим нативным SQL probe не подменяется.

Первый probe ошибочно ожидал разные updated_at у create/update внутри одной
транзакции. Существующий trigger `trg_leader_catalog_updated_at` использует now(),
поэтому отметка в таком тесте одинакова. Первый fixture полностью откатился;
отдельное чтение подтвердило 0 остатка. Исправлен только тест: stale revision
явно на секунду старее. Повторный native probe прошёл; trigger и рабочий RPC
не менялись ради теста.

После успешного ROLLBACK независимый SELECT подтвердил:

| Проверка | Результат |
| --- | --- |
| Каталог | 69 позиций |
| MD5 всего упорядоченного каталога до/после | `67ac8366d079173715e97f7c06965d47` |
| Price logs / catalog receipts | 0 / 0 |
| Probe rows / probe receipts | 0 / 0 |
| Scoped private snapshot | 1, совпадает с текущими данными |
| Заказы / оплаты / расходы | 2 / 1 / 0 |

Security advisors до/после совпали, кроме observed_at: 1 INFO и 2 прежних WARN,
новых предупреждений этим пакетом нет. Чужие nav-функции и общая Auth-настройка
не изменялись.
Прежние WARN: [authenticated SECURITY DEFINER functions](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
и [leaked password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Остановка и следующий шаг

Неразрушающий stop: `supabase/production-candidates/leader_catalog_management_stop_rollback.sql`,
SHA256 `e1606c98b5dd23954c4705e439200d23edae345e57c60de6cf98020243ef7176`.
Он отзывает EXECUTE двух новых функций и сохраняет каталог, историю, snapshot
и закрытые legacy browser writes. Exact stop проверен в disposable PostgreSQL
в #587; на работающем production сервере без причины не применялся.

Интерфейс сохраняет прежний staging gate: публикация документации не включает
запись в production. Для следующего этапа нужны authenticated Edge smoke под
настоящим пользовательским JWT и отдельный проверенный frontend opt-in обоих
интерфейсов. Нативный RPC/RLS probe и HTTP 401 не объявляются полным Auth→Edge→UI E2E.
Запросы подрядчикам, архив документов, возвраты и #381 этим пакетом не менялись.
