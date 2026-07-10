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

File:

`crm/v4/assets/v4/company-legal-settings-v1.js`

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

## Current source behavior

`loadCompanyLegalSettings()` performs a read-only SELECT from `leader_settings`.

If the row does not exist or cannot be read:

- the helper returns safe defaults;
- act generation remains available with manual editable fields;
- no write or automatic row creation occurs.

`normalizeCompanyLegalSettings()`:

- accepts only an object;
- trims and limits text values;
- applies default brand/tax/signatory role;
- exposes `configured` and `schema_version`.

`companyLegalDetailsText()` builds a human-readable multiline block without secrets.

## Act sidecar

Prepared file:

`crm/v4/assets/v4/order-act-company-settings-v1.js`

It is designed to fill only blank/default act fields:

- executor name;
- executor requisites;
- tax mode;
- signatory name;
- signatory role.

It must not overwrite user edits.

Current activation status:

- source sidecar is prepared;
- it is not yet loaded by `crm/v4/index.html`;
- activation is tracked in #215;
- the existing act preview remains usable with manual entry.

## Permission model

Read:

- users allowed to generate a document may read the approved company settings required for rendering.

Write:

- only owner/admin with `settings.manage`;
- server-side permission check required;
- UI hiding is not authorization.

Each settings change should create an audit event with:

- actor;
- timestamp;
- old schema version/hash;
- new schema version/hash;
- changed field names without logging sensitive full values unnecessarily.

## Future admin UI

Owner/admin settings screen should provide:

- field validation;
- preview of the formatted executor block;
- tax-mode selection;
- signatory selection;
- save confirmation;
- audit history;
- no secret fields.

## Approval gate

Before writing the setting in production:

1. define server-side update command;
2. require `settings.manage`;
3. validate schema version and field lengths;
4. create audit event;
5. test owner/admin allow and all other roles deny;
6. test act/invoice/contract rendering;
7. obtain explicit production approval.
