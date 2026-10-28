# Точка продолжения РА «Лидер»

Обновлено: 28.10.2026. Репозиторий deputat36/lider-bsk, PR #596, ветка agent/complete-recovery-20261027. Владелец поручил завершить восстановление, выполнить итоговый аудит и разрешил доступные инструменты. Повторные общие разрешения не нужны.

## Что установлено и повторять нельзя

- Production intake: Edge leader-public-lead v11, лимит 3000/3001 и безопасный повтор проверены 27.10; анонимная запись в таблицы закрыта.
- Notifications: production и staging package/RPC, Edge v1, enabled=true, dispatch_url установлен, cron active. Подписки только добровольные; автоматически никто не подписан. Native очередь/права/410/replay прошли в ROLLBACK. Android по фактической доставке ещё не проверен.
- Quotes: production Edge v1, staging v2; additive schema/RLS/service-only RPC установлены. Native create/respond/update/accept/selection/template/replay/deny прошёл; все fixture строки откатились.
- Документы: production/staging package, private общие реквизиты и counters, RPC, JWT Edge v2 установлены. Native register/replay/hash/permissions/sign/terminal прошёл. Документов/номеров/реальных реквизитов не создано; company revision=0. Исправлена коллизия переменной с реальным orders.data.
- Финансовые корректировки: production/staging package и JWT Edge v1 установлены. Native refund/replay/paired allocation/cap/void/protected payment/expense confirmation invalidation прошёл. Новых постоянных движений не создано.
- Рабочие прайс, клиенты, заказы, финансы, дизайн, производство и монтаж были установлены раньше; не устанавливать прежние пакеты заново.

## Последняя проверенная точка

- Source notifications/quotes/documents/finance-adjustments совпал с 8/8 Edge readbacks обеих баз. Docs обработчик обновлён до v2.
- Production lead canonical RLS и scoped FK indexes установлены. Последний notification FK index migration 20261028075410; новых Leader unindexed FK нет.
- Безопасный anonymous GET limit=0: net/private schema 406, docs/quotes tables 401. Секреты не читались.
- 28.10 10:53 МСК: 19 leads / 17 clients / 69 catalog / 2 orders / 1 payment / 0 expenses. Новые fixture rows=0. Notifications enabled, cron=1, subscriptions=0; company revision=0.
- HEAD 3c3ce304 — 85/85 success. Mobile archive/finance/notification artifacts просмотрены, последние layout fixes подтверждены.
- Итоговый аудит создан: FINAL_AUDIT_2026-10-28.md, в том числе 35 issues, historical gaps, security и развитие. STATUS/DECISIONS актуализированы. Все 227 YAML парсятся; оставшихся playwright install больше нет.

## Что делать дальше

1. Проверить финальный CI и merge #596 только на exact проверенном HEAD. На cc61cf3 было 87 success/2 failures: старый контраст creative-kicker и Bash default после container migration. Исправлены source/CSS cache, generators/source contracts и bundled Chromium path; код фиксируется следующим checkpoint. Проверки не отключены. На ca3a251 WCAG=0; уточняется first-viewport budget без lazy-prefetch, полный transferred остаётся в report. Public form browser suite делится на 1440/390 matrix с deadline; coverage 64 страниц сохраняется.
2. Проверить main/Pages и GET runtime bytes, manifest/icons. Зафиксировать merge SHA, CI и URL в этом файле. Не переустанавливать уже сверенные серверные блоки.
3. Завершить owner/Метрика Auth через защищённый browserAuth, если владелец даст данные; в текущем cloud browser обе сессии отсутствуют. Android и реквизиты/историческая классификация остаются реальной приёмкой.

## Потребует участия владельца

Реальный вход в CRM/Метрику, если сессии нет; Android с закрытой вкладкой для фактического push; подтверждённые юридические реквизиты; классификация спорных исторических цепочек и реальные материалы портфолио. Это не новые разрешения на плагины. Независимую разработку эти пункты не останавливают.

## После обрыва

Прочитать этот файл и CRM_RECOVERY_DELIVERY_2026-10-27.md. Сверить remote HEAD #596 и фактический результат последнего действия через migration history/Edge readback/receipt. Не повторять неизвестную запись вслепую. Код и SQL сохранять в удалённую ветку ДО изменения сервера; после блока записывать результат и следующий шаг. Один чат записывает ветку/базу. Shell-команды ограничивать timeout, одинаковую ошибку не повторять более двух раз без диагностики/смены подхода. Секреты/клиентские данные не сохранять в public source.
