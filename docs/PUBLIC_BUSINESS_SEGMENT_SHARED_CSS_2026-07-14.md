# Публичный сайт РА «Лидер»: общий CSS для отраслевых страниц

Дата: 2026-07-14.

Контур: только публичный сайт.

## Страницы

- `reklama-dlya-magazina-borisoglebsk.html`;
- `reklama-dlya-kafe-borisoglebsk.html`;
- `reklama-dlya-salona-krasoty-borisoglebsk.html`;
- `reklama-dlya-servisa-masterskoy-borisoglebsk.html`.

## Что изменено

Четыре страницы использовали одну визуальную систему и почти полностью одинаковый inline CSS. Стили вынесены в единый файл:

- `assets/public-business-segment.css?v=1`.

Различие страницы магазина сохранено через переменные:

- hero-текст — 940 px вместо 980 px;
- вводный текст секции — 900 px вместо 920 px.

Для этого используются body-классы:

- `page-business-shop`;
- `page-business-cafe`;
- `page-business-beauty`;
- `page-business-service`.

## Что сохранено

- все клиентские тексты;
- 62 карточки суммарно;
- по четыре этапа работы на каждой странице;
- Service JSON-LD;
- canonical и robots;
- версии общей формы v15, v18, v20 и v21;
- телефон и CTA;
- мобильный breakpoint 900 px.

## Дополнительное улучшение

На странице магазина удалён inline JavaScript, который назначал пустой обработчик клика и не выполнял полезной функции.

## Польза

- один кешируемый stylesheet вместо четырёх повторяющихся блоков;
- меньше HTML;
- синхронная поддержка адаптивности;
- ниже риск визуального расхождения отраслевых страниц;
- страницы ближе к CSP-ready архитектуре.

## Постоянная защита

Добавлены:

- `tools/check_public_business_segment_css.py`;
- `.github/workflows/public-business-segment-css-check.yml`.

Контракт проверяет четыре страницы одновременно, версии формы, body-классы, canonical, карточки, этапы, JSON-LD, телефон и отсутствие inline CSS/исполняемого JavaScript.

## Не затронуто

- CRM UI;
- `nav_*` и `nav_v2_*`;
- Supabase schema, RLS, Auth и Edge Functions;
- production-заявки и audit;
- содержание услуг и коммерческие обещания.
