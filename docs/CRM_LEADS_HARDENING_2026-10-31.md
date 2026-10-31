# Серверные права и описание заявки — 31.10.2026

Первый пакет по аудиту main 9f0572f. Production: ofewxuqfjhamgerwzull,
staging: otulfnouybahfnsycxqn. Изменения схемы не нужны.

## Поведение

leader-crm-leads проверяет свежую Auth-сессию, активный профиль, известную
роль, действие и service-only leader_actor_has_crm_action_rpc. Отказ или
недоступность проверки не допускает бизнес-операцию. ensure_profile отдельно
создаёт только неактивного manager и не принимает роль/активность из запроса.

Owner/admin сохраняют офисные действия. Manager работает с заявками,
клиентами и создаёт заказ из согласованного КП; legacy create_order принимает
финансовый снимок и требует finance.write. Accountant получает только
list_orders в финансовой проекции. Designer/contractor/installer не получают
общий список заявок и операции этого endpoint.

Заявки читаются с JWT пользователя и действующим RLS. Прямой SELECT заказов
закрыт: список служебный, как в установленном canonical orders endpoint,
после orders.read. Проекция роли дополнительно пересекается с текущими
finance.read/costs.read/clients.read — без расширения grants.
Создание заявки также исполняется с JWT. Редактирование выполняется служебно
после проверки видимости объекта под JWT и явного списка полей: прямой
UPDATE в staging закрыт, расширять grants ради этого нельзя. Поиск существующего
клиента и проверка видимости КП перед служебной конвертацией учитывают RLS.
Служебный INSERT клиента остаётся после clients.write; данные нового клиента
не содержат чужого owner_id. Actor конвертации берётся из Auth, payload
явно ограничен. Manager не может задать предоплату или статус оплаты кроме
нулевого/«Не оплачено»; UI скрывает недоступные финансовые поля. Проекция
ответа конвертации исключает клиентские контакты и внутренние суммы.

Описание до 3000 UTF-16 символов после trim сохраняется целиком. 3001 даёт
400 message_too_long до записи. PATCH без message сохраняет исходный текст
и payload с параметрами. Превышение не исправляется тихим усечением.
Неизвестный/невидимый объект не возвращается как успешная пустая запись.
GET не выполняет записи; malformed JSON имеет явную ошибку, сеть ограничена.

## Проверка и выпуск

1. `node --test tools/test_crm_leads_handler.mjs`: настоящий handler с mocks,
   матрица ролей/actions, отзыв canonical permission, inactive/unknown,
   RLS-контекст, лимиты/повторное чтение, spoofed actor, безопасная проекция.
2. В staging разворачивается точный candidate как leader-crm-leads-hardening,
   verify_jwt=true. Основной staging wrapper остаётся на прежнем месте.
3. Узкий push-workflow crm-leads-hardening-staging.yml получает GitHub OIDC;
   bootstrap проверяет repository/id, actor/id, ref, workflow, audience,
   event и run binding. Тест создаёт только synthetic user/lead/snapshots,
   выполняет HTTP create/update/readback, семь ролей × восемь actions,
   реальную manager-конвертацию и owner/admin/manager replay. После —
   cleanup с нулевым residue и удалением временного Auth-пользователя.
   Снимок «Согласовано» здесь явно синтетический, не факт клиента.
4. Сохранить commit, PR и зелёные проверки его точного SHA. Только затем
   заменить production leader-crm-leads; независимый get_edge_function
   должен подтвердить SHA-256 index.ts и verify_jwt=true.
5. Production postflight — только чтение/отказы без synthetic заявок,
   изменение Auth/ролей, оплат, согласований или реальных заказов запрещено.

Реальная UI-приёмка владельцем не подменяется HTTP/mocks.

## Снимок и откат

До установки исходный index.ts production v12 сохранён без изменений:
`supabase/production-candidates/rollback/20261031-leader-crm-leads-v12/index.ts`.
Его SHA-256 включён в `contracts/leader-production-edge-sources-20261031.json`.
В пакете нет DDL/DML production, поэтому откат данных не нужен. При регрессии
owner-flow переустановить только этот сохранённый файл с verify_jwt=true,
затем проверить source hash и owner-flow. Старая v12 не содержит новой защиты;
откат не считается закрытием RBAC, а требует немедленного исправления причины.

Тестовый bootstrap до пакета — v36, exact source в main 9f0572f:
`supabase/staging-functions/leader-staging-authenticated-e2e-bootstrap/`.
После HTTP proof его можно вернуть к этим двум файлам и проверить hash;
production bootstrap отсутствует. Не переносить тестовую ветку/fixtures
в production.

## Карта источников установки

Машиночитаемый baseline: `contracts/leader-production-edge-sources-20261031.json`.
16 Leader functions / 27 файлов прочитаны с сервера, версии и SHA-256 сохранены.
13 функций полностью соответствуют существующим файлам, но разным каталогам:

| Группа | Источник |
| --- | --- |
| clients, documents, finance-adjustments, notifications, quotes, offer-transitions, public-lead | supabase/functions |
| orders v3 и четыре shared файла | supabase/staging-functions |
| design, production/create, installation/create | supabase/production-candidates/functions |
| finance v1, catalog v2 | Production adaptations констант/guard; перед изменением нужен fresh readback |
| leads v12 | Сохранённый rollback; текущий source candidate закрывает функциональный drift |

Нельзя использовать общий каталог как готовый production bundle, переносить
staging-константы или выполнять общий db push. Остальные 15 функций этим
пакетом не переустанавливаются. Migration history, глобальный Auth и чужие
префиксы общей базы не изменяются.

## Итог установки

Реализовано и объединено: [PR #600](https://github.com/deputat36/lider-bsk/pull/600),
head e4be9285b97736f86c19339712de7ad6f6728152, 67/67 success.
Main release c9ee4b92e0a104903e1d65b4c39accc1b693b853. Pages
41232498691 success; runtime readback 41232500500 success проверил 42 файла,
включая index.html CRM и изменённый offer-order-create-v1.js.

Установлено: production leader-crm-leads **v13**, verify_jwt=true,
индекс SHA-256 **a43517e468899c206fed8a808e831240ae7748dd21c6dfb3c8982b27b8798394**.
Независимый get_edge_function после установки подтвердил точный source.
Остальные 15 production функций не переустанавливались. На момент postflight:
20 заявок, 17 клиентов, 2 заказа, 1 платёж, 0 расходов; количество/активность
профилей и fingerprint permission RPC совпали с preflight. Реальные записи
и глобальный Auth не изменялись. Новых findings advisors нет: 5 Leader private
RLS-no-policy намеренны, чужие 53 security-definer grants/12 FK не затрагивались;
84 unused Leader indexes не удалять по одному счётчику. 5 multiple SELECT
policies требуют отдельной оценки, а не автоматического удаления.

Проверено автоматически:

- 17 tests настоящего handler с isolated mocks, включая unknown/inactive role,
  отзыв разрешения, неподдерживаемые поля и RLS-видимость объекта.
- [Staging HTTP run 41232253984](https://github.com/deputat36/lider-bsk/actions/runs/41232253984):
  candidate alias v3 exact source, 7 ролей × 8 actions, реальное создание и
  редактирование 2001/3000 символов с readback, 3001 отказ до записи, manager
  conversion и owner/admin/manager replay одного заказа, финансовые отказы,
  inactive/anon deny. Cleanup и независимый SQL: profiles/leads/orders/offers/
  Auth fixtures = 0. Предыдущие неудачные fixtures также очищены.
- [Pinned browser run 41232257824](https://github.com/deputat36/lider-bsk/actions/runs/41232257824):
  owner/manager × 5 ширин, КП→заказ, доступность финансовых полей, Escape/focus.

Проверка выявила закрытые direct UPDATE leads и SELECT orders в staging.
Вместо расширения grants исправлен служебный путь с canonical permission,
object/field guards. Изолированный staging alias leader-crm-leads-hardening v3
и bootstrap v39 остаются для воспроизводимости; основной staging wrapper
не заменялся. Bootstrap context ограничен веткой agent/601-leads-server-hardening
и точным workflow; helpers работают только с синтетическим run marker.

Принято в реальной работе: отдельно. Авторизованная UI-сессия владельца и
реальный рабочий сценарий здесь не подменяются HTTP/mocks.

Следующий пакет — editor только актуального черновика КП, серверные CAS/replay
и защита согласованного снимка; затем поиск услуги и предметная подача пяти
приоритетных страниц. Общее разрешение повторно не требуется.
