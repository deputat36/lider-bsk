# Staging installation user-JWT smoke v2

Дата обновления: 22 июля 2026 года.

## Назначение

Runner проверяет реальный JWT-контур Edge `leader-crm-installation v2` для двух действий:

- `installation_job.read` / `installation.read`;
- `installation_job.update` / `installation.write`.

Edge SHA-256: `24183605aad2c5cfcc84ebe14c348dcfce1b68de41a43dcfb973f65cef8cb369`.

## Runtime cases

- без JWT → `401 missing_or_invalid_jwt`;
- некорректный JWT → `401 missing_or_invalid_jwt`;
- запрещённый read → `403 forbidden` с action/permission evidence;
- запрещённый update → `403 forbidden` с action/permission evidence;
- разрешённый read несуществующего job → `404 not_found` после permission gate;
- разрешённый update несуществующего job → `404 not_found` после permission gate.

Нужны два разных краткоживущих пользовательских JWT: профиль с обоими installation permissions и профиль без них. Service-role key runner не использует.

Реальные значения в репозиторий не добавляются, не логируются и не сохраняются в artifacts.

## Текущий gate

Runtime smoke в source PR не запускается. На staging сейчас:

- Auth users: `0`;
- active profiles: `0`.

Поэтому реальные JWT отсутствуют. Auth-пользователи не создавались, прямые изменения `auth.users` не выполнялись.

## Запуск

```bash
STAGING_SUPABASE_URL='https://otulfnouybahfnsycxqn.supabase.co' \
STAGING_SUPABASE_PUBLISHABLE_KEY='...' \
STAGING_INSTALLATION_AUTHORIZED_USER_JWT='...' \
STAGING_INSTALLATION_FORBIDDEN_USER_JWT='...' \
node tools/run_crm_staging_installation_user_jwt_smoke.mjs
```

## Production boundary

Production `ofewxuqfjhamgerwzull` не изменяется и runner должен завершиться до вызова сети при любом другом project ref.
