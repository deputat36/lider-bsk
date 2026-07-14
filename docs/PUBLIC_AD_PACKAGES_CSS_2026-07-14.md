# Публичный сайт: CSS страницы комплектов рекламы

Дата: 2026-07-14.

## Цель

Перенести встроенные стили `komplekty-reklamy.html` в кешируемый файл без изменения содержания, структуры комплектов, SEO, structured data или формы.

## Результат

- page-specific CSS: `assets/public-ad-packages.css?v=1`;
- shared form CSS остаётся `assets/public-lead-form.css?v=12`;
- shared form JS остаётся `assets/public-lead-form.js?v=12`;
- сохранены шесть комплектов и по три уровня в каждом;
- сохранены четыре шага выбора;
- сохранён ItemList JSON-LD из шести элементов;
- сохранены canonical, robots, Open Graph, CTA и телефон;
- executable inline JavaScript отсутствует.

## Постоянная защита

`tools/check_public_ad_packages_css.py` проверяет:

- порядок CSS;
- отсутствие inline `<style>`;
- шесть комплектов и 18 уровней;
- четыре шага;
- ItemList JSON-LD;
- форму v12;
- ключевые CSS-селекторы и мобильный breakpoint.

## Границы

CRM UI, `nav_*`, Supabase schema, RLS, Auth, Edge Functions и production data не изменяются.
