// RA Lider analytics helper. Set window.LEADER_METRIKA_ID to enable Yandex Metrika goals.
(function(){
  window.LEADER_METRIKA_ID = window.LEADER_METRIKA_ID || 0;

  window.leaderGoal = function(goal, params){
    params = params || {};
    try {
      if (window.LEADER_METRIKA_ID && typeof window.ym === 'function') {
        window.ym(window.LEADER_METRIKA_ID, 'reachGoal', goal, params);
      }
    } catch(e) {
      console.warn('leaderGoal failed', goal, e);
    }
    try {
      window.dispatchEvent(new CustomEvent('leader:goal', { detail: { goal: goal, params: params } }));
    } catch(e) {}
  };

  function initClickGoals(){
    document.addEventListener('click', function(e){
      var link = e.target.closest && e.target.closest('a');
      if (!link) return;
      var href = link.getAttribute('href') || '';
      if (href.indexOf('tel:') === 0) {
        window.leaderGoal('phone_click', { href: href, page: location.href });
      }
      if (href.indexOf('#request') === 0 || href.endsWith('/#request')) {
        window.leaderGoal('request_block_click', { text: (link.textContent || '').trim(), page: location.href });
      }
      if (/\.html($|#|\?)/.test(href)) {
        window.leaderGoal('service_page_click', { href: href, text: (link.textContent || '').trim(), page: location.href });
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initClickGoals);
  else initClickGoals();
})();
