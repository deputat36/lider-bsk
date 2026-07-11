# CRM v4: manual test for order status registry adoption

Related: #200, #202, #204, #205, #217.

Test URLs:

- `https://deputat36.github.io/lider-bsk/crm/v4/?tab=orders`;
- `https://deputat36.github.io/lider-bsk/crm/v4/?tab=order_control`.

## Live known statuses

Confirm that orders with `Новый`, `Макет на согласовании`, `В производстве`, `Выдано`:

- retain their exact stored values;
- receive the expected visual state;
- remain in the correct active/terminal counters;
- show consistent status labels in the lead card, fast list, order control and order modal.

## Progress and queues

- `В производстве` marks production as started but not ready;
- `Готово` marks production and readiness;
- `Выдано` marks production, readiness and issue to the client;
- `Закрыт` and `Отменён` are excluded from active counters;
- legacy `Отмена` is recognized as cancelled without rewriting the row.

## Unknown raw status

For a non-production fixture with `Legacy Order State`:

- the exact raw value remains visible;
- an unknown-status warning is displayed;
- the unknown order remains in active counters and queues;
- it is not silently treated as completed or removed;
- rendering sends no update request.

## Network and permissions

- inspect Network while opening all four order views;
- only the existing SELECT requests are expected from this adoption;
- no status update control is added;
- no new Supabase write path is introduced;
- no historical status rewrite or background normalization occurs;
- server-side `orders.transition` remains tracked by #202/#204;
- `nav_*`, `nav-*`, `parket-*` and `broker-*` remain untouched.

## Pass criteria

- all live statuses are recognized by registry;
- four order views classify statuses consistently;
- terminal counters come from registry rather than duplicated sets;
- unknown raw values remain visible and active;
- no order status is changed by rendering.
