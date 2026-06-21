function setActiveTab(tab) {
  document.body.dataset.v4Tab = tab;
  document.querySelectorAll('[data-v4-tab-button]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.v4TabButton === tab);
  });

  if (tab === 'leads') {
    document.querySelectorAll('[data-v4-managed-section]').forEach((section) => { section.hidden = true; });
    const leads = document.getElementById('leadsSection');
    const next = document.querySelector('.v4-next-card');
    if (leads) leads.style.display = '';
    if (next) next.style.display = '';
  }

  document.dispatchEvent(new CustomEvent('leader-v4:tab-opened', { detail: { tab } }));
}

function bootTabsLite() {
  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-v4-tab-button]');
    if (!button) return;
    const tab = button.dataset.v4TabButton;
    if (tab !== 'leads') return;
    event.preventDefault();
    setActiveTab('leads');
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootTabsLite); else bootTabsLite();
