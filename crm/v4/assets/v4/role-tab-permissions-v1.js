import { v4State } from './state.js';

export const CRM_V4_TABS = Object.freeze([
  'management_dashboard',
  'leads',
  'card',
  'orders',
  'order_control',
  'finance_control',
  'production',
  'contact_control',
  'public_lead_audit',
  'user_admin'
]);

const FULL_ACCESS = CRM_V4_TABS;

export const CRM_V4_ROLE_TABS = Object.freeze({
  owner: FULL_ACCESS,
  admin: FULL_ACCESS,
  manager: Object.freeze([
    'leads',
    'card',
    'orders',
    'order_control',
    'production',
    'contact_control',
    'public_lead_audit'
  ]),
  accountant: Object.freeze([
    'orders',
    'order_control',
    'finance_control'
  ]),
  designer: Object.freeze(['production']),
  installer: Object.freeze(['production']),
  contractor: Object.freeze(['production'])
});

function normalizedRole(profile = v4State.profile) {
  return String(profile?.role || '').trim().toLowerCase();
}

export function allowedV4Tabs(profile = v4State.profile) {
  const role = normalizedRole(profile);
  return new Set(CRM_V4_ROLE_TABS[role] || []);
}

export function canOpenV4Tab(tab, profile = v4State.profile) {
  const value = String(tab || '').trim();
  if (!profile || v4State.profileLoaded !== true) return false;
  return allowedV4Tabs(profile).has(value);
}

export function firstAllowedV4Tab(profile = v4State.profile) {
  const allowed = allowedV4Tabs(profile);
  return CRM_V4_TABS.find((tab) => tab !== 'card' && allowed.has(tab)) || '';
}

export function applyV4TabButtonVisibility(root = document, profile = v4State.profile) {
  const allowed = allowedV4Tabs(profile);
  root.querySelectorAll?.('[data-v4-tab-button]').forEach((button) => {
    const permitted = allowed.has(button.dataset.v4TabButton || '');
    button.hidden = !permitted;
    button.disabled = !permitted;
    button.setAttribute('aria-hidden', permitted ? 'false' : 'true');
  });
}

export function roleAccessSummary(profile = v4State.profile) {
  return {
    role: normalizedRole(profile),
    tabs: [...allowedV4Tabs(profile)],
    serverEnforcement: false,
    note: 'UI visibility only. Server-side RLS/RPC/Edge permission enforcement is tracked in #202.'
  };
}
