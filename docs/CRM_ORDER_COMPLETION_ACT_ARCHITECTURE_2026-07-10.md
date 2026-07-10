# CRM v4: акт выполненных работ — архитектура и план

Related: #200, #202, #204, #214.

Mode: GitHub source implementation plus read-only Supabase inspection. No production DDL, DML, Edge deploy, RLS, grants, policies, Auth or Storage changes were made.

## Business goal

Target flow:

`order → completed work → editable act draft → preview → print/PDF → saved version → sent → signed → audit/history`

The act must use client-facing order data only.

It must never expose:

- contractor cost;
- contractor price;
- profit or margin;
- internal comments;
- raw order JSON;
- staff-only event data.

## Live schema findings

Read-only inspection confirmed:

- `leader_order_documents` does not exist;
- `leader_order_document_items` does not exist;
- `leader_settings` contains no discovered company/legal/tax/document settings;
- `leader_clients` currently provides `name`, `phone`, `address` and `comment` but no full legal requisites;
- `leader_orders` and `leader_order_items` contain enough client-facing fields for a preview;
- `leader_order_items.client_sum` is the safe source for the document amount;
- contractor fields must not be selected by the act preview.

## Stage 1 — source-only preview

Implemented in:

`crm/v4/assets/v4/order-act-preview-v1.js`

Capabilities:

- inject `Создать акт` into the existing order card;
- visible only when `documents.generate` is allowed by the UI action registry;
- fetch only the order, client and client-facing order item fields;
- show completion/production/installation and total mismatch warnings;
- allow editing document date, draft number, basis, parties, tax text, signatory, work rows and statements;
- open an A4 HTML print view;
- use browser print for PDF;
- display an explicit unsaved-draft warning;
- do not issue INSERT, UPDATE or DELETE;
- do not change order, payment, production, installation or document status.

The source-only draft number format is intentionally non-final:

`АВР-YYYY-ЧЕРНОВИК-{order}`

It must not be treated as a unique legal document number.

## Canonical permissions

Added to `crm/v4/assets/v4/action-permissions-v1.js`:

- `documents.read`;
- `documents.create`;
- `documents.update`;
- `documents.generate`;
- `documents.send`;
- `documents.sign`;
- `documents.void`.

Current UI baseline:

- owner/admin: all document actions;
- manager: read/create/update/generate/send;
- accountant: read/generate/send/sign;
- designer/installer/contractor: no document actions.

This remains UI defense-in-depth. Server-side authorization is still required.

## Stage 2 — proposed persistent model

Recommended table:

`public.leader_order_documents`

Suggested columns:

- `id uuid primary key`;
- `owner_id uuid not null`;
- `order_id uuid not null`;
- `client_id uuid null`;
- `document_type text not null`;
- `document_number text not null`;
- `document_year integer not null`;
- `sequence_number bigint not null`;
- `document_date date not null`;
- `status text not null`;
- `version integer not null default 1`;
- `title text not null`;
- `basis text`;
- `currency text not null default 'RUB'`;
- `tax_mode text not null`;
- `subtotal numeric not null`;
- `tax_amount numeric not null default 0`;
- `total numeric not null`;
- `snapshot jsonb not null`;
- `file_path text`;
- `file_url text`;
- `created_by uuid`;
- `updated_by uuid`;
- `sent_at timestamptz`;
- `signed_at timestamptz`;
- `voided_at timestamptz`;
- `created_at timestamptz not null default now()`;
- `updated_at timestamptz not null default now()`.

Recommended uniqueness:

- unique `(document_type, document_number)`;
- unique `(order_id, document_type, version)`;
- check `version > 0`;
- check `total >= 0`.

## Snapshot decision

Use an immutable versioned JSON snapshot for the legal rendering source.

The snapshot should contain:

- executor requisites;
- customer requisites;
- basis;
- completion date;
- tax mode;
- client-facing rows;
- completion statement;
- claims statement;
- signatory details;
- total;
- source order ID and number;
- schema/contract version.

Why snapshot first:

- later edits to order items must not silently change a generated act;
- signed versions must be reproducible;
- rendering requires one immutable payload;
- versions remain auditable.

A separate `leader_order_document_items` table may be added later for reporting, but it must not replace the immutable snapshot used for rendering.

## Server numbering

Final format:

`АВР-YYYY-NNNN`

The final number must be allocated inside one transaction.

Recommended sequence table:

`public.leader_document_number_sequences`

Key:

- `document_type`;
- `document_year`;
- `last_number`.

The server command must lock/update the sequence row and create the document in the same transaction.

Never allocate the final number only in browser JavaScript.

## Target command

Canonical command:

`document.create_act`

Recommended database RPC or protected Edge action:

`leader_create_order_act_rpc(p_payload jsonb)`

The transaction must:

1. resolve the authenticated actor and active CRM profile;
2. require `documents.create` or `documents.generate`;
3. load the order and client-facing items server-side;
4. reject an empty order;
5. validate/normalize editable fields;
6. recompute totals server-side;
7. allocate a unique document number;
8. create immutable snapshot version 1;
9. create an audit event;
10. return the document snapshot for rendering.

Later commands:

- `document.update_draft`;
- `document.generate_file`;
- `document.mark_sent`;
- `document.mark_signed`;
- `document.create_version`;
- `document.void`.

## Status registry

Recommended statuses:

- `draft` / `Черновик`;
- `generated` / `Сформирован`;
- `sent` / `Отправлен клиенту`;
- `signed` / `Подписан`;
- `voided` / `Аннулирован`.

Rules:

- signed documents are immutable;
- voiding requires reason and audit event;
- a new version does not overwrite a signed version;
- document status does not automatically change order/payment status;
- order completion does not automatically mean payment completed;
- printing a preview does not mean the act was sent or signed.

## Company settings dependency

Before persistent generation, add an approved organization-settings contract, for example:

`leader_settings.key = 'company_legal_details_v1'`

Suggested value fields:

- legal/brand name;
- tax identifier;
- registration details if applicable;
- legal/postal address;
- phone/email;
- bank details if required;
- default tax mode;
- default signatory name and role;
- signature/stamp asset references.

Do not store secret credentials in this JSON.

## PDF/storage design

Stage 1 uses browser HTML printing.

Persistent PDF generation may later use a protected Edge Function or approved rendering service.

Requirements:

- A4;
- Russian text support;
- repeating table header;
- no clipped long names;
- page breaks between rows where possible;
- stable file name;
- immutable file for signed version;
- private Storage bucket;
- signed URLs or authenticated download;
- no public bucket for legal documents.

Suggested file name:

`akt-vypolnennyh-rabot-{document_number}-{order_number}.pdf`

## Development-branch test matrix

1. One-row order.
2. Many rows and multi-page print.
3. Long work names.
4. Missing client requisites.
5. Empty order.
6. Mismatch between order total and item total.
7. Incomplete production or installation.
8. Unique concurrent number allocation.
9. New draft version.
10. Signed document immutability.
11. Void with reason.
12. Manager permissions.
13. Accountant permissions.
14. Deny designer/installer/contractor.
15. No contractor cost/internal fields in payload or PDF.
16. Audit event created transactionally.
17. Creating act does not change order/payment status.
18. Private file access.
19. Rollback of migration and Edge/RPC candidate.

## Approval gate

Before production persistence:

1. create/rebase a Supabase development branch;
2. apply migration only to the branch;
3. implement server permission checks;
4. run negative role tests;
5. run concurrent number tests;
6. verify private Storage access;
7. record rollback evidence;
8. obtain explicit production approval.

No production persistence work is authorized by this document.
