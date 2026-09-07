#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
FILES = {
    'offers': ROOT / 'crm/v4/assets/v4/offers.js',
    'css': ROOT / 'crm/v4/assets/v4/offers.css',
    'privacy': ROOT / 'crm/v4/assets/v4/offer-client-privacy-v1.js',
    'print': ROOT / 'crm/v4/assets/v4/offer-print-brand-v4.js',
    'index': ROOT / 'crm/v4/index.html',
    'loader': ROOT / 'crm/v4/assets/v4/crm-v4-tab-loader-v1.js',
    'contract': ROOT / 'supabase/staging-functions/leader-crm-offers/contract.ts',
    'migration': ROOT / 'supabase/staging-migrations/20260907_01_offer_client_privacy_default.sql',
}

errors = []
for name, path in FILES.items():
    if not path.exists():
        errors.append(f'missing {name}: {path.relative_to(ROOT)}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

text = {name: path.read_text(encoding='utf-8') for name, path in FILES.items()}

required = {
    'offers': [
        "from './offer-client-privacy-v1.js'",
        'includeClientDetails = false',
        'offerIncludeClientDetails',
        'Показывать имя и контакты клиента в КП',
        'Персональные данные по умолчанию скрыты',
        'offerCreateSummaryMarkup',
        'v4-offer-privacy ${includeClientDetails',
        'include_client_details: includeClientDetails',
    ],
    'css': [
        '.v4-offer-create-flow',
        '.v4-offer-step',
        '.v4-offer-privacy-toggle',
        '.v4-offer-create-summary',
        '.v4-offer-summary-grid',
        '.v4-offer-privacy.is-anonymous',
        '.v4-offer-privacy.is-personalized',
        '@media(max-width:560px)',
    ],
    'privacy': [
        'storedOfferIncludesClientDetails',
        'storedOfferClientDetails',
        'offerClientIdentityLines',
        'offerGreeting',
        'Без данных клиента',
        'С данными клиента',
    ],
    'print': [
        "from './offer-client-privacy-v1.js'",
        'storedOfferClientDetails(offer)',
        'clientBusinessCard(offer)',
        'clientPresentationCard(offer)',
    ],
    'contract': [
        "'include_client_details'",
        'include_client_details must be a boolean or null',
        'payload.include_client_details === true',
        'include_client_details: includeClientDetails',
    ],
    'migration': [
        'include_client_details',
        'v_include_client_details boolean := false',
        "'include_client_details', v_include_client_details",
        'not v_include_client_details',
    ],
    'index': [
        'offers.css?v=20260907-client-privacy-1',
    ],
    'loader': [
        "import('./offers.js?v=20260907-client-privacy-1')",
    ],
}

for name, markers in required.items():
    for marker in markers:
        if marker not in text[name]:
            errors.append(f'{name}: missing marker {marker}')

if '<input id="offerIncludeClientDetails" type="checkbox" checked' in text['offers']:
    errors.append('privacy checkbox must not be checked by default')
if ".from('leader_leads')" in text['print'] or 'LEAD_FIELDS' in text['print']:
    errors.append('print source must not fetch current lead identity')
if 'lead?.name' in text['print'] or 'lead?.phone' in text['print']:
    errors.append('print source must not render current lead identity')
if 'include_client_details: true' in text['offers']:
    errors.append('frontend must not hardcode personalized offers')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('CRM offer privacy UX: anonymous default, explicit personalization, live summary, print isolation and responsive UI PASS')
