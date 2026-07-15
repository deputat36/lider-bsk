# Публичный сайт РА «Лидер»: общий CSS для кампаний и запусков

Дата: 2026-07-15.

Контур: только публичный сайт.

## Страницы

- `reklamnye-posty-vk-borisoglebsk.html`;
- `reklama-otkrytiya-magazina-borisoglebsk.html`.

## Что изменено

Две страницы используют одинаковую структуру: верхнюю контактную панель, фиксированный header, hero из двух колонок, две трёхколоночные сетки, CTA с формой и footer.

Повторяющийся inline CSS перенесён в кешируемый файл:

- `assets/public-campaign-landing.css?v=1`.

Для явной привязки к шаблону добавлены классы body:

- `page-vk-post`;
- `page-store-opening`.

## Что сохранено

- клиентские тексты;
- title, description, robots и canonical;
- Open Graph, Twitter Card и JSON-LD;
- заголовки и шесть карточек на каждой странице;
- опубликованные ценовые ориентиры страницы рекламных постов;
- телефон `8 980 245-74-71`;
- ссылки на политику обработки данных;
- service preset формы;
- `public-lead-form.css?v=4`;
- `public-lead-form.js?v=5`;
- мобильный breakpoint 900 px;
- отсутствие page-specific executable JavaScript.

## Польза

- HTML стал меньше;
- общий визуальный шаблон обслуживается одним файлом;
- браузер может кешировать стили между двумя страницами;
- ниже риск расхождения header, карточек, CTA и мобильной версии;
- страницы ближе к CSP-ready архитектуре.

## Постоянная защита

Добавлены:

- `tools/check_public_campaign_landing_css.py`;
- `.github/workflows/public-campaign-landing-css-check.yml`.

Контракт проверяет обе страницы, порядок подключения CSS, body-классы, canonical, H1 и H2, шесть карточек, service preset, форму, телефон, privacy-ссылку, количество ценовых блоков и отсутствие inline CSS или executable inline JavaScript. JSON-LD остаётся разрешённым.

## Supabase snapshot

Read-only проверка на момент работы:

- проект `ofewxuqfjhamgerwzull` — `ACTIVE_HEALTHY`;
- `leader-public-lead` — ACTIVE, версия 10;
- `leader_leads` — 12 записей;
- последний lead — 2026-07-01 14:20:01 UTC;
- заявок с двух изменяемых страниц — 0.

## Не затронуто

- CRM UI;
- `nav_*` и `nav_v2_*`;
- Supabase schema, RLS, Auth и Edge Functions;
- production-данные;
- содержание услуг, цены, контакты и коммерческие обещания.
