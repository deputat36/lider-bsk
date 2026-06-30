# CRM public request chain checklist — 2026-06-30

Repository: `deputat36/lider-bsk`.
Public page: `https://www.lider-bsk.ru/request.html`.
CRM audit route: `https://deputat36.github.io/lider-bsk/crm/v4/?tab=public_lead_audit`.

## Purpose

This checklist proves the real chain:

`site form → leader-public-lead → leader_leads → leader_public_lead_audit → CRM audit → leader_request_trace`

The check must be performed in a browser because the current execution environment can block direct POST/curl checks to GitHub Pages or public site endpoints.

## Preparation

1. Open CRM v4.
2. Press Ctrl + F5.
3. Log in as `owner` or `admin`.
4. Open `Аудит заявок`.
5. Open `request.html` in a separate browser tab.
6. Keep DevTools Console open if possible.

## Test A. Normal public request

1. On `request.html`, click one quick scenario in `Выберите похожую задачу`.
2. Fill name/phone/message with test data.
3. Submit the form once.
4. Confirm the success message shows `Номер обращения`.
5. Copy the shown `request_id` / request number.
6. In CRM audit, reload events.
7. Find an event with the same `request_id`.
8. Click or use `Проверить request_id`.
9. Expected result: `Цепочка полная`.
10. Expected audit result: `accepted`.

Record:

- request_id:
- visible CRM lead:
- audit result:
- trace status:
- browser/device:
- date/time:

## Test B. Duplicate request_id

Goal: prove that a repeated request is not counted as a new accepted lead.

Technical method can be browser console, a small temporary local script, or another controlled test tool that sends the same `request_id` payload to `leader-public-lead`.

Expected result:

- HTTP response remains user-safe;
- audit records `duplicate`;
- the existing `request_id` is returned;
- no second real lead is created for the same `request_id`.

Record:

- request_id:
- audit result:
- duplicate visible in CRM:
- second lead created: yes/no:

## Test C. Honeypot / suspicious request

Goal: prove that bots filling hidden `website` do not create real leads.

Technical method can be browser console or a controlled POST request with non-empty `website`.

Expected result:

- audit records `suspicious`;
- reason is `honeypot_filled`;
- no real lead is created.

Record:

- request_id:
- audit result:
- reason:
- lead created: yes/no:

## Test D. Invalid payload / rejected request

Goal: prove that empty contact payload is rejected safely.

Send a request without phone and without message.

Expected result:

- client receives validation error;
- audit records `rejected`;
- reason is `phone_or_message_required`;
- no real lead is created.

Record:

- request_id:
- audit result:
- reason:
- lead created: yes/no:

## Pass criteria

The chain is considered browser-proven only when all are true:

- normal request creates one lead and one `accepted` audit event;
- request number shown to the user equals stored `request_id`;
- `Проверить request_id` shows `Цепочка полная`;
- duplicate request records `duplicate`, not another `accepted`;
- honeypot records `suspicious` and creates no lead;
- invalid empty request records `rejected` and creates no lead.

## Current status

As of this checkpoint, the manual browser proof is still required.

Supabase production was not changed while creating this checklist.
