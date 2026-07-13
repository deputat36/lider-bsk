# CSS каталога услуг

Дата: 2026-07-13.

Контур: публичная страница `uslugi.html`.

## Цель

Убрать большой встроенный CSS-блок из каталога услуг без изменения дизайна, структуры, SEO, формы заявки или клиентских текстов.

## Итоговая схема

- общие стили формы: `assets/public-lead-form.css?v=5`;
- стили каталога: `assets/public-services.css?v=1`;
- логика заявки: `assets/public-lead-form.js?v=5`.

Стили каталога загружаются после общих стилей формы, чтобы специфичные правила страницы сохраняли прежний приоритет.

## Защищаемые элементы

Проверка требует сохранения:

- H1 каталога;
- четырёх групп `outdoor`, `print`, `design`, `online`;
- блока заявки `request`;
- контейнера `leader-lead-form`;
- мобильных breakpoint 920 и 620 пикселей;
- основных CSS-компонентов каталога, карточек услуг и CTA.

## Автоматизация

- `tools/check_public_services_catalog_css.py`;
- `.github/workflows/public-services-catalog-css-check.yml`.

При ошибке сохраняется artifact `public-services-catalog-css-report`.

## Границы

Миграция:

- не меняет тексты, ссылки, structured data и форму;
- не добавляет внешние CSS-ресурсы;
- не затрагивает CRM, `nav_*` или `nav_v2_*`;
- не меняет Supabase schema, RLS, Auth, Edge Functions или production data.
