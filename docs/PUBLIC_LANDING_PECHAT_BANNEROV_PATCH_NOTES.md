# Pechat bannerov landing migration

Дата завершения: 2026-07-12.

Scope: public site only.

Related issues: #185, #191, #195.

Target file: `pechat-bannerov-borisoglebsk.html`.

## Что выполнено

- подключён `assets/public-landing.css?v=1`;
- общий stylesheet подключается до `assets/public-lead-form.css?v=4`;
- удалён большой повторяющийся inline CSS foundation;
- оставлены только короткие стили, специфичные для страницы печати баннеров;
- HTML разбит на читаемые строки вместо нескольких минифицированных блоков;
- сохранены все основные разделы, FAQ, ссылки, footer и JSON-LD;
- сохранён блок формы `data-leader-lead-form`;
- сохранена локальная подстановка услуги `Баннер`;
- `assets/public-lead-form.js` обновлён с `v=4` до `v=5`;
- title, description, canonical и Open Graph не изменены.

## Автоматическая проверка

Добавлены:

- `tools/check_public_pechat_bannerov_migration.py`;
- `.github/workflows/public-pechat-bannerov-migration-check.yml`.

Проверка подтверждает:

- правильный порядок stylesheets;
- отсутствие старого повторяющегося CSS foundation;
- ограниченный размер оставшегося inline CSS;
- наличие canonical, JSON-LD и формы;
- `public-lead-form.js?v=5` и отсутствие `v=4`;
- подстановку услуги `Баннер`;
- существование всех локальных HTML-ссылок.

## Ручная проверка после публикации

Нужно открыть production-страницу на desktop и mobile и проверить:

- шапку и первый экран;
- карточки и сетки;
- FAQ;
- форму;
- подстановку услуги `Баннер`;
- получение номера обращения после реальной тестовой отправки.

## Не изменялось

- CRM;
- `nav_*` и `nav_v2_*`;
- Supabase Edge Functions;
- схема и данные Supabase;
- содержание ценовых ориентиров страницы.
