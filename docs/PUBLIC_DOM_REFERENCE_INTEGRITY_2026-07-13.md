# Public DOM reference integrity

Дата: 2026-07-13.

Scope: публичный сайт РА «Лидер».

## Цель

Защитить клиентские страницы от конфликтующих HTML `id` и ссылок на отсутствующие DOM-элементы. Такие ошибки могут ломать якорную навигацию, подписи полей, вкладки, раскрывающиеся блоки и accessibility-связи.

## Покрытие

Проверяются:

- все корневые `*.html`;
- `banner/index.html`;
- `signs/index.html`;
- `auto-stickers/index.html`.

Contract проверяет:

- уникальность каждого непустого `id` внутри страницы;
- отсутствие пробелов в `id`;
- существование целей `label[for]`;
- существование целей атрибутов `form` и `list`;
- существование каждого ID из `aria-labelledby`;
- существование каждого ID из `aria-describedby`;
- существование каждого ID из `aria-controls` и `aria-owns`;
- существование ID из `headers` у табличных ячеек.

## Диагностика

При ошибке выводятся:

- файл и строка;
- тег и атрибут;
- дублирующийся или отсутствующий `id`;
- все позиции дубликатов.

Workflow сохраняет полный artifact `public-dom-integrity-report` только при ошибке.

## Реализация

- checker: `tools/check_public_dom_integrity.py`;
- workflow: `.github/workflows/public-dom-integrity-check.yml`.

## Границы

Contract анализирует статический HTML source. Элементы, которые создаются исключительно JavaScript-кодом после загрузки страницы, должны проверяться отдельными browser-тестами и не должны использоваться как статические ID-ссылки без документированного контракта.

Не изменяются:

- тексты, дизайн и клиентские данные;
- логика общей формы;
- CRM UI;
- `nav_*` и `nav_v2_*`;
- Supabase schema, RLS, grants, Auth, Edge Functions и production data.
