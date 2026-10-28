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

Quote staging acceptance (actual RPC) прошёл 28.10, все четыре таблицы/receipts пусты после ROLLBACK. Обновление Edge остановилось на скачивании ненужного runtime-импорта JSR с декларациями типов (10-секундный timeout), а не на бизнес-логике. Импорт заменён локальной TypeScript-декларацией: Edge не имеет внешних runtime dependencies. Повтор будет выполняться с изменённым пакетом после сохранения source.

## Quotes production — 28.10

Установлены воспроизводимый package leader_quote_workspace_v1 и JWT Edge v1 без внешних зависимостей. Native acceptance прошёл целиком в рабочей базе внутри ROLLBACK; requests/quotes/templates/receipts/fixture profiles = 0, исходных лидов 19. RPC browser EXECUTE=false; readback Edge точный. CI actual package PostgreSQL и editor browser 360/390/1440 success на 48fb058.

## Архив документов — разработка

Подготовлены новый additive package/RPC, приватные реквизиты и receipts, годовые атомарные номера актов/договоров, версии, hash snapshot и terminal signed/void. Никакие рабочие документы/номера/реквизиты пока не создавались. PostgreSQL/Edge/browser проверка и установка продолжаются. Вариант НДС 22% добавлен по подтверждению ФНС https://www.nalog.gov.ru/rn39/ifns/imns39_10/info/16596254/ ; действующая настройка организации автоматически не меняется, историческая формулировка 20% сохранена.

## Архив production — 28.10

Полный пакет и JWT Edge v1 установлены. Native create/register/replay/hash/deny/sign/terminal proof прошёл в рабочей базе внутри ROLLBACK. Независимый SELECT: documents/events/receipts/counters/fixture profiles = 0, company revision=0, исходных заказов 2. Staging имел пустые профили; fixture owner/order создаются только внутри тестовой транзакции без Auth. Обнаружена коллизия PL/pgSQL-переменной data с реальным orders.data; имя заменено input_data, в CI fixture добавлена эта колонка. Native staging proof после исправления прошёл. Необработанный ответ содержит только технический SQLSTATE; контактные данные/тексты ошибок не логируются.

Финансовые корректировки подготовлены отдельным additive пакетом. Существующий RPC не переписывается; защищённые платежи нельзя отменить отдельно от связанной операции. Пока этот серверный пакет не установлен, реальные деньги/расходы не меняются. В старом transport устранено бесконечное ожидание getSession и добавлена привязка JWT к пользователю открытой карточки.

## Финансовые корректировки production — 28.10

Package и JWT Edge v1 установлены в обоих контурах. Native acceptance в staging и production прошёл: фактический возврат/точный replay/конфликт payload/ограничение переплаты/парный перенос и парная отмена/защита исходного платежа/подтверждение и автоматическое снятие полноты расходов. Тесты полностью ROLLBACK; новые реальные платежи, расходы и реквизиты не создавались. Независимый postflight подтверждает исходные counts и нулевые adjustments/confirmations/receipts/events.

В интерфейсе старого writer неопределённый 500 при попытке отдельно отменить защищённый платёж уточняется чтением связи через новый endpoint; подтверждённый запрет не удерживает форму в бесконечном retry. Обычные неизвестные результаты сохраняют тот же ключ. Native PostgreSQL и мобильные/desktop browser tests корректировок success на d7c0ae4.

## Итоговый аудит: дополнительная защита заявок

Read-only проверка показала: leader_has_access означает лишь активный профиль. Старые permissive lead policies тем самым не ограничивали роли canonical leads.read/create/update. Подготовлены дополнительные restrictive policies, сохраняющие прежние policies/grants и разрешённое создание owner/admin/manager. Service-only intake не зависит от browser RLS. До применения сохранён native RLS proof owner/manager/contractor с полным ROLLBACK.

Новые document/quote FK advisories адресованы scoped индексами. Прочие проекты общей базы и исторические индексы не меняются.

## Аудит прав, установки и кеша — 28.10

Дополнительные restrictive lead policies установлены в staging/production. Native owner/manager create и contractor read/create/update denial прошли; fixture profiles/leads=0 после ROLLBACK. Глобальные Auth/роли и прежние политики не удалялись. Новые FK индексы применены в обоих контурах.

Подготовлен единый cache release 20261028-recovery-1 для всех изменённых CRM modules и их старых URL aliases; graph не создаёт второй экземпляр одного изменённого модуля. PWA получила 192/512 PNG из точного исходного SVG/растрового логотипа владельца с его alpha matrix. Неизменённый бренд сохранён; растровый fallback соответствует официальному install manifest guidance https://web.dev/articles/add-manifest . Worker ждёт именно свою регистрацию, а не произвольный root serviceWorker.ready, и обновляет source без HTTP-cache.

CI screenshots архивов/уведомлений/переноса 360 и 1440 скачаны и просмотрены. Browser fixtures синтетические; они не подменяют фактическую доставку на Android или настоящий вход владельца.


## 28 октября — финальная серверная сверка и аудит

8/8 readbacks notifications/quotes/documents/finance-adjustments совпали с сохранённым source. Documents Edge v2 в обеих средах возвращает технические сбои как 503. Последние production migrations: canonical lead role policies 20261028074218, scoped FK indexes 20261028074219, notification event FK index 20261028075410. В новых Leader объектах unindexed FK=0. Security advisors: прежние 9 INFO/53 WARN/1 WARN, без новых findings.

Anonymous GET limit=0 подтвердил: net и leader_private не экспонируются PostgREST (406), документы и quotes не читаются anon (401). В 10:53 МСК бизнес-счётчики прежние 19/17/69/2/1/0, новые fixtures/receipts/documents/counters/adjustments/subscriptions=0. Исторический read-only срез: 5 leads со статусом заказа без заказа, 5 calculations, 5 согласованных offers без order_id, 11 calculations без need_id, 3 расхождения totals (одно с позициями); наборы пересекаются.

HEAD 3c3ce304 прошёл 85/85 check runs; artifact 12799747205 (documents) и 12799229810 (finance), SHA256 ZIP проверены. Последние mobile screenshots после layout fixes просмотрены; notification mobile artifact также принят ранее. Все 227 workflow YAML парсятся. Оставшиеся семь browser workflows переведены на тот же pinned container с timeout/concurrency, playwright install --with-deps больше не используется ни одним workflow.

Итоговая оценка и продолжение развития: FINAL_AUDIT_2026-10-28.md. Source финального релиза и статус публикации записываются в WORK_CURRENT после CI/merge. Настоящих owner/Метрика сессий нет; проверка Android, юридические реквизиты и классификация истории не подменялись синтетикой.

Финальный прогон cc61cf3 дополнительно запустил accessibility/branding задания, не входившие в прежние 85. Он выявил прежний недостаточный контраст .creative-kicker на главной (2.68:1) и необходимость явного Bash после container migration. Подзаголовок использует существующий тёмный оранжевый #9b3e00 (6.36:1 на #f7f7f8), cache release обновлён в страницах, генераторах и source contracts. Все семь перенесённых jobs явно запускают Bash; legacy brand screenshot берёт bundled Chromium через Playwright executablePath. Генераторы 13 commercial pages/creative hub, homepage contracts и все 64 формы проверены локально; финальный CI повторяется на исправленном source.


На ca3a251 WCAG contrast устранён: violations=0 на 25 сочетаниях страниц/ширин. Performance checker учитывал нативный prefetch невидимых loading=lazy изображений в «начальном» лимите; уточнён first-viewport metric (250 KB сохранён), полный transferred и deferredImageBytes остаются в report. Это не оптимизация/изменение оригинальных фото. Длинный public-form browser suite разделён на 1440/390 matrix с отдельными artifact, bounded locator/navigation timeout и сообщениями этапов; оба набора и все 64 страницы сохранены.


На 943a603 прошли browser suite обеих ширин и accessibility 25/25 (0 violations, max critical 195748 B, max total 447427 B, deferred photo 267189 B). Последним оставалось старое calculation staging transport задание: Deno check завис на JSR type-only import и job не имел timeout. Лишняя внешняя type-зависимость удалена, native Deno globals используются без изменений runtime-логики; check/test сохранены с timeout 60s, job 6min/concurrency. Это source/CI fix, ранее установленный сервер расчётов не заменяется.


Deno на aefb2f4 успешно проверил source и 9 поведенческих contract tests. Остался ложный source marker, требовавший именно сетевой type import: checker обновлён на built-in Deno.serve/env и запрет возвращения ненужного import; проверки canonical permissions, exact environment и RPC-only writes сохранены. Второе старое candidate Deno job также ограничено 6min/60s и concurrency.
