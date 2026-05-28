import { setupTop, getCachedUser, renderAuthBox, rpc, esc } from './supabase-v2.js';

const app = document.getElementById('app');
const page = document.body.dataset.adminPage || 'admin';
const scripts = {
  admin: './admin-v2.js?v=20260526-8',
  invite: './admin-invite-v2.js?v=20260526-8',
  access: './nav-temp-password-v2.js?v=20260526-8',
  audit: './nav-access-audit-v2.js?v=20260526-8'
};

function noAccess(profile) {
  app.innerHTML = `<main class="nav-v2-shell"><section class="hero"><h1>Нет доступа к разделу</h1><p>Этот раздел доступен только owner/admin Навигатора сделок.</p></section><section class="card"><h2>Текущий профиль</h2><div class="status warn">${esc(profile?.email || 'Пользователь')} · роль: ${esc(profile?.role || 'не определена')}</div><p class="muted">Для вашей роли открыт только рабочий функционал. Управление командой, доступами и аудитом скрыто.</p><div class="actions" style="justify-content:flex-start"><a class="btn primary" href="./dashboard-v2.html">Вернуться на рабочий стол</a><a class="btn light" href="./nav-system-check-v2.html">Проверка системы</a></div></section></main>`;
}

async function init() {
  setupTop('admin');
  if (!getCachedUser()) return renderAuthBox(app, async () => location.reload());
  app.innerHTML = '<main class="nav-v2-shell"><div class="status">Проверяю доступ...</div></main>';
  try {
    const data = await rpc('nav_v2_get_my_profile', {}, 12000);
    const profile = data?.profile || null;
    if (!['owner', 'admin'].includes(profile?.role)) return noAccess(profile);
    await import(scripts[page] || scripts.admin);
  } catch (e) {
    noAccess({ role: 'не определена', email: '' });
  }
}

init();
