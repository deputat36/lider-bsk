# Public local resource integrity

Дата: 2026-07-13.

Scope: публичный сайт РА «Лидер».

## Цель

Не допускать публикацию клиентских страниц с локальными ссылками, стилями, скриптами, изображениями или якорями, которые ведут на отсутствующий файл или несуществующий блок страницы.

## Покрытие

Проверяются:

- все корневые `*.html` публичного сайта;
- `banner/index.html`;
- `signs/index.html`;
- `auto-stickers/index.html`.

Из HTML извлекаются локальные значения:

- `href`;
- `src`;
- `srcset`;
- `action`;
- `poster`.

Проверка понимает:

- относительные пути;
- абсолютные пути от корня сайта;
- ссылки на `https://www.lider-bsk.ru/...` и `https://lider-bsk.ru/...`;
- query-параметры cache busting;
- ссылки на каталог с `index.html`;
- локальные fragment-якоря.

Внешние URL, `mailto:`, `tel:`, `data:`, `blob:` и JavaScript-ссылки не проверяются как локальные файлы.

## Ошибки

Contract падает, если:

- локальная ссылка выходит за пределы корня репозитория;
- целевой HTML, CSS, JavaScript, изображение или другой локальный файл отсутствует;
- ссылка содержит fragment на отсутствующий `id` или именованный anchor в локальном HTML.

Сообщение содержит исходную страницу, HTML-тег, атрибут, URL и отсутствующую цель.

## Реализация

- checker: `tools/check_public_local_resources.py`;
- workflow: `.github/workflows/public-local-resource-integrity-check.yml`.

## Границы

Contract не выполняет сетевые запросы и не подтверждает доступность внешних сайтов. Он проверяет только целостность локального статического сайта в GitHub source.

Не изменяются:

- клиентские тексты и дизайн;
- CRM UI;
- `nav_*` и `nav_v2_*`;
- Supabase schema, RLS, grants, Auth, Edge Functions и production data.
