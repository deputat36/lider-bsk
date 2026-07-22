import { V4_CONFIG, isV4StagingInstallationPage } from './config.js';
import { supabaseClient } from './supabase-client.js';
import { openStagingInstallationJobCard } from './installation-job-staging-card-v1.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let authBusy = false;

function byId(id) { return document.getElementById(id); }
function text(value) { return String(value ?? '').trim(); }
function setStatus(message, kind = 'info') {
  const node = byId('stagingPageStatus');
  if (!node) return;
  node.textContent = message;
  node.dataset.kind = kind;
}
function setBusy(value) {
  authBusy = value;
  const login = byId('stagingLoginButton');
  const logout = byId('stagingLogoutButton');
  const open = byId('stagingOpenJobButton');
  if (login) login.disabled = value;
  if (logout) logout.disabled = value;
  if (open) open.disabled = value;
}
function showSession(session) {
  const signedIn = Boolean(session?.user);
  byId('stagingLoginForm')?.classList.toggle('hidden', signedIn);
  byId('stagingUserPanel')?.classList.toggle('hidden', !signedIn);
  if (signedIn) byId('stagingUserEmail').textContent = session.user.email || session.user.id;
  else byId('stagingUserEmail').textContent = '—';
}
function exactEnvironment() {
  return isV4StagingInstallationPage(globalThis.location)
    && V4_CONFIG.environment === 'staging_installation'
    && V4_CONFIG.supabaseUrl === 'https://otulfnouybahfnsycxqn.supabase.co'
    && V4_CONFIG.authStorageKey === 'leader_crm_v4_staging_installation_session';
}
async function readSession() {
  if (!exactEnvironment()) throw new Error('Страница не прошла exact-staging проверку');
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) throw error;
  showSession(data.session);
  setStatus(data.session?.user ? 'Staging-сессия активна. Можно открыть синтетическое задание.' : 'Нужен вход временного staging-пользователя.', data.session?.user ? 'good' : 'info');
  return data.session || null;
}
async function login(event) {
  event.preventDefault();
  if (authBusy || !exactEnvironment()) return;
  const email = text(byId('stagingLoginEmail')?.value).toLowerCase();
  const password = String(byId('stagingLoginPassword')?.value || '');
  if (!email || !password) {
    setStatus('Введите email и пароль временного staging-пользователя.', 'error');
    return;
  }
  setBusy(true);
  setStatus('Проверяю вход в staging…');
  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (!data.session?.user) throw new Error('Сессия не получена');
    showSession(data.session);
    byId('stagingLoginPassword').value = '';
    setStatus('Вход выполнен. Сервер проверит права при открытии задания.', 'good');
  } catch (error) {
    showSession(null);
    setStatus(error?.message || 'Не удалось войти в staging.', 'error');
  } finally {
    setBusy(false);
  }
}
async function logout() {
  if (authBusy || !exactEnvironment()) return;
  setBusy(true);
  try {
    await supabaseClient.auth.signOut({ scope: 'local' });
  } catch (_) {
    // Local storage removal below remains the final cleanup fallback.
  } finally {
    try { localStorage.removeItem(V4_CONFIG.authStorageKey); } catch (_) {}
    showSession(null);
    byId('stagingInstallationCardHost').innerHTML = '';
    setStatus('Локальная staging-сессия удалена.');
    setBusy(false);
  }
}
async function openJob(event) {
  event.preventDefault();
  if (authBusy || !exactEnvironment()) return;
  const jobId = text(byId('stagingJobId')?.value);
  if (!UUID_PATTERN.test(jobId)) {
    setStatus('Введите корректный UUID монтажного задания.', 'error');
    return;
  }
  setBusy(true);
  setStatus('Открываю задание через JWT-first Edge…');
  try {
    const session = await readSession();
    if (!session?.user) throw new Error('Сначала войдите временным staging-пользователем');
    await openStagingInstallationJobCard(jobId);
    const url = new URL(location.href);
    url.searchParams.set('job', jobId);
    history.replaceState(null, '', url);
    setStatus('Карточка открыта. Доступ и право записи подтверждает сервер.', 'good');
  } catch (error) {
    setStatus(error?.message || 'Не удалось открыть задание.', 'error');
  } finally {
    setBusy(false);
  }
}
function initialJobFromUrl() {
  try {
    const jobId = text(new URL(location.href).searchParams.get('job'));
    if (!UUID_PATTERN.test(jobId)) return '';
    byId('stagingJobId').value = jobId;
    return jobId;
  } catch (_) {
    return '';
  }
}
async function boot() {
  if (!exactEnvironment()) {
    document.body.innerHTML = '<main class="staging-shell"><section class="staging-warning"><span class="staging-badge">ЗАБЛОКИРОВАНО</span><h1>Неверное окружение</h1><p>Staging-интерфейс разрешён только на отдельном точном пути. Сетевые запросы не выполнялись.</p></section></main>';
    return;
  }
  byId('stagingLoginForm')?.addEventListener('submit', login);
  byId('stagingLogoutButton')?.addEventListener('click', logout);
  byId('stagingJobForm')?.addEventListener('submit', openJob);
  document.addEventListener('leader-v4:staging-installation-status', (event) => {
    const detail = event.detail || {};
    if (detail.message) setStatus(detail.message, detail.kind || 'info');
  });
  const initialJob = initialJobFromUrl();
  try {
    const session = await readSession();
    if (session?.user && initialJob) await openStagingInstallationJobCard(initialJob);
  } catch (error) {
    showSession(null);
    setStatus(error?.message || 'Не удалось проверить staging-сессию.', 'error');
  }
}

document.addEventListener('DOMContentLoaded', boot);
