// Enable only after the matching production DB/Edge postflight succeeds.
export const ORDER_FINANCE_PRODUCTION_ENABLED = false;
export function orderOperationsAvailable(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && (parsed.hostname === 'otulfnouybahfnsycxqn.supabase.co' ||
      (ORDER_FINANCE_PRODUCTION_ENABLED && parsed.hostname === 'ofewxuqfjhamgerwzull.supabase.co'));
  } catch (_) { return false; }
}
