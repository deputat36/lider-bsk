import { supabaseClient } from './supabase-client.js';
import { friendlyError } from './api.js';
import { toast } from './ui.js';

const ROLES = [
  ['owner', 'Владелец'],
  ['admin', 'Администратор'],
  ['manager', 'Менеджер'],
  ['designer', 'Дизайнер'],
  ['production', 'Производство'],
  ['installer', 'Монтажник']
];

const ROLE_LABELS = Object.fromEntries(ROLES);
const ACCESS_MARKER = 'CRM access admin v1';

const state = {
  user: null,
  profile: null,
  profiles: [],
  invites: [],
  busy: false
};

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function fmtDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
}

function isAdmin() {
  return state.profile?.is_active === true && ['owner', 'admin'].includes(state.profile?.role || '');
}

function roleOptions(selected = 'manager') {
  return ROLES.map(([value, label]) => `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(label)}</option>`).join('');
}

function ensureStyle() {
  if (document.getElementById('user-admin-v1-style')) return;
  const style = document.createElement('style');
  style.id = 'user-admin-v1-style';
  style.textContent = `
    .v4-access-grid{display:grid;grid-template-columns:minmax(260px,.85fr) minmax(320px,1.4fr);gap:16px;align-items:start}
    .v4-access-form{display:grid;gap:10px;background:#f8fafc;border:1px solid #dbeafe;border-radius:16px;padding:14px}
    .v4-access-form label{display:grid;gap:6px;font-weight:900;color:#334155}
    .v4-access-form input,.v4-access-form select,.v4-access-form textarea{border:1px solid #cbd5e1;border-radius:12px;padding:10px;background:#fff;color:#0f172a;width:100%}
    .v4-access-table-wrap{overflow:auto;border:1px solid #dbeafe;border-radius:16px;background:#fff;margin:10px 0 18px}
    .v4-access-table{width:100%;border-collapse:collapse;min-width:740px}
    .v4-access-table th,.v4-access-table td{padding:10px;border-bottom:1px solid #e2e8f0;text-align:left;vertical-align:top}
    .v4-access-table th{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#64748b;background:#f8fafc}
    .v4-access-actions{display:flex;gap:6px;flex-wrap:wrap}
    .v4-access-actions button,.v4-access-pill{border:1px solid #cbd5e1;background:#fff;border-radius:999px;padding:7px 10px;font-weight:900;cursor:pointer}
    .v4-access-badge{display:inline-flex;border-radius:999px;padding:4px 8px;font-size:12px;font-weight:900;background:#f1f5f9;color:#334155}
    .v4-access-badge.active{background:#dcfce7;color:#166534}.v4-access-badge.wait{background:#fef3c7;color:#92400e}.v4-access-badge.off{background:#fee2e2;color:#991b1b}
    .v4-access-note{font-size:13px;color:#64748b}.v4-access-alert{border:1px solid #fde68a;background:#fffbeb;color:#92400e;border-radius:16px;padding:14px;font-weight:900}
    @media(max-width:900px){.v4-access-grid{grid-template-columns:1fr}.v4-access-table{min-width:680px}}
  `;
  document.head.appendChild(style);
}

function section() {
  return document.getElementById('userAdminSection');
}

function root() {
  return document.getElementById('userAdminContent');
}

function ensureSection() {
  const workspace = document.getElementById('crmWorkspace');
  if (!workspace || section()) return;
  ensureStyle();
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

function renderMessage(message) {
  if (root()) root().innerHTML = `<div class="v4-access-alert">${esc(message)}</div>`;
}

function renderLoading() {
  if (root()) root().innerHTML = '<div class="v4-empty">Загружаю доступ...</div>';
}

function userRows() {
  if (!state.profiles.length) return '<tr><td colspan="6">Пользователей пока нет.</td></tr>';
  return state.profiles.map((profile) => {
    const active = profile.is_active === true;
    const self = profile.user_id === state.user?.id;
    return `
      <tr>
        <td><b>${esc(profile.email || '—')}</b><br><span class="v4-access-note">${esc(profile.full_name || 'Имя не указано')}</span></td>
        <td><select data-action="role" data-user-id="${esc(profile.user_id)}" ${self && profile.role === 'owner' ? 'disabled' : ''}>${roleOptions(profile.role || 'manager')}</select></td>
        <td><span class="v4-access-badge ${active ? 'active' : 'wait'}">${active ? 'Активен' : 'Ожидает активации'}</span></td>
        <td>${esc(profile.phone || '—')}</td>
        <td>${fmtDate(profile.created_at)}</td>
        <td><div class="v4-access-actions">${active
          ? `<button type="button" data-action="disable" data-user-id="${esc(profile.user_id)}" ${self ? 'disabled' : ''}>Отключить</button>`
          : `<button type="button" data-action="enable" data-user-id="${esc(profile.user_id)}">Активировать</button>`}</div></td>
      </tr>
    `;
  }).join('');
}

function inviteRows() {
  if (!state.invites.length) return '<tr><td colspan="6">Приглашений пока нет.</td></tr>';
  return state.invites.map((invite) => {
    const accepted = Boolean(invite.accepted_at);
    const waiting = invite.is_active === true && !accepted;
    return `
      <tr>
        <td><b>${esc(invite.email || '—')}</b><br><span class="v4-access-note">${esc(invite.full_name || 'Имя не указано')}</span></td>
        <td>${esc(ROLE_LABELS[invite.role] || invite.role || '—')}</td>
        <td><span class="v4-access-badge ${accepted ? 'active' : waiting ? 'wait' : 'off'}">${accepted ? 'Использовано' : waiting ? 'Ожидает' : 'Закрыто'}</span></td>
        <td>${fmtDate(invite.expires_at)}</td>
        <td>${esc(invite.invited_by_email || '—')}<br><span class="v4-access-note">${fmtDate(invite.created_at)}</span></td>
        <td><div class="v4-access-actions">${waiting ? `<button type="button" data-action="cancel" data-invite-id="${esc(invite.id)}">Закрыть</button>` : ''}</div></td>
      </tr>
    `;
  }).join('');
}

function renderAdmin() {
  if (!root()) return;
  root().innerHTML = `
    <div class="v4-access-grid">
      <form id="userInviteForm" class="v4-access-form">
        <h3>Пригласить сотрудника</h3>
        <label>Email<input name="email" type="email" placeholder="employee@example.com" required></label>
        <label>Имя<input name="full_name" type="text" placeholder="ФИО или имя"></label>
        <label>Роль<select name="role">${roleOptions('manager')}</select></label>
        <label>Срок действия<input name="expires_at" type="datetime-local"></label>
        <label>Комментарий<textarea name="note" rows="3" placeholder="Например: дизайнер на удалёнке"></textarea></label>
        <button class="v4-primary" type="submit" ${state.busy ? 'disabled' : ''}>Создать приглашение</button>
        <p class="v4-access-note">При первом входе пользователя активное приглашение автоматически активирует профиль. Без приглашения профиль останется pending.</p>
      </form>
      <div>
        <h3>Пользователи CRM</h3>
        <div class="v4-access-table-wrap"><table class="v4-access-table"><thead><tr><th>Пользователь</th><th>Роль</th><th>Статус</th><th>Телефон</th><th>Создан</th><th>Действия</th></tr></thead><tbody>${userRows()}</tbody></table></div>
      </div>
    </div>
    <h3>Приглашения</h3>
    <div class="v4-access-table-wrap"><table class="v4-access-table"><thead><tr><th>Кому</th><th>Роль</th><th>Статус</th><th>Истекает</th><th>Кто создал</th><th>Действия</th></tr></thead><tbody>${inviteRows()}</tbody></table></div>
  `;
}

async function getSession() {
  const { data, error } = await supabaseClient.auth.getSession();
  if (error) throw error;
  if (!data.session?.user) throw new Error('Сначала войдите в CRM');
  return data.session;
}

async function load() {
  renderLoading();
  const session = await getSession();
  state.user = session.user;

  const profileRes = await supabaseClient
    .from('leader_user_profiles')
    .select('user_id,email,role,is_active,full_name')
    .eq('user_id', session.user.id)
    .maybeSingle();
  if (profileRes.error) throw profileRes.error;
  state.profile = profileRes.data;

  if (!isAdmin()) {
    renderMessage(`Раздел доступен только владельцу или администратору. Ваша роль: ${ROLE_LABELS[state.profile?.role] || state.profile?.role || 'не загружена'}.`);
    return;
  }

  const [profilesRes, invitesRes] = await Promise.all([
    supabaseClient.from('leader_user_profiles').select('user_id,email,full_name,role,is_active,phone,created_at,updated_at').order('created_at', { ascending: false }),
    supabaseClient.from('leader_user_invites').select('id,email,role,full_name,is_active,invited_by_email,expires_at,accepted_at,accepted_user_id,note,created_at,updated_at').order('created_at', { ascending: false }).limit(80)
  ]);
  if (profilesRes.error) throw profilesRes.error;
  if (invitesRes.error) throw invitesRes.error;
  state.profiles = profilesRes.data || [];
  state.invites = invitesRes.data || [];
  renderAdmin();
}

async function reload() {
  try {
    state.busy = true;
    await load();
  } catch (error) {
    console.warn('CRM access admin error:', error);
    renderMessage(friendlyError(error));
  } finally {
    state.busy = false;
  }
}

function localDateToIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

async function createInvite(form) {
  const data = new FormData(form);
  const email = String(data.get('email') || '').trim().toLowerCase();
  const role = String(data.get('role') || 'manager').trim().toLowerCase();
  if (!email) throw new Error('Укажите email');
  if (!ROLE_LABELS[role]) throw new Error('Недопустимая роль');
  const { error } = await supabaseClient.from('leader_user_invites').insert({
    email,
    role,
    full_name: String(data.get('full_name') || '').trim() || null,
    expires_at: localDateToIso(String(data.get('expires_at') || '')),
    note: String(data.get('note') || '').trim() || null,
    invited_by: state.user?.id || null,
    invited_by_email: state.user?.email || state.profile?.email || null
  });
  if (error) throw error;
  form.reset();
  toast('Приглашение создано');
}

async function updateProfile(userId, patch) {
  const { error } = await supabaseClient.from('leader_user_profiles').update({ ...patch, updated_at: new Date().toISOString() }).eq('user_id', userId);
  if (error) throw error;
}

async function cancelInvite(id) {
  const { error } = await supabaseClient.from('leader_user_invites').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

document.addEventListener('leader-v4:tab-opened', (event) => {
  if (event.detail?.tab === 'user_admin') reload();
});

document.addEventListener('leader-v4:crm-ready', () => {
  if (document.body?.dataset?.v4Tab === 'user_admin') window.setTimeout(reload, 250);
});

document.addEventListener('submit', async (event) => {
  const form = event.target.closest?.('#userInviteForm');
  if (!form) return;
  event.preventDefault();
  try { await createInvite(form); await reload(); } catch (error) { toast(friendlyError(error)); renderMessage(friendlyError(error)); }
});

document.addEventListener('click', async (event) => {
  if (event.target.closest?.('#userAdminReloadBtn')) { event.preventDefault(); await reload(); return; }
  const button = event.target.closest?.('[data-action]');
  if (!button || !section()?.contains(button)) return;
  try {
    if (button.dataset.action === 'enable') await updateProfile(button.dataset.userId, { is_active: true });
    if (button.dataset.action === 'disable') {
      if (button.dataset.userId === state.user?.id) throw new Error('Нельзя отключить самого себя');
      await updateProfile(button.dataset.userId, { is_active: false });
    }
    if (button.dataset.action === 'cancel') await cancelInvite(button.dataset.inviteId);
    toast('Изменения сохранены');
    await reload();
  } catch (error) { toast(friendlyError(error)); renderMessage(friendlyError(error)); }
});

document.addEventListener('change', async (event) => {
  const select = event.target.closest?.('[data-action="role"]');
  if (!select || !section()?.contains(select)) return;
  try {
    if (!ROLE_LABELS[select.value]) throw new Error('Недопустимая роль');
    await updateProfile(select.dataset.userId, { role: select.value });
    toast('Роль обновлена');
    await reload();
  } catch (error) { toast(friendlyError(error)); renderMessage(friendlyError(error)); }
});

function boot() {
  ensureSection();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();