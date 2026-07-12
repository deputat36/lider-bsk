# Banner store landing migration

Дата: 2026-07-12.

Scope: public site only.

Related issues: #185 and #191.

Target: `banner-dlya-magazina-borisoglebsk.html`.

## Выполнено

- подключён `assets/public-landing.css?v=1`;
- общий stylesheet подключается до `assets/public-lead-form.css?v=4`;
- удалён повторяющийся CSS foundation;
- оставлен короткий локальный style block для первого экрана, FAQ и related links;
- HTML разбит на читаемые строки;
- сохранены все исходные разделы и ценовые ориентиры;
- сохранены canonical, Open Graph и Service JSON-LD;
- сохранён form mount `data-leader-lead-form`;
- сохранена подстановка `service.value='Баннер'`;
- `assets/public-lead-form.js` обновлён до `v=5`;
- все локальные HTML-ссылки проверяются автоматически.

## Автоматическая проверка

Добавлены:

- `tools/check_public_banner_store_migration.py`;
- `.github/workflows/public-banner-store-migration-check.yml`.

Контракт проверяет:

- порядок stylesheet-подключений;
- отсутствие старого foundation CSS;
- ограниченный размер inline CSS;
- title, description, canonical, JSON-LD и форму;
- service prefill `Баннер`;
- `public-lead-form.js?v=5` и отсутствие `v=4`;
- существование связанных страниц.

## Ручная проверка после публикации

- desktop и mobile layout;
- первый экран и навигация;
- сетки карточек;
- FAQ;
- форма и подстановка услуги;
- тестовая отправка с получением номера обращения.

## Не изменялось

- CRM;
- `nav_*` и `nav_v2_*`;
- Supabase functions, schema и data;
- цены и коммерческие формулировки страницы.
