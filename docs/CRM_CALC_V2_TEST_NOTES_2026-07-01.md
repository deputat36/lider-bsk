# CRM calc v2 test notes — 2026-07-01

Scope: CRM РА «Лидер», calculation builder v2.
Related issues: #143, #144, #145, #146.

## Main checks

1. Old saved calculations still create commercial offers.
2. Old offer text still hides internal numbers.
3. Contractor quote shell shows cost, client total, profit and margin for manager.
4. Contractor quote mode should save as one calculation and one item.
5. Contractor quote item should use `data.mode = contractor_quote`.
6. Contractor quote item should use `data.visibility = single_line` by default.
7. `single_line` should show one final client-facing line.
8. `detailed` should show only public components.
9. `internal_only` should be hidden from client text.
10. Approved offer should still create an order.

## Safety checks

Client text must not include:

- contractor cost;
- supplier price;
- internal cost;
- profit;
- margin.

## Backward compatibility

Existing production items do not currently use builder JSON fields. Treat missing `data.visibility` as `single_line`.
