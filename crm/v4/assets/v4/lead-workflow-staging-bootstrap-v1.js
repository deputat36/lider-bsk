// Browser-only bootstrap. The dynamic import keeps pure model tests free from browser/Supabase dependencies.
if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  import('./lead-workflow-staging-ui-v1.js').catch((error) => {
    console.error('[leader-crm] staging lead workflow bootstrap failed', error);
  });
}
