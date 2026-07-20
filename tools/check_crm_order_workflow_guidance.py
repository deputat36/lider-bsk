#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
model = (root / 'crm/v4/assets/v4/order-workflow-guidance-model-v1.js').read_text(encoding='utf-8')
card = (root / 'crm/v4/assets/v4/order-card-v1.js').read_text(encoding='utf-8')
test = (root / 'tools/test_order_workflow_guidance.mjs').read_text(encoding='utf-8')
manual = (root / 'docs/CRM_ORDER_WORKFLOW_GUIDANCE_MANUAL_TEST_2026-07-20.md').read_text(encoding='utf-8')
workflow = (root / '.github/workflows/crm-order-workflow-guidance-check.yml').read_text(encoding='utf-8')

errors = []

for marker in [
    'buildOrderPrimaryAction',
    'ORDER_EXCEPTION_SCENARIOS',
    'buildOrderExceptionPlan',
    'resolve_overdue',
    'approve_layout',
    'settle_cancelled_order',
    'defect_rework',
    'partial_ready',
]:
    if marker not in model:
        errors.append('Missing order guidance model marker: ' + marker)

for forbidden in ['supabaseClient', "from('", '.insert(', '.update(', '.delete(', 'fetch(', 'invokeLeaderFunction']:
    if forbidden in model:
        errors.append('Order guidance model must remain side-effect free: ' + forbidden)

for marker in [
    "from './order-workflow-guidance-model-v1.js'",
    'data-order-primary-action',
    'data-order-primary-target',
    'Что сделать сейчас',
    'Ситуация изменилась',
    'data-order-exception-select',
    'data-order-exception-open',
    'data-order-exception-copy',
    'Ничего ещё не сохранено',
    'openTarget',
    'copyExceptionNote',
]:
    if marker not in card:
        errors.append('Missing order card guidance marker: ' + marker)

for forbidden in ['.insert(', '.update(', '.delete(', 'invokeLeaderFunction']:
    if forbidden in card:
        errors.append('Order card guidance must not add a write path: ' + forbidden)

if 'class="v4-primary" data-order-card-open-lead' in card:
    errors.append('Linked lead action must remain visually secondary')

for marker in [
    'review_unknown_status',
    'resolve_overdue',
    'verify_payment_before_start',
    'resolve_production_problem',
    'ORDER_EXCEPTION_SCENARIOS.length, 8',
    'Object.isFrozen',
]:
    if marker not in test:
        errors.append('Missing order guidance unit-test marker: ' + marker)

for marker in ['Desktop', 'Mobile', 'Роли', 'Network', 'Production boundary']:
    if marker not in manual:
        errors.append('Missing manual test marker: ' + marker)

for marker in [
    'node --check crm/v4/assets/v4/order-workflow-guidance-model-v1.js',
    'node --check crm/v4/assets/v4/order-card-v1.js',
    'node tools/test_order_workflow_guidance.mjs',
    'python3 tools/check_crm_order_workflow_guidance.py',
]:
    if marker not in workflow:
        errors.append('Missing workflow marker: ' + marker)

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('CRM order workflow guidance contract is valid.')
