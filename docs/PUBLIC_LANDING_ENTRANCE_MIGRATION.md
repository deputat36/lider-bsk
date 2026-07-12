# Entrance landing migration

Дата: 2026-07-12.

Scope: public site only.

Related issues: #185 and #191.

Target: `oformlenie-vhoda-borisoglebsk.html`.

## Выполнено

- подключён `assets/public-landing.css?v=1`;
- общий stylesheet подключается до `assets/public-lead-form.css?v=4`;
- удалён повторяющийся CSS foundation;
- сохранены hero, карточки, цены, steps, FAQ, footer и Service JSON-LD;
- CTA использует допустимую услугу `Вывеска / наружная реклама`;
- page preset в `assets/public-lead-form.js` остаётся `Вывеска / наружная реклама`;
- `assets/public-lead-form.js` обновлён до `v=5`;
- фраза про поиск заявки в CRM заменена нейтральной проверкой номера обращения;
- все локальные HTML-ссылки проверяются автоматически.

## Автоматическая проверка

Добавлены:

- `tools/check_public_entrance_migration.py`;
- `.github/workflows/public-entrance-migration-check.yml`.

Контракт проверяет:

- порядок stylesheet-подключений;
- отсутствие старого foundation CSS;
- ограниченный размер inline CSS;
- title, description, canonical, JSON-LD и форму;
- допустимый `data-service`;
- совпадение service preset в общем form script;
- `public-lead-form.js?v=5` и отсутствие `v=4`;
- отсутствие клиентской фразы про CRM;
- существование связанных страниц.

## Ручная проверка после публикации

- desktop и mobile layout;
- декоративный фон первого экрана;
- сетки карточек и steps;
- FAQ;
- форма и услуга `Вывеска / наружная реклама`;
- тестовая отправка с получением номера обращения.

## Не изменялось

- CRM UI;
- `nav_*` и `nav_v2_*`;
- Supabase functions, schema и data;
- цены и коммерческие обещания страницы.
