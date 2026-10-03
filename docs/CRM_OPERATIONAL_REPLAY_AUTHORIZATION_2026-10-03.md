# Производство и монтаж: fresh authorization и минимальный ответ

03.10.2026, PR569. Существующие команды/архитектура сохранены.

## Исправленный риск

Production create/update RPC возвращали success receipt до свежей проверки
production.write и orders.update для внутреннего комментария. Layout wrapper
читал заказ/макет до authorization. Это позволяло отключённому профилю или
профилю со снятыми правами получить прежний ответ при direct server retry.
Create response дополнительно содержал финансовые поля производства/монтажа.

Две staging migrations с CLI-generated именами в `supabase/staging-migrations/`:
`20261003184404_operational_replay_authorization_v1.sql` и
`20261003185613_operational_response_projection_v1.sql` применены только к
`otulfnouybahfnsycxqn`. Они сохраняют SECURITY INVOKER, service-only EXECUTE,
канонический bridge/matrix, locking, числовую validation, audit и business flow.
Права проверяются перед replay/read; receipt actor/hash сравниваются явно;
retry возвращает актуальный request_id. Финансовые/private поля исключаются
также из ответа старого receipt без переписывания сохранённой истории.

Upgrade атомарно проверяет fingerprint каждого исходного runtime: неизвестное
расхождение останавливает применение. В CI воспроизведено реальное staging
форматирование installation exception handler; business semantics не изменены.
Это staging upgrade, не migration для db push в production.

## Доказательства

`tools/build_operational_replay_test.py` переиспользует существующие acceptance
сценарии заказ → производство и производство → монтаж. Четыре positive
create/update, новый request_id, отключённый профиль, смена роли, потеря права
на внутренний комментарий при сохранённом production.write, actor mismatch,
исторический receipt с private fields и browser EXECUTE denial: staging SQL PASS.
Все synthetic данные в одной транзакции с ROLLBACK; независимый residue SELECT
подтверждает 0. Auth users не создавались; Edge и Auth/Storage не менялись.
`--staging-test` строит только transaction fixtures для уже обновлённого staging;
обычный режим — полный disposable PostgreSQL proof, включённый в существующий CI.

Полный authenticated browser E2E из PR568 не повторялся. Новый результат — SQL
command/ACL proof, не доказательство worker browser mutation или production UI.

## Production и следующий этап

Read-only preflight: production/installation jobs = 0, operational RPC отсутствуют.
Production в PR569 не менялся. Следующий scoped cutover должен использовать
обновлённые команды, минимальные projections, действующий общий core и новый
snapshot; исторический installation rollout нельзя применять вслепую.
До activation нужны positive authenticated worker commands/UI, согласованный
lock order job/order, closed/archive guards и proof финансовых patch permissions;
проверка create response не означает завершения всех legacy read/write прав.
#381 и реальные бизнес-строки не изменялись. Owner input для этого исправления
не требуется; обычная разработка продолжается автономно.
