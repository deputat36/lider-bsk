// STAGING ONLY.
// Canonical database action gate in front of the preserved orders implementation.
import { orderActionPlan } from '../_shared/crm-canonical-action-map-v1.js'
import { runCanonicalEdgeWrapper } from '../_shared/canonical-edge-wrapper-v1.js'

Deno.serve((req: Request) => runCanonicalEdgeWrapper(req, {
  implementationSlug: 'leader-crm-orders-impl',
  plan: (body: Record<string, unknown>) => orderActionPlan(body),
}))
