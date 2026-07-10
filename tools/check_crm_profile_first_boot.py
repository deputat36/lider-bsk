#!/usr/bin/env python3
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[1]
auth = root / 'crm/v4/assets/v4/auth.js'
manual = root / 'docs/CRM_PROFILE_FIRST_BOOT_MANUAL_TEST_2026-07-10.md'

errors = []

if not auth.exists():
    errors.append('Missing CRM v4 auth module')
else:
    text = auth.read_text(encoding='utf-8')
    required = [
        'function beginProfileCheck(session)',
        'async function resolveProfile(user)',
        'function activateCrm(session, profile, statusText)',
        'async function prepareCrm(session, statusText',
        'profileLoaded: false',
        'crmReady: false',
        'if (profile.is_active !== true)',
        'denyInactiveProfile(profile)',
        'activateCrm(session, profile, statusText)',
        'Рабочие данные пока не загружаются',
        'Рабочие данные не загружаются, пока профиль и роль не будут подтверждены',
        "return await prepareCrm(data.session, 'CRM готова')",
    ]
    for marker in required:
        if marker not in text:
            errors.append(f'Missing profile-first auth marker: {marker}')

    forbidden = [
        'window.setTimeout(() => loadProfileInBackground(session.user), 400)',
        'function openCrm(session',
        'async function loadProfileInBackground(user)',
    ]
    for marker in forbidden:
        if marker in text:
            errors.append(f'Legacy profile-after-ready marker remains: {marker}')

    activate_start = text.find('function activateCrm(')
    activate_end = text.find('\n}\n', activate_start)
    activate_body = text[activate_start:activate_end] if activate_start >= 0 and activate_end >= 0 else ''
    if 'crmReady: true' not in activate_body or 'emitCrmReady();' not in activate_body:
        errors.append('CRM ready state/event must be emitted inside active-profile activation')

    prepare_start = text.find('async function prepareCrm(')
    prepare_end = text.find('\n}\n', prepare_start)
    prepare_body = text[prepare_start:prepare_end] if prepare_start >= 0 and prepare_end >= 0 else ''
    if not (
        prepare_body.find('const profile = await resolveProfile(session.user)') >= 0
        and prepare_body.find('if (profile.is_active !== true)') >= 0
        and prepare_body.find('activateCrm(session, profile, statusText)') >= 0
        and prepare_body.find('const profile = await resolveProfile(session.user)')
        < prepare_body.find('if (profile.is_active !== true)')
        < prepare_body.find('activateCrm(session, profile, statusText)')
    ):
        errors.append('Profile resolution, active check and CRM activation order is invalid')

if not manual.exists():
    errors.append('Missing CRM profile-first manual test')
else:
    text = manual.read_text(encoding='utf-8')
    required = [
        'Active user',
        'Inactive/pending user',
        'Missing profile',
        'Network/profile error',
        'Expired stored session',
        'no inactive or unverified profile reaches `crmReady=true`',
        'does not alter Supabase Auth, RLS, grants, policies, database data or Edge Functions',
    ]
    for marker in required:
        if marker not in text:
            errors.append(f'Missing profile-first manual marker: {marker}')

if errors:
    print('\n'.join(errors))
    sys.exit(1)

print('CRM profile-first boot source and manual test are valid.')
