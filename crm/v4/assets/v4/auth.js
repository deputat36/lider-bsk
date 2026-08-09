import { V4_CONFIG } from './config.js';
import { supabaseClient } from './supabase-client.js';
import { timeout, friendlyError, isNetworkError } from './api.js';
import { invokeLeaderFunction } from './functions-client.js';
import { setState, resetAuthState, v4State } from './state.js';
import { bindAuthUi, byId, readCredentials, renderProfile, setAuthBusy, setProfileNotice, setStatus, showLoggedIn, showLoggedOut, toast } from './ui.js';

function isInvalidStoredSession(error) {
  const details = `${error?.code || ''} ${error?.message || ''}`.toLowerCase();
  return details.includes('refresh_token_not_found')
    || details.includes('invalid refresh token')
    || details.includes('refresh token not found');
}

function removeStoredSession() {
  try {
    window.localStorage.removeItem(V4_CONFIG.authStorageKey);
  } catch (error) {
    console.warn('CRM v4 local session storage warning:', error);
  }
}

async function clearLocalSession() {
  try {
    await timeout(
      supabaseClient.auth.signOut({ scope: 'local' }),
      V4_CONFIG.timeouts.logoutMs,
      'Локальный сброс сессии не ответил вовремя'
    );
  } catch (error) {
    console.warn('CRM v4 local session cleanup warning:', error);
  } finally {
    removeStoredSession();
  }
}

function hideWorkspace() {
  byId('crmWorkspace')?.classList.add('hidden');
}

function showWorkspace() {
  byId('crmWorkspace')?.classList.remove('hidden');
}

function emitCrmReady() {
  try { window.performance?.mark?.('crm_auth_ready'); } catch (_) { /* performance marks are best-effort */ }
  document.dispatchEvent(new CustomEvent('leader-v4:crm-ready', { detail: { state: v4State } }));
}

function beginProfileCheck(session) {
  if (!session?.user) return;
  setState({
    session,
    user: session.user,
    profile: null,
    profileLoaded: false,
    crmReady: false,
    status: 'Проверяю доступ к CRM'
  });
  showLoggedIn(session.user);
  hideWorkspace();
  renderProfile(null);
  setStatus('Проверяю доступ к CRM', 'warn');
  setProfileNotice('Проверяю активный профиль и роль. Рабочие данные пока не загружаются.');
}

async function resolveProfile(user) {
  if (!user?.id) throw new Error('bad_user');

  const response = await timeout(
    supabaseClient
      .from('leader_user_profiles')
      .select('user_id,email,role,is_active,full_name')
      .eq('user_id', user.id)
      .maybeSingle(),
    V4_CONFIG.timeouts.profileMs,
    'Профиль доступа не загрузился вовремя'
  );
  if (response.error) throw response.error;
  if (response.data) return response.data;

  const ensured = await invokeLeaderFunction('leader-crm-leads', { action: 'ensure_profile' }, {
    timeoutMs: Math.max(V4_CONFIG.timeouts.profileMs + 7000, 12000),
    timeoutMessage: 'Профиль доступа не подготовился вовремя'
  });
  return ensured.profile || ensured.data || ensured || null;
}

function activateCrm(session, profile, statusText) {
  setState({
    session,
    user: session.user,
    profile,
    profileLoaded: true,
    crmReady: true,
    status: statusText
  });
  renderProfile(profile);
  showWorkspace();
  setProfileNotice('');
  setStatus(statusText, 'good');
  emitCrmReady();
}

function denyInactiveProfile(profile) {
  setState({ profile, profileLoaded: true, crmReady: false, status: 'Доступ ожидает активации' });
  renderProfile(profile);
  hideWorkspace();
  setStatus('Доступ ожидает активации', 'warn');
  setProfileNotice('Профиль создан, но доступ к CRM ещё не активирован владельцем или администратором.');
}

async function prepareCrm(session, statusText = 'CRM готова') {
  if (!session?.user) return false;
  beginProfileCheck(session);
  try {
    const profile = await resolveProfile(session.user);
    if (!profile || typeof profile !== 'object') throw new Error('profile_not_found');
    if (profile.is_active !== true) {
      denyInactiveProfile(profile);
      return false;
    }
    activateCrm(session, profile, statusText);
    return true;
  } catch (error) {
    console.warn('CRM v4 profile check warning:', error);
    setState({ profile: null, profileLoaded: false, crmReady: false });
    renderProfile(null);
    hideWorkspace();
    const message = `${error?.message || ''}`.toLowerCase();
    if (message.includes('access_denied')) {
      setStatus('Доступ не активирован', 'warn');
      setProfileNotice('Вход выполнен, но профиль CRM не активирован. Обратитесь к владельцу или администратору.');
    } else if (isNetworkError(error)) {
      setStatus('Профиль не проверен: ошибка сети', 'error');
      setProfileNotice('Не удалось подтвердить доступ к CRM. Проверьте интернет и повторите вход или обновите страницу.');
    } else {
      setStatus('Профиль CRM не подтверждён', 'error');
      setProfileNotice('Рабочие данные не загружаются, пока профиль и роль не будут подтверждены.');
    }
    return false;
  }
}

export async function checkAuth() {
  setStatus('Проверяю вход', 'warn');
  try {
    const { data, error } = await timeout(
      supabaseClient.auth.getSession(),
      12000,
      'Проверка сессии не ответила вовремя'
    );
    if (error) throw error;
    if (!data.session?.user) {
      resetAuthState();
      showLoggedOut();
      hideWorkspace();
      setStatus('Нужен вход', 'warn');
      return false;
    }
    return await prepareCrm(data.session, 'CRM готова');
  } catch (error) {
    const staleSession = isInvalidStoredSession(error);
    if (staleSession) await clearLocalSession();
    resetAuthState();
    showLoggedOut();
    hideWorkspace();
    const message = staleSession
      ? 'Сессия устарела. Войдите снова'
      : (isNetworkError(error) ? 'Ошибка сети' : 'Нужен вход');
    setStatus(message, isNetworkError(error) ? 'error' : 'warn');
    if (staleSession) toast(message);
    return false;
  }
}

export async function login() {
  if (v4State.authBusy) return;
  const { email, password } = readCredentials();
  if (!email || !password) {
    setStatus('Нужен вход', 'warn');
    toast('Введите email и пароль');
    return;
  }
  setState({ authBusy: true });
  setAuthBusy(true);
  setStatus('Проверяю вход', 'warn');
  try {
    const { data, error } = await timeout(
      supabaseClient.auth.signInWithPassword({ email, password }),
      22000,
      'Вход не ответил за 22 секунды. Проверьте интернет и повторите.'
    );
    if (error) throw error;
    if (!data.session?.user) throw new Error('Сессия не получена');
    const active = await prepareCrm(data.session, 'Вход выполнен. CRM открыта');
    toast(active ? 'Вход выполнен' : 'Вход выполнен, но доступ к CRM пока не подтверждён');
  } catch (error) {
    resetAuthState();
    showLoggedOut();
    hideWorkspace();
    const message = isNetworkError(error) ? 'Ошибка сети или долгий ответ Supabase. Повторите вход.' : friendlyError(error);
    setStatus(message, isNetworkError(error) ? 'error' : 'warn');
    toast(message);
  } finally {
    setState({ authBusy: false });
    setAuthBusy(false);
  }
}

export async function logout() {
  if (v4State.authBusy) return;
  setState({ authBusy: true });
  setAuthBusy(true);
  setStatus('Выход из CRM...', 'warn');
  try {
    await timeout(
      supabaseClient.auth.signOut({ scope: 'local' }),
      V4_CONFIG.timeouts.logoutMs,
      'Выход не ответил вовремя'
    );
  } catch (error) {
    console.warn('CRM v4 logout warning:', error);
  } finally {
    removeStoredSession();
    resetAuthState();
    showLoggedOut();
    hideWorkspace();
    renderProfile(null);
    setProfileNotice('');
    setStatus('Нужен вход', 'warn');
    setAuthBusy(false);
    setState({ authBusy: false });
    toast('Вход сброшен');
  }
}

export function bootAuth() {
  bindAuthUi({ onLogin: login, onLogout: logout });
  showLoggedOut();
  hideWorkspace();
  checkAuth();
}

document.addEventListener('DOMContentLoaded', bootAuth);
