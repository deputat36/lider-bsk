# CRM access tab check — 2026-06-27

Repository: `deputat36/lider-bsk`.
Supabase project: `ofewxuqfjhamgerwzull`.

## Direct check URL

Use the main CRM URL with the direct tab route:

`https://deputat36.github.io/lider-bsk/crm/v4/?tab=user_admin`

The route is implemented in `crm/v4/assets/v4/crm-v4-tabs-lite.js` and loaded with cache marker:

`assets/v4/crm-v4-tabs-lite.js?v=20260627-access-route-1`

The cache note script is also loaded with the same marker:

`assets/v4/site-cache-note-v1.js?v=20260627-access-route-1`

## In-app quick link

After login, the `CRM готова` card contains a direct button-link:

`Открыть доступ CRM`

It points to `?tab=user_admin` and opens the same access route as the direct check URL. This is the fallback path if the sticky tab menu is hard to see on a small screen or an old cached layout is still visible.

## Menu label

The sticky CRM menu shows this route as:

`Доступ и роли`

The clearer label is intentional: this section controls users, roles, pending access and invites.

## Expected behavior

After login:

- if the current CRM profile is active `owner` or `admin`, the page opens the `Доступ и роли` section and shows CRM users plus invite controls;
- if the current CRM profile is active but not owner/admin, the page opens the section and shows an access message instead of admin controls;
- if the current CRM profile is pending/inactive, the workspace remains blocked and the profile notice explains that access is waiting for activation.

## If the tab is not visible

Check in this order:

1. Open the main CRM URL, not the temporary CRM:
   - main: `https://deputat36.github.io/lider-bsk/crm/v4/?tab=user_admin`
   - temporary: `https://deputat36.github.io/lidercalculator/app-v4.html`
2. Hard refresh the page with `Ctrl + F5`.
3. Confirm that the loaded HTML contains `20260627-access-route-1`.
4. Confirm that the bottom-left cache note shows `CRM build: 20260627-access-route-1` after a fresh load.
5. After login, use `Открыть доступ CRM` in the `CRM готова` card if the sticky menu tab `Доступ и роли` is still not visible.
6. Confirm the signed-in user has an active CRM profile.
7. If the section opens but shows a role message, the code is working and the user is not owner/admin.

## Repository markers

The access tab depends on these markers:

- `data-v4-tab-button="user_admin"` in `crm/v4/index.html`;
- `href="?tab=user_admin"` and `Открыть доступ CRM` in `crm/v4/index.html`;
- `{ tab: 'user_admin', label: 'Доступ и роли' }` in `crm-v4-expanded-menu-v1.js`;
- `ROUTABLE_TABS` and `URLSearchParams` in `crm-v4-tabs-lite.js`;
- `import './user-admin-v1.js?v=20260627-access-3';` in `auth.js`;
- `CRM access admin v1` in `user-admin-v1.js`;
- `CRM build: 20260627-access-route-1` in `site-cache-note-v1.js`.

## Live Supabase check

Last checked on 2026-06-27:

- active access admins (`owner` + `admin`): 3;
- active `owner`: 2;
- active `admin`: 1;
- active `manager`: 1;
- inactive profiles: 0.

No personal emails are required for this check.

## Production note

This document does not require a Supabase production change. It documents browser verification for existing CRM access controls, the direct access-tab route, and the in-app quick link.