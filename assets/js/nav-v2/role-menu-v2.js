import { supabase } from './supabase-v2.js';

function ensureTopShell() {
  if (document.querySelector('[data-nav-v2-top]')) return;
  const top = document.createElement('header');
  top.className = 'nav-v2-top';
  top.dataset.navV2Top = 'true';
  top.innerHTML = `<nav class="nav-v2-menu"><a data-nav-section="deals" href="./deals-v2.html">Сделки</a><a data-nav-section="card" href="./deal-card-v2.html">Карточка</a></nav><div class="nav-v2-user"><span data-nav-v2-status>Проверяю вход...</span><button class="btn light" data-nav-v2-logout type="button">Выйти</button></div>`;
  document.body.prepend(top);
}

async function bindLogout() {
  const button = document.querySelector('[data-nav-v2-logout]');
  if (!button) return;
  button.onclick = async () => {
    button.disabled = true;
    try {
      await supabase.auth.signOut({ scope: 'local' });
      location.reload();
    } catch (error) {
      console.warn('Navigator v2 logout warning:', error);
      button.disabled = false;
    }
  };
}

ensureTopShell();
bindLogout();
