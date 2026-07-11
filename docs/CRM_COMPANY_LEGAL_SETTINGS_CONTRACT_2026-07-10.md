# CRM v4: контракт юридических реквизитов организации

Related: #202, #204, #214, #215.

Mode: source contract and read-only Supabase inspection only. No production setting, DDL, DML, RLS, grant, policy, Auth, Storage or Edge Function change was made.

## Purpose

Centralize executor details for:

- acts of completed work;
- future invoices;
- contracts;
- guarantees;
- commercial documents.

## Source contract

Files:

- `crm/v4/assets/v4/company-legal-settings-v1.js` — read-only loader and formatter;
- `crm/v4/assets/v4/company-legal-settings-draft-v1.js` — pure normalization, validation and preview model;
- `crm/v4/assets/v4/order-act-company-settings-v1.js` — act-field autofill sidecar;
- `crm/v4/assets/v4/company-legal-settings-preview-v1.js` — read-only owner/admin validation and preview form.

Settings key:

`company_legal_details_v1`

Storage target after approval:

`public.leader_settings.value jsonb`

## Schema version 1

Fields:

- `brand_name`;
- `legal_name`;
- `tax_id`;
- `registration_number`;
- `legal_address`;
- `postal_address`;
- `phone`;
- `email`;
- `bank_name`;
- `bank_account`;
- `correspondent_account`;
- `bank_code`;
- `tax_mode`;
- `signatory_name`;
- `signatory_role`;
- `schema_version`.

The contract must not contain:

- Supabase keys;
- passwords;
- API tokens;
- private signing keys;
- raw signature image bytes;
- unrelated personal data.

Signature/stamp files, if later required, must be private Storage references with controlled access.

## Current read-only behavior

`loadCompanyLegalSettings()` performs a read-only SELECT from `leader_settings`.

If the row does not exist or cannot be read:

- the helper returns safe defaults;
- the existing act preview remains usable with manual entry;
- no write or automatic row creation occurs.

`normalizeCompanyLegalSettings()` trims and limits source values and exposes `configured` and `schema_version`.

`validateCompanyLegalSettingsDraft()` additionally checks:

- supported `schema_version`;
- INN length;
- email format;
- bank/correspondent account length;
- BIK length;
- supported tax mode;
- forbidden secret-like field names.

Validation warnings identify incomplete address, contacts, signatory and bank details without blocking the unsaved draft.

## Act activation

The sidecar is activated through `order-act-preview-v1.js` with a small module import. No new script tag was added to `crm/v4/index.html`.

When an act editor opens:

- configured organization details fill blank/default executor fields;
- manual user edits are not overwritten by automatic loading;
- missing or unreadable settings keep editable fallback values;
- no database write is attempted.

Owner/admin users with UI permission `settings.manage` also see `Проверить реквизиты` in the act editor. The form:

- loads the current read-only setting;
- validates field formats;
- shows a formatted executor preview;
- can apply valid values only to the current unsaved act draft;
- has no production save action.

Manager/accountant can generate an act but cannot open the organization-settings form. Designer/installer/contractor cannot generate the act.

## Permission model

Read:

- users allowed to generate a document may read the approved company settings required for rendering.

Write:

- only owner/admin with `settings.manage`;
- server-side permission check required;
- UI hiding is not authorization;
- no write command exists in this source-only stage.

Each future settings change should create an audit event with actor, timestamp, old/new schema version or hash, and changed field names without logging full values unnecessarily.

## Verification

Automated source checks:

- `tools/check_crm_company_legal_settings.py`;
- `tools/test_crm_company_legal_settings.mjs`;
- `.github/workflows/crm-order-completion-act-check.yml`.

Manual browser/Network proof remains required by `docs/CRM_ORDER_COMPLETION_ACT_MANUAL_TEST_2026-07-10.md`.

## Approval gate

Before writing the setting in production:

1. define a server-side update command;
2. require `settings.manage` server-side;
3. validate schema version and field lengths;
4. create an audit event;
5. test owner/admin allow and all other roles deny;
6. test act/invoice/contract rendering;
7. obtain explicit production approval.

No production setting row, policy, grant, Edge Function or data was changed by this activation.
