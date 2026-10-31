# Редактирование черновика КП

Пакет начат 31.10.2026 и завершён локально 01.11.2026. Установка и фактические версии фиксируются исполнителем выпуска после readback; этот документ сам по себе не подтверждает deploy.

Кнопка «Редактировать КП» открывает редактор внутри существующей карточки. Меняются название, короткий/полный тексты и дата действия. Сумма, состав расчёта, связи и статус сохраняются. Доступ: активные owner/admin/manager через canonical `offers.write`. Отправленное, согласованное, отклонённое, устаревшее КП и КП с заказом остаются только для чтения; новые коммерческие условия требуют новой версии расчёта и нового КП.

Правки сохраняются в sessionStorage отдельно для пользователя и КП; восстановление доступно в течение трёх суток. Закрытие/перезагрузка сохраняет ввод. «Отменить правки» явно очищает этот черновик. При конфликте версии показываются актуальные условия рядом с введёнными; применение к новой версии требует явного сравнения. При неизвестном результате повтор использует прежние UUID, revision и полный payload. Текст не обрезается: превышение лимита отклоняется. При смене пользователя или потере прав карточка немедленно скрывается, поздний ответ не применяется к новой сессии; черновик остаётся связан с исходным пользователем.

## Сервер и установка

- Исходник установленного endpoint расширяется, новый Edge не создаётся: `supabase/functions/leader-crm-offer-transitions/index.ts`, actions `offer.transition` и `offer.update`.
- Добавлен service-only `leader_update_offer_rpc(jsonb)` с row locks, CAS `updated_at`, request/key/hash receipt и атомарным событием истории. SQL повторно проверяет роль, актуальность расчёта, статус, заказ и whitelist.
- Миграция: `supabase/migrations/20261031180000_leader_offer_editor_v1.sql`. Применять по одной после staging proof. Общий db push не нужен.
- Content trigger сохраняет название, тексты, дату, сумму и исходные связи после отправки/согласования/заказа. Существующие изменения статуса, отметок времени и `order_id` остаются разрешены служебным маршрутам.
- Прямые browser UPDATE и DELETE КП закрываются, включая UPDATE отдельных колонок; у authenticated также отзываются TRUNCATE/REFERENCES/TRIGGER. У anon и PUBLIC отзываются все table/column privileges. Существующие authenticated SELECT/INSERT не расширяются: restrictive policies требуют offers.read/offers.write; browser INSERT допускает только черновик без отметок отправки/согласования/отказа и без заказа. BEFORE INSERT связывает отсутствующие actor fields со свежим auth.uid(), чтобы закешированный createOffer продолжал работать; подмена actor отклоняется. Service-only RPC/seed не блокируются. Staging не получает новый INSERT grant.
- ID карточки хранится в `#offerCardV1.dataset.offerId` независимо от наличия edit-кнопки. Согласованное КП по-прежнему открывает форму создания заказа.

Порядок выпуска:

1. Сохранить исходники удалённым commit. Выполнить CI текущего SHA и подготовить PR.
2. Снять read-only metadata: ACL таблицы/колонок, связанные триггеры/RPC, версии и содержимое Edge. Перед production сохранить адресный снимок существующих offers/events через проверенный существующий приватный механизм резервирования; предварительно проверить его наличие и ACL. Клиентские записи не помещать в git или публичный artifact. Проверить отсутствие посторонней рабочей записи между снимком и postflight.
3. В staging применить только эту миграцию; развернуть exact Edge bundle с verify_jwt=true. Через существующий ограниченный OIDC bootstrap создать синтетическое КП сразу в статусе «Черновик». Не откатывать реальное согласованное КП в черновик.
4. Проверить реальный authenticated HTTP update/readback, роли и inactive, CAS, replay, защищённые поля, отказ прямому UPDATE/DELETE/RPC. Проверить UI save/readback, ввод после потери сети/конфликта и создание заказа после согласования на synthetic fixtures. Очистить только свои fixtures и проверить остаток/Auth.
5. С разрешённым production scope применить миграцию и exact Edge bundle. Прочитать установленный source/hash и ACL. Миграция не меняет существующие business rows: сравнить снимок, выполнить advisors и безопасные anonymous/invalid-JWT probes.
6. Только после сервера публиковать UI/import-map; подтвердить Pages/exact SHA/readback. Реальную приёмку сотрудником отличать от автоматических проверок.

Публичные изменения в этом пакете отсутствуют. Другие проекты общего Supabase и глобальный Auth не затрагиваются.

## Проверки

`node tools/test_offer_edit.mjs` — полный текст, валидация, привязка к пользователю/revision/payload, неизвестный ответ и повтор, конфликт, host/permission guard.

`node --experimental-strip-types tools/test_offer_operations_edge.mjs` — реальный Edge handler с изолированными HTTP doubles: 7 ролей × 2 операции, свежий Auth, canonical permission, объект, привязка actor, malformed/oversized payload, fail closed. Это не authenticated staging acceptance.

`python3 tools/build_offer_edit_rpc_test.py` генерирует настоящий migration+transactional acceptance. Исполнять только в отдельной PostgreSQL базе `leader_offer_editor_test`; проверка запрещает иное имя. Проверяет office allow / restricted deny / inactive, CAS, same-key и same-request конфликт, replay без дубля, отказ финансовым полям, full text, атомарность при ошибке события, frozen content, browser privilege denial, ролевые SELECT/INSERT, совместимость cached createOffer и отказ подмене actor/вставке согласованного КП. Все fixtures откатываются ROLLBACK.

`tools/test_offer_card_browser.mjs` проходит owner/manager на 360/390/768/1024/1440 и restricted роли. Выполняется существующим pinned Playwright workflow `crm-recovery-check.yml`, без загрузки браузера в рабочую среду. В него же добавлены transport/Edge проверки и отдельная native DB в существующем PostgreSQL job.

## Безопасный stop / rollback

Файл `supabase/production-candidates/rollback/20261031_offer_editor_stop.sql` отзывает service EXECUTE только нового edit RPC. Затем вернуть прежние проверенные UI и Edge версии по сохранённому readback. Редактирование остановится; уже сохранённые данные/история/receipts и закрытые browser UPDATE/DELETE сохранятся. Широкие browser ACL автоматически не возвращать. Старый Edge продолжит выполнять переходы статуса, content guard допускает их. Для повторного включения после исправления отдельно вернуть EXECUTE service_role и пройти тот же acceptance.
