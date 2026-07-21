import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

import {
  canonicalCorsHeaders,
  runCanonicalEdgeWrapper,
} from '../_shared/canonical-edge-wrapper-v1.js'
import { designActionPlan } from '../_shared/crm-canonical-action-map-v1.js'

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: canonicalCorsHeaders,
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: canonicalCorsHeaders })
  if (req.method !== 'POST') {
    return json(405, {
      error: 'method_not_allowed',
      allowed: ['POST'],
    })
  }

  return await runCanonicalEdgeWrapper(req, {
    implementationSlug: 'leader-crm-design-impl',
    plan(body: Record<string, unknown>) {
      return designActionPlan(body)
    },
  })
})
