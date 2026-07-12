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

### `nakleyki-na-vitrinu-borisoglebsk.html`

- подключён shared landing foundation;
- сохранены все секции, цены, FAQ, related links и Service JSON-LD;
- CTA использует значение `Наклейки`;
- используется page preset из общего `public-lead-form.js`;
- дублирующий inline prefill script удалён;
- `public-lead-form.js?v=5` подключается один раз;
- внутренняя CRM-фраза заменена клиентской проверкой номера обращения.

Подробности: `docs/PUBLIC_LANDING_WINDOW_STICKERS_MIGRATION.md`.

### `rezhim-raboty-tablichki-borisoglebsk.html`

- подключён shared landing foundation;
- сохранены все секции, материалы, цены, FAQ, related links и Service JSON-LD;
- CTA использует значение `Табличка`;
- используется page preset из общего `public-lead-form.js`;
- дублирующий inline prefill script удалён;
- `public-lead-form.js?v=5` подключается один раз;
- внутренняя CRM-фраза заменена клиентской проверкой номера обращения.

Подробности: `docs/PUBLIC_LANDING_WORKING_HOURS_MIGRATION.md`.

## Статус малых landing pages

Все небольшие наружные landing pages из remaining blocked pages issues #185 и #191 мигрированы на общий foundation и текущую форму `v=5`.

## Следующий этап

Отдельно остаются более крупные страницы:

1. `index.html`;
2. `request.html`.

Для них требуется самостоятельный этап, потому что страницы содержат больше уникальных блоков, скриптов и CI-маркеров. Их нельзя механически заменить шаблоном малых landing pages.

## Безопасный порядок следующего этапа

1. Сначала описать обязательные секции и script order каждой крупной страницы.
2. Создать отдельный contract checker до изменения HTML.
3. Перенести только повторяющийся foundation CSS.
4. Сохранить уникальную главную навигацию, сценарии заявки, Metrika helpers и structured data.
5. Обновить `public-lead-form.js?v=4` до `v=5` только после сокращения страницы.
6. Выполнить desktop/mobile browser smoke и тестовую отправку формы.

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
