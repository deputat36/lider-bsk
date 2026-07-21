// STAGING ONLY.
// Canonical database action gate in front of the preserved leads implementation.
import { leadsActionPlan } from '../_shared/crm-canonical-action-map-v1.js'
import { runCanonicalEdgeWrapper } from '../_shared/canonical-edge-wrapper-v1.js'

Deno.serve((req: Request) => runCanonicalEdgeWrapper(req, {
  implementationSlug: 'leader-crm-leads-staging-impl',
  plan: (body: Record<string, unknown>, url: URL) => leadsActionPlan(
    body,
    url.searchParams.get('action') || '',
  ),
}))
