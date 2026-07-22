import { isStagingInstallationEnvironment } from './installation-job-staging-transport-v1.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(value) {
  return String(value ?? '').trim();
}

export function installationJobPersistenceRoute(supabaseUrl = '') {
  if (isStagingInstallationEnvironment(supabaseUrl)) {
    return Object.freeze({
      mode: 'staging_edge',
      enabled: true,
      atomic: true,
      browserDirectWrite: false,
      reason: '',
      title: 'Изолированный staging',
      description: 'Чтение и сохранение выполняются через защищённый installation Edge.',
      buttonPrefix: 'Сохранить в staging'
    });
  }

  return Object.freeze({
    mode: 'production_legacy',
    enabled: true,
    atomic: false,
    browserDirectWrite: true,
    reason: 'existing_production_path',
    title: 'Рабочий production',
    description: 'Production сохраняет прежний путь. Installation Edge здесь не включён.',
    buttonPrefix: 'Сохранить'
  });
}

export function createInstallationJobIdempotencyKey(jobId, cryptoObject = globalThis.crypto) {
  const id = text(jobId);
  const randomId = cryptoObject?.randomUUID?.();
  if (!UUID_PATTERN.test(id)) throw new Error('job_id_invalid');
  if (!UUID_PATTERN.test(text(randomId))) throw new Error('secure_request_id_unavailable');
  return `installation-job:${id}:${randomId}`;
}
