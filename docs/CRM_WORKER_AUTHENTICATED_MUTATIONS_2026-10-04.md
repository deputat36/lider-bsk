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

Локально 5/5 тестов: другой run/роль/владелец, незавершённые этапы, explicit
boolean для active switch, canonical handoff без цен, syntax всех трёх
сгенерированных browser modules. Существующий browser launcher test PASS.
Первый полный прогон: [37201019503](https://github.com/deputat36/lider-bsk/actions/runs/37201019503),
head `147a4ac5ca4ad4ef5844809276c9e445abb0f888`; результат ещё проверяется.

До первого deploy сохранён точный runtime bootstrap v32; staging v33 добавляет
helper module и временный доверенный branch для этого прогона. До merge
временные trust/trigger должны быть удалены из runtime и source. Для отката
вернуть bootstrap из base `a2f0949b` и убрать worker step/new helper scripts;
schema rollback не нужен. Cleanup — existing action с обязательной проверкой
нулевого residue и удаления временного Auth user, включая failed run.

Production operational cutover остаётся следующим отдельным блоком после
успешного полного доказательства; прямые production DML сейчас не закрывались.
