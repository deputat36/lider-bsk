# Сохранение источника при переходе со старых страниц

Дата: 2026-07-17.

## Проблема

В production-данных встречались заявки со старых точек входа:

- `/banner/`;
- `/signs/`;
- `/auto-stickers/`.

Эти адреса уже перенаправляют посетителя на актуальные коммерческие страницы. JavaScript-редирект использовал только новый путь и отбрасывал query string. Если клиент открывал старую ссылку с `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `scenario` или `service`, метки не доходили до публичной формы.

## Исправление

Каждый из трёх редиректов теперь переносит:

- фиксированный same-origin путь актуальной страницы;
- исходный `window.location.search`;
- исходный `window.location.hash`.

Пример:

`/banner/?utm_source=vk&utm_campaign=bannery_iyul`

переходит на:

`/bannery-borisoglebsk.html?utm_source=vk&utm_campaign=bannery_iyul`

## Безопасные границы

- целевые пути по-прежнему жёстко заданы в HTML;
- внешний URL или пользовательский redirect target не принимается;
- canonical, `noindex, follow`, meta refresh и fallback-ссылка сохранены;
- старые адреса не добавлены в sitemap;
- форма, endpoint и Supabase не изменялись;
- production/staging Supabase, RLS, Auth, данные и Edge Functions не изменялись.

## Проверка

`tools/check_public_legacy_redirects.py` проверяет все три адреса и требует точную конструкцию `location.replace` с переносом `window.location.search` и `window.location.hash`. Старый вариант, отбрасывающий параметры, запрещён.

Ручная проверка:

1. открыть `/banner/?utm_source=vk&utm_campaign=redirect_test#form`;
2. убедиться, что открылась `/bannery-borisoglebsk.html`;
3. проверить сохранение `utm_source=vk`, `utm_campaign=redirect_test` и `#form` в адресной строке;
4. повторить для `/signs/` и `/auto-stickers/`.
