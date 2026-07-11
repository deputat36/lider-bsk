#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
registry = root / 'crm/v4/assets/v4/status-transitions-v1.js'
model = root / 'crm/v4/assets/v4/offer-status-ui-model-v1.js'
offers = root / 'crm/v4/assets/v4/offers.js'
test = root / 'tools/test_crm_offer_status_ui.mjs'
manual = root / 'docs/CRM_OFFER_STATUS_UI_REGISTRY_MANUAL_TEST_2026-07-11.md'

errors = []

checks = {
    registry: [
        "label: 'Отправлено', aliases: ['КП отправлено']",
        "timestampField: 'approved_at'",
        "timestampField: 'rejected_at'",
    ],
    model: [
        "from './status-transitions-v1.js'",
        'rawOfferStatus',
        'offerStatusUiModel',
        'offerStatusTargetForAction',
        'validateOfferStatusTransition',
        'leadStatusForOfferStatus',
        'calculationStatusForOfferStatus',
        'Неизвестный статус КП',
        'сохранён без изменения',
    ],
    offers: [
        "from './offer-status-ui-model-v1.js'",
        "from './action-permissions-v1.js'",
        'offerStatusActionButtons',
        'validateOfferStatusTransition(current.status, status)',
        'requireV4Action(CRM_V4_ACTIONS.OFFERS_TRANSITION)',
        'transition.timestampField',
        'calculationStatusForOfferStatus(targetStatus)',
        'offerStatusTargetForAction(action)',
        'data-unknown-offer-status',
    ],
    test: [
        "offerStatusUiModel('КП отправлено')",
        "validateOfferStatusTransition('Черновик', 'Согласовано').ok, false",
        "validateOfferStatusTransition('Отправлено', 'Согласовано').ok, true",
        "validateOfferStatusTransition('Legacy Offer State', 'Отправлено').reason, 'unknown_from_status'",
        'CRM offer status UI registry behavior is valid.',
    ],
    manual: [
        'Черновик → Отправлено',
        'Черновик → Согласовано',
        'КП отправлено',
        'Legacy Offer State',
        'unknown raw value remains unchanged',
        'no historical status rewrite',
        'no new Supabase table or write path',
        '`nav_*`, `nav-*`, `parket-*` and `broker-*` remain untouched',
    ],
}

for path, markers in checks.items():
    if not path.exists():
        errors.append(f'Missing offer status UI registry file: {path.relative_to(root)}')
        continue
    text = path.read_text(encoding='utf-8')
    for marker in markers:
        if marker not in text:
            errors.append(f'Missing offer status UI marker in {path.relative_to(root)}: {marker}')

if model.exists():
    text = model.read_text(encoding='utf-8')
    for marker in ['supabaseClient', ".from('leader_", '.insert(', '.update(', '.delete(', '.upsert(', '.rpc(', 'fetch(']:
        if marker in text:
            errors.append(f'Offer status UI model must remain side-effect free: {marker}')

if offers.exists():
    text = offers.read_text(encoding='utf-8')
    forbidden = [
        "if (status === 'КП отправлено') patch.sent_at",
        "updateOfferStatus(offerId, 'КП отправлено')",
        "offer.status !== 'КП отправлено'",
        "offer.status !== 'Согласовано' ? '<button",
    ]
    for marker in forbidden:
        if marker in text:
            errors.append(f'Legacy duplicated offer status UI remains: {marker}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('CRM offer status UI uses the canonical registry, guards invalid transitions and preserves unknown raw values.')
