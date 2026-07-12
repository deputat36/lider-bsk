# CRM local training execution addendum — 2026-07-12

Related: #200, #205, #230.

## Выполненный этап

В CRM v4 добавлен отдельный локальный учебный сценарий, который не использует рабочие строки Supabase.

Source:

- `crm/v4/assets/v4/crm-training-scenario-model-v1.js`;
- `crm/v4/assets/v4/crm-training-scenario-v1.js`;
- подключение через `crm/v4/assets/v4/site-cache-note-v1.js`;
- оформление в `crm/v4/assets/v4/crm-quick-start-v1.css`.

## Учебный маршрут

Вымышленный кейс:

`обращение из ВКонтакте → баннер 3000 × 1000 мм → потребность 85% → расчёт и КП → заказ → согласованный макет → производство → выдача`

Шаги доступны только последовательно:

1. принять обращение;
2. заполнить потребность;
3. подготовить расчёт и КП;
4. оформить заказ;
5. довести до успешной выдачи.

Отмена не считается выполнением.

## Разделение прогресса

Реальный quick-start:

`leader_crm_v4_quick_start_v1`

Локальная тренировка:

`leader_crm_v4_training_scenario_v1`

Прохождение тренировки не отмечает рабочие шаги выполненными и не меняет автоматический прогресс реального quick-start.

## Data boundary

Модель сценария является pure module.

UI использует только:

- DOM;
- localStorage;
- статические демонстрационные данные.

Он не создаёт Supabase client и не содержит:

- SELECT к `leader_*`;
- INSERT;
- UPDATE;
- DELETE;
- UPSERT;
- RPC;
- Edge Function invocation;
- `fetch()`.

## Проверки

Добавлены:

- `tools/test_crm_training_scenario.mjs`;
- `tools/check_crm_training_scenario.py`;
- `docs/CRM_LOCAL_TRAINING_SCENARIO_2026-07-12.md`;
- расширение `.github/workflows/crm-quick-start-check.yml`.

Manual browser/Network proof остаётся открытым в #230.

## Production boundary

Не изменялись:

- production Supabase data;
- таблицы и столбцы;
- RLS, policies и grants;
- Auth;
- Storage;
- Edge Functions;
- `nav_*`, `nav-*`, `parket-*`, `broker-*`.
