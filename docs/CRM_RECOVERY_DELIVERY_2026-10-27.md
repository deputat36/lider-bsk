# Завершение восстановления — 27.10.2026

Владелец поручил выполнить сохранённый план и итоговый аудит. Все связанные изменения ведутся в PR #596.

## Приём заявки

Actual source Edge проверен локально и в CI: 2000/2001/3000 символов сохраняются целиком; 3001 отклоняется до записи и rate-limit квоты. Есть deadline каждого backend вызова и точный повтор после потерянного ответа. Невалидный JSON/null закрыт. Ключи backend не попадают в браузер.

Staging migration leader_public_intake_runtime_v2 установлена после восстановления среды. Первая попытка вернула Invalid or expired requestState; независимое чтение подтвердило отсутствие config table/RPC/history. Повтор выполнен только после этой проверки и завершился success.

Actual staging leader-public-lead-acceptance v1: проверка staging-public-intake-1793125122632 подтвердила 200/200/200/400 на границах 2000/2001/3000/3001 и duplicate=true на повторе. Cleanup удалил 3 лида/4 audit/3 receipts; независимый SELECT подтвердил 0/0/0. RPC quota/replay/private config проверены внутри BEGIN/ROLLBACK.

Private pepper может находиться в Edge environment или в закрытой service-only конфигурации. Значения salt/ключей не выводились и не сохранялись в source.

## Устойчивость проверок

Восстановлены четыре исторические staging миграции уведомлений. Они уже установлены и не применяются заново. Shared net ACL из исторического пакета не переносится в production без отдельного анализа.

Исправлены два ложных CI отказа: grep сам обнаруживал строку проверки в третьем guard workflow. Запрет автоматического production deploy сохранён. TypeScript проходит реальный strip+syntax, поскольку node --check с TS-файлом не удаляет типы в текущем runtime.

Для первого HEAD manifest Registry вернул digest устаревшей схемы: Docker его отклонил. Получен schema-v2 manifest list с явным Accept; запрос по новому digest вернул 200. Три затронутых browser jobs используют этот образ Playwright 1.55.0 с закреплённым digest. Повторный apt install Chromium/fonts из них удалён; npm package остаётся той же версии. Security/business checks не отключены.

## Граница текущего checkpoint

Production rollout публичного intake, уведомлений, quotes, архива и новых финансовых операций в этом checkpoint ещё не заявляется. Результаты каждого последующего этапа добавляются здесь после native readback и проверки сценария.

## Production intake завершён

Установлены runtime migration 20261027182713 и leader_public_intake_acl_v2; deployed Edge leader-public-lead v11 ACTIVE, verify_jwt=false, bundle ee12fb0d743ae38e9b7308f123c1ebe0fa7a3caa20d4b5305584ffa411ae2a10. Перед cutover сохранён private metadata backup public-intake-20261027-v2 и точный исходник прежнего Edge v10.

Actual production POST: 3001 → 400/message_too_long; honeypot → 200 без лида; 3000 → 200 и ровно 3000 символов + UTM в одной строке, повтор → 200/duplicate=true. Audit accepted/duplicate подтверждён. Anonymous table/column INSERT на leads/audit закрыт, authenticated manual INSERT сохранён; публичная INSERT-policy leads ограничена активным authenticated CRM-профилем и 3000 символами.

Обычный execute_sql cleanup дважды получил Invalid or expired requestState; независимое чтение подтвердило остаток. Та же строго ограниченная очистка с проверкой имени/пути и отсутствия заказа выполнена через native data migration leader_public_intake_acceptance_cleanup_v2. Независимый SELECT: 19 лидов, 0/0/0 synthetic leads/audit/receipts. Реальные строки и финансы не изменялись.

## Notifications WIP

Добавлены Edge sender с fresh Auth и одноразовым worker ticket, npm web-push 3.6.7 + package-lock, push-only SW без кеширования CRM, PWA manifest и настройки на 360/390/1440. Actual Edge unit proof проверяет шифрованный Web Push запрос без внешней отправки, denied actor, worker ticket и SSRF guard. Browser проверяет пользовательский жест разрешения, повтор test request_id, смену аккаунта и logout. Настройка/доставка в production ещё не включены. Native SQL/CI/closed-tab SW proof продолжаются.

## 28.10: восстановление после обрыва

Восстановлен точный remote HEAD 5f70c4b PR #596, а не незакоммиченный каталог предыдущей среды. Все 71 check runs на этом head завершились success. Чтение staging подтвердило прежние четыре notification migrations, disabled config и нулевые очереди. Notification Edge отсутствовал: повторной установки неизвестного результата не было.

Установлен staging leader-crm-notifications v1 ACTIVE, verify_jwt=false: браузерные команды проверяют fresh Auth внутри, worker — одноразовый HMAC ticket. Readback обоих файлов полностью совпал. Actual POST status без JWT вернул 401/auth_required. Рабочая база на этой контрольной точке не изменялась.

Native staging acceptance 28.10 прошёл внутри BEGIN/ROLLBACK: права/получатели/одноразовый ticket/отзыв профиля/410/stale finish. Независимый SELECT подтвердил 0 profiles/subscriptions/events/outbox.

Production preflight: 19 лидов, 17 клиентов, 69 позиций прайса, 2 заказа, 1 оплата, 0 расходов; notifications/quotes/documents отсутствуют. pg_net/pg_cron ещё не установлены. Production package теперь содержит только последние версии функций, retention одноразовых tickets и закрывает browser-доступ к новым net/cron IO. Он останавливается при неожиданно существующем shared extension, чтобы не менять чужие ACL. Private worker_secret остаётся только в закрытой конфигурации. Активация включает только возможность добровольной подписки, без подписок от имени сотрудников и без уведомлений по старым заявкам.

## Notifications production — 28.10

Package SQL и Edge v1 установлены. Readback index.ts/deno.json точный, HTTP status без JWT → 401/auth_required. Native acceptance прошёл после учёта существующего invite trigger: он переводит новые профили в inactive manager; тест явно настраивает только зарезервированные synthetic rows внутри ROLLBACK. Guard/приглашения/Auth и настоящие профили не менялись. После проверки fixtures/subscriptions/events/outbox/wakeups = 0, исходных лидов 19. Активирован dispatch_url/enabled=true, выделенный cron active; существующие сотрудники автоматически не подписаны.

Тонкость hosted pg_net: объекты принадлежат supabase_admin; REVOKE, выполненный postgres, не снял default PUBLIC ACL. Не утверждаем закрытие этих ACL по одному SQL source. Постоянный worker_secret никогда не передаётся через очередь, только одноразовый двухминутный ticket. Отдельная проверка фактической API-экспозиции и административное усиление pg_net остаются пунктом аудита; запрещён обход через серверные файлы/ОС или чужие роли.

Для quotes подготовлен воспроизводимый additive package из snapshot со всеми FK/CHECK, service-only RPC/RLS и индексами. Новый deadline освобождает UI при потерянном ответе; повтор использует исходный request_id. Production installation пока не выполнена.
