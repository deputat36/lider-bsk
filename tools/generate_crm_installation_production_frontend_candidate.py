#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / 'build/installation-production-frontend-candidate'

PRODUCTION_PROJECT_REF = 'ofewxuqfjhamgerwzull'
PRODUCTION_HOSTNAME = f'{PRODUCTION_PROJECT_REF}.supabase.co'

SOURCES = {
    'route': {
        'path': ROOT / 'crm/v4/assets/v4/installation-job-save-route-v1.js',
        'blob_sha': '64d6137600261d22397ff348f72a60eb908d5d4b',
    },
    'write_transport': {
        'path': ROOT / 'crm/v4/assets/v4/installation-job-staging-transport-v1.js',
        'blob_sha': 'a4f265fe53c438095ebcbc7b58d22e90e551c057',
    },
    'read_transport': {
        'path': ROOT / 'crm/v4/assets/v4/installation-job-staging-read-transport-v1.js',
        'blob_sha': 'b5ebf2a0b05404b639b63b7f8aae27c3574464ce',
    },
    'card': {
        'path': ROOT / 'crm/v4/assets/v4/installation-job-card-v2.js',
        'blob_sha': '1c360e08ce954d7879bc075bc203d3fd406db0ae',
    },
    'index': {
        'path': ROOT / 'crm/v4/index.html',
        'blob_sha': '404719b0338c4fc6d5c8b0cd5f5b85e06d902973',
    },
}


def git_blob_sha(data: bytes) -> str:
    header = f'blob {len(data)}\0'.encode('utf-8')
    return hashlib.sha1(header + data).hexdigest()


def load_sources() -> dict[str, str]:
    loaded: dict[str, str] = {}
    for name, spec in SOURCES.items():
        path = spec['path']
        raw = path.read_bytes()
        actual = git_blob_sha(raw)
        if actual != spec['blob_sha']:
            raise SystemExit(
                f'{name} source drift: expected Git blob {spec["blob_sha"]}, got {actual}'
            )
        loaded[name] = raw.decode('utf-8')
    return loaded


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected one occurrence, got {count}: {old!r}')
    return text.replace(old, new, 1)


def replace_all_required(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise SystemExit(f'{label}: missing marker {old!r}')
    return text.replace(old, new)


def replace_section(text: str, start: str, end: str, replacement: str, label: str) -> str:
    start_pos = text.find(start)
    end_pos = text.find(end, start_pos + len(start))
    if start_pos < 0 or end_pos < 0 or end_pos <= start_pos:
        raise SystemExit(f'{label}: section markers not found')
    return text[:start_pos] + replacement.rstrip() + '\n\n' + text[end_pos:]


def production_write_transport(source: str) -> str:
    text = source
    pairs = [
        ("const STAGING_PROJECT_REF = 'otulfnouybahfnsycxqn';", f"const PRODUCTION_PROJECT_REF = '{PRODUCTION_PROJECT_REF}';"),
        ("const STAGING_HOSTNAME = `${STAGING_PROJECT_REF}.supabase.co`;", "const PRODUCTION_HOSTNAME = `${PRODUCTION_PROJECT_REF}.supabase.co`;"),
        ("return hostname === STAGING_HOSTNAME ? STAGING_PROJECT_REF : '';", "return hostname === PRODUCTION_HOSTNAME ? PRODUCTION_PROJECT_REF : '';"),
        ('export function isStagingInstallationEnvironment', 'export function isProductionInstallationEnvironment'),
        ('=== STAGING_PROJECT_REF;', '=== PRODUCTION_PROJECT_REF;'),
        ('export function installationStagingTransportAvailability', 'export function installationProductionTransportAvailability'),
        ('const staging = isStagingInstallationEnvironment(supabaseUrl);', 'const production = isProductionInstallationEnvironment(supabaseUrl);'),
        ("if (!staging) reason = 'production_locked';", "if (!production) reason = 'production_locked';"),
        ('enabled: staging && canWrite === true', 'enabled: production && canWrite === true'),
        ('    staging,\n', '    production,\n'),
        ('export function buildStagingInstallationJobCommand', 'export function buildProductionInstallationJobCommand'),
        ('export function installationStagingResultMessage', 'export function installationProductionResultMessage'),
        ('export async function invokeStagingInstallationJob', 'export async function invokeProductionInstallationJob'),
        ('const availability = installationStagingTransportAvailability', 'const availability = installationProductionTransportAvailability'),
        ('command = buildStagingInstallationJobCommand', 'command = buildProductionInstallationJobCommand'),
        ('installationStagingResultMessage', 'installationProductionResultMessage'),
    ]
    for old, new in pairs:
        text = replace_all_required(text, old, new, 'write transport')

    message_pairs = [
        ('Монтажное задание сохранено одной командой только в staging.', 'Монтажное задание сохранено одной атомарной командой в production.'),
        ('Серверное сохранение монтажа разрешено только в staging.', 'Серверное сохранение монтажа разрешено только в production CRM.'),
        ('Нужен вход отдельного staging-пользователя.', 'Нужен действующий вход в production CRM.'),
        ('У staging-профиля нет права installation.write.', 'У профиля нет права installation.write.'),
        ('Монтажное задание не найдено в staging.', 'Монтажное задание не найдено.'),
        ('Не удалось связаться со staging Edge Function.', 'Не удалось связаться с production Edge Function.'),
        ('Staging не смог атомарно сохранить монтажное задание.', 'Production Edge не смог атомарно сохранить монтажное задание.'),
        ('Staging вернул неизвестный результат.', 'Production Edge вернул неизвестный результат.'),
    ]
    for old, new in message_pairs:
        text = replace_once(text, old, new, 'write transport messages')

    forbidden = [
        "otulfnouybahfnsycxqn",
        'STAGING_PROJECT_REF',
        'STAGING_HOSTNAME',
        'isStagingInstallationEnvironment',
        'installationStagingTransportAvailability',
        'buildStagingInstallationJobCommand',
        'installationStagingResultMessage',
        'invokeStagingInstallationJob',
    ]
    for marker in forbidden:
        if marker in text:
            raise SystemExit(f'write transport still contains staging marker: {marker}')
    return text


def production_read_transport(source: str) -> str:
    text = source
    pairs = [
        ("const STAGING_PROJECT_REF = 'otulfnouybahfnsycxqn';", f"const PRODUCTION_PROJECT_REF = '{PRODUCTION_PROJECT_REF}';"),
        ("const STAGING_HOSTNAME = `${STAGING_PROJECT_REF}.supabase.co`;", "const PRODUCTION_HOSTNAME = `${PRODUCTION_PROJECT_REF}.supabase.co`;"),
        ('export function isExactInstallationStagingUrl', 'export function isExactInstallationProductionUrl'),
        ('=== STAGING_HOSTNAME;', '=== PRODUCTION_HOSTNAME;'),
        ('export function installationStagingReadAvailability', 'export function installationProductionReadAvailability'),
        ('const staging = isExactInstallationStagingUrl(supabaseUrl);', 'const production = isExactInstallationProductionUrl(supabaseUrl);'),
        ("if (!staging) reason = 'production_locked';", "if (!production) reason = 'production_locked';"),
        ('enabled: staging && canRead === true', 'enabled: production && canRead === true'),
        ('    staging,\n', '    production,\n'),
        ('export function installationStagingReadMessage', 'export function installationProductionReadMessage'),
        ('export async function invokeStagingInstallationJobRead', 'export async function invokeProductionInstallationJobRead'),
        ('const availability = installationStagingReadAvailability', 'const availability = installationProductionReadAvailability'),
        ('installationStagingReadMessage', 'installationProductionReadMessage'),
    ]
    for old, new in pairs:
        text = replace_all_required(text, old, new, 'read transport')

    message_pairs = [
        ('Монтажное задание загружено через защищённый staging Edge.', 'Монтажное задание загружено через защищённый production Edge.'),
        ('Серверное чтение монтажа разрешено только в staging.', 'Серверное чтение монтажа разрешено только в production CRM.'),
        ('Нужен вход отдельного staging-пользователя.', 'Нужен действующий вход в production CRM.'),
        ('У staging-профиля нет права installation.read.', 'У профиля нет права installation.read.'),
        ('Монтажное задание не найдено в staging.', 'Монтажное задание не найдено.'),
        ('Не удалось связаться со staging Edge Function.', 'Не удалось связаться с production Edge Function.'),
        ('Staging не смог безопасно загрузить монтажное задание.', 'Production Edge не смог безопасно загрузить монтажное задание.'),
        ('Staging вернул неизвестный результат чтения.', 'Production Edge вернул неизвестный результат чтения.'),
    ]
    for old, new in message_pairs:
        text = replace_once(text, old, new, 'read transport messages')

    forbidden = [
        "otulfnouybahfnsycxqn",
        'STAGING_PROJECT_REF',
        'STAGING_HOSTNAME',
        'isExactInstallationStagingUrl',
        'installationStagingReadAvailability',
        'installationStagingReadMessage',
        'invokeStagingInstallationJobRead',
    ]
    for marker in forbidden:
        if marker in text:
            raise SystemExit(f'read transport still contains staging marker: {marker}')
    return text


def production_route() -> str:
    return """import { isProductionInstallationEnvironment } from './installation-job-production-transport-v1.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(value) {
  return String(value ?? '').trim();
}

export function installationJobPersistenceRoute(supabaseUrl = '') {
  if (isProductionInstallationEnvironment(supabaseUrl)) {
    return Object.freeze({
      mode: 'production_edge',
      enabled: true,
      atomic: true,
      browserDirectWrite: false,
      browserDirectRead: false,
      commentsWriteEnabled: false,
      reason: '',
      title: 'Production Edge',
      description: 'Монтажное задание читается и сохраняется через защищённый production Edge.',
      buttonPrefix: 'Сохранить'
    });
  }

  return Object.freeze({
    mode: 'production_locked',
    enabled: false,
    atomic: false,
    browserDirectWrite: false,
    browserDirectRead: false,
    commentsWriteEnabled: false,
    reason: 'production_environment_mismatch',
    title: 'Серверный маршрут недоступен',
    description: 'Монтажный backend разрешён только для точного production Supabase URL.',
    buttonPrefix: 'Серверное сохранение недоступно'
  });
}

export function createInstallationJobIdempotencyKey(jobId, cryptoObject = globalThis.crypto) {
  const id = text(jobId);
  const randomId = cryptoObject?.randomUUID?.();
  if (!UUID_PATTERN.test(id)) throw new Error('job_id_invalid');
  if (!UUID_PATTERN.test(text(randomId))) throw new Error('secure_request_id_unavailable');
  return `installation-job:${id}:${randomId}`;
}
"""


def production_card(source: str) -> str:
    text = source
    import_pairs = [
        ("from './installation-job-save-route-v1.js'", "from './installation-job-save-route-v2.js'"),
        ("import { invokeStagingInstallationJob } from './installation-job-staging-transport-v1.js';", "import { invokeProductionInstallationJob } from './installation-job-production-transport-v1.js';"),
        ("import { invokeStagingInstallationJobRead } from './installation-job-staging-read-transport-v1.js';", "import { invokeProductionInstallationJobRead } from './installation-job-production-read-transport-v1.js';"),
        ('function stagingEdgeEnabled() {', 'function productionEdgeEnabled() {'),
        ("return persistenceRoute().mode === 'staging_edge';", "return persistenceRoute().mode === 'production_edge';"),
    ]
    for old, new in import_pairs:
        text = replace_once(text, old, new, 'card imports')

    text = replace_all_required(text, 'stagingEdgeEnabled()', 'productionEdgeEnabled()', 'card edge helper')
    text = replace_all_required(text, "route.mode === 'staging_edge'", "route.mode === 'production_edge'", 'card route mode')
    text = replace_all_required(text, 'isStaging', 'isProductionEdge', 'card route variable')
    text = replace_all_required(text, 'invokeStagingInstallationJobRead', 'invokeProductionInstallationJobRead', 'card read invoke')
    text = replace_all_required(text, 'invokeStagingInstallationJob', 'invokeProductionInstallationJob', 'card write invoke')

    fetch_bundle = """async function fetchBundle(jobId) {
  if (!canOpenV4ProductionKind('installation')) throw new Error('Доступ к монтажным заданиям не разрешён');
  const route = persistenceRoute();
  if (!route.enabled || route.mode !== 'production_edge') {
    throw new Error(route.description || 'Production installation Edge недоступен');
  }
  const result = await invokeProductionInstallationJobRead({
    client: supabaseClient,
    supabaseUrl: V4_CONFIG.supabaseUrl,
    canRead: true,
    jobId
  });
  if (!result.ok) throw new Error(result.message);
  return result.bundle;
}"""
    text = replace_section(text, 'async function fetchBundle(jobId) {', 'function renderItems(items) {', fetch_bundle, 'card fetchBundle')

    save_job = """async function saveJob(jobId) {
  if (busy || !canOpenV4ProductionKind('installation')) return;
  busy = true;
  try {
    const route = persistenceRoute();
    if (!route.enabled || route.mode !== 'production_edge') {
      throw new Error(route.description || 'Production installation Edge недоступен');
    }
    const old = currentBundle?.job || (await fetchBundle(jobId)).job;
    const selectedStatus = field('installJobStatus') || rawInstallationFallback(old.install_status);
    const transition = validateInstallationStatusTransition(old.install_status, selectedStatus);
    if (!transition.ok) throw new Error(transitionErrorMessage(transition, old.install_status, selectedStatus));
    const status = transition.storedValue;
    const scheduledRaw = field('installJobScheduled');
    const edgePatch = {
      title: field('installJobTitle') || old.title,
      install_status: status,
      installer_name: field('installJobInstaller') || null,
      installer_phone: field('installJobInstallerPhone') || null,
      address: field('installJobAddress') || null,
      scheduled_at: scheduledRaw ? new Date(scheduledRaw).toISOString() : null,
      before_photo_url: field('installJobBefore') || null,
      after_photo_url: field('installJobAfter') || null,
      technical_task: field('installJobTask') || null,
      tools_required: field('installJobTools') || null,
      installer_comment: field('installJobComment') || null
    };
    const result = await invokeProductionInstallationJob({
      client: supabaseClient,
      supabaseUrl: V4_CONFIG.supabaseUrl,
      canWrite: true,
      job: old,
      patch: edgePatch,
      expectedUpdatedAt: old.updated_at,
      idempotencyKey: createInstallationJobIdempotencyKey(jobId),
      readAfterSuccess: () => fetchBundle(jobId)
    });
    if (!result.ok) throw new Error(result.message);
    toast(result.message);
    setStatus(result.message, 'good');
    document.dispatchEvent(new CustomEvent('leader-v4-order-updated', { detail: { order: { id: old.order_id, installation_status: status } } }));
    renderCard(result.refreshed || await fetchBundle(jobId));
  } catch (error) {
    toast(friendlyError(error));
    setStatus(`Ошибка монтажа: ${friendlyError(error)}`, 'error');
  } finally { busy = false; }
}"""
    text = replace_section(text, 'async function saveJob(jobId) {', 'function rawInstallationFallback(value) {', save_job, 'card saveJob')

    add_comment = """async function addComment() {
  toast('Комментарии к монтажу доступны только для чтения до отдельной server action.');
}"""
    text = replace_section(text, 'async function addComment(jobId) {', 'async function printJob(jobId) {', add_comment, 'card addComment')

    message_pairs = [
        ('В staging комментарии доступны только для чтения до отдельной server action.', 'Комментарии доступны только для чтения до отдельной production server action.'),
        ('data-installation-staging-edge', 'data-installation-production-edge'),
        ("const saveLabel = isProductionEdge ? route.buttonPrefix : 'Сохранить';", "const saveLabel = route.buttonPrefix;"),
        ("const routeNotice = isProductionEdge ?", "const routeNotice = route.enabled ?"),
    ]
    for old, new in message_pairs:
        text = replace_once(text, old, new, 'card messages')

    forbidden = [
        "supabaseClient.from('leader_installation_jobs')",
        "supabaseClient.from('leader_orders')",
        "supabaseClient.from('leader_installation_job_items')",
        "supabaseClient.from('leader_installation_events')",
        "supabaseClient.from('leader_installation_comments')",
        'invokeStagingInstallationJob',
        'invokeStagingInstallationJobRead',
        "mode === 'staging_edge'",
        'stagingEdgeEnabled()',
    ]
    for marker in forbidden:
        if marker in text:
            raise SystemExit(f'candidate card contains forbidden direct/staging marker: {marker}')
    return text


def candidate_index(source: str) -> str:
    old = '<script type="module" src="assets/v4/installation-job-card-v2.js?v=20260622-1"></script>'
    new = '<script type="module" src="assets/v4/installation-job-card-v3.js?v=20260723-production-edge-candidate-1"></script>'
    return replace_once(source, old, new, 'index loader')


def main() -> int:
    sources = load_sources()
    outputs = {
        'crm/v4/assets/v4/installation-job-save-route-v2.js': production_route(),
        'crm/v4/assets/v4/installation-job-production-transport-v1.js': production_write_transport(sources['write_transport']),
        'crm/v4/assets/v4/installation-job-production-read-transport-v1.js': production_read_transport(sources['read_transport']),
        'crm/v4/assets/v4/installation-job-card-v3.js': production_card(sources['card']),
        'crm/v4/index.html': candidate_index(sources['index']),
    }

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for relative, content in outputs.items():
        target = OUT_DIR / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content, encoding='utf-8')

    manifest = {
        'contract': 'crm-installation-production-frontend-candidate',
        'version': 1,
        'status': 'source_only_not_switched',
        'production_project_ref': PRODUCTION_PROJECT_REF,
        'allowed_hostname': PRODUCTION_HOSTNAME,
        'source_blobs': {name: spec['blob_sha'] for name, spec in SOURCES.items()},
        'outputs': sorted(outputs),
        'cutover': {
            'read': 'single_production_edge_action',
            'write': 'single_atomic_production_edge_action',
            'browser_direct_read': False,
            'browser_direct_write': False,
            'comments_write': False,
            'loader_switch_in_generated_index_only': True,
        },
        'production_boundary': {
            'repository_working_files_changed': False,
            'production_frontend_switched': False,
            'production_supabase_changed': False,
            'edge_deployed': False,
        },
    }
    (OUT_DIR / 'manifest.json').write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8'
    )
    print(f'Generated {len(outputs)} candidate files in {OUT_DIR.relative_to(ROOT)}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
