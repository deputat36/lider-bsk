# CRM status addendum: аудит заявок и request_id

Дата: 2026-06-29.

Фокус: только CRM РА «Лидер» и связка сайт → CRM. Публичный сайт, SEO и посадочные страницы этим документом не меняются.

## Текущий контур

- основной CRM-контур: `https://deputat36.github.io/lider-bsk/crm/v4/`;
- страница заявки: `https://www.lider-bsk.ru/request.html`;
- Supabase project: `ofewxuqfjhamgerwzull`;
- рабочие объекты: только `leader_*`.

## Supabase baseline

На этом этапе Supabase production не менялся:

- не выполнялись DDL/DML;
- не менялись RLS, grants, policies;
- не деплоились Edge Functions;
- не менялись production data.

Актуальные функции контура РА «Лидер» по baseline:

- `leader-public-lead v9`, `verify_jwt=false`;
- `leader-crm-leads v12`, `verify_jwt=true`;
- `leader-crm-orders v2`, `verify_jwt=true`.

## Аудит заявок в CRM

Раздел `Аудит заявок` обновлён для текущего duplicate/request_id контракта:

- добавлен счётчик `Дубли`;
- добавлен фильтр `Дубли`;
- в карточке события есть кнопка `Скопировать request_id`;
- в карточке события есть кнопка `Проверить цепочку`;
- есть сводка `С request_id` / `Без request_id`;
- есть подсказка `Проверка v8` со ссылкой на `request.html` и пометкой `Тест CRM v4 audit v8`;
- есть виджет `Проверить request_id`, который читает `leader_request_trace`;
- виджет показывает `Цепочка полная`, `Заявка без audit-события`, `Audit без заявки` или `Не найдено`;
- при найденной заявке виджет показывает кнопку `Открыть заявку`.

## Cache-marker аудита

Актуальные подключения:

- `public-lead-audit-v1.js?v=20260629-trace-button-1`;
- `public-lead-audit-helper-v1.js?v=20260629-trace-open-lead-1`;
- `public-lead-audit-summary-v1.js?v=20260629-request-summary-1`.

## Guard’ы аудита

Текущие проверки:

- `Public lead audit copy check`;
- `Public lead audit helper check`;
- `Public lead audit summary check`;
- `Public lead audit search check`;
- `Request trace view check`;
- `Static checks`;
- `Docs checks`.

## Дизайн в заказах

Без изменения базы закрыт UI-этап:

- карточка заказа показывает `Дизайн в заказе` и `Дизайн / макет`;
- быстрый список заказов показывает `Дизайн / макет` и счётчик `Дизайн проверить`;
- `Контроль заказов` показывает `Дизайн / макеты и производство`;
- производственная доска показывает предупреждение `Макет не согласован`;
- карточка производственного задания и печатный лист показывают `Дизайн / макет не согласован`.

Актуальные cache-marker:

- `order-card-v1.js?v=20260629-design-1`;
- `orders-fast-loader-v1.js?v=20260629-design-summary-1`;
- `order-control-v2.js?v=20260629-design-control-1`;
- `production-board-v3.js?v=20260629-layout-warn-1`;
- `production-job-card-v2.js?v=20260629-layout-alert-1`.

## Ручная проверка

1. Нажать Ctrl + F5 в CRM.
2. Открыть `request.html`.
3. Отправить тестовую заявку с пометкой `Тест CRM v4 audit v8`.
4. Записать показанный номер обращения.
5. Открыть `Аудит заявок`.
6. Проверить сводку `С request_id` / `Без request_id`.
7. Найти событие по номеру обращения.
8. Нажать `Проверить цепочку`.
9. Убедиться, что виджет показывает `Цепочка полная`.
10. Нажать `Открыть заявку`, если кнопка появилась.
11. Повторить техническую отправку с тем же `request_id` и убедиться, что audit показывает `duplicate`, а не `accepted`.

## Следующее безопасное направление

- улучшать CRM/UI и документацию;
- не менять Supabase production без отдельного approval;
- отдельно согласовать модель данных для полноценного блока `Дизайн в заказах`.
