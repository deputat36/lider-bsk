#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
model = (root / 'crm/v4/assets/v4/lead-exception-scenarios-v1.js').read_text(encoding='utf-8')
assistant = (root / 'crm/v4/assets/v4/lead-exception-assistant-v1.js').read_text(encoding='utf-8')
timeline = (root / 'crm/v4/assets/v4/lead-timeline.js').read_text(encoding='utf-8')
manual = (root / 'docs/CRM_LEAD_EXCEPTION_ASSISTANT_MANUAL_TEST_2026-07-20.md').read_text(encoding='utf-8')

errors = []

for marker in [
    'client_changed',
    'additional_work',
    'client_thinks',
    'no_contact',
    'too_expensive',
    'deadline_shift',
    'buildLeadExceptionPlan',
    'Данные ещё не сохранены',
]:
    if marker not in model:
        errors.append('Missing exception model marker: ' + marker)

for source_name, source in [('model', model), ('assistant', assistant)]:
    for forbidden in ['supabaseClient', ".from('", '.insert(', '.update(', '.delete(', 'fetch(']:
        if forbidden in source:
            errors.append(f'{source_name} must remain without a network/write path: {forbidden}')

for marker in [
    'Ситуация изменилась',
    'data-lead-exception-prepare',
    'leadNextContactInput',
    'leadTimelineType',
    'leadTimelineBody',
    'is-recommended',
    'leader-v4:lead-exception-prepared',
    'Сохраните статус, дату контакта и запись в истории',
]:
    if marker not in assistant:
        errors.append('Missing assistant marker: ' + marker)

for forbidden in ['.click()', '.submit()', 'requestSubmit()', 'leaderAddLeadEvent(']:
    if forbidden in assistant:
        errors.append('Assistant must prepare existing controls without automatic save: ' + forbidden)

if "import './lead-exception-assistant-v1.js?v=20260720-1';" not in timeline:
    errors.append('Lead timeline must load the exception assistant with the canonical cache marker')

for marker in [
    'Desktop',
    'Mobile',
    'Без автоматического сохранения',
    'Повторное открытие карточки',
    'Production boundary',
]:
    if marker not in manual:
        errors.append('Missing manual test marker: ' + marker)

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('CRM lead exception assistant contract is valid.')
