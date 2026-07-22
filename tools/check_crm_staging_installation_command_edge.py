#!/usr/bin/env python3
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STAGING = 'otulfnouybahfnsycxqn'
PRODUCTION = 'ofewxuqfjhamgerwzull'
EDGE_SHA = '24183605aad2c5cfcc84ebe14c348dcfce1b68de41a43dcfb973f65cef8cb369'
READ_MD5 = '01e91816d4f3a6a1bea2d6cbe760011f'
WRITE_MD5 = '0ed4669197dac1f2695d0eec54e1'

files = {
    'evidence': ROOT / 'contracts/crm-staging-installation-command-edge-v1.json',
    'read': ROOT / 'contracts/crm-staging-installation-read-edge-v1.json',
    'runtime': ROOT / 'contracts/crm-staging-installation-runtime-smoke-v1.json',
    'edge': ROOT / 'supabase/staging-functions/leader-crm-installation/index.ts',
    'edge_contract': ROOT / 'supabase/staging-functions/leader-crm-installation/contract.ts',
    'update_rpc': ROOT / 'supabase/staging-migrations/20260721_06_installation_job_update_rpc.sql',
    'capability_rpc': ROOT / 'supabase/staging-migrations/20260722_05_installation_read_capabilities.sql',
    'staging_transport': ROOT / 'crm/v4/assets/v4/installation-job-staging-transport-v1.js',
    'staging_card': ROOT / 'crm/v4/assets/v4/installation-job-staging-card-v1.js',
    'production_card': ROOT / 'crm/v4/assets/v4/installation-job-card-v2.js',
    'workflow': ROOT / '.github/workflows/crm-staging-installation-command-edge-check.yml',
}
texts = {}
errors = []
for name, path in files.items():
    if not path.is_file():
        errors.append(f'Missing file: {path.relative_to(ROOT)}')
        texts[name] = ''
    else:
        texts[name] = path.read_text(encoding='utf-8')

try:
    evidence = json.loads(texts['evidence'])
    read = json.loads(texts['read'])
    runtime = json.loads(texts['runtime'])
except Exception as exc:
    evidence = read = runtime = {}
    errors.append(f'Invalid JSON: {exc}')

for key, value in {'contract':'crm-staging-installation-command-edge','version':7,'project_ref':STAGING,'environment':'staging'}.items():
    if evidence.get(key) != value:
        errors.append(f'evidence.{key} drifted')
edge = evidence.get('edge', {})
for key, value in {'slug':'leader-crm-installation','version':2,'verify_jwt':True,'sha256':EDGE_SHA}.items():
    if edge.get(key) != value:
        errors.append(f'edge.{key} drifted')
if set(edge.get('actions', [])) != {'installation_job.read','installation_job.update'}:
    errors.append('edge action inventory drifted')

database = evidence.get('database', {})
if database.get('read_capability_migration_version') != '20260722194950':
    errors.append('read capability migration drifted')
if database.get('schema_reconciliation_required') is not False:
    errors.append('schema must remain reconciled')

update = evidence.get('update_command', {})
for key in ('request_id_required','idempotency_key_required','expected_updated_at_required'):
    if update.get(key) is not True:
        errors.append(f'update.{key} must be true')
for key, value in (update.get('atomicity') or {}).items():
    if value is not True:
        errors.append(f'update.atomicity.{key} must be true')

read_command = evidence.get('read_command', {})
for key in ('privacy_safe_projection','client_contacts_excluded','financial_fields_excluded','internal_comments_excluded','order_data_excluded','order_installation_status_included','server_capabilities_included','server_can_write_projection'):
    if read_command.get(key) is not True:
        errors.append(f'read_command.{key} must be true')
if read_command.get('identity_or_role_exposed') is not False:
    errors.append('read identity/role must remain hidden')

fingerprints = evidence.get('rpc_fingerprints', {})
if ((fingerprints.get('leader_update_installation_job_rpc') or {}).get('md5'), (fingerprints.get('leader_update_installation_job_rpc') or {}).get('bytes')) != (WRITE_MD5,19061):
    errors.append('write fingerprint drifted')
if ((fingerprints.get('leader_read_installation_job_rpc') or {}).get('md5'), (fingerprints.get('leader_read_installation_job_rpc') or {}).get('bytes')) != (READ_MD5,5599):
    errors.append('read fingerprint drifted')

for key in ('edge_checks_canonical_permission','rpc_rechecks_permission','service_role_execute'):
    if evidence.get('authorization', {}).get(key) is not True:
        errors.append(f'authorization.{key} must be true')
for key in ('public_execute','anon_execute','authenticated_execute'):
    if evidence.get('authorization', {}).get(key) is not False:
        errors.append(f'authorization.{key} must be false')

for key in ('installation_jobs','installation_job_items','installation_events','installation_comments','command_receipts','auth_users','active_profiles'):
    if evidence.get('staging_postflight', {}).get(key) != 0:
        errors.append(f'postflight.{key} must be zero')
for key in ('service_role_only','write_regression_passed','write_idempotent_replay','read_privacy_acceptance_passed','capability_acceptance_passed'):
    if evidence.get('staging_postflight', {}).get(key) is not True:
        errors.append(f'postflight.{key} must be true')

readiness = evidence.get('readiness', {})
for key in ('authorization_ready','atomic_update_ready','privacy_safe_read_ready','server_capability_projection_ready','user_jwt_smoke_completed','isolated_staging_frontend_wired'):
    if readiness.get(key) is not True:
        errors.append(f'readiness.{key} must be true')
if readiness.get('authenticated_browser_ui_smoke_completed') is not False or readiness.get('production_ready') is not False:
    errors.append('browser/production readiness drifted')

frontend = evidence.get('frontend', {})
if frontend.get('staging_transport_wired') is not True or frontend.get('server_capability_controls_write') is not True:
    errors.append('staging frontend wiring drifted')
if frontend.get('production_changed') is not False:
    errors.append('production frontend must remain unchanged')
if frontend.get('production_write_path') != 'three_direct_browser_writes':
    errors.append('production legacy path inventory drifted')

if read.get('database', {}).get('rpc_md5') != READ_MD5 or runtime.get('rpc_postflight', {}).get('read', {}).get('md5') != READ_MD5:
    errors.append('read/runtime current fingerprint mismatch')
if runtime.get('status') != 'completed_clean':
    errors.append('runtime smoke must remain completed_clean')

required = {
    'edge_contract': ["INSTALLATION_READ_ACTION = 'installation_job.read'", "INSTALLATION_UPDATE_ACTION = 'installation_job.update'"],
    'edge': ['/rest/v1/rpc/leader_read_installation_job_rpc','/rest/v1/rpc/leader_update_installation_job_rpc','authenticatedUser(req, supabaseUrl, publicKey)'],
    'update_rpc': ['pg_advisory_xact_lock','for update',"'installation_job.update'",'security invoker'],
    'capability_rpc': ["'can_write', leader_private.leader_actor_has_crm_action(p_actor_id, 'installation.write')"],
    'staging_transport': ['invokeStagingInstallationJobRead','invokeStagingInstallationJob','client.functions.invoke(FUNCTION_SLUG, { body: command })'],
    'staging_card': ['capabilities?.can_write === true','expectedUpdatedAt: old.updated_at'],
    'production_card': [".from('leader_installation_jobs').update(patch)",".from('leader_orders').update(",".from('leader_installation_events').insert("],
    'workflow': ['CRM staging installation command Edge check','python3 tools/check_crm_staging_installation_command_edge.py'],
}
for name, markers in required.items():
    for marker in markers:
        if marker not in texts[name]:
            errors.append(f'{name}: missing marker {marker!r}')

for name in ('staging_transport','staging_card'):
    for forbidden in ('.from(','.insert(','.update(','.delete(','.rpc(','service_role','SUPABASE_SERVICE_ROLE_KEY'):
        if forbidden in texts[name]:
            errors.append(f'{name}: forbidden marker {forbidden!r}')
for name in ('edge','edge_contract','update_rpc','capability_rpc'):
    if PRODUCTION in texts[name]:
        errors.append(f'{name}: production ref forbidden')
    if re.search(r'sb_secret_[A-Za-z0-9_-]{10,}', texts[name]):
        errors.append(f'{name}: possible secret material')

production = evidence.get('production_boundary', {})
if production.get('production_project_ref') != PRODUCTION:
    errors.append('production project ref drifted')
for key in ('production_read_rpc_exists','production_read_migration_exists','production_edge_deploy','production_frontend_switch','production_data_changed'):
    if production.get(key) is not False:
        errors.append(f'production.{key} must be false')

if errors:
    print('CRM staging installation command Edge checks failed:', file=sys.stderr)
    for error in errors:
        print(f'- {error}', file=sys.stderr)
    raise SystemExit(1)
print('CRM staging installation command Edge and isolated staging UI contracts are coherent.')
