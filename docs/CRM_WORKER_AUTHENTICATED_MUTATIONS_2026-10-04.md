# Авторизованные команды рабочих ролей — 04.10.2026

## Scope

Репозиторий `deputat36/lider-bsk`, staging `otulfnouybahfnsycxqn`.
Production `ofewxuqfjhamgerwzull` не изменяется. Новых migrations,
workflow, постоянных Auth users или глобальных Auth/Storage настроек нет.

Существующий E2E проверял чтение очередей и отказы рабочих ролей, но не
выполнение работы: к worker step финансовый сценарий уже закрывал заказ.
Теперь существующий workflow создаёт второй синтетический заказ под тем же
лидом и временным пользователем; существующий cleanup удаляет оба заказа.

## Реальный путь

1. Manager bootstrap создаёт открытый синтетический заказ и design task через
   canonical create RPC, используя существующую синтетическую потребность.
2. Designer входит через Auth, начинает работу через Edge API и передаёт
   ссылку на макет из формы рабочей очереди в браузере.
3. Manager согласует проверенный макет и создаёт production job через
   canonical RPC без финансовых ключей.
4. Contractor записывает рабочий комментарий через Edge API и переводит
   задание «В производстве» → «Готово» из карточки в браузере.
5. Manager создаёт installation job только после готовности производства.
6. Installer записывает рабочий комментарий через Edge API и переводит
   монтаж «В работе» → «Выполнен» из карточки в браузере.
7. Manager inspect проверяет конечные статусы и ровно четыре события на
   каждое задание. Повторы не должны добавлять события.

Для каждой роли: retry с прежним и новым request_id; stale revision с новым
ключом; replay после отключения профиля; чужие команды и прямой вызов
service-only RPC запрещены; финансовые поля запрещены в чтении/ответах.
После inactive probe профиль включается в finally, затем выполняется UI.
Команда для replay хранится только в приватном RUNNER_TEMP и удаляется;
OIDC не передаётся в API/browser children, секреты не входят в evidence.

## Ограничения bootstrap

Существующая проверка подписи GitHub OIDC сохранена. Новые действия требуют
совпадения synthetic_marker и run_key профиля с текущим signed run; handoff
требует активного manager и единственного заказа этого пользователя/лида
с точным синтетическим именем. Caller не передаёт произвольные entity IDs.
Продвижение запрещено без reviewed design / ready production.
`verify_jwt=false` сохранён: функция использует собственную GitHub OIDC
authentication, а не пользовательский Supabase JWT.

## Проверки и rollback

Локально 6/6 тестов PASS: другой run/роль/владелец, незавершённые этапы,
explicit boolean для active switch, canonical handoff без цен и точный статус
«Согласовано», syntax и разрешение относительных imports всех трёх browser
modules. Существующие browser launcher и worker queue access tests PASS.

Полный authenticated API + browser прогон
[37208075574](https://github.com/deputat36/lider-bsk/actions/runs/37208075574)
на head `a0fefa15b4ba2eb55389835c3e01a5904da6eb33` — SUCCESS.
Для designer, contractor и installer: positive_api, positive_ui,
inactive_replay_denied = true; API evidence также подтверждает idempotent
replay, stale denial, wrong-role denial, service-only RPC denial и response
privacy. Manager inspect: completed=true, audit counts design/production/
installation = 4/4/4. Авторизованный браузерный прогон выполнен на desktop;
мобильная визуальная проверка этим прогоном не подтверждается.

Cleanup evidence: auth_user_deleted=true, все 24 категории residue=0.
Независимый read-only staging postflight по префиксу этого run подтвердил
8/8 нулевых результатов: profiles, orders, leads, Auth users, design tasks,
production jobs, installation jobs, command receipts. Failed runs также
очищены. Ошибки первых прогонов устранены: browser import теперь указывает
на assets/v4/supabase-client.js; manager handoff использует canonical
«Согласовано» вместо неверного «Согласована».

До первого deploy сохранён точный runtime bootstrap v32. Финальный staging
bootstrap v36 содержит helper и исправления; временный доверенный worker
branch удалён из runtime и source, временный push trigger тоже удалён.
Для отката вернуть bootstrap из base `a2f0949b` и убрать worker step/new
helper scripts; schema rollback не нужен. Cleanup — existing action с
обязательной проверкой нулевого residue и удаления временного Auth user.

Production operational cutover остаётся следующим отдельным блоком:
свежий preflight и staging proof кандидатов, scoped private backup,
исполняемый rollback/postflight, закрытие direct DML/TRUNCATE и проверка
read ACL, затем frontend gates. Production в этом блоке не изменялась;
публичные формы и реальные финансовые записи не использовались.
