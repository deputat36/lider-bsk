import { v4State } from './state.js';

export const CRM_V4_ACTIONS = Object.freeze({
  LEADS_READ: 'leads.read',
  LEADS_CREATE: 'leads.create',
  LEADS_UPDATE: 'leads.update',
  LEADS_ASSIGN: 'leads.assign',
  LEADS_TRANSITION: 'leads.transition',
  CLIENTS_READ: 'clients.read',
  CLIENTS_WRITE: 'clients.write',
  NEEDS_READ: 'needs.read',
  NEEDS_WRITE: 'needs.write',
  CALCULATIONS_READ: 'calculations.read',
  CALCULATIONS_WRITE: 'calculations.write',
  COSTS_READ: 'costs.read',
  OFFERS_READ: 'offers.read',
  OFFERS_WRITE: 'offers.write',
  OFFERS_TRANSITION: 'offers.transition',
  ORDERS_READ: 'orders.read',
  ORDERS_CREATE: 'orders.create',
  ORDERS_UPDATE: 'orders.update',
  ORDERS_TRANSITION: 'orders.transition',
  PRODUCTION_READ: 'production.read',
  PRODUCTION_WRITE: 'production.write',
  INSTALLATION_READ: 'installation.read',
  INSTALLATION_WRITE: 'installation.write',
  DESIGN_READ: 'design.read',
  DESIGN_WRITE: 'design.write',
  FINANCE_READ: 'finance.read',
  FINANCE_WRITE: 'finance.write',
  CATALOG_READ: 'catalog.read',
  CATALOG_MANAGE: 'catalog.manage',
  AUDIT_READ: 'audit.read',
  USERS_MANAGE: 'users.manage',
  SETTINGS_MANAGE: 'settings.manage'
});

const ALL_ACTIONS = Object.freeze(Object.values(CRM_V4_ACTIONS));

export const CRM_V4_ROLE_ACTIONS = Object.freeze({
  owner: ALL_ACTIONS,
  admin: ALL_ACTIONS,
  manager: Object.freeze([
    CRM_V4_ACTIONS.LEADS_READ,
    CRM_V4_ACTIONS.LEADS_CREATE,
    CRM_V4_ACTIONS.LEADS_UPDATE,
    CRM_V4_ACTIONS.LEADS_ASSIGN,
    CRM_V4_ACTIONS.LEADS_TRANSITION,
    CRM_V4_ACTIONS.CLIENTS_READ,
    CRM_V4_ACTIONS.CLIENTS_WRITE,
    CRM_V4_ACTIONS.NEEDS_READ,
    CRM_V4_ACTIONS.NEEDS_WRITE,
    CRM_V4_ACTIONS.CALCULATIONS_READ,
    CRM_V4_ACTIONS.CALCULATIONS_WRITE,
    CRM_V4_ACTIONS.OFFERS_READ,
    CRM_V4_ACTIONS.OFFERS_WRITE,
    CRM_V4_ACTIONS.OFFERS_TRANSITION,
    CRM_V4_ACTIONS.ORDERS_READ,
    CRM_V4_ACTIONS.ORDERS_CREATE,
    CRM_V4_ACTIONS.ORDERS_UPDATE,
    CRM_V4_ACTIONS.ORDERS_TRANSITION,
    CRM_V4_ACTIONS.PRODUCTION_READ,
    CRM_V4_ACTIONS.PRODUCTION_WRITE,
    CRM_V4_ACTIONS.INSTALLATION_READ,
    CRM_V4_ACTIONS.INSTALLATION_WRITE,
    CRM_V4_ACTIONS.DESIGN_READ,
    CRM_V4_ACTIONS.DESIGN_WRITE,
    CRM_V4_ACTIONS.AUDIT_READ
  ]),
  accountant: Object.freeze([
    CRM_V4_ACTIONS.ORDERS_READ,
    CRM_V4_ACTIONS.FINANCE_READ,
    CRM_V4_ACTIONS.FINANCE_WRITE,
    CRM_V4_ACTIONS.COSTS_READ
  ]),
  designer: Object.freeze([
    CRM_V4_ACTIONS.DESIGN_READ,
    CRM_V4_ACTIONS.DESIGN_WRITE,
    CRM_V4_ACTIONS.PRODUCTION_READ,
    CRM_V4_ACTIONS.PRODUCTION_WRITE
  ]),
  installer: Object.freeze([
    CRM_V4_ACTIONS.INSTALLATION_READ,
    CRM_V4_ACTIONS.INSTALLATION_WRITE
  ]),
  contractor: Object.freeze([
    CRM_V4_ACTIONS.PRODUCTION_READ,
    CRM_V4_ACTIONS.PRODUCTION_WRITE
  ])
});

function roleOf(profile = v4State.profile) {
  return String(profile?.role || '').trim().toLowerCase();
}

export function allowedV4Actions(profile = v4State.profile) {
  return new Set(CRM_V4_ROLE_ACTIONS[roleOf(profile)] || []);
}

export function canPerformV4Action(action, profile = v4State.profile) {
  const key = String(action || '').trim();
  if (!key || !profile || v4State.profileLoaded !== true || profile.is_active !== true) return false;
  return allowedV4Actions(profile).has(key);
}

export function requireV4Action(action, profile = v4State.profile) {
  if (canPerformV4Action(action, profile)) return true;
  document.dispatchEvent(new CustomEvent('leader-v4:action-denied', {
    detail: { action: String(action || ''), role: roleOf(profile), enforcement: 'ui_only' }
  }));
  return false;
}

export function v4ActionAccessSummary(profile = v4State.profile) {
  return {
    role: roleOf(profile),
    actions: [...allowedV4Actions(profile)],
    serverEnforcement: false,
    note: 'Canonical source registry only. Server-side enforcement is tracked in #202 and #204.'
  };
}
