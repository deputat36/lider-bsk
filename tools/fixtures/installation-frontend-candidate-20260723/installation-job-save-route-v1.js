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
      title: 'Тестовый staging',
      description: 'Монтажное задание будет сохранено одной атомарной командой через защищённый сервер.',
      buttonPrefix: 'Сохранить в staging'
    });
  }

  return Object.freeze({
    mode: 'production_locked',
    enabled: false,
    atomic: false,
    browserDirectWrite: false,
    reason: 'production_backend_not_deployed',
    title: 'Новый серверный маршрут не включён',
    description: 'Подключение installation Edge к production запрещено до отдельного production rollout.',
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
