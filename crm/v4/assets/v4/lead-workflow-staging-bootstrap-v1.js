// Browser-only bootstrap. Awaiting the dynamic import removes the race where the
// lead card can become interactive before the protected staging workflow handler
// is installed. Pure model/Node tests still skip browser/Supabase dependencies.
if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  try {
    await import('./lead-workflow-staging-ui-v1.js');
  } catch (error) {
    console.error('[leader-crm] staging lead workflow bootstrap failed', error);
  }
}
