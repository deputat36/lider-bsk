# CRM access tab check — 2026-06-27

Repository: `deputat36/lider-bsk`.
Supabase project: `ofewxuqfjhamgerwzull`.

## Direct check URL

Use the main CRM URL with the direct tab route:

`https://deputat36.github.io/lider-bsk/crm/v4/?tab=user_admin`

The route is implemented in `crm/v4/assets/v4/crm-v4-tabs-lite.js` and loaded with cache marker:

`assets/v4/crm-v4-tabs-lite.js?v=20260627-access-route-1`

## Expected behavior

After login:

- if the current CRM profile is active `owner` or `admin`, the page opens the `Доступ` section and shows CRM users plus invite controls;
- if the current CRM profile is active but not owner/admin, the page opens the section and shows an access message instead of admin controls;
- if the current CRM profile is pending/inactive, the workspace remains blocked and the profile notice explains that access is waiting for activation.

## If the tab is not visible

Check in this order:

1. Open the main CRM URL, not the temporary CRM:
   - main: `https://deputat36.github.io/lider-bsk/crm/v4/?tab=user_admin`
   - temporary: `https://deputat36.github.io/lidercalculator/app-v4.html`
2. Hard refresh the page with `Ctrl + F5`.
3. Confirm that the loaded HTML contains `20260627-access-route-1`.
4. Confirm the signed-in user has an active CRM profile.
5. If the section opens but shows a role message, the code is working and the user is not owner/admin.

## Repository markers

The access tab depends on these markers:

- `data-v4-tab-button="user_admin"` in `crm/v4/index.html`;
- `{ tab: 'user_admin', label: 'Доступ' }` in `crm-v4-expanded-menu-v1.js`;
- `ROUTABLE_TABS` and `URLSearchParams` in `crm-v4-tabs-lite.js`;
- `import './user-admin-v1.js?v=20260627-access-3';` in `auth.js`;
- `CRM access admin v1` in `user-admin-v1.js`.

## Live Supabase check

Last checked on 2026-06-27:

- active `owner`: 2;
- active `admin`: 1;
- active `manager`: 1.

No personal emails are required for this check.

## Production note

This document does not require a Supabase production change. It documents browser verification for existing CRM access controls and the direct access-tab route.