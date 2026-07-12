# Public landing first page migration

Дата обновления: 2026-07-12.

Scope: public site only.

Related issues: #185, #191, #195.

## Завершённые страницы

### `pechat-bannerov-borisoglebsk.html`

- подключён `assets/public-landing.css?v=1`;
- повторяющийся inline CSS удалён;
- локальные стили сокращены;
- форма и service prefill `Баннер` сохранены;
- `assets/public-lead-form.js?v=5` подключается один раз;
- title, description, canonical, Open Graph и JSON-LD сохранены;
- добавлен отдельный migration contract.

Подробности: `docs/PUBLIC_LANDING_PECHAT_BANNEROV_PATCH_NOTES.md`.

### `banner-dlya-magazina-borisoglebsk.html`

- применён тот же проверенный shared CSS pattern;
- сохранены все секции, FAQ, related links, footer и Service JSON-LD;
- сохранена локальная подстановка услуги `Баннер`;
- `assets/public-lead-form.js` обновлён с `v=4` до `v=5`;
- добавлен отдельный checker локальных ссылок и размера inline CSS.

Подробности: `docs/PUBLIC_LANDING_BANNER_STORE_MIGRATION.md`.

### `oformlenie-vhoda-borisoglebsk.html`

- подключён shared landing foundation;
- сокращён повторяющийся inline CSS;
- сохранены все разделы, steps, FAQ, цены и Service JSON-LD;
- CTA использует допустимое значение `Вывеска / наружная реклама`;
- page preset в `public-lead-form.js` подтверждён checker-ом;
- `public-lead-form.js?v=5` подключается один раз;
- внутренняя фраза про поиск заявки в CRM заменена клиентской проверкой номера обращения.

Подробности: `docs/PUBLIC_LANDING_ENTRANCE_MIGRATION.md`.

## Следующий кандидат

`nakleyki-na-vitrinu-borisoglebsk.html`.

Причины:

- страница входит в remaining blocked pages issues #185 и #191;
- использует тот же наружный landing foundation;
- после неё останется `rezhim-raboty-tablichki-borisoglebsk.html`, а затем отдельно более крупные `index.html` и `request.html`.

## Безопасный порядок следующего этапа

1. Прочитать страницу целиком по частям и сохранить все контентные блоки.
2. Подключить `assets/public-landing.css`.
3. Удалить только foundation CSS, уже покрытый общим файлом.
4. Сохранить локальные стили, JSON-LD, форму и service prefill.
5. После сокращения страницы обновить `assets/public-lead-form.js?v=4` до `v=5`.
6. Добавить отдельный contract checker и workflow.
7. Проверить локальные ссылки и профильные GitHub Actions.

## Ограничения

- не трогать CRM;
- не трогать `nav_*` и `nav_v2_*`;
- не менять Supabase functions, migrations, schema или production data;
- не менять клиентские цены и коммерческие обещания в техническом CSS-этапе.

## Ручная проверка

После публикации каждой страницы:

- desktop и mobile layout;
- отображение формы;
- правильная подстановка услуги;
- отправка тестового обращения;
- появление номера обращения;
- запись `request_id` и `source_page_path` через `leader-public-lead v10`.
