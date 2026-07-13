# Публичный HTML/SEO baseline

Дата: 2026-07-13.

Контур: только публичный сайт РА «Лидер».

## Цель

Защитить базовую индексируемость и структуру всех клиентских HTML-страниц, а не только URL, уже присутствующих в `sitemap.xml`.

## Покрытие

Проверяются:

- все корневые `*.html`;
- `banner/index.html`;
- `signs/index.html`;
- `auto-stickers/index.html`;
- `sitemap.xml`.

## Обязательные свойства страницы

Каждая публичная HTML-страница должна иметь:

- ровно один `<html lang="ru">`;
- ровно один UTF-8 `charset`;
- один responsive viewport с `width=device-width`;
- один непустой `<title>`;
- одну meta description длиной не менее 30 символов;
- ровно один непустой H1;
- ровно один абсолютный canonical на `https://www.lider-bsk.ru`;
- один robots meta со значением `index, follow` или `noindex, follow`.

## Связь robots, canonical и sitemap

Для индексируемой корневой страницы:

- canonical должен совпадать с собственным публичным URL;
- URL должен присутствовать в sitemap.

Для `noindex, follow` страницы:

- собственный URL не должен присутствовать в sitemap;
- canonical может указывать на основную страницу, например при legacy redirect.

Проверка также запрещает:

- query и fragment в canonical;
- indexable-страницы с общим canonical;
- повторяющиеся `<loc>` в sitemap.

## Автоматизация

Файлы:

- `tools/check_public_html_seo_baseline.py`;
- `.github/workflows/public-html-seo-baseline-check.yml`.

При ошибке workflow сохраняет artifact:

- `public-html-seo-baseline-report`.

## Границы

Этот этап:

- не меняет дизайн или клиентские тексты сам по себе;
- не делает сетевые запросы к поисковым системам;
- не проверяет фактическую индексацию в Яндекс Вебмастере или Search Console;
- не изменяет CRM UI, `nav_*` и `nav_v2_*`;
- не изменяет Supabase schema, RLS, Auth, Edge Functions или production data.
