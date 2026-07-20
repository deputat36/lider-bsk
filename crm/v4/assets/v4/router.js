import { readCrmLeadRoute } from './crm-navigation-route-v1.js';
import { setRoute } from './state.js';

export function currentLeadUrl(id) {
  const url = new URL(window.location.href);
  url.searchParams.set('lead', id);
  return `${url.pathname}${url.search}`;
}

export function clearLeadUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete('lead');
  url.searchParams.delete('id');
  window.history.pushState({}, '', `${url.pathname}${url.search}`);
  setRoute({ leadId: null });
  document.dispatchEvent(new CustomEvent('leader-v4:route-change', { detail: { leadId: null } }));
}

export function openLeadRoute(id) {
  const url = new URL(window.location.href);
  url.searchParams.set('lead', id);
  window.history.pushState({}, '', `${url.pathname}${url.search}`);
  setRoute({ leadId: id });
  document.dispatchEvent(new CustomEvent('leader-v4:route-change', { detail: { leadId: id } }));
}

export function bootRouter() {
  if (window.LeaderV4RouterBooted) return;
  window.LeaderV4RouterBooted = true;
  const leadId = readCrmLeadRoute(window.location.href) || null;
  setRoute({ leadId });
  window.addEventListener('popstate', () => {
    const nextLeadId = readCrmLeadRoute(window.location.href) || null;
    setRoute({ leadId: nextLeadId });
    document.dispatchEvent(new CustomEvent('leader-v4:route-change', { detail: { leadId: nextLeadId } }));
  });
}

document.addEventListener('DOMContentLoaded', bootRouter);
