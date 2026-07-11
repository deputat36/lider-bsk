# CRM v4: manual test for commercial-offer status registry

Related: #200, #202, #204, #217.

Test URL: `https://deputat36.github.io/lider-bsk/crm/v4/?tab=leads`

## Expected transition sequence

1. Create an offer and confirm the status is `Черновик`.
2. Confirm only `Черновик → Отправлено` is offered.
3. Confirm `Черновик → Согласовано` and `Черновик → Отклонено` are not offered and are blocked if triggered manually.
4. Move the offer to `Отправлено`.
5. Confirm only `Согласовано` and `Отклонено` are offered by the current UI.
6. Move it to `Согласовано` and confirm no reopening action is shown.

## Legacy alias

For a fixture or existing row with status `КП отправлено`:

- the UI recognizes it as canonical `Отправлено`;
- the exact database value is not rewritten merely by rendering;
- allowed actions are the same as for `Отправлено`.

## Unknown raw status

For a non-production fixture with status `Legacy Offer State`:

- the exact value is displayed with an unknown-status warning;
- the unknown raw value remains unchanged;
- all status actions are hidden;
- a manually triggered transition is rejected before a write request.

## Network and data proof

- inspect requests to `leader_commercial_offers`;
- a valid status click produces only the existing update flow;
- invalid and unknown transitions produce no update request;
- timestamps use `sent_at`, `approved_at` or `rejected_at` according to registry;
- linked lead/calculation updates retain their existing behavior;
- no historical status rewrite or background normalization occurs;
- no new Supabase table or write path is introduced by the pure model;
- no Edge Function, RLS, grant, Auth or Storage change is involved;
- `nav_*`, `nav-*`, `parket-*` and `broker-*` remain untouched.

## Role proof

- owner/admin/manager with `offers.transition` can use valid UI transitions;
- a role without the action is denied by the UI guard;
- this remains defense-in-depth only until #202/#204 add server-side enforcement.

## Pass criteria

- buttons match the canonical registry;
- legacy `КП отправлено` remains readable as an alias;
- unknown raw values are visible and immutable through this UI;
- invalid transitions do not send a request;
- canonical new sent status is `Отправлено`;
- production data is not rewritten automatically.
