# Публичный HTML/SEO baseline

Дата: 2026-07-13.

Контур: только публичный сайт РА «Лидер».

## Цель

Защитить базовую индексируемость и структуру всех клиентских HTML-страниц, а не только URL, уже присутствующих в `sitemap.xml`.

## Покрытие

Проверяются:

- все корневые клиентские `*.html`;
- `banner/index.html`;
- `signs/index.html`;
- `auto-stickers/index.html`;
- `sitemap.xml`.

Из site-only набора явно исключены:

- `deal-card-v2.html`;
- `deals-v2.html`.

Это preview/entrypoint-файлы Navigator/CRM-контура, а не клиентские страницы сайта. Их SEO и интерфейс должны проверяться в отдельном рабочем контуре.

## Обязательные свойства страницы

Каждая публичная HTML-страница должна иметь:

- ровно один `<html lang="ru">`;
- ровно один UTF-8 `charset`;
- один responsive viewport с `width=device-width`;
- один непустой `<title>`;
- одну meta description длиной не менее 30 символов;
- ровно один непустой H1;
- один robots meta с поддерживаемым режимом.

Поддерживаемые robots-режимы:

- `index, follow` — обычная индексируемая страница;
- `noindex, follow` — legacy/redirect-страница, которая передаёт переходы на основной URL;
- `noindex, nofollow` — закрытая служебная страница, например генератор рекламных UTM-ссылок.

## Связь robots, canonical и sitemap

Для индексируемой корневой страницы:

- требуется один абсолютный canonical на `https://www.lider-bsk.ru`;
- canonical должен совпадать с собственным публичным URL;
- URL должен присутствовать в sitemap.

Для `noindex, follow` страницы:

- требуется один корректный canonical;
- собственный URL не должен присутствовать в sitemap;
- canonical может указывать на основную страницу, например при legacy redirect.

Для закрытой `noindex, nofollow` служебной страницы:

- собственный URL не должен присутствовать в sitemap;
- canonical необязателен;
- если canonical указан, он должен быть единственным и корректным.

Проверка также запрещает:

- query и fragment в canonical;
- несколько индексируемых страниц с одним canonical;
- повторяющиеся `<loc>` в sitemap.

Один основной индексируемый URL и его старые `noindex, follow` redirect-страницы могут иметь общий canonical — это ожидаемая legacy-схема.

## Исправления текущего этапа

В ходе первого глобального прогона найдены и исправлены реальные пробелы:

- добавлены meta description в `banner/index.html`, `signs/index.html`, `auto-stickers/index.html`;
- добавлен явный `index, follow` на 11 действующих посадочных страницах, у которых уже были title, description, canonical и sitemap URL;
- глобальные resource, DOM и HTML/SEO проверки подключены к основному `Public site audit check`.

Клиентский текст, дизайн, форма и structured data этих страниц не менялись.

## Автоматизация

Файлы:

- `tools/check_public_html_seo_baseline.py`;
- `.github/workflows/public-html-seo-baseline-check.yml`.

При ошибке workflow сохраняет artifact:

- `public-html-seo-baseline-report`.

## Границы

Этот этап:

- не делает сетевые запросы к поисковым системам;
- не проверяет фактическую индексацию в Яндекс Вебмастере или Search Console;
- не изменяет CRM UI, `nav_*` и `nav_v2_*`;
- не изменяет Supabase schema, RLS, Auth, Edge Functions или production data.
