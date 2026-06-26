import { setupTop, getCachedUser, renderAuthBox } from './supabase-v2.js';

const app = document.getElementById('app');

async function renderDealsEntry() {
  await setupTop('deals');

  if (!getCachedUser()) {
    renderAuthBox(app, renderDealsEntry);
    return;
  }

  app.innerHTML = `
    <main class="nav-v2-shell">
      <section class="card">
        <h1>Сделки</h1>
        <p class="muted">Раздел списка сделок Navigator v2 подготовлен как точка входа. Карточку сделки можно открыть по прямой ссылке с параметром <code>?deal_id=...</code>.</p>
        <div class="actions" style="justify-content:flex-start">
          <a class="btn primary" href="./deal-card-v2.html">Открыть карточку сделки</a>
        </div>
      </section>
    </main>
  `;
}

renderDealsEntry();
