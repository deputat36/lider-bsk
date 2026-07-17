#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
saved = (root / 'crm/v4/assets/v4/calculations-saved-tools-v2.js').read_text(encoding='utf-8')
offers = (root / 'crm/v4/assets/v4/offers.js').read_text(encoding='utf-8')
model = (root / 'crm/v4/assets/v4/calculation-offer-next-action-model-v1.js').read_text(encoding='utf-8')
html = (root / 'crm/v4/index.html').read_text(encoding='utf-8')
manual = (root / 'docs/CRM_CALCULATION_OFFER_NEXT_ACTION_MANUAL_TEST_2026-07-17.md').read_text(encoding='utf-8')

errors = []

for marker in [
    'calculationOfferNextAction',
    'offerEligibleCalculations',
    'preferredOfferCalculationId',
    'offerCalculationAvailability',
]:
    if marker not in model:
        errors.append('Missing calculation-offer model marker: ' + marker)

for forbidden in ['supabaseClient', ".from('", '.insert(', '.update(', '.delete(', 'fetch(']:
    if forbidden in model:
        errors.append('Calculation-offer model must remain side-effect free: ' + forbidden)

for marker in [
    'data-v2-calc-create-offer',
    'leader-v4:create-offer-from-calculation',
    'CRM_V4_ACTIONS.OFFERS_WRITE',
    'v4State.offers || []',
]:
    if marker not in saved:
        errors.append('Missing saved calculation next-action marker: ' + marker)

for marker in [
    'offerEligibleCalculations',
    'preferredOfferCalculationId',
    'id="offerCreateForm"',
    'leader-v4:create-offer-from-calculation',
    'CRM_V4_ACTIONS.OFFERS_READ',
    'CRM_V4_ACTIONS.OFFERS_WRITE',
    "requireV4Action(CRM_V4_ACTIONS.OFFERS_WRITE)",
    'Для этого расчёта КП уже создано или не указана сумма клиенту',
    'Новое КП недоступно, пока не проверен список существующих предложений',
    'setState({ offers: [offer, ...(v4State.offers || [])] })',
]:
    if marker not in offers:
        errors.append('Missing offers next-action marker: ' + marker)

for marker in [
    'offers.css?v=20260717-next-action-1',
    'calculations-saved-tools-v2.js?v=20260717-offer-next-1',
    'offers.js?v=20260717-next-action-1',
]:
    if marker not in html:
        errors.append('Missing calculation-offer cache marker: ' + marker)

for marker in ['Desktop', 'Mobile', 'Роли', 'Network', 'Production boundary']:
    if marker not in manual:
        errors.append('Missing manual test marker: ' + marker)

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('CRM calculation-to-offer next action contract is valid.')
