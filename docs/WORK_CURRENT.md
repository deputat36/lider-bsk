# Точка продолжения РА «Лидер»

Обновлено: 01.11.2026. Основной репозиторий deputat36/lider-bsk, main;
CRM https://www.lider-bsk.ru/crm/v4/, каталог https://www.lider-bsk.ru/uslugi.html.
Production Supabase ofewxuqfjhamgerwzull, staging otulfnouybahfnsycxqn.
Регламент: [WORKFLOW.md](WORKFLOW.md). Не начинать новый общий аудит;
проверять только дельту, реальную установку и остаток. Разрешения владельца
действуют; безопасные технические шаги повторно не согласовывать.

## Установленные результаты этого продолжения

1. **Сервер заявок** — [PR #600](https://github.com/deputat36/lider-bsk/pull/600),
   production leader-crm-leads v13, verify_jwt=true. Роли/actions, видимость
   объекта, финансовые поля и актуальная server matrix проверяются до записи.
   Описание до 3000 символов сохраняется целиком, 3001 отклоняется до записи.
   Сохранены manager-конвертация из согласованного КП и безопасный повтор.
   Staging HTTP7×8, text roundtrip, 17 handler tests, browser5 widths PASS;
   source exact. [Receipt и откат](CRM_LEADS_HARDENING_2026-10-31.md).
2. **Поиск услуги** — [PR #602](https://github.com/deputat36/lider-bsk/pull/602),
   main e169ad8d, Pages41248974367/runtime41248975195 success. Поиск названий
   и синонимов, возврат к запросу, дизайн/3D quick-link; четыре предметных
   дополнения вместо общего списка на 11 страницах печати. 15/15 файлов exact;
   browser5 widths и опубликованный каталог проверены без отправки заявки.
3. **Редактор КП** — [PR #603](https://github.com/deputat36/lider-bsk/pull/603),
   main 0b15743b. Production leader-crm-offer-transitions v2, JWT=true, source
   SHA256 701dd7076e2e3fa7d72836d20151d0b6a4dd6b893af994eb04e5eda33ee4a808
   exact. Актуальный черновик: текст/название/срок, CAS, receipt/replay,
   сохранение ввода и сравнение конфликта. Суммы не пересчитываются;
   отправленный/согласованный снимок защищён, маржа только costs.read.
   Direct UPDATE/DELETE/лишние ACL закрыты, старое создание совместимо.
   PR68/68; native SQL, browser owner/manager5 widths, real staging component
   UI+API (текст3014/reopen), 7 roles, concurrent200+409, replay/deny PASS.
   Run41250687586; fixtures/Auth/events/receipts0. Pages41251104397 и
   runtime41251105631 success; отдельно 5/5 изменённых UI файлов exact.
   [Receipt, миграция, stop/rollback](CRM_OFFER_EDITOR_2026-10-31.md).

Production после установки: 20 заявок, 15 КП, 2 заказа, 1 платёж, 0 расходов.
Все 15 исходных КП совпали с приватным снимком по hash; edit receipts0:
тестовых или вымышленных изменений рабочего учёта не делали. Advisors без
новых findings. Остальные установленные quote/document/finance/notification
пакеты не переустанавливались. Реальная приёмка владельцем — отдельно.

## Текущий клиентский пакет

[PR604](https://github.com/deputat36/lider-bsk/pull/604), main187d9723 уточняет подачу визиток и повторного
тиража, сезонного комплекта для точки и размещения в сообществах. Из рекламы
убраны внутренние заметки об импорте и недатированные числа подписчиков.
Состав площадок/ссылки сохранены, действующие формы и цены не менялись.
58/58 CI exact head2063b7fa, Pages41252286259/runtime41252286641 success;
три HTML3/3 HTTP200/SHA256 exact, mobile screenshots просмотрены. Рабочие
документы владельца обновлены и перечитаны. Предложения используют прежние формы.

[PR605](https://github.com/deputat36/lider-bsk/pull/605), main632ac17f опубликован.
Дублирующий700ms preset, который сбрасывал query/button выбор, удалён;
правильный preset остаётся в общей форме. Страница использует brand tokens,
короткий первый экран, один основной CTA, focus/keyboard таблицы сообществ.
58/58 CI head965a62ca, Pages41252985741/runtime41252986544 success; HTML/CSS2/2
HTTP200/SHA256 exact. Browser5 widths: query/button и текст после задержки,
keyboard scroll, цвета; mobile hero/table просмотрены, artifact hash проверен.
Тарифы и площадки сохранены. Docs00/02 обновлены и содержат исходный аудит,
результаты PR600/602/603/604/605, приватный снимок КП и подготовку восстановления.

## Защищённый снимок и проверка восстановления данных

PR607: единый MVCC snapshot67 таблиц/301 строка,79 SQL sources,2 sequence
(включая IDENTITY номера КП, пропущенный старым inventory). Ciphertext и
отдельный RSA private key сохранены приватно; полный GPG decrypt/SHA256 exact.
Read-only production: все67 таблиц/301 строка неизменны после испытания.

Реальный stage data restore67 typed tables/RLS,58 выбранных таблиц/290 строк;
остальные9/11 (архивы/config/queues) только в encrypted snapshot. Полные поля/hash,
78FK validated,2 sequence state/parameters/next>max exact; три реальные role
SELECT-denials, ACL закрыты и для BYPASSRLS. Business triggers/functions0;
внешних default/CHECK dependencies0. Native run41283418373, exact5a9c181d:19/19.
Cleanup RESTRICT с guard завершён: stage history prepare20261101070747 /
validate20261101070834 / cleanup20261101085258; namespace/relations0,Auth0.
50 рабочих stage таблиц и cron неизменны; advisors findings до/после совпадают.

[Receipt/границы](LEADER_DATA_RESTORE_DRILL_2026-11-01.md),
[machine receipt](../contracts/leader-data-restore-drill-20261101.json).
Приватные файлы — только владельцу в личном чате; ссылки на snapshot/key не
публиковать в общих Docs или GitHub. В рабочих документах только итоги/receipt.
Старый ZIP41345bytes был только подготовкой. Snapshot/data restore выполнены;
полное DR/Auth/файлы/Edge/config activation и полный RTO не доказаны.

## Следующий клиентский пакет

Ветка agent/608-public-preset-preservation устраняет ещё три legacy side effects:
print/contacts120ms и related80ms сбрасывали явно выбранную услугу. Дефект
воспроизведён исполнением прежних скриптов. Page defaults применяются один раз
при init и уважают service/scenario; related helper оставлен только для ссылок.
Сохраняются обычные defaults, текст клиента и текущие URL/формы/цены.
Проверить browser query/scenario/быстрый выбор на5 ширинах, затем Pages/readback.

## Следующая единая очередь

- Проверить реальный рабочий маршрут владельца: клиент/потребность → расчёт/
  КП → заказ → нужный дизайн/производство/монтаж → реальные оплаты/документ.
  Не подменять рабочую приёмку mocks, read-only SQL или synthetic fixtures.
- Адресно классифицировать исторические разрывы по фактам. В аудите31.10:
  5 leads «Создан заказ» без заказа, 5 таких calculations, 5 согласованных КП
  без заказа, 11 calculations без потребности, 3 расхождения сумм. Наборы
  пересекаются: это5 цепочек, из них3 payload.demo=true и2 manual. Сверка01.11
  подтверждает, что нынешний order1001 принадлежит другой заявке/клиенту;
  не связывать по одному старому event. Два draft4190 имеют0строк;
  mismatch58400/67896 относится к demo. Missing need включает2 связанных
  заказа; не объявлять все11 потерянными. Приватная адресная классификация
  сохранена в документе02 владельца; no DML. Не делать массовый reset,
  заказы-дубли или пересчёт согласованного.
- Пилот ООО «ВПТ», ИНН3663157643, Елена Валяева: 1000 двусторонних визиток,
  3000₽, ответственный Ковтун А.В., условие100% предоплаты уже согласовано.
  Поступление денег не подтверждено; срок готовности не согласован. До печати
  проверить файл согласованного макета и материал в рабочей базе. Не спрашивать
  повторно согласованную предоплату/ответственного и не фиксировать оплату
  или производство без факта. Счёт/проекты договора/акта уже подготовлены.
- Аналитика: кабинет Метрики/настроенные цели и actual Android/FCM требуют
  отдельной проверки. Событие в коде не равно цели; клик по телефону не звонок.
  GSC Wizard ранее вернул payment_required — не повторять без изменения доступа
  и не покупать подписку без конкретного бюджета. Реальный Android push ещё
  не принят; не писать PWA заново из-за отсутствия физической проверки.
- Базовый snapshot/data restore завершён. Дальше — отдельная проверка правил
  приложения/Auth/файлов/Edge в полноценном изолированном целевом окружении;
  общий production и Auth не откатывать, новые расходы без бюджета не создавать.
  Не восстанавливать реальные данные в public staging или публичном CI.
  Продолжать предметные примеры/подачу пяти приоритетных услуг по обращениям;
  использовать реальные материалы, цены с конфигурацией/датой/источником.
  Фотосъёмку и мобильные стенды сначала подтвердить пилотом и экономикой.

## Источники и границы

[Карта действующих Edge](../contracts/leader-production-edge-sources-20261031.json),
[receipt редактора и migration history](../contracts/leader-offer-editor-release-v1.json),
[аудит28.10 и 35 issues](FINAL_AUDIT_2026-10-28.md),
[история установки27.10](CRM_RECOVERY_DELIVERY_2026-10-27.md),
[история](STATUS.md), [решения](DECISIONS.md).
Рабочая база владельца:
https://docs.google.com/document/d/1dT2krTvYdHKN3hrvkpryEPt-pA2_AJrSLJ57HRDUxe4 .

Часть действующих функций собрана из staging-functions/production-candidates;
finance/catalog имеют production adaptations. Не разворачивать каталог целиком
и не делать общий db push. Файл offer editor20261031180000 установлен с history
stage20261031225331/prod20261031230704; ориентироваться на name+SQL hash+receipt,
не применять повторно по одному отличию timestamp. DDL только миграциями,
source remote до server changes; unknown outcome сначала readback/history.
Один writer ветки/схемы. Только leader_*/leader-*; чужие префиксы и глобальный
Auth общей базы не менять. Staging tests удаляют только свои fixtures.
GitHub хранит код, Drive — рабочую базу, CRM — реальные записи; секреты и
приватные снимки клиентов не публиковать. Недоступность кабинета/устройства/
фактов блокирует только зависимую часть. Полные чаты/вложения пока не
инвентаризированы — не советовать удалять диалоги по одному списку файлов.
