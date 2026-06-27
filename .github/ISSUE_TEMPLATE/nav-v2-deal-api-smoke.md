---
name: Navigator v2 deal API runtime smoke
about: Результат ручной runtime-проверки nav-v2-deal-api с реальным user JWT
title: "Navigator v2 deal API runtime smoke: "
labels: "navigator-v2, smoke-test"
assignees: ""
---

## Контекст

```text
Дата и время проверки:
Проверяющий:
GitHub Actions workflow run URL:
Supabase project: ofewxuqfjhamgerwzull
Edge Function: nav-v2-deal-api
Observed Edge Function version: 2
Observed deployed SHA: 3f438c82f2dbffdf03fbfb745369367507b9f61ddaa62b6b3d2d229d937ec455
Deal UUID использован: да/нет
Test-only data использованы: да/нет
User JWT был короткоживущим: да/нет
JWT удалён/ротирован после проверки: да/нет
```

Не вставлять в issue JWT, refresh token, service-role key, secret API key, персональные данные клиента или полный payload сделки.

## Режим запуска

```text
preflight_only: true / false
compare_direct_rpc: true / false
supabase_url: https://ofewxuqfjhamgerwzull.supabase.co
```

Если `preflight_only=true`, runtime-доступ к сделке не проверялся. Для подтверждения runtime-доступа нужен запуск с `preflight_only=false`.

## Preflight guardrails

```text
deal_id UUID validation: pass / fail / not checked
supabase_url production validation: pass / fail / not checked
JWT role=authenticated validation: pass / fail / not checked
JWT sub claim validation: pass / fail / not checked
JWT exp validation: pass / fail / not checked
JWT issuer validation: pass / fail / not checked
JWT audience validation: pass / fail / not checked
JWT anonymous-user rejection: pass / fail / not checked
API key guardrail: pass / fail / not checked
```

## Runtime auth guard

```text
No Authorization rejected with 401/403: pass / fail / skipped
Invalid Bearer rejected with 401/403: pass / fail / skipped
```

## Authenticated read actions

```text
get_deal_card Edge Function call completed: pass / fail / skipped
get_deal_card HTTP status:
get_deal_card payload shape valid: pass / fail / skipped
get_deal_card returned data field present: pass / fail / skipped

get_deal_card_lite Edge Function call completed: pass / fail / skipped
get_deal_card_lite HTTP status:
get_deal_card_lite payload shape valid: pass / fail / skipped
get_deal_card_lite returned data field present: pass / fail / skipped

Read action error code if failed:
Read action short error summary:
```

## V2 write action smoke

Use only safe test deals and test users. Note any side effects and cleanup without private data.

```text
add_comment with test-only body: pass / fail / skipped
update_deal_status with reversible test status: pass / fail / skipped
update_document_status with test document: pass / fail / skipped
update_document_workflow with test document: pass / fail / skipped
update_task_status with test task: pass / fail / skipped
Write side effects expected: yes / no
Write cleanup completed: pass / fail / skipped
Write action error summary without private data:
```

## Role and access matrix

Проверить только безопасные тестовые сделки и тестовых пользователей.

```text
Allowed owner: pass / fail / not checked
Allowed admin: pass / fail / not checked
Allowed manager: pass / fail / not checked
Allowed spn: pass / fail / not checked
Allowed lawyer: pass / fail / not checked
Allowed broker: pass / fail / not checked
Unrelated authenticated user denied: pass / fail / not checked
Disabled profile denied: pass / fail / not checked
```

## Direct RPC comparison

```text
compare_direct_rpc enabled: true / false
nav_v2_get_deal_card direct RPC call completed: pass / fail / skipped
nav_v2_get_deal_card_lite direct RPC call completed: pass / fail / skipped
Write direct RPC comparison used: true / false
Edge and direct RPC payload shape match: pass / fail / skipped
Difference summary without private data:
```

## Browser opt-in

```text
Browser URL tested with ?edge_api=1: pass / fail / not checked
Browser URL tested with ?edge_api=0 fallback: pass / fail / not checked
?id=<deal-uuid> tested: pass / fail / not checked
?deal_id=<deal-uuid> tested: pass / fail / not checked
Browser write actions remained on direct RPC paths: pass / fail / not checked
Browser console errors:
```

## Итог

```text
Result: pass / pass with notes / fail
Can consider default browser read migration: yes / no
Can consider browser write migration: yes / no
Blockers:
Notes:
```
