# Публичная главная: вынос CSS и форма v5

Дата: 2026-07-12.

Scope: public site only.

Related issues: #185, #191.

## Цель

Сократить большой `index.html` без изменения внешнего вида и только после этого перевести главную на текущую версию общей формы.

## Безопасное преобразование

Единственный inline `<style>`-блок извлекается без редактирования содержимого в:

- `assets/public-homepage.css`.

В `index.html` остаётся ссылка:

- `assets/public-homepage.css?v=1`.

Одновременно обновляются только cache-маркеры:

- `assets/public-lead-form.css?v=3` → `v=4`;
- `assets/public-lead-form.js?v=4` → `v=5`.

`assets/packages-link.js?v=1` остаётся после form script, поэтому сценарии, дополнительные ссылки, клиентские тексты и мобильное меню продолжают инициализироваться в прежнем порядке.

## Guarded extraction

Одноразовый patch:

- требует ровно один `<style>`-блок;
- проверяет ключевые homepage CSS markers до извлечения;
- останавливается, если `assets/public-homepage.css` уже существует;
- не меняет CSS-селекторы и значения;
- проверяет ровно по одному старому cache-маркеру;
- запрещает остаточный inline `<style>` после преобразования.

После успешного commit одноразовые patch-файлы удаляются из рабочей ветки.

## Постоянная защита

Добавлены:

- `tools/check_public_homepage_css_migration.py`;
- `.github/workflows/public-homepage-css-migration-check.yml`.

Контракт проверяет:

- порядок homepage CSS и form CSS;
- отсутствие inline `<style>`;
- полноту извлечённого CSS по ключевым селекторам;
- порядок `public-lead-form.js?v=5` и `packages-link.js?v=1`;
- source-level клиентские формулировки;
- общий v5 coverage;
- homepage canonical `/` в SEO-contract;
- синтаксис общих JavaScript-файлов.

## Supabase

Supabase production не изменяется. Главная продолжает отправлять обращения в активную `leader-public-lead v10`, `verify_jwt=false`.

## Не затронуто

- CRM UI;
- `nav_*` и `nav_v2_*`;
- Edge Functions, migrations, schema, RLS, grants, policies, Auth и данные;
- структура, тексты, цены и визуальное оформление главной.

## Следующий крупный этап

После главной в issues #185 и #191 останется `request.html`.
