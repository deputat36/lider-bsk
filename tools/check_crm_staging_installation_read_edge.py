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

paths = {
    'contract': 'contracts/crm-staging-installation-read-edge-v1.json',
    'command': 'contracts/crm-staging-installation-command-edge-v1.json',
    'runtime': 'contracts/crm-staging-installation-runtime-smoke-v1.json',
    'edge': 'supabase/staging-functions/leader-crm-installation/index.ts',
    'edge_contract': 'supabase/staging-functions/leader-crm-installation/contract.ts',
    'capability_migration': 'supabase/staging-migrations/20260722_05_installation_read_capabilities.sql',
    'capability_acceptance': 'supabase/staging-tests/20260722_installation_frontend_wiring_acceptance.sql',
    'staging_card': 'crm/v4/assets/v4/installation-job-staging-card-v1.js',
    'production_card': 'crm/v4/assets/v4/installation-job-card-v2.js',
    'production_index': 'crm/v4/index.html',
    'workflow': '.github/workflows/crm-staging-installation-read-edge-check.yml',
}
texts = {}
errors = []
for name, relative in paths.items():
    path = ROOT / relative
    if not path.is_file():
        errors.append(f'Missing file: {relative}')
        texts[name] = ''
    else:
        texts[name] = path.read_text(encoding='utf-8')

try:
    contract = json.loads(texts['contract'])
    command = json.loads(texts['command'])
    runtime = json.loads(texts['runtime'])
except Exception as exc:
    contract = command = runtime = {}
    errors.append(f'Invalid JSON: {exc}')

for key, value in {
    'contract': 'crm-staging-installation-read-edge',
    'version': 3,
    'project_ref': STAGING,
    'environment': 'staging',
}.items():
    if contract.get(key) != value:
        errors.append(f'contract.{key} drifted')

edge = contract.get('edge', {})
for key, value in {'slug':'leader-crm-installation','version':2,'verify_jwt':True,'sha256':EDGE_SHA}.items():
    if edge.get(key) != value:
        errors.append(f'contract.edge.{key} drifted')

database = contract.get('database', {})
if (database.get('rpc_md5'), database.get('rpc_bytes')) != (READ_MD5, 5599):
    errors.append('read RPC fingerprint drifted')
if database.get('capability_migration_version') != '20260722194950':
    errors.append('capability migration version drifted')
for key in ('security_invoker','empty_search_path'):
    if database.get(key) is not True:
        errors.append(f'database.{key} must be true')

projection = contract.get('projection', {})
for key in ('entity_has_updated_at','order_has_installation_status','internal_comments_excluded','client_contacts_excluded','financial_fields_excluded','order_data_excluded','server_owned_actor_fields_excluded'):
    if projection.get(key) is not True:
        errors.append(f'projection.{key} must be true')
capabilities = projection.get('capabilities', {})
if capabilities.get('can_write') != 'server_projection_of_installation.write' or capabilities.get('identity_or_role_exposed') is not False:
    errors.append('server capability projection drifted')

for key, value in {'public_execute':False,'anon_execute':False,'authenticated_execute':False,'service_role_execute':True}.items():
    if contract.get('authorization', {}).get(key) != value:
        errors.append(f'authorization.{key} drifted')

acceptance = contract.get('acceptance', {})
for key in ('rollback_privacy_acceptance','runtime_user_jwt_acceptance','capability_acceptance','privacy_sensitive_markers_absent','capability_identity_markers_absent'):
    if acceptance.get(key) is not True:
        errors.append(f'acceptance.{key} must be true')
if acceptance.get('persistent_fixture') is not False or acceptance.get('working_data_changed') is not False:
    errors.append('acceptance persistent flags must be false')

write = contract.get('write_regression', {})
if (write.get('write_rpc_md5'), write.get('write_rpc_bytes')) != (WRITE_MD5, 19061):
    errors.append('write RPC fingerprint drifted')

for key in ('installation_jobs','installation_job_items','installation_events','installation_comments','command_receipts','auth_users','active_profiles'):
    if contract.get('staging_postflight', {}).get(key) != 0:
        errors.append(f'postflight.{key} must be zero')

runtime_gate = contract.get('runtime_gate', {})
for key in ('user_jwt_smoke_completed','auth_cleanup_verified','isolated_staging_frontend_source_wired','frontend_read_wired_on_staging','frontend_write_wired_on_staging'):
    if runtime_gate.get(key) is not True:
        errors.append(f'runtime_gate.{key} must be true')
if runtime_gate.get('authenticated_browser_ui_smoke_completed') is not False or runtime_gate.get('production_frontend_wired') is not False:
    errors.append('browser/production frontend gate drifted')

if runtime.get('status') != 'completed_clean' or runtime.get('rpc_postflight', {}).get('read', {}).get('md5') != READ_MD5:
    errors.append('runtime current postflight drifted')
if command.get('readiness', {}).get('isolated_staging_frontend_wired') is not True or command.get('readiness', {}).get('production_ready') is not False:
    errors.append('command readiness drifted')

required = {
    'edge': ['authenticatedUser(req, supabaseUrl, publicKey)', '/rest/v1/rpc/leader_read_installation_job_rpc'],
    'edge_contract': ["INSTALLATION_READ_ACTION = 'installation_job.read'", "INSTALLATION_READ_PERMISSION = 'installation.read'"],
    'capability_migration': ["'capabilities', jsonb_build_object(", "'can_write', leader_private.leader_actor_has_crm_action(p_actor_id, 'installation.write')", 'security invoker', "set search_path = ''"],
    'capability_acceptance': ['manager_capability_projection_failed','installer_capability_projection_failed','accountant_permission_failed','rollback;'],
    'staging_card': ['invokeStagingInstallationJobRead','capabilities?.can_write === true'],
    'production_card': [".from('leader_installation_jobs').select(jobFields())", ".from('leader_installation_jobs').update(patch)"],
    'workflow': ['CRM staging installation read Edge check','python3 tools/check_crm_staging_installation_read_edge.py'],
}
for name, markers in required.items():
    for marker in markers:
        if marker not in texts[name]:
            errors.append(f'{name}: missing marker {marker!r}')

if 'installation-job-staging-card-v1.js' in texts['production_index'] or 'invokeStagingInstallationJob' in texts['production_card']:
    errors.append('production UI must remain disconnected from staging transport')
if not texts['capability_acceptance'].lower().rstrip().endswith('rollback;') or 'commit;' in texts['capability_acceptance'].lower():
    errors.append('capability acceptance must be rollback-only')
for name in ('edge','edge_contract','capability_migration','capability_acceptance'):
    if PRODUCTION in texts[name]:
        errors.append(f'{name}: production ref forbidden in staging executable source')
    if re.search(r'sb_secret_[A-Za-z0-9_-]{10,}', texts[name]):
        errors.append(f'{name}: possible secret material')

production = contract.get('production_boundary', {})
if production.get('production_project_ref') != PRODUCTION:
    errors.append('production project ref drifted')
for key in ('production_rpc_exists','production_migration_exists','production_edge_deploy','production_frontend_switch','production_data_changed'):
    if production.get(key) is not False:
        errors.append(f'production.{key} must be false')

if errors:
    print('CRM staging installation read Edge checks failed:', file=sys.stderr)
    for error in errors:
        print(f'- {error}', file=sys.stderr)
    raise SystemExit(1)
print('CRM staging installation read Edge, capability projection and isolated staging UI are coherent.')
