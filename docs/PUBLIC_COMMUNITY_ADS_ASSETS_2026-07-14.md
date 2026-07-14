# Публичный сайт: assets страницы рекламы в сообществах

Дата: 2026-07-14.

## Цель

Перенести inline CSS и executable inline JavaScript страницы `reklama-v-soobshchestvah-borisoglebska.html` в кешируемые файлы без изменения списка площадок, FAQ, structured data или формы.

## Результат

- CSS: `assets/public-community-ads.css?v=1`;
- form preset: `assets/public-community-ads.js?v=1`;
- shared form CSS/JS остаются v26;
- сохранены блоки аудиторий, форматов и пакетов;
- сохранена таблица сообществ и ссылки ВК;
- сохранены шесть FAQ и четыре шага заявки;
- сохранены два JSON-LD-блока;
- сохранён контекст заявки для ВК/ОК;
- все внешние ссылки в новой вкладке сохраняют `rel="noopener"`.

## Постоянная защита

Checker и workflow проверяют порядок assets, таблицу, FAQ, шаги, JSON-LD, форму v26, JS-синтаксис и отсутствие inline executable code.

## Границы

CRM UI, `nav_*`, Supabase schema, RLS, Auth, Edge Functions и production data не изменяются.
