# CRM v4 profile-first boot manual test — 2026-07-10

Related: #200, #203.

Test URL:

`https://deputat36.github.io/lider-bsk/crm/v4/`

## Implemented contract

CRM working data must not load until all conditions are true:

1. Supabase Auth session exists.
2. `leader_user_profiles` profile is resolved.
3. `profile.is_active === true`.
4. Profile role is available.
5. Only then `crmReady=true` and `leader-v4:crm-ready` are emitted.

## Manual scenarios

### Active user

1. Log in with an active CRM profile.
2. Confirm status first shows `Проверяю доступ к CRM`.
3. Confirm working sections stay hidden while the profile is checked.
4. Confirm the workspace appears only after the active profile is shown.
5. Confirm leads and other working data load after workspace activation.

### Inactive/pending user

1. Log in with a profile where `is_active=false`.
2. Confirm the user session is recognized.
3. Confirm the workspace remains hidden.
4. Confirm status says `Доступ ожидает активации`.
5. Confirm no leads/orders/finance data are loaded.
6. Confirm logout remains available.

### Missing profile

1. Log in with an Auth user without a profile.
2. Confirm CRM attempts the controlled `ensure_profile` path.
3. If a pending profile is created, confirm workspace remains hidden until activation.
4. Confirm no `leader-v4:crm-ready` event is emitted for the pending profile.

### Network/profile error

1. Simulate an unavailable profile request.
2. Confirm workspace remains hidden.
3. Confirm status reports that the profile was not verified.
4. Confirm working data loaders do not start.

### Expired stored session

1. Open CRM with an invalid refresh token in local storage.
2. Confirm the local session is cleared.
3. Confirm login form is shown.
4. Confirm workspace remains hidden.

## Pass criteria

- no inactive or unverified profile reaches `crmReady=true`;
- `leader-v4:crm-ready` is emitted only from active-profile activation;
- working data requests start only after active profile verification;
- pending and error states are clear and retain a logout path;
- no browser console errors are introduced by `auth.js`.

## Production boundary

This source change does not alter Supabase Auth, RLS, grants, policies, database data or Edge Functions.
