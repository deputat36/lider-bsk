import { supabaseClient } from './supabase-client.js';
import { timeout, friendlyError } from './api.js';
import { toast } from './ui.js';

const ROLE_OPTIONS = [
  ['owner', 'Владелец'],
  ['admin', 'Администратор'],
  ['manager', 'Менеджер'],
  ['designer', 'Дизайнер'],
  ['production', 'Производство'],
  ['installer', 'Монтажник']
];

const ROLE_LABELS = Object.fromEntries(ROLE_OPTIONS);

const ACCESS_MARKER = 'CRM access admin v1';

let state = {
  loaded: false,
  busy: false,
  currentUser: null,
  currentProfile: null,
  profiles: [],
  invites: []
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
}

function isAdminProfile(profile) {
  return profile?.is_active === true && ['owner', 'admin'].includes(profile?.role || '');
}

function section() {
  return document.getElementById('userAdminSection');
}

function content() {
  return document.getElementById('userAdminContent');
}

function injectStyles() {
  if (document.getElementById('user-admin-v1-style')) return;
  const style = document.createElement('style');
  style.id = 'user-admin-v1-style';
  style.textContent = `
    .v4-user-admin-grid{display:grid;grid-template-columns:minmax(260px,.9fr) minmax(320px,1.4fr);gap:16px;align-items:start}
    .v4-user-admin-form{display:grid;gap:10px;background:#f8fafc;border:1px solid #dbeafe;border-radius:16px;padding:14px}
    .v4-user-admin-form label{display:grid;gap:6px;font-weight:900;color:#334155}
    .v4-user-admin-form input,.v4-user-admin-form select,.v4-user-admin-form textarea{width:100%;border:1px solid #cbd5e1;border-radius:12px;padding:10px;background:#fff;color:#0f172a}
    .v4-user-admin-table-wrap{overflow:auto;border:1px solid #dbeafe;border-radius:16px;background:#fff}
    .v4-user-admin-table{width:100%;border-collapse:collapse;min-width:760px}
    .v4-user-admin-table th,.v4-user-admin-table td{padding:10px;border-bottom:1px solid #e2e8f0;text-align:left;vertical-align:top}
    .v4-user-admin-table th{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#64748b;background:#f8fafc}
    .v4-user-admin-actions{display:flex;gap:6px;flex-wrap:wrap}
    .v4-user-admin-actions button,.v4-user-admin-small-btn{border:1px solid #cbd5e1;background:#fff;border-radius:999px;padding:7px 10px;font-weight:900;cursor:pointer}
    .v4-user-admin-actions button:hover,.v4-user-admin-small-btn:hover{border-color:#1d4ed8;color:#1d4ed8}
    .v4-user-admin-badge{display:inline-flex;align-items:center;border-radius:999px;padding:4px 8px;font-weight:900;font-size:12px;background:#f1f5f9;color:#334155}
    .v4-user-admin-badge.is-active{background:#dcfce7;color:#166534}
    .v4-user-admin-badge.is-pending{background:#fef3c7;color:#92400e}
    .v4-user-admin-badge.is-blocked{background:#fee2e2;color:#991b1b}
    .v4-user-admin-muted{color:#64748b;font-size:13px}
    .v4-user-admin-alert{border:1px solid #fde68a;background:#fffbeb;color:#92400e;border-radius:16px;padding:14px;font-weight:800}
    @media(max-width:900px){.v4-user-admin-grid{grid-template-columns:1fr}.v4-user-admin-table{min-width:680px}}
  `;
  document.head.appendChild(style);
}

function ensureSection() {
  const workspace = document.getElementById('crmWorkspace');
  if (!workspace || section()) return;

  injectStyles();

  const node = document.createElement('section');
  node.id = 'userAdminSection';
  node.className = 'v4-card';
  node.dataset.v4ManagedSection = 'user_admin';
  node.hidden = true;
  node.innerHTML = `
    <div class="v4-section-head">
      <div>
        <h2>Доступ к CRM</h2>
        <p>Пользователи, роли, pending-доступ и приглашения сотрудников. ${ACCESS_MARKER}</p>
      </div>
      <button id="userAdminReloadBtn" type="button" class="v4-primary">Обновить доступ</button>
    </div>
    <div id="userAdminContent"><div class="v4-empty">Откройте раздел, чтобы загрузить пользователей.</div></div>
  `;

  const nav = document.getElementById('v4LayoutTabs');
  if (nav) nav.insertAdjacentElement('afterend', node);
  else workspace.appendChild(node);
}

function roleSelect(name, selected, attrs = '') {
  return `<select name="${escapeHtml(name)}" ${attrs}>${ROLE_OPTIONS.map(([value, label]) => `<option value="${escapeHtml(value)}" ${value === selected ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('')}</select>`;
}

function renderAccessDenied() {
  const root = content();
  if (!root) return;
  root.innerHTML = `
    <div class="v4-user-admin-alert">
      Раздел доступен только владельцу или администратору CRM. Ваш профиль: ${escapeHtml(ROLE_LABELS[state.currentProfile?.role] || state.currentProfile?.role || 'не загружен')}.
    </div>
  `;
}

function renderLoading(text = 'Загружаю доступ...') {
  const root = content();
  if (root) root.innerHTML = `<div class="v4-empty">${escapeHtml(text)}</div>`;
}

function renderError(error) {
  const root = content();
  if (root) root.innerHTML = `<div class="v4-user-admin-alert">${escapeHtml(friendlyError(error))}</div>`;
}

function profileRows() {
  if (!state.profiles.length) return '<tr><td colspan="6">Пользователей пока нет.</td></tr>';

  return state.profiles.map((profile) => {
    const active = profile.is_active === true;
    const isSelf = profile.user_id === state.currentUser?.id;
    const statusClass = active ? 'is-active' : 'is-pending';
    const statusText = active ? 'Активен' : 'Ожидает активации';
    const role = profile.role || 'manager';

    return `
      <tr data-user-id="${escapeHtml(profile.user_id)}">
        <td>
          <b>${escapeHtml(profile.email || '—')}</b><br>
          <span class="v4-user-admin-muted">${escapeHtml(profile.full_name || 'Имя не указано')}</span>
        </td>
        <td>${roleSelect('role', role, `data-action="profile-role" data-user-id="${escapeHtml(profile.user_id)}" ${isSelf && role === 'owner' ? 'disabled' : ''}`)}</td>
        <td><span class="v4-user-admin-badge ${statusClass}">${statusText}</span></td>
        <td>${escapeHtml(profile.phone || '—')}</td>
        <td>${formatDate(profile.created_at)}</td>
        <td>
          <div class="v4-user-admin-actions">
            ${active
              ? `<button type="button" data-action="deactivate-profile" data-user-id="${escapeHtml(profile.user_id)}" ${isSelf ? 'disabled title="Нельзя отключить самого себя"' : ''}>Отключить</button>`
              : `<button type="button" data-action="activate-profile" data-user-id="${escapeHtml(profile.user_id)}">Активировать</button>`}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function inviteRows() {
  if (!state.invites.length) return '<tr><td colspan="6">Активных и последних приглашений пока нет.</td></tr>';

  return state.invites.map((invite) => {
    const accepted = Boolean(invite.accepted_at);
    const active = invite.is_active === true && !accepted;
    const expired = invite.expires_at && new Date(invite.expires_at).getTime() < Date.now();
    const badgeClass = accepted ? 'is-active' : (active && !expired ? 'is-pending' : 'is-blocked');
    const badgeText = accepted ? 'Использовано' : (active && !expired ? 'Ожидает' : 'Закрыто');

    return `
      <tr data-invite-id="${escapeHtml(invite.id)}">
        <td><b>${escapeHtml(invite.email || '—')}</b><br><span class="v4-user-admin-muted">${escapeHtml(invite.full_name || 'Имя не указано')}</span></td>
        <td>${escapeHtml(ROLE_LABELS[invite.role] || invite.role || '—')}</td>
        <td><span class="v4-user-admin-badge ${badgeClass}">${badgeText}</span></td>
        <td>${formatDate(invite.expires_at)}</td>
        <td>${escapeHtml(invite.invited_by_email || '—')}<br><span class="v4-user-admin-muted">${formatDate(invite.created_at)}</span></td>
        <td>
          <div class="v4-user-admin-actions">
            ${active && !accepted ? `<button type="button" data-action="cancel-invite" data-invite-id="${escapeHtml(invite.id)}">Закрыть</button>` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function renderAdmin() {
  const root = content();
  if (!root) return;

  root.innerHTML = `
    <div class="v4-user-admin-grid">
      <form id="userInviteForm" class="v4-user-admin-form">
        <h3>Пригласить сотрудника</h3>
        <label>Email
          <input name="email" type="email" placeholder="employee@example.com" required>
        </label>
        <label>Имя сотрудника
          <input name="full_name" type="text" placeholder="ФИО или имя">
        </label>
        <label>Роль
          ${roleSelect('role', 'manager')}
        </label>
        <label>Срок действия приглашения
          <input name="expires_at" type="datetime-local">
        </label>
        <label>Комментарий
          <textarea name="note" rows="3" placeholder="Например: дизайнер на удалёнке"></textarea>
        </label>
        <button class="v4-primary" type="submit" ${state.busy ? 'disabled' : ''}>Создать приглашение</button>
        <p class="v4-user-admin-muted">Пользователь должен сначала быть создан в Supabase Auth или войти по выданным учётным данным. При первом входе активное приглашение автоматически активирует профиль.</p>
      </form>

      <div>
        <h3>Пользователи CRM</h3>
        <div class="v4-user-admin-table-wrap">
          <table class="v4-user-admin-table">
            <thead><tr><th>Пользователь</th><th>Роль</th><th>Статус</th><th>Телефон</th><th>Создан</th><th>Действия</th></tr></thead>
            <tbody>${profileRows()}</tbody>
          </table>
        </div>
      </div>
    </div>

    <h3>Приглашения</h3>
    <div class="v4-user-admin-table-wrap">
      <table class="v4-user-admin-table">
        <thead><tr><th>Кому</th><th>Роль</th><th>Статус</th><th>Истекает</th><th>Кто создал</th><th>Действия</th></tr></thead>
        <tbody>${inviteRows()}</tbody>
      </table>
    </div>
  `;
}

async function loadCurrentProfile(user) {
  const { data, error } = await supabaseClient
    .from('leader_user_profiles')
    .select('user_id,email,role,is_active,full_name')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function loadAdminData() {
  renderLoading();
  const sessionResult = await timeout(supabaseClient.auth.getSession(), 12000, 'Сессия CRM не ответила вовремя');
  const session = sessionResult?.data?.session || null;
  if (!session?.user) {
    renderError(new Error('Сначала войдите в CRM'));
    return;
  }

  state.currentUser = session.user;
  state.currentProfile = await loadCurrentProfile(session.user);

  if (!isAdminProfile(state.currentProfile)) {
    state.loaded = true;
    renderAccessDenied();
    return;
  }

  const profilesReq = supabaseClient
    .from('leader_user_profiles')
    .select('user_id,email,full_name,role,is_active,phone,position,notes,created_at,updated_at,last_seen_at')
    .order('created_at', { ascending: false });

  const invitesReq = supabaseClient
    .from('leader_user_invites')
    .select('id,email,role,full_name,is_active,invited_by_email,expires_at,accepted_at,accepted_user_id,note,created_at,updated_at')
    .order('created_at', { ascending: false })
    .limit(80);

  const [profilesRes, invitesRes] = await Promise.all([profilesReq, invitesReq]);
  if (profilesRes.error) throw profilesRes.error;
  if (invitesRes.error) throw invitesRes.error;

  state.profiles = Array.isArray(profilesRes.data) ? profilesRes.data : [];
  state.invites = Array.isArray(invitesRes.data) ? invitesRes.data : [];
  state.loaded = true;
  renderAdmin();
}

async function reload() {
  try {
    state.busy = true;
    await loadAdminData();
  } catch (error) {
    console.warn('CRM user admin error:', error);
    renderError(error);
  } finally {
    state.busy = false;
  }
}

function normalizeLocalDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

async function createInvite(form) {
  const formData = new FormData(form);
  const email = String(formData.get('email') || '').trim().toLowerCase();
  const fullName = String(formData.get('full_name') || '').trim();
  const role = String(formData.get('role') || 'manager').trim().toLowerCase();
  const expiresAt = normalizeLocalDate(String(formData.get('expires_at') || ''));
  const note = String(formData.get('note') || '').trim();

  if (!email) throw new Error('Укажите email приглашения');
  if (!ROLE_LABELS[role]) throw new Error('Недопустимая роль');

  const { error } = await supabaseClient
    .from('leader_user_invites')
    .insert({
      email,
      full_name: fullName || null,
      role,
      expires_at: expiresAt,
      note: note || null,
      invited_by: state.currentUser?.id || null,
      invited_by_email: state.currentUser?.email || state.currentProfile?.email || null
    });

  if (error) throw error;
  form.reset();
  toast('Приглашение создано');
}

async function updateProfile(userId, patch) {
  const { error } = await supabaseClient
    .from('leader_user_profiles')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
  if (error) throw error;
}

async function cancelInvite(inviteId) {
  const { error } = await supabaseClient
    .from('leader_user_invites')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', inviteId);
  if (error) throw error;
}

async function handleSubmit(event) {
  const form = event.target.closest?.('#userInviteForm');
  if (!form) return;
  event.preventDefault();
  try {
    state.busy = true;
    renderAdmin();
    await createInvite(form);
    await loadAdminData();
  } catch (error) {
    toast(friendlyError(error));
    renderError(error);
  } finally {
    state.busy = false;
  }
}

async function handleClick(event) {
  const reloadButton = event.target.closest?.('#userAdminReloadBtn');
  if (reloadButton) {
    event.preventDefault();
    await reload();
    return;
  }

  const button = event.target.closest?.('[data-action]');
  if (!button || !section()?.contains(button)) return;

  const action = button.dataset.action;
  try {
    state.busy = true;
    button.disabled = true;

    if (action === 'activate-profile') {
      await updateProfile(button.dataset.userId, { is_active: true });
      toast('Пользователь активирован');
    }

    if (action === 'deactivate-profile') {
      if (button.dataset.userId === state.currentUser?.id) throw new Error('Нельзя отключить самого себя');
      await updateProfile(button.dataset.userId, { is_active: false });
      toast('Пользователь отключён');
    }

    if (action === 'cancel-invite') {
      await cancelInvite(button.dataset.inviteId);
      toast('Приглашение закрыто');
    }

    await loadAdminData();
  } catch (error) {
    toast(friendlyError(error));
    renderError(error);
  } finally {
    state.busy = false;
  }
}

async function handleChange(event) {
  const select = event.target.closest?.('[data-action="profile-role"]');
  if (!select || !section()?.contains(select)) return;
  try {
    const role = select.value;
    if (!ROLE_LABELS[role]) throw new Error('Недопустимая роль');
    await updateProfile(select.dataset.userId, { role });
    toast('Роль обновлена');
    await loadAdminData();
  } catch (error) {
    toast(friendlyError(error));
    renderError(error);
  }
}

function maybeLoadOnTab(event) {
  const tab = event?.detail?.tab || document.body?.dataset?.v4Tab;
  if (tab !== 'user_admin') return;
  reload();
}

function bootUserAdmin() {
  ensureSection();
  document.addEventListener('leader-v4:tab-opened', maybeLoadOnTab);
  document.addEventListener('leader-v4:crm-ready', () => {
    if (document.body?.dataset?.v4Tab === 'user_admin') window.setTimeout(reload, 250);
  });
  document.addEventListener('submit', handleSubmit);
  document.addEventListener('click', handleClick);
  document.addEventListener('change', handleChange);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootUserAdmin); else bootUserAdmin();
