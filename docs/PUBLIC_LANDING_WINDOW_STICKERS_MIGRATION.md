# Public landing: window stickers migration

Дата: 2026-07-12.

Scope: public site only.

Related issues: #185, #191.

## Страница

`nakleyki-na-vitrinu-borisoglebsk.html`.

## Выполнено

- подключён `assets/public-landing.css?v=1`;
- повторяющийся landing foundation удалён из inline CSS;
- сохранены hero, варианты наклеек, цены, расчёт, FAQ, related links, footer и Service JSON-LD;
- CTA сохраняет услугу `Наклейки`;
- общий `public-lead-form.js` уже содержит page preset для этой страницы;
- удалён дублирующий inline prefill script;
- `assets/public-lead-form.js?v=4` заменён на `v=5`;
- внутренняя фраза про поиск заявки в CRM заменена клиентской проверкой номера обращения;
- страница добавлена в общий список `V5_PAGES`.

## Проверка

Добавлены:

- `tools/check_public_window_stickers_migration.py`;
- `.github/workflows/public-window-stickers-migration-check.yml`.

Контракт проверяет:

- порядок shared stylesheets;
- ограниченный объём локального inline CSS;
- title, description, canonical, Open Graph и Service JSON-LD;
- форму и CTA service value;
- наличие page preset в общем form script;
- отсутствие старой `v=4`, CRM-фразы и дублирующего prefill script;
- существование локальных HTML-ссылок.

## Supabase

Supabase production не изменялся. Страница использует активную `leader-public-lead v10`, `verify_jwt=false`.

## Не затронуто

- CRM UI;
- `nav_*` и `nav_v2_*`;
- Edge Functions, migrations, schema, RLS, grants, policies, Auth и данные;
- цены и коммерческие обещания страницы.

## Следующий кандидат

`rezhim-raboty-tablichki-borisoglebsk.html`.
