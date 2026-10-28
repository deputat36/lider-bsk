# Точка продолжения РА «Лидер»

Обновлено: 28.10.2026. Главная ветка — main в deputat36/lider-bsk. Пользователь поручил завершить восстановление, выполнить аудит и разрешил доступные инструменты; общие разрешения повторно не спрашивать.

## Опубликованный результат

- PR #596 уже MERGED: https://github.com/deputat36/lider-bsk/pull/596 . Head 23725e3247117242b890b214d351846f7c54ed80, merge d536b29cba68dfa2a2bb7a1ac27628147e3b318b. Старую agent/complete-recovery-20261027 не продолжать как незавершённый PR.
- PR: 114 success + 1 штатный skipped IndexNow. Main merge: 119/119 success; Pages 40656395095 success.
- После публикации source 44015a72cb61cb3beea6716524699e4bd831826f сверён с 41 публичным файлом: 41/41 SHA256 совпали с первой попытки, run 40657143371 success. Cloud workflow .github/workflows/recovery-runtime-readback.yml теперь проверяет эти файлы после успешного Pages. Сам workflow не пишет в базу.
- Production intake Edge v11: 3000 символов, отказ 3001, безопасный повтор; anon direct INSERT закрыт. Техническая production-проверка и очистка выполнены 27.10.
- Production/staging notifications: schema/RPC и Edge v1 установлены, enabled=true, dispatch_url верный, cron active. Worker HMAC ticket; browser fresh Auth/canonical role. Actual Android/FCM не доказан.
- Quotes: production Edge v1, staging v2; workspace package установлен; native create/respond/version/accept/selection/template/replay/deny PASS.
- Documents: обе базы schema/RPC и JWT Edge v2; общие private реквизиты/CAS, постоянный архив/номера/версии/печать/история. Native register/replay/hash/permissions/sign/terminal PASS.
- Finance-adjustments: обе базы package и JWT Edge v1; возврат, парный перенос переплаты и отмена, защита исходных платежей, подтверждение расходов и invalidation. Native acceptance PASS.
- Canonical restrictive lead RLS установлен: owner/manager allowed, contractor read/create/update denied. Все новые Leader FK покрыты индексами. Data API net/private=406, anon docs/quotes=401.
- 8/8 Edge readbacks новых четырёх функций совпали с source. Все native fixtures откатились ROLLBACK.

Последний production read-only срез 28.10 11:23 МСК: 19 leads / 17 clients / 69 catalog / 2 orders / 1 payment / 0 expenses. Новых subscriptions/events/outbox/documents/counters/receipts/adjustments/confirmations=0; company revision=0. Не вносить вымышленные реквизиты и не создавать номера документов ради проверки.

## Что действительно осталось

1. После восстановления браузерной среды: безопасный реальный вход владельца/менеджера; проверить catalog.access и UI прайса, карточку заказа, документы/финансы. Пароли и OTP в чат не запрашивать; использовать browserAuth. В этой сессии CRM показала «Нужен вход», сессии нет.
2. Android: добровольная подписка, закрытая вкладка, реальное появление push; SW/browser test этого не доказывает.
3. Метрика: кабинет/счётчик/цели требуют входа. Здесь открылась публичная страница с «Войти»; подходящего плагина не найдено. Настройки не менялись.
4. Подтверждённые юридические реквизиты, NAP и реальные материалы портфолио.
5. Классификация истории: 5 leads «Создан заказ» без заказа; 5 calculations и 5 согласованных offers без order_id; 11 calculations без need; 3 total mismatch (одно с позициями). Наборы пересекаются. Массовый reset/создание заказов/пересчёт по текущему прайсу не выполнять без основания.
6. Дальнейшие приоритеты итогового аудита: legacy RBAC/backend (#202/#204) до приглашения новых ролей, восстановление резервных копий, единые статусы/CI, затем рост сайта по целевым обращениям.

Это реальные данные/учётная запись/устройство, а не недостающие общие разрешения.

## Документы и точный следующий шаг

[Итоговый аудит и все 35 issues](FINAL_AUDIT_2026-10-28.md), [подробная установка и проверки](CRM_RECOVERY_DELIVERY_2026-10-27.md), [актуальный статус](STATUS.md), [решения](DECISIONS.md). Read-only SQL: supabase/production-tests/20261028_recovery_final_readonly.sql.

Локальный exec-server и cloud browser стали unavailable на финише. Это не откат сервера/публикации. Независимая проверка завершена через GitHub Actions. После восстановления начать с актуального main и этого файла; следующий продуктовый шаг — реальная приёмка из пунктов 1–3, затем адресные задачи нового аудита. Не начинать новый полный аудит и не переустанавливать уже сверенные функции.

## Правила восстановления

Source сохранить удалённым commit ДО server changes; после потерянного ответа сначала migration history/Edge readback/receipt, затем решение о повторе. Не повторять неизвестную запись вслепую. Один активный writer для ветки/базы. Новые команды сохраняют прежний request_id/payload; SQL/HTTP и очередь ограничены временем/числом попыток. Все browser workflows используют pinned Playwright container, без повторных browser/apt downloads. Старые Deno calculation jobs исправлены: лишний JSR type import удалён, native check/test сохранены, 60s на команду/6min job. Секреты и тексты клиентов не сохранять в public source.
