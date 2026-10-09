// Enabled after production DB/Edge postflight on 2026-10-09.
export const OPERATIONAL_PRODUCTION_ENABLED = true;
export function isExactOperationalProductionUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'ofewxuqfjhamgerwzull.supabase.co'
      && !url.username && !url.password && !url.port && url.pathname === '/'
      && !url.search && !url.hash;
  } catch (_) { return false; }
}
export function operationalProductionAvailable(url) {
  return OPERATIONAL_PRODUCTION_ENABLED && isExactOperationalProductionUrl(url);
}
