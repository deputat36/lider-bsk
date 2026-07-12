import { statusDefinition } from './status-transitions-v1.js';

const RESPONSIBLE_ROLES = new Set(['owner', 'admin', 'manager']);
const UNASSIGNED_KEY = '__unassigned__';

function asTime(value) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function dayBounds(now) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return [start.getTime(), end.getTime()];
}

function daysSince(value, now) {
  const time = asTime(value);
  if (time === null) return null;
  return Math.max(0, Math.floor((now - time) / 86400000));
}

function activeLead(lead) {
  const definition = statusDefinition('lead', lead?.status || 'Новая');
  return definition ? definition.terminal !== true : true;
}

function profileLabel(profile, userId) {
  const name = String(profile?.full_name || '').trim();
  if (name) return name;
  const short = String(userId || '').slice(0, 8);
  return short ? `Сотрудник ${short}` : 'Не назначен';
}

function createGroup(key, profile = null) {
  return {
    key,
    assignedTo: key === UNASSIGNED_KEY ? '' : key,
    label: key === UNASSIGNED_KEY ? 'Без ответственного' : profileLabel(profile, key),
    role: String(profile?.role || '').trim(),
    active: 0,
    withoutNextContact: 0,
    overdue: 0,
    dueToday: 0,
    slaBreaches: 0,
    slaCoveragePercent: 100,
    oldestLeadAgeDays: null,
    leads: []
  };
}

function finalizeGroup(group) {
  const covered = Math.max(0, group.active - group.slaBreaches);
  group.slaCoveragePercent = group.active ? Math.round((covered / group.active) * 100) : 100;
  group.leads.sort((a, b) => {
    const aNext = asTime(a.next_contact_at);
    const bNext = asTime(b.next_contact_at);
    if (aNext === null && bNext !== null) return -1;
    if (aNext !== null && bNext === null) return 1;
    if (aNext !== bNext) return Number(aNext || 0) - Number(bNext || 0);
    return String(a.created_at || '').localeCompare(String(b.created_at || ''));
  });
  return Object.freeze({ ...group, leads: Object.freeze([...group.leads]) });
}

export function buildManagementWorkloadSnapshot(leads = [], profiles = [], nowValue = Date.now()) {
  const now = Number.isFinite(Number(nowValue)) ? Number(nowValue) : Date.now();
  const [todayStart, todayEnd] = dayBounds(now);
  const profileMap = new Map();
  const groups = new Map();

  for (const profile of Array.isArray(profiles) ? profiles : []) {
    const userId = String(profile?.user_id || '').trim();
    if (!userId) continue;
    profileMap.set(userId, profile);
    if (profile?.is_active === true && RESPONSIBLE_ROLES.has(String(profile?.role || '').trim().toLowerCase())) {
      groups.set(userId, createGroup(userId, profile));
    }
  }
  groups.set(UNASSIGNED_KEY, createGroup(UNASSIGNED_KEY));

  const active = (Array.isArray(leads) ? leads : []).filter(activeLead);
  for (const lead of active) {
    const assignedTo = String(lead?.assigned_to || '').trim();
    const key = assignedTo || UNASSIGNED_KEY;
    if (!groups.has(key)) groups.set(key, createGroup(key, profileMap.get(key)));
    const group = groups.get(key);
    const next = asTime(lead?.next_contact_at);
    const age = daysSince(lead?.created_at, now);

    group.active += 1;
    group.leads.push(lead);
    if (age !== null && (group.oldestLeadAgeDays === null || age > group.oldestLeadAgeDays)) group.oldestLeadAgeDays = age;
    if (next === null) {
      group.withoutNextContact += 1;
      group.slaBreaches += 1;
    } else {
      if (next < now) {
        group.overdue += 1;
        group.slaBreaches += 1;
      }
      if (next >= todayStart && next <= todayEnd) group.dueToday += 1;
    }
  }

  const unassigned = finalizeGroup(groups.get(UNASSIGNED_KEY));
  const managers = [...groups.entries()]
    .filter(([key]) => key !== UNASSIGNED_KEY)
    .map(([, group]) => finalizeGroup(group))
    .sort((a, b) => b.slaBreaches - a.slaBreaches || b.active - a.active || a.label.localeCompare(b.label, 'ru'));

  const withoutNextContact = managers.reduce((sum, group) => sum + group.withoutNextContact, 0) + unassigned.withoutNextContact;
  const overdue = managers.reduce((sum, group) => sum + group.overdue, 0) + unassigned.overdue;
  const dueToday = managers.reduce((sum, group) => sum + group.dueToday, 0) + unassigned.dueToday;
  const slaBreaches = withoutNextContact + overdue;
  const activeCount = active.length;
  const assignedCount = Math.max(0, activeCount - unassigned.active);
  const slaCoveragePercent = activeCount ? Math.round(((activeCount - slaBreaches) / activeCount) * 100) : 100;

  return Object.freeze({
    generatedAt: new Date(now).toISOString(),
    activeCount,
    assignedCount,
    unassignedCount: unassigned.active,
    withoutNextContact,
    overdue,
    dueToday,
    slaBreaches,
    slaCoveragePercent,
    managersWithLeads: managers.filter((group) => group.active > 0).length,
    unassigned,
    managers: Object.freeze(managers)
  });
}

export function managementWorkloadGroup(snapshot, key) {
  const value = String(key || '').trim();
  if (!snapshot) return null;
  if (!value || value === UNASSIGNED_KEY) return snapshot.unassigned || null;
  return (snapshot.managers || []).find((group) => group.assignedTo === value) || null;
}

export const MANAGEMENT_WORKLOAD_UNASSIGNED_KEY = UNASSIGNED_KEY;
