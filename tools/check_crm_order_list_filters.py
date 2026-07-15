#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
ui = (root / 'crm/v4/assets/v4/orders-fast-loader-v1.js').read_text(encoding='utf-8')
model = (root / 'crm/v4/assets/v4/order-list-preferences-v1.js').read_text(encoding='utf-8')
html = (root / 'crm/v4/index.html').read_text(encoding='utf-8')
errors = []
for marker in ['data-orders-fast-search', 'data-orders-fast-filter', 'data-orders-fast-sort', 'data-orders-fast-reset', 'По выбранным условиям заказов нет', 'В базе пока нет заказов']:
    if marker not in ui: errors.append('Missing order list UX marker: ' + marker)
for marker in ['ORDER_LIST_PREFERENCES_KEY', 'selectOrderRows', 'paymentNeedsAttention', 'describeOrderListState']:
    if marker not in model: errors.append('Missing order list model marker: ' + marker)
for marker in [".from('leader_orders')", '.insert(', '.update(', '.delete(', 'supabase/functions', 'supabase/migrations']:
    if marker in model: errors.append('Order preferences must remain browser-only: ' + marker)
if 'orders-fast-loader-v1.js?v=20260715-filter-state-1' not in html: errors.append('Missing cache marker')
if errors:
    print('\n'.join(errors)); sys.exit(1)
print('CRM order list filter UX contract is valid and browser-only.')
