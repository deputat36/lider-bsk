import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const NAV_V2_CONFIG = Object.freeze({
  supabaseUrl: 'https://ofewxuqfjhamgerwzull.supabase.co',
  supabasePublishableKey: 'sb_publishable_ZiX8_Mnf0dY6S__tKO2A4A_uD94G2cs',
  authStorageKey: 'leader_crm_v4_main_session'
});

const supabase = createClient(
  NAV_V2_CONFIG.supabaseUrl,
  NAV_V2_CONFIG.supabasePublishableKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: NAV_V2_CONFIG.authStorageKey
    }
  }
);

let cachedUser = readStoredUser();
let cachedProfile = readStoredProfile();

function readStoredUser() {
  try {
    const raw = window.localStorage.getItem(NAV_V2_CONFIG.authStorageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.user || parsed?.currentSession?.user || parsed?.session?.user || null;
  } catch (_) {
    return null;
  }
}

function readStoredProfile() {
  try {
    const raw = window.localStorage.getItem('leader_nav_v2_profile');
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(n);
}

export function statusText(status) {
  const map = {
    draft: 'Черновик',
    need_info: 'Нужно дозаполнить',
    need_lawyer: 'Юрист',
    need_broker: 'Брокер',
    need_documents: 'Нужны документы',
    ready_for_deposit: 'Готова к задатку',
    deposit_done: 'Задаток внесен',
    preparing_deal: 'Подготовка к сделке',
    ready_for_deal: 'Готова к сделке',
    registration: 'На регистрации',
    registered: 'Зарегистрирована',
    closed: 'Закрыта',
    cancelled: 'Отменена',
    open: 'Открыта',
    in_progress: 'В работе',
    done: 'Готово'
  };
  return map[status] || status || '—';
}

export function riskPill(level) {
  const key = String(level || '').toLowerCase();
  const label = ({ red: 'Высокий риск', yellow: 'Средний риск', green: 'Низкий риск' })[key] || (level ? String(level) : 'Риск не указан');
  const cls = ({ red: 'red', yellow: 'yellow', green: 'green' })[key] || 'blue';
  return `<span class="pill ${cls}">${esc(label)}</span>`;
}

export function getCachedUser() {
  cachedUser = cachedUser || readStoredUser();
  return cachedUser;
}

export function saveCachedProfile(profile) {
  cachedProfile = profile || null;
  try {
    if (cachedProfile) window.localStorage.setItem('leader_nav_v2_profile', JSON.stringify(cachedProfile));
  } catch (error) {
    console.warn('Navigator v2 profile cache warning:', error);
  }
}

function setTopStatus(text) {
  const el = document.querySelector('[data-nav-v2-status]');
  if (el) el.textContent = text;
}

export async function setupTop(active = '') {
  const top = document.querySelector('[data-nav-v2-top]');
  if (top) {
    top.querySelectorAll('[data-nav-section]').forEach((item) => {
      item.classList.toggle('active', item.dataset.navSection === active);
    });
  }
  setTopStatus(getCachedUser() ? 'Вход выполнен' : 'Нужен вход');

  try {
    const { data } = await supabase.auth.getSession();
    cachedUser = data?.session?.user || cachedUser;
    setTopStatus(cachedUser ? 'Вход выполнен' : 'Нужен вход');
  } catch (error) {
    console.warn('Navigator v2 session check warning:', error);
  }
  return cachedUser;
}

export async function rpc(name, params = {}, timeoutMs = 20000) {
  const { data: sessionData } = await supabase.auth.getSession();
  cachedUser = sessionData?.session?.user || cachedUser;
  if (!sessionData?.session?.access_token) throw new Error('Сначала войдите в CRM');

  const request = supabase.rpc(name, params);
  const timeout = new Promise((_, reject) => {
    window.setTimeout(() => reject(new Error('Supabase не ответил вовремя')), timeoutMs);
  });
  try {
    const { data, error } = await Promise.race([request, timeout]);
    if (error) throw error;
    return data;
  } catch (error) {
    throw new Error(error?.message || String(error));
  }
}

export function renderAuthBox(target, onReady) {
  if (!target) return;
  target.innerHTML = `<main class="nav-v2-shell"><section class="card auth-card"><h1>Вход в Навигатор сделок</h1><p class="muted">Используйте учётную запись CRM.</p><div class="field"><label>Email</label><input id="navV2Email" type="email" autocomplete="email"></div><div class="field"><label>Пароль</label><input id="navV2Password" type="password" autocomplete="current-password"></div><div class="actions" style="justify-content:flex-start"><button id="navV2Login" class="btn primary" type="button">Войти</button></div><div id="navV2AuthStatus" class="status">Нужен вход</div></section></main>`;
  const status = target.querySelector('#navV2AuthStatus');
  const button = target.querySelector('#navV2Login');
  button.onclick = async () => {
    const email = target.querySelector('#navV2Email')?.value?.trim() || '';
    const password = target.querySelector('#navV2Password')?.value || '';
    if (!email || !password) {
      status.className = 'status error';
      status.textContent = 'Введите email и пароль';
      return;
    }
    button.disabled = true;
    status.className = 'status';
    status.textContent = 'Проверяю вход...';
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      cachedUser = data?.user || data?.session?.user || null;
      status.className = 'status ok';
      status.textContent = 'Вход выполнен';
      if (typeof onReady === 'function') await onReady();
    } catch (error) {
      status.className = 'status error';
      status.textContent = error?.message || 'Ошибка входа';
    } finally {
      button.disabled = false;
    }
  };
}

export { supabase, cachedProfile };
