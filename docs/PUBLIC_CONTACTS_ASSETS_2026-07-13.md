# Публичный сайт РА «Лидер»: assets страницы контактов

Дата: 2026-07-13.

Контур: только публичный сайт.

## Цель

Убрать inline CSS и executable inline JavaScript из `kontakty.html`, сохранив подтверждённые контакты, LocalBusiness JSON-LD, форму и защиту неподтверждённых NAP-полей.

## Выполнено

- стили перенесены в `assets/public-contacts.css?v=1`;
- preset формы перенесён в `assets/public-contacts.js?v=1`;
- сохранены `assets/public-lead-form.css?v=4` и `assets/public-lead-form.js?v=5`;
- сохранён порядок общей формы и page-specific preset;
- сохранены телефон `8 980 245-74-71` и email `zakaz@lider-bsk.ru`;
- сохранены LocalBusiness name, URL, telephone, email, locality, region и areaServed;
- не добавлены точный адрес, индекс, график, координаты, карты, мессенджеры или sameAs;
- сохранён номер обращения после отправки формы.

## Постоянная защита

Добавлены:

- `tools/check_public_contacts_assets.py`;
- `.github/workflows/public-contacts-assets-check.yml`.

Контракт проверяет:

- отсутствие inline `<style>` и executable inline JavaScript;
- единственное подключение внешних CSS/JS;
- порядок общих и page-specific assets;
- подтверждённые телефон и email;
- форму, LocalBusiness и клиентскую формулировку номера обращения;
- отсутствие неподтверждённых NAP-полей;
- ключевые CSS- и JS-маркеры;
- синтаксис JavaScript через `node --check`;
- отсутствие прямой отправки данных из page-specific скрипта.

## Не изменено

- CRM UI;
- `nav_*` и `nav_v2_*`;
- Supabase schema, RLS, Auth, Edge Functions и production data.
