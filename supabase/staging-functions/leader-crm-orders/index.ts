// Canonical order handler. The production bundle is reviewed after staging proof.
import { orderOperationPlan, executeOrderOperation } from '../_shared/order-operations-edge-v1.js'
import { runCanonicalEdgeWrapper } from '../_shared/canonical-edge-wrapper-v1.js'

Deno.serve(async (req: Request) => {
  const correlationId = crypto.randomUUID()
  try {
    const url = Deno.env.get('SUPABASE_URL')
    if (!['https://otulfnouybahfnsycxqn.supabase.co','https://ofewxuqfjhamgerwzull.supabase.co'].includes(url || '')) throw new Error('wrong_environment')
    if (req.method === 'POST') {
      const body = await req.text()
      if (new TextEncoder().encode(body).length > 16384) return new Response(JSON.stringify({ error: 'payload_too_large' }), { status: 413 })
      req = new Request(req.url, { method: req.method, headers: req.headers, body })
    }
    return await runCanonicalEdgeWrapper(req, { plan: orderOperationPlan, execute: executeOrderOperation })
  } catch (_) {
    console.error(JSON.stringify({ module: 'orders', code: 'order_request_failed', correlation_id: correlationId, timestamp: new Date().toISOString() }))
    return new Response(JSON.stringify({ ok: false, error: 'order_request_failed', correlation_id: correlationId }), { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' } })
  }
})
